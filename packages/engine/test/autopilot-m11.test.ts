import { describe, expect, it } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AutopilotJournal, type AutopilotIdentity } from '../src/autopilot.js';
import {
  M11Autopilot, M11StopHook, M11_TERMINAL_TOKEN, openRootCauseFinding,
  type WaitingEntry,
} from '../src/autopilot-m11.js';
import { evaluateM11Terminal, type M11Checks, type M11Evidence } from '../src/terminal-gate.js';

const H = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const IDENTITY = 'e'.repeat(64);

function mkJournal(name: string): { dir: string; file: string; identity: AutopilotIdentity; journal: AutopilotJournal } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `m11-${name}-`));
  const file = path.join(dir, 'run.jsonl');
  const identity: AutopilotIdentity = { repository: dir, revision: 'r57', plan: 'hv3' };
  return { dir, file, identity, journal: new AutopilotJournal(file, identity) };
}

function waiting(overrides: Partial<WaitingEntry> = {}): WaitingEntry {
  const now = new Date().toISOString();
  return {
    waitingId: 'W-1',
    taskId: 'T-1',
    state: 'WAITING_EXTERNAL',
    wake: { kind: 'ci', key: 'ci:quality:quality-linux', expect: 'success' },
    retry: { attempt: 0, maxAttempts: 3, backoffMs: 0, nextRetryAt: 0 },
    successorClosure: ['T-1b'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('C5 waiting-state machine', () => {
  it('WAITING_EXTERNAL never terminates the run and only blocks its closure', () => {
    const { journal } = mkJournal('wait-nonterminal');
    const m = new M11Autopilot(journal);
    m.registerWait(waiting({ waitingId: 'W-EXT-1', taskId: 'A', successorClosure: ['A2'] }));

    const { due, advanced } = m.pumpWaits(Date.now());
    assert.strictEqual(advanced.length, 0);
    assert.strictEqual(due.length, 0);
    // independent sibling B was never registered → nothing holds it back
    assert.ok(!m.waitingEntries().some((w) => w.taskId === 'B'));
    // run stays nonterminal, waiting entry persists
    assert.notStrictEqual(journal.snapshot().state, 'COMPLETED');
    assert.strictEqual(m.waitingEntries().length, 1);
    assert.strictEqual(m.waitingEntries()[0].state, 'WAITING_EXTERNAL');
  });

  it('RETRY_SCHEDULED advances with backoff only when due', () => {
    const { journal } = mkJournal('retry');
    const m = new M11Autopilot(journal);
    const now = Date.now();
    m.registerWait(waiting({
      waitingId: 'W-R-1', taskId: 'T', state: 'RETRY_SCHEDULED',
      wake: { kind: 'retry', key: 'retry:T', expect: 'ready' },
      retry: { attempt: 0, maxAttempts: 3, backoffMs: 100, nextRetryAt: now + 100 },
    }));

    let r = m.pumpWaits(now); // not yet due
    assert.strictEqual(r.due.length, 0);
    r = m.pumpWaits(now + 100); // due
    assert.strictEqual(r.due.length, 1);
    assert.strictEqual(r.advanced[0].retry.attempt, 1);
    assert.strictEqual(r.advanced[0].retry.backoffMs, 200);
    // advanced once only — next pump is not due again
    assert.strictEqual(m.pumpWaits(now + 100).advanced.length, 0);
    // still nonterminal
    assert.notStrictEqual(journal.snapshot().state, 'COMPLETED');
  });

  it('deadline expiry moves WAITING_EXTERNAL to fallback target', () => {
    const { journal } = mkJournal('deadline');
    const m = new M11Autopilot(journal);
    m.registerWait(waiting({
      waitingId: 'W-D-1', taskId: 'T', state: 'WAITING_EXTERNAL', deadline: Date.now() - 1,
      fallback: { action: 'defer-heavy', to: 'WAITING_RESOURCE' },
    }));
    const r = m.pumpWaits(Date.now());
    assert.strictEqual(r.advanced.length, 1);
    assert.strictEqual(r.advanced[0].state, 'WAITING_RESOURCE');
    assert.strictEqual(r.advanced[0].deadline, undefined);
  });

  it('deadline expiry defaults to WAITING_AUTHORITY when no fallback', () => {
    const { journal } = mkJournal('deadline-default');
    const m = new M11Autopilot(journal);
    m.registerWait(waiting({ waitingId: 'W-D-2', taskId: 'T', deadline: Date.now() - 1 }));
    const r = m.pumpWaits(Date.now());
    assert.strictEqual(r.advanced[0].state, 'WAITING_AUTHORITY');
  });

  it('CI watcher registers WAITING_EXTERNAL on pending/failed checks and resolves on green', () => {
    const { journal } = mkJournal('ci');
    const m = new M11Autopilot(journal);
    const created = m.scanCi([
      { workflow: 'quality', check: 'quality-macos', conclusion: 'failure', commitSha: H },
      { workflow: 'quality', check: 'quality-linux', conclusion: 'pending', commitSha: H },
    ], (key) => (key.includes('macos') ? ['T-macos'] : ['T-linux']));
    assert.strictEqual(created.length, 2);
    const macos = m.waitingEntries().find((w) => w.wake.key === 'ci:quality:quality-macos');
    assert.ok(macos);
    assert.strictEqual(macos.state, 'WAITING_EXTERNAL');
    assert.deepStrictEqual(macos.successorClosure, ['T-macos']);
    // pending check flips to green → waiting entry resolves
    m.scanCi([{ workflow: 'quality', check: 'quality-macos', conclusion: 'success' }]);
    assert.ok(!m.waitingEntries().some((w) => w.wake.key === 'ci:quality:quality-macos'));
    assert.strictEqual(m.waitingEntries().length, 1);
  });
});

describe('C5 journal idempotency and crash recovery', () => {
  it('replays the same logical mutation once — no duplicate journal record', () => {
    const { journal, file, identity } = mkJournal('idem');
    const m = new M11Autopilot(journal);
    const opKey = 'wait:register:W-CRASH';
    const entry = waiting({ waitingId: 'W-CRASH', taskId: 'A' });

    m.registerWait(entry, opKey); // first application
    const before = m.waitingEntries();

    // simulate crash + replay: fresh journal, same logical op, same opKey
    const recovered = new M11Autopilot(new AutopilotJournal(file, identity));
    recovered.registerWait(entry, opKey);

    assert.deepStrictEqual(recovered.waitingEntries(), before);
    const records = new AutopilotJournal(file, identity).records()
      .filter((r) => r.type === 'M11_WAIT' && r.data?.entry?.waitingId === 'W-CRASH');
    assert.strictEqual(records.length, 1);
  });

  it('replaying a retry pump does not double-advance the policy', () => {
    const { journal, file, identity } = mkJournal('pump-replay');
    const now = Date.now();
    const m = new M11Autopilot(journal);
    m.registerWait(waiting({
      waitingId: 'W-P', taskId: 'T', state: 'RETRY_SCHEDULED',
      wake: { kind: 'retry', key: 'r', expect: 'ready' },
      retry: { attempt: 0, maxAttempts: 3, backoffMs: 100, nextRetryAt: now },
    }));
    assert.strictEqual(m.pumpWaits(now).advanced.length, 1);

    const recovered = new M11Autopilot(new AutopilotJournal(file, identity));
    // replay the identical pump (same journal state, same op keys)
    assert.strictEqual(recovered.pumpWaits(now).advanced.length, 0);
    assert.strictEqual(recovered.waitingEntries()[0].retry.attempt, 1);
  });

  it('journal hash chain rejects a corrupt/tampered record on replay', () => {
    const { file, identity, journal } = mkJournal('corrupt');
    const m = new M11Autopilot(journal);
    m.registerWait(waiting({ waitingId: 'W-TAMPER' }));
    fs.appendFileSync(file, '{"tampered":true}\n', 'utf8');
    assert.throws(() => new AutopilotJournal(file, identity).records(), /hash-chain mismatch/);
  });
});

describe('C5 leases and heartbeat', () => {
  it('revokes a stale lease after missed heartbeat; work is not lost', () => {
    const { journal } = mkJournal('lease');
    const m = new M11Autopilot(journal);
    const now = Date.now();
    m.registerWait(waiting({ waitingId: 'W-LEASE', taskId: 'task-A' }));

    m.acquireLease('L-1', 'worker-1', 'task-A', 500);
    m.heartbeat('L-1', 500, `hb:${now}`); // renewal within TTL
    const renewed = m.leaseEntries().find((l) => l.leaseId === 'L-1');
    assert.ok(renewed && renewed.expiresAt > now + 400);

    // heartbeat missed → lease goes stale
    const stale = m.staleLeases(now + 5_000);
    assert.deepStrictEqual(stale.map((s) => s.leaseId), ['L-1']);
    m.revokeLease('L-1');
    assert.strictEqual(m.leaseEntries().find((l) => l.leaseId === 'L-1')!.revoked, true);
    // work not lost: the waiting entry for task-A survives revocation
    assert.ok(m.waitingEntries().some((w) => w.taskId === 'task-A'));
  });

  it('two consecutive heartbeats without an explicit opKey both extend the lease', async () => {
    const { journal } = mkJournal('hb-default');
    const m = new M11Autopilot(journal);
    m.acquireLease('L-HB', 'worker-1', 'task-A', 500);
    const first = m.heartbeat('L-HB', 500);
    assert.ok(first);
    await new Promise((resolve) => setTimeout(resolve, 5)); // distinct default-opKey timestamp
    const second = m.heartbeat('L-HB', 500);
    assert.ok(second);
    // a replayed/deduped heartbeat would keep the old expiry — this must strictly extend
    assert.ok(second.expiresAt > first.expiresAt, 'second heartbeat must extend the lease, not dedupe as replay');
    const hbRecords = journal.records()
      .filter((r) => r.type === 'M11_LEASE' && r.data?.entry?.leaseId === 'L-HB');
    assert.strictEqual(hbRecords.length, 3); // acquire + 2 heartbeats, no dedup
  });
});

describe('C5 root-cause escalation', () => {
  it('two repairs with the same root cause escalate model+review tier and open a root-cause finding', () => {
    const { journal } = mkJournal('esc');
    const m = new M11Autopilot(journal);
    const signature = 'verifier: probeExitCode 1 on contract C';

    const first = m.recordRepair('task-A', signature);
    assert.strictEqual(first.attempt, 1);
    assert.strictEqual(first.escalated, false);

    const second = m.recordRepair('task-A', signature);
    assert.strictEqual(second.attempt, 2);
    assert.strictEqual(second.escalated, true);
    assert.strictEqual(second.modelTier, 'high');
    assert.strictEqual(second.reviewTier, 'independent');

    const ledger: Record<string, unknown> = { findings: [] };
    const finding = openRootCauseFinding(ledger, {
      taskId: second.taskId, rootCauseSignature: second.rootCauseSignature,
      modelTier: second.modelTier, reviewTier: second.reviewTier,
    });
    assert.strictEqual(finding.status, 'OPEN');
    assert.strictEqual((ledger.findings as unknown[]).length, 1);
    assert.strictEqual((ledger.findings as Array<Record<string, unknown>>)[0].kind, 'root-cause');

    // a different root cause does not inherit escalation
    const other = m.recordRepair('task-A', 'network: provider timeout');
    assert.strictEqual(other.escalated, false);
    assert.strictEqual(other.attempt, 1);
  });
});

describe('C5 stop hook', () => {
  it('checkpoints while gate false but refuses completion', () => {
    const { journal } = mkJournal('stop');
    const hook = new M11StopHook(journal, { evaluate: () => ({ passed: false, failedGates: ['M11_EFFECTIVE_REQUIREMENTS_MATCH'] }) });

    const snap = hook.checkpoint('cp-1');
    assert.strictEqual(snap.state, 'CHECKPOINTED');

    const attempt = hook.declareComplete(M11_TERMINAL_TOKEN);
    assert.strictEqual(attempt.ok, false);
    assert.ok(!journal.records().some((r) => r.type === 'M11_COMPLETE'));
  });

  it('emits the terminal token only when the gate passes', () => {
    const { journal } = mkJournal('stop-pass');
    const hook = new M11StopHook(journal, { evaluate: () => ({ passed: true, failedGates: [] }) });
    const attempt = hook.declareComplete(M11_TERMINAL_TOKEN);
    assert.strictEqual(attempt.ok, true);
    assert.ok(journal.records().some((r) => r.type === 'M11_COMPLETE' && r.data?.terminal === M11_TERMINAL_TOKEN));
  });
});

// ── M11 terminal gate ────────────────────────────────────────────────────────

function fixture(overrides: {
  ledger?: Record<string, unknown>;
  evidence?: Partial<M11Evidence>;
  checks?: Partial<M11Checks>;
} = {}): { ledger: Record<string, unknown>; evidence: M11Evidence; checks: M11Checks } {
  const now = Date.now();
  const evidence: M11Evidence = {
    headCommit: H,
    effectivePlanIdentity: IDENTITY,
    envelopeSha256: 'f'.repeat(64),
    observedAt: new Date(now).toISOString(),
    fresh: true,
    ciSha: H,
    certifiedArtifactSha256: 'c'.repeat(64),
    installedArtifactSha256: 'c'.repeat(64),
    installedFrom: 'certified-local-main',
    reconciliationHeadCommit: H,
    parity: 'COMPLETE',
    topology: 'COMPLETE',
    reviews: ['architecture', 'security', 'maintainability', 'UX', 'operations'].map((dimension) => ({
      dimension, accepted: true, reviewId: `REV-${dimension}`, stale: false,
    })),
    ...overrides.evidence,
  };
  const ledger: Record<string, unknown> = {
    status: 'ADOPTED',
    execution_state: 'RUNNING',
    headCommit: H,
    commitSha: H,
    findings: [],
    orphanFindings: [],
    effective_plan_identity: { sha256: IDENTITY },
    attestations: [{ host: 'codex', commitSha: H }, { host: 'grok', commitSha: H }],
    ...overrides.ledger,
  };
  const checks: M11Checks = {
    requirements: Array.from({ length: 31 }, (_, i) => ({
      requirement_id: i < 15 ? `REQ-${String(i + 1).padStart(3, '0')}` : `M11-R${11 + (i - 15)}`,
      status: 'MATCH',
    })),
    scorecard: Array.from({ length: 3 }, (_, i) => ({ id: `d0${i + 1}`, score: 9, status: 'VERIFIED' })),
    waitingGates: [],
    ...overrides.checks,
  };
  return { ledger, evidence, checks };
}

describe('evaluateM11Terminal', () => {
  it('positive: all MATCH, zero open, evidence binds HEAD → HV3_M11_LOCAL_COMPLETE eligible', () => {
    const { ledger, evidence, checks } = fixture();
    const result = evaluateM11Terminal(ledger, evidence, checks);
    assert.strictEqual(result.passed, true, result.failedGates.join(', '));
    assert.deepStrictEqual(result.failedGates, []);
    // token emission is engine-only: the evaluator result alone authorizes nothing
    assert.notStrictEqual(ledger.execution_state, M11_TERMINAL_TOKEN);
  });

  const negatives: Array<[string, typeof fixture, string]> = [
    ['one requirement PARTIAL', (f) => { f.checks.requirements[0].status = 'PARTIAL'; }, 'M11_EFFECTIVE_REQUIREMENTS_MATCH'],
    ['one requirement GAP', (f) => { f.checks.requirements[30].status = 'GAP'; }, 'M11_EFFECTIVE_REQUIREMENTS_MATCH'],
    ['one open finding', (f) => { f.ledger.findings = [{ finding_id: 'F-1', status: 'OPEN' }]; }, 'M11_NO_OPEN_FINDINGS'],
    ['one UNVERIFIED score', (f) => { f.checks.scorecard[1] = { id: 'd02', score: null, status: 'UNVERIFIED' }; }, 'M11_SCORES_VERIFIED'],
    ['stale evidence', (f) => { f.evidence.fresh = false; }, 'M11_EVIDENCE_BINDS_HEAD'],
    ['evidence binds wrong HEAD', (f) => { f.evidence.headCommit = OTHER; }, 'M11_EVIDENCE_BINDS_HEAD'],
    ['installed artifact differs', (f) => { f.evidence.installedArtifactSha256 = OTHER; }, 'M11_INSTALLED_ARTIFACT_MATCHES'],
    ['artifact not from local main', (f) => { f.evidence.installedFrom = 'some-other-source'; }, 'M11_INSTALLED_ARTIFACT_MATCHES'],
    ['parity skipped', (f) => { f.evidence.parity = 'SKIPPED'; }, 'M11_PARITY_TOPOLOGY_COMPLETE'],
    ['topology skipped', (f) => { f.evidence.topology = 'SKIPPED'; }, 'M11_PARITY_TOPOLOGY_COMPLETE'],
    ['required gate waiting', (f) => { f.checks.waitingGates = ['FULL_STACK_GATE']; }, 'M11_NO_WAITING_GATES'],
    ['review not accepted', (f) => { f.evidence.reviews[0].accepted = false; }, 'M11_REVIEWS_ACCEPT'],
    ['stale review', (f) => { f.evidence.reviews[3].stale = true; }, 'M11_REVIEWS_ACCEPT'],
    ['execution_state NEEDS_REMEDIATION', (f) => { f.ledger.execution_state = 'NEEDS_REMEDIATION'; }, 'M11_EXECUTION_STATE_OK'],
    ['M10 marker HISTORICAL_STALE_FOR_M11', (f) => { f.ledger.terminalMarker = 'HARNESS_V3_10_OF_10_COMPLETE'; f.ledger.terminalMarkerStatus = 'HISTORICAL_STALE_FOR_M11'; }, 'M11_EXECUTION_STATE_OK'],
    ['empty requirement set', (f) => { f.checks.requirements = []; }, 'M11_EFFECTIVE_REQUIREMENTS_MATCH'],
    ['CI SHA does not bind HEAD', (f) => { f.evidence.ciSha = OTHER; }, 'M11_CI_BINDS_HEAD'],
    ['no native attestations', (f) => { f.ledger.attestations = []; }, 'M11_ATTESTATIONS_BIND_HEAD'],
    ['attestation does not bind exact HEAD', (f) => { (f.ledger.attestations as Array<{ commitSha: string }>)[0].commitSha = OTHER; }, 'M11_ATTESTATIONS_BIND_HEAD'],
    ['reconciliation does not bind HEAD', (f) => { f.evidence.reconciliationHeadCommit = OTHER; }, 'M11_RECONCILIATION_BINDS_HEAD'],
  ] as const;

  it.each(negatives)('negative: %s → NOT eligible', (_name, mutate, gateName) => {
    const f = fixture();
    mutate(f);
    const result = evaluateM11Terminal(f.ledger, f.evidence, f.checks);
    assert.strictEqual(result.passed, false);
    assert.ok(result.failedGates.includes(gateName as string), `expected ${String(gateName)} in ${result.failedGates.join(', ')}`);
  });

  it('dynamic requirement count comes from the compiled effective plan, not a constant', () => {
    const f = fixture();
    // the compiled effective set is 31 (15 REQ + 16 M11-R) — the gate must bind that dynamic count
    assert.strictEqual(f.checks.requirements.length, 31);
    const result = evaluateM11Terminal(f.ledger, f.evidence, f.checks);
    assert.strictEqual(result.passed, true);
    const gate = result.gates.find((g) => g.name === 'M11_EFFECTIVE_REQUIREMENTS_MATCH')!;
    assert.ok(gate.detail.includes('31 effective requirements'), gate.detail);
    assert.ok(gate.detail.includes('dynamic count'));
    // the same evaluator accepts a different sized effective set — count is data-driven, not 15
    const smaller = fixture();
    smaller.checks.requirements = smaller.checks.requirements.filter((r) => r.requirement_id.startsWith('REQ-'));
    assert.strictEqual(smaller.checks.requirements.length, 15);
    const r2 = evaluateM11Terminal(smaller.ledger, smaller.evidence, smaller.checks);
    assert.strictEqual(r2.passed, true);
    assert.ok(r2.gates.find((g) => g.name === 'M11_EFFECTIVE_REQUIREMENTS_MATCH')!.detail.includes('15 effective requirements'));
  });

  it('SUPERSEDED requirements are acceptable', () => {
    const f = fixture();
    f.checks.requirements[5].status = 'SUPERSEDED';
    assert.strictEqual(evaluateM11Terminal(f.ledger, f.evidence, f.checks).passed, true);
  });
});
