import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
const run = (script: string, args: string[] = [], input?: string) => spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, encoding: 'utf8', input, windowsHide: true });

describe('repo-level maintenance tools', () => {
  it('audits skills, semantic fixtures and context integrity without tsx', () => {
    for (const script of ['automation/skills-audit.mjs', 'automation/skill-eval.mjs', 'automation/context-integrity.mjs']) {
      const result = run(script, script.includes('skills-audit') ? ['--profile', '5fedu'] : []);
      expect(result.status, `${script}\n${result.stdout}\n${result.stderr}`).toBe(0);
    }
  });

  it('reports explicit text context separately from binary assets', () => {
    const result = run('automation/skill-eval.mjs');
    expect(result.status, result.stderr).toBe(0);
    const body = JSON.parse(result.stdout) as { explicit_contracts: Array<Record<string, unknown>> };
    const reactNative = body.explicit_contracts.find((entry) => entry.id === 'react-native-best-practices');
    expect(reactNative).toEqual(expect.objectContaining({
      body_reference_tokens: expect.any(Number),
      script_text_tokens: expect.any(Number),
      binary_asset_files: expect.any(Number),
      binary_asset_bytes: expect.any(Number),
    }));
    expect(Number(reactNative?.binary_asset_files)).toBeGreaterThan(0);
    expect(Number(reactNative?.binary_asset_bytes)).toBeGreaterThan(1_000_000);
    expect(Number(reactNative?.body_reference_tokens)).toBeLessThan(500_000);
  });

  it('reports truthful base, profile and task-selected catalog accounting', () => {
    const result = run('automation/skills-audit.mjs', ['--json', '--profile', '5fedu', '--host', 'codex']);
    expect(result.status, result.stderr).toBe(0);
    const body = JSON.parse(result.stdout) as { catalog_accounting: Record<string, number> };
    expect(body.catalog_accounting.canonical_active_skills).toBeGreaterThan(body.catalog_accounting.global_projected_implicit_skills);
    expect(body.catalog_accounting.explicit_library_skills).toBeGreaterThan(0);
    expect(body.catalog_accounting.effective_task_catalog_chars).toBeLessThanOrEqual(body.catalog_accounting.host_budget);
  });

  it('lints one transient plan from stdin and rejects invalid input', () => {
    const valid = {
      outcome: 'change one seam', locked_contract: 'public behavior stays fixed', planning_depth: 'FAST',
      requirements: [{ id: 'R1', change_kind: 'MODIFY', statement: 'change internals', acceptance: ['A1'] }],
      acceptance: [{ id: 'A1', claim: 'works', proof: 'focused test' }],
      slices: [{ id: 'S1', change: 'modify', change_kind: 'MODIFY', requirements: ['R1'], acceptance: ['A1'], source_proof: ['diff'], runtime_proof: ['test'] }],
      escalation_boundary: ['public contract change'],
    };
    expect(run('automation/plan-lint.mjs', ['--stdin'], JSON.stringify(valid)).status).toBe(0);
    expect(run('automation/plan-lint.mjs', ['--stdin'], '{}').status).not.toBe(0);
  });

  it('rejects unapproved skill-sync source before touching canonical state', () => {
    const result = run('automation/skills-sync.mjs', ['--target', 'fake', '--repository', 'https://example.com/fake', '--commit', 'a'.repeat(40), '--source-path', 'skills/fake', '--license', 'MIT']);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/not approved/);
  });
});
