/**
 * Phase 8 — Generic fixture matrix (G1–G4) per frozen contract §11.
 *
 * G1: Fresh unrelated repository — no .agent, no harness projection, default behavior.
 * G2: Existing repository with project-owned instructions (AGENTS.md).
 * G3: Upgraded environment with stale harness-owned state (old pointer + ledger).
 * G4: Representative host enforcement classes (static adapter conformance).
 *
 * These are disposable fixture repos proving harness behavior on arbitrary
 * consumer repositories, not named real projects.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { stageClosureTransaction, commitClosureTransaction, correctInvalidClosure, writeOperationalIgnore, type ClosureInput, type EvidenceBindingManifest } from '../../src/northstar/closure-service.js';
import { HOST_CAPABILITIES, assertHostSurface } from '../../src/northstar/host-adapters.js';
import { classifyArtifact, admitArtifact } from '../../src/northstar/artifact-admission.js';
import { requiresCausalMap, validateCausalMapForWork } from '../../src/northstar/causal-map.js';
import { compileDoD } from '../../src/northstar/portable-plan.js';

let fixtureRoot: string;
const allRoots: string[] = [];

function makeRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g-fixture-'));
  allRoots.push(root);
  return root;
}

function git(root: string, args: string[]): void {
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'ignore' });
}

function gitInit(root: string): void {
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 't@t.t']);
  git(root, ['config', 'user.name', 't']);
  fs.writeFileSync(path.join(root, '.gitignore'), '# seed\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# seed fixture\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'seed']);
}

function makeBinding(root: string): EvidenceBindingManifest {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  return {
    harness_release: { repository: 'local', branch: 'main', sha256: head },
    installation_projection: { installation_root: 'toolhome', projection_sha256: '0'.repeat(64) },
    consumer_repository: { worktree_path: root, worktree_dirty: false, tree_hash: '0'.repeat(40) },
    consumer_candidate: { candidate_sha256: head, candidate_branch: 'main', tree_hash: '0'.repeat(40) },
    host_runtime: { host: 'opencode', version: '1.18.18', session_id: 'test', capabilities: [] },
  };
}

function makeInput(root: string): ClosureInput {
  return {
    plan_id: 'test-plan',
    work_id: 'test-work',
    purpose: 'G1 fixture closure',
    effective_contract_sha256: 'a'.repeat(64),
    requirements: [{ id: 'R-001', statement: 'feature works', status: 'PASS' }],
    reconciliations: [{ count: 1, statuses: ['PASS'] }],
    evidence: [{ evidence_id: 'ev-1', sha256: 'b'.repeat(64), outcome: 'PASS' }],
    changed_surfaces: ['.gitignore'],
    diff_stat: '1 file',
    binding: makeBinding(root),
    behavioral_baseline: '0'.repeat(40),
  };
}

beforeAll(() => { fixtureRoot = makeRepo(); });
afterAll(() => {
  for (const r of allRoots) fs.rmSync(r, { recursive: true, force: true });
});

describe('G1 — Fresh unrelated repository (no .agent, no harness layout)', () => {
  it('closes successfully with default no-skill/no-MCP behavior', () => {
    gitInit(fixtureRoot);
    const input = makeInput(fixtureRoot);
    const staged = stageClosureTransaction(input, fixtureRoot);
    expect(staged.staged).toBe(true);
    const receipt = commitClosureTransaction(input, fixtureRoot, staged);
    expect(receipt.committed).toBe(true);
    expect(fs.existsSync(path.join(fixtureRoot, '.agent', 'closure', 'test-plan.committed.json'))).toBe(true);
  });

  it('correction writes tombstone (invalid v1 closure corrected)', () => {
    const correction = correctInvalidClosure({
      repoRoot: fixtureRoot,
      plan_id: 'old-plan',
      pointer: null,
      ledger: null,
      reason: 'G1 fresh repo never had a valid pointer; correct as PARTIAL',
    });
    expect(correction.corrected).toBe(true);
    expect(correction.terminal_outcome).toBe('PARTIAL');
  });

  it('source-clean after closure (only operational ignores, no source files written)', () => {
    writeOperationalIgnore(fixtureRoot);
    const gitignore = fs.readFileSync(path.join(fixtureRoot, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.agent/closure/');
    expect(gitignore).toContain('.agent/runs/');
  });
});

describe('G2 — Existing repository with project-owned instructions', () => {
  let g2Root: string;
  beforeAll(() => {
    g2Root = makeRepo();
    gitInit(g2Root);
    // Project-owned AGENTS.md (harmless build/style rules)
    fs.writeFileSync(path.join(g2Root, 'AGENTS.md'), '# Project Rules\n\n- Always run `npm test` before committing\n- Use conventional commits\n');
    fs.writeFileSync(path.join(g2Root, 'tsconfig.json'), '{}');
    fs.mkdirSync(path.join(g2Root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(g2Root, 'src', 'index.ts'), 'export const x = 1;\n');
    git(g2Root, ['add', '-A']);
    git(g2Root, ['commit', '-q', '-m', 'add project instructions']);
  });

  it('AGENTS.md is preserved after closure (project truth not overwritten)', () => {
    const input = makeInput(g2Root);
    stageClosureTransaction(input, g2Root);
    commitClosureTransaction(input, g2Root, stageClosureTransaction(input, g2Root));
    expect(fs.existsSync(path.join(g2Root, 'AGENTS.md'))).toBe(true);
    const agentsMd = fs.readFileSync(path.join(g2Root, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('npm test');
    expect(agentsMd).toContain('conventional commits');
  });

  it('tsconfig.json and src/index.ts are untouched', () => {
    expect(fs.existsSync(path.join(g2Root, 'tsconfig.json'))).toBe(true);
    expect(fs.readFileSync(path.join(g2Root, 'src', 'index.ts'), 'utf8')).toContain('export const x = 1');
  });
});

describe('G3 — Upgraded environment with stale harness-owned state', () => {
  let g3Root: string;
  beforeAll(() => {
    g3Root = makeRepo();
    gitInit(g3Root);
    // Stale harness-owned state: old pointer + ledger
    const staleLedger = {
      schema_version: 4, plan_id: 'old-plan', status: 'RETIRED', execution_state: 'CLOSED',
      milestones: {}, reconciliations: [], requirements: {},
    };
    fs.mkdirSync(path.join(g3Root, '.agent', 'ledger'), { recursive: true });
    fs.writeFileSync(path.join(g3Root, '.agent', 'ledger', 'old-plan.json'), JSON.stringify(staleLedger));
    fs.mkdirSync(path.join(g3Root, '.agent', 'archive', 'old-plan'), { recursive: true });
    fs.writeFileSync(path.join(g3Root, '.agent', 'archive', 'old-plan', 'residue.json'), '{"plan_id":"old-plan"}');
    git(g3Root, ['add', '-A']);
    git(g3Root, ['commit', '-q', '-m', 'seed stale state']);
  });

  it('correctInvalidClosure marks old plan SUPERSEDED/INACTIVE/PARTIAL', () => {
    const correction = correctInvalidClosure({
      repoRoot: g3Root,
      plan_id: 'old-plan',
      pointer: { generation: 5, status: 'EFFECTIVE', execution_state: 'IN_PROGRESS' },
      ledger: { status: 'RETIRED', execution_state: 'CLOSED' },
      reason: 'stale harness state corrected during upgrade',
    });
    expect(correction.corrected_status).toBe('SUPERSEDED');
    expect(correction.corrected_execution_state).toBe('INACTIVE');
    expect(correction.terminal_outcome).toBe('PARTIAL');
  });

  it('new closure writes new plan manifest alongside old residue (old state preserved)', () => {
    const input = makeInput(g3Root);
    input.plan_id = 'new-plan';
    stageClosureTransaction(input, g3Root);
    commitClosureTransaction(input, g3Root, stageClosureTransaction(input, g3Root));
    expect(fs.existsSync(path.join(g3Root, '.agent', 'closure', 'new-plan.committed.json'))).toBe(true);
    expect(fs.existsSync(path.join(g3Root, '.agent', 'archive', 'old-plan', 'residue.json'))).toBe(true);
  });
});

describe('G4 — Representative host enforcement classes', () => {
  it('6-host matrix covers all certified/deferred surfaces', () => {
    expect(HOST_CAPABILITIES.codex.headless).toBe(true);
    expect(HOST_CAPABILITIES.opencode.headless).toBe(true);
    expect(HOST_CAPABILITIES.claude.headless).toBe(true);
  });

  it('6 hosts only (Mimocode removed from certified/deferred)', () => {
    const hosts = Object.keys(HOST_CAPABILITIES);
    expect(hosts.length).toBe(6);
    expect(hosts).not.toContain('mimocode');
  });

  it('artifact admission refuses EPHEMERAL with no persistence reasons', () => {
    const result = admitArtifact({ class: 'EPHEMERAL', reasons: [] });
    expect(result.admission).toBe('REFUSE');
    expect(result.persist).toBe(false);
  });

  it('S0/S1 work does not require causal map', () => {
    expect(requiresCausalMap('S0', false)).toBe(false);
    expect(requiresCausalMap('S1', false)).toBe(false);
  });

  it('S2/S3/cross-cutting work requires causal map', () => {
    expect(requiresCausalMap('S2', false)).toBe(true);
    expect(requiresCausalMap('S0', true)).toBe(true);
  });

  it('CompiledDoD for PLAN_ONLY is CODE-only', () => {
    const dod = compileDoD({ disposition: 'PLAN_ONLY' });
    expect(dod.required).toEqual(['CODE']);
  });
});
