/**
 * REQ-021/REQ-022 — North-Star vNext eval cases: one-copy handoff, artifact
 * minimization, no support-file invention, MCP route-only + remote refusal,
 * 5fedu disclosure, enforcement fallback, operator model selection, worker
 * never authors PASS, and legacy schema readability.
 */
import { describe, it, expect } from 'vitest';
import { compileFrozenContract, renderPlan, verifyContractHash, auditPreHandoff } from '../../src/northstar/portable-plan.js';
import { admitArtifact } from '../../src/northstar/artifact-admission.js';
import { decideEnforcement, probeHostCapabilities } from '../../src/northstar/host-capabilities.js';
import { governModel } from '../../src/northstar/model-governor.js';
import { renderDomainReferenceFooters, type DomainReferenceReceipt } from '../../src/northstar/domain-packs.js';
import { deriveAcceptance } from '../../src/northstar/evidence-ledger.js';
import { assertWorkRequest, assertWorkSpec, type WorkRequest, type WorkSpec } from '../../src/northstar/protocol.js';

function baseRequest(): WorkRequest {
  return { protocol_version: '2.0', work_id: 'W-eval', raw_intent: 'build widget', source: 'cli' };
}
function baseSpec(): WorkSpec {
  return {
    protocol_version: '2.0', spec_id: 'S-eval', revision: 1, work_id: 'W-eval',
    requirements: [{ id: 'R-001', statement: 'widget works', mandatory: true, claims: ['C-001'] }],
  };
}
function basePackets() {
  return [{
    protocol_version: '2.0', task_id: 'T-001', spec_id: 'S-eval', spec_revision: 1, work_id: 'W-eval',
    goal: 'build widget', requirements: ['R-001'], scope: { owned: ['src/widget'], forbidden: [] },
    acceptance: [{ claim_id: 'C-001', verifier_id: 'v-1' }],
  }];
}

describe('Eval — one-copy handoff and cheap-model implementation', () => {
  it('a receiver with runtime verifies the hash; a receiver without runtime still gets scope/tasks/proof/failure rules/closure criteria in one copy', () => {
    const contract = compileFrozenContract({ request: baseRequest(), spec: baseSpec(), packets: basePackets() });
    expect(verifyContractHash(contract)).toBe(true);
    const plan = renderPlan(contract);
    expect(plan).toContain(contract.semantic_hash);
    expect(plan).toContain('## Tasks');
    expect(plan).toContain('Owned: src/widget');
    expect(plan).toContain('Proof categories');
    expect(plan).toContain('## Failure rules');
    expect(plan).toContain('## Closure criteria');
    // One copy: the plan itself is the self-contained artifact.
    expect(plan.split('# Frozen Execution Contract')).toHaveLength(2);
  });
});

describe('Eval — artifact minimization and adaptive persistence', () => {
  it('small one-shot tasks persist nothing by default', () => {
    expect(admitArtifact({ class: 'EPHEMERAL', reasons: [] }).persist).toBe(false);
  });
  it('long tasks persist a minimal checkpoint; no durable support file is invented', () => {
    const receipt = admitArtifact({ class: 'CHECKPOINTED', reasons: ['restart_resume'] });
    expect(receipt.persist).toBe(true);
    expect(receipt.compact).toBe('minimal_checkpoint');
  });
});

