import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildStrongPlannerInvocation,
  createWorkRequest,
  materializePlannerSnapshot,
  parsePlannerStdout,
  runStrongPlanner,
} from '../src/northstar/index.js';

const temps: string[] = [];
function tempRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-planner-test-'));
  temps.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const answer = 42;\n');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=do-not-copy\n');
  fs.mkdirSync(path.join(root, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'x', 'index.js'), 'bad');
  return root;
}
afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function validContract(intent: string) {
  return {
    protocol_version: '2.0', raw_intent: intent, risk_class: 'S1',
    known: ['src/index.ts exists'], assumed: [], unresolved: [], requires_user: [],
    impact: { owning_modules: ['src'], dependency_breadth: 'single module', public_api: [], schema_data: [], security_boundaries: [], reference_dependencies: [], relevant_tests: [], active_decisions: [] },
    requirements: [{ id: 'R-001', statement: intent, mandatory: true, claims: [{ claim_id: 'C-001a', statement: 'Requested behavior is implemented', class: 'mechanical', required_kinds: ['test'] }] }],
    tasks: [{ goal: intent, requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['src'], forbidden: [], verifiers_by_claim: { 'C-001a': ['V-001'] } }],
    verifiers: [{ id: 'V-001', kind: 'test', argv: { executable: 'node', args: ['--version'] } }],
    decisions: [], claim_policies: [],
  };
}

describe('North-Star isolated strong planner runtime', () => {
  it('materializes a bounded source snapshot without dependencies or common secrets', () => {
    const repo = tempRepo();
    const snapshot = materializePlannerSnapshot(repo);
    temps.push(snapshot.root);
    expect(fs.existsSync(path.join(snapshot.root, 'src', 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(snapshot.root, '.env'))).toBe(false);
    expect(fs.existsSync(path.join(snapshot.root, 'node_modules'))).toBe(false);
    expect(snapshot.files.some((file) => file.path === 'src/index.ts')).toBe(true);
    expect(snapshot.omitted.some((item) => item.startsWith('.env:'))).toBe(true);
  });

  it('uses read-only host posture and never enables MiMo dangerous permission bypass for planning', () => {
    expect(buildStrongPlannerInvocation('claude', 'x').args).toContain('plan');
    expect(buildStrongPlannerInvocation('codex', 'x').args).toEqual(expect.arrayContaining(['--sandbox', 'read-only']));
    const mimo = buildStrongPlannerInvocation('mimocode', 'x');
    expect(mimo.args).not.toContain('--dangerously-skip-permissions');
    expect(mimo.env?.OPENCODE_CONFIG_CONTENT).toContain('"edit":"deny"');
  });

  it('extracts a JSON object but leaves semantic validation to the contract compiler', () => {
    expect(parsePlannerStdout('note\n```json\n{"a":1}\n```\ntrailing')).toEqual({ a: 1 });
  });

  it('mounts an explicitly selected verified domain pack only inside the disposable planner snapshot', async () => {
    const repo = tempRepo();
    const intent = 'Adapt an employee list behavior from the selected ERP reference';
    const request = createWorkRequest({ raw_intent: intent, risk_hint: 'S1' });
    const contract = validContract(intent);
    let observedReference = false;
    const result = await runStrongPlanner({
      repoRoot: repo, request, planner: 'codex', domainPackId: '5fedu', timeoutMs: 10_000,
      invocationOverride: (_prompt, snapshotRoot) => {
        observedReference = fs.existsSync(path.join(snapshotRoot, '.agent-reference', '5fedu', 'App.tsx'));
        expect(fs.existsSync(path.join(repo, '.agent-reference'))).toBe(false);
        return { executable: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(contract))})`] };
      },
    });
    expect(observedReference).toBe(true);
    expect(result.receipt.domain_reference).toMatchObject({
      pack_id: '5fedu',
      relative_root: '.agent-reference/5fedu',
      tree_sha256: '1e5ca0259db84c129b1d041ff6e34c997db18b2e0e871bcc08c318ae662df3e4',
      files: 446,
    });
    expect(result.receipt.domain_reference?.bytes).toBeGreaterThan(1_000_000);
  });

  it('runs a fresh planner process, validates its contract, and writes a PASS receipt', async () => {
    const repo = tempRepo();
    const intent = 'Add a narrow checked behavior';
    const request = createWorkRequest({ raw_intent: intent, risk_hint: 'S1' });
    const contract = validContract(intent);
    const result = await runStrongPlanner({
      repoRoot: repo, request, planner: 'codex', timeoutMs: 10_000,
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(contract))})`] }),
    });
    expect(result.compiled.packets).toHaveLength(1);
    expect(result.receipt.status).toBe('PASS');
    expect(result.receipt.snapshot_files).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(repo, '.agent', 'planner', `${request.work_id}.receipt.json`))).toBe(true);
  });

  it('fails closed when planner stdout is invalid or contract validation fails', async () => {
    const repo = tempRepo();
    const intent = 'Add a narrow checked behavior';
    const request = createWorkRequest({ raw_intent: intent, risk_hint: 'S1' });
    await expect(runStrongPlanner({
      repoRoot: repo, request, planner: 'codex', timeoutMs: 10_000,
      invocationOverride: () => ({ executable: process.execPath, args: ['-e', 'process.stdout.write("not-json")'] }),
    })).rejects.toThrow(/BLOCKED/);
    const receipt = JSON.parse(fs.readFileSync(path.join(repo, '.agent', 'planner', `${request.work_id}.receipt.json`), 'utf8'));
    expect(receipt.status).toBe('BLOCKED');
  });
});
