/**
 * packages/engine/test/false-green-reject.test.ts — M11-R35 seeded
 * false-green/false-reject classification proof (AM-0020 §11).
 *
 * The eval is a self-contained Python script (evals/m11/false_green.py) whose
 * validators own the classification logic; this test drives the real artifact
 * via child_process and asserts the full contract:
 *   - all 21 fixtures reach the correct verdict (false-green BLOCKED,
 *     known-good at correct status);
 *   - AM-0020 §11 acceptance invariants all hold (zero self-review terminal
 *     path, zero capability-invalid PASS, zero unbound terminal report, zero
 *     unbounded repair loop).
 * No logic is re-implemented here — the shipped eval is the source of truth.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const EVAL_PATH = path.resolve(import.meta.dirname, '..', '..', '..', 'evals', 'm11', 'false_green.py');

const FG_IDS = [
  'FG-01', 'FG-02', 'FG-03', 'FG-04', 'FG-05', 'FG-06', 'FG-07', 'FG-08',
  'FG-09', 'FG-10', 'FG-11', 'FG-12', 'FG-13', 'FG-14', 'FG-15', 'FG-16',
  'FG-17', 'FG-18', 'FG-19', 'FG-20', 'FG-21',
];

interface FixtureResult {
  id: string;
  name: string;
  kind: 'false-green' | 'known-good';
  expected: 'BLOCK' | 'ACCEPT';
  status: 'PASS' | 'FAIL';
  note: string;
}

function runEval(): { report: { status: string; detail: { fixtures: FixtureResult[]; summary: Record<string, unknown> } } } {
  const proc = spawnSync('python3', [EVAL_PATH], { encoding: 'utf8', timeout: 30_000 });
  expect(proc.status, `python3 exit code (stderr: ${proc.stderr})`).toBe(0);
  const match = /M11REPORT:(\{.*\})/.exec(proc.stdout);
  expect(match, 'eval must emit one M11REPORT line').not.toBeNull();
  return { report: JSON.parse(match![1]) };
}

describe('M11-R35 seeded false-green/false-reject evaluation (AM-0020 §11)', () => {
  const { report } = runEval();
  const fixtures = report.detail.fixtures;

  it('reports case M11-C10-R35 as PASS', () => {
    expect(report.status).toBe('PASS');
  });

  it('covers all 21 seeded fixtures (FG-01..FG-21)', () => {
    expect(fixtures.map((f) => f.id)).toEqual(FG_IDS);
  });

  it('blocks all 17 false-green fixtures (validator catches every seeded claim)', () => {
    const fg = fixtures.filter((f) => f.kind === 'false-green');
    expect(fg).toHaveLength(17);
    for (const f of fg) {
      expect(f.expected).toBe('BLOCK');
      expect(f.status, `${f.id} ${f.name}: validator must BLOCK`).toBe('PASS');
    }
  });

  it('reaches the correct status for all 4 known-good fixtures (no false reject)', () => {
    const kg = fixtures.filter((f) => f.kind === 'known-good');
    expect(kg).toHaveLength(4);
    for (const f of kg) {
      expect(f.expected).toBe('ACCEPT');
      expect(f.status, `${f.id} ${f.name}: known-good must not be blocked`).toBe('PASS');
    }
  });

  it('holds every AM-0020 §11 acceptance invariant at zero violations', () => {
    const invariants = (report as unknown as { detail: { acceptance_invariants: Record<string, { count: number; expected: number }> } })
      .detail.acceptance_invariants;
    for (const [name, v] of Object.entries(invariants)) {
      expect(v.count, name).toBe(v.expected);
    }
  });

  it('keeps known-good remediation loops bounded (no same-root repair spin)', () => {
    // FG-18 (expected 401/404/409) and FG-21 (resolved findings) are the
    // loop-termination probes; they must PASS with zero retries/reopenings.
    for (const id of ['FG-18', 'FG-21']) {
      const f = fixtures.find((x) => x.id === id)!;
      expect(f.status).toBe('PASS');
    }
  });
});