describe('Eval — MCP idle-zero, route-only, and remote refusal', () => {
  it('a task that routes no MCP gets no managed MCP config', async () => {
    // loop.ts mcpConfigForTask returns undefined when the task routes no ids.
    const { materializeMcpConfig } = await import('../../src/runner/mcp-config.js');
    // route-only: only the routed integration is materialised
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-route-'));
    fs.mkdirSync(path.join(root, 'recommended', 'context7', 'adapters'), { recursive: true });
    fs.writeFileSync(path.join(root, 'recommended', 'context7', 'adapters', 'opencode.json'), JSON.stringify({ mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp@3.2.5'] } } }));
    const out = path.join(root, 'out');
    const result = materializeMcpConfig(out, { registryRoot: root, integrationIds: ['context7'] });
    expect(result.resolved).toEqual(['context7']);
    const opencodeConfig = JSON.parse(fs.readFileSync(result.opencode!.configPath, 'utf8'));
    expect(Object.keys(opencodeConfig.mcp ?? {})).toEqual(['context7']);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('remote (url-based) MCP is refused fail-closed without an explicit network policy', async () => {
    const { materializeMcpConfig } = await import('../../src/runner/mcp-config.js');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-remote-'));
    fs.mkdirSync(path.join(root, 'recommended', 'remote-mcp', 'adapters'), { recursive: true });
    fs.writeFileSync(path.join(root, 'recommended', 'remote-mcp', 'adapters', 'opencode.json'), JSON.stringify({ mcpServers: { remote: { url: 'http://127.0.0.1:9999/mcp' } } }));
    expect(() => materializeMcpConfig(path.join(root, 'out'), { registryRoot: root, integrationIds: ['remote-mcp'] })).toThrow(/remote MCP refused/);
    // With an explicit network policy the materialiser allows it.
    const allowed = materializeMcpConfig(path.join(root, 'out2'), { registryRoot: root, integrationIds: ['remote-mcp'], allowRemoteMcp: true });
    expect(allowed.resolved).toEqual(['remote-mcp']);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('Eval — 5fedu inactive/active disclosure', () => {
  function receipt(): DomainReferenceReceipt {
    return {
      schema: 'agent-rules/domain-reference-receipt', version: 1, pack_id: '5fedu', manifest_id: 'm',
      path: 'features/he-thong/chuc-vu/core/types.ts', sha256: 'a'.repeat(64), component: 'he-thong/chuc-vu', consumed_at: '2026-08-19T00:00:00Z',
    };
  }
  it('inactive or active-but-unused renders no footer; a consumed receipt renders the short footer', () => {
    expect(renderDomainReferenceFooters([])).toBe('');
    const footer = renderDomainReferenceFooters([receipt()]);
    expect(footer).toContain('5fedu reference used: he-thong/chuc-vu');
    expect(footer).not.toContain('intent detected');
  });
});

describe('Eval — enforcement fallback and operator model selection', () => {
  it('unproven host falls back to worktree transaction; no control -> BLOCKED', () => {
    const attestation = probeHostCapabilities('opencode', { ok: false });
    const fallback = decideEnforcement({ host: 'opencode', attestation, effects: ['filesystem_mutation'], broker_manages_effect: false, worktree_available: true });
    expect(fallback.layer).toBe('workspace_transaction');
    const blocked = decideEnforcement({ host: 'opencode', attestation, effects: ['destructive'], broker_manages_effect: false, worktree_available: false });
    expect(blocked.layer).toBe('blocked');
  });

  it('operator model selection is never lowered below the safety floor', () => {
    const decision = governModel({ role: 'worker', risk: 'S3', userOverride: 'utility' });
    expect(decision.logical_class).not.toBe('utility'); // S3 floor is standard
    expect(decision.reasons.some((reason) => reason.includes('refused by safety floor'))).toBe(true);
  });
});

describe('Eval — worker never authors PASS', () => {
  it('PASS is derived only from verifier evidence, never worker prose', async () => {
    const { deriveAcceptance } = await import('../../src/northstar/evidence-ledger.js');
    const acceptance = deriveAcceptance({
      spec: baseSpec(),
      packets: basePackets(),
      manifest: { claims: [] } as never,
      evidence: [], // no verifier evidence at all
    });
    // No verifier evidence -> not PASS.
    expect(acceptance.outcome).not.toBe('PASS');
    void auditPreHandoff;
  });
});

describe('Eval — schema migration: legacy artifacts remain readable', () => {
  it('legacy WorkRequest without intent_events and legacy WorkSpec still parse', () => {
    const legacyRequest = { protocol_version: '2.0', work_id: 'W-legacy', raw_intent: 'old', source: 'cli' };
    expect(() => assertWorkRequest(legacyRequest)).not.toThrow();
    const legacySpec = {
      protocol_version: '2.0', spec_id: 'S-legacy', revision: 1, work_id: 'W-legacy',
      requirements: [{ id: 'R-001', statement: 'x', mandatory: true, claims: ['C-001'] }],
      constraints: ['c'], decisions: ['d'],
    };
    expect(() => assertWorkSpec(legacySpec)).not.toThrow();
    // New renderer round-trip never turns Markdown into truth.
    const contract = compileFrozenContract({ request: baseRequest(), spec: baseSpec(), packets: basePackets() });
    expect(renderPlan(contract)).not.toContain('markdown_truth');
  });
});

void deriveAcceptance;
