import { describe, expect, it } from 'vitest';
import {
  liftVerification,
  parseVerification,
  type VerificationStep,
  type VerificationProfile,
} from '../src/runner/profile.js';

// Test name conventions (smoke / e2e / browser):
//   - Default: any test not prefixed [e2e] or [browser] runs in `npm run smoke`
//     via the standard `vitest run`. Smoke subset finishes in < 30s.
//   - [e2e]:   may spawn a real agent / open a browser. Run with
//     `npm run test:e2e -- engine`.  Skipped by default smoke.
//   - [browser]: Playwright / chrome-devtools MCP. Run with
//     `npm run test:browser -- engine`. Skipped by default smoke.
//   - [flaky]: known flaky on Windows symlink tests; tracked separately
//     in `npm run test:flaky`.
//
// Filter via `--testNamePattern`:
//   vitest run --testNamePattern="^(?!.*\\[browser\\]).*$"
//   vitest run --testNamePattern="^\\[e2e\\] .*"

describe('VerificationProfile (runner/profile)', () => {
  describe('liftVerification', () => {
    it('wraps every command as a shell step', () => {
      const profile = liftVerification(['npm run check', 'npm test']);
      expect(profile.steps).toHaveLength(2);
      expect(profile.steps[0]).toEqual({ kind: 'shell', command: 'npm run check' });
      expect(profile.steps[1]).toEqual({ kind: 'shell', command: 'npm test' });
      expect(profile.evidence).toEqual([]);
    });

    it('throws on empty command (matches runner refuse-at-enqueue rule)', () => {
      expect(() => liftVerification([''])).toThrow(/empty/);
      expect(() => liftVerification(['   '])).toThrow(/empty/);
    });

    it('preserves order', () => {
      const profile = liftVerification(['b', 'a', 'c']);
      expect(profile.steps.map((s) => (s as { command: string }).command)).toEqual(['b', 'a', 'c']);
    });
  });

  describe('parseVerification', () => {
    it('accepts a flat string[] (legacy format) and lifts it', () => {
      const profile = parseVerification(['npm test']);
      expect(profile.steps).toEqual([{ kind: 'shell', command: 'npm test' }]);
    });

    it('parses shell step explicitly', () => {
      const profile = parseVerification({ steps: [{ kind: 'shell', command: 'npm run check' }] });
      expect(profile.steps[0].kind).toBe('shell');
    });

    it('parses exact argv steps without shell tokenization', () => {
      const profile = parseVerification({ steps: [{ kind: 'argv', executable: process.execPath, args: ['-e', 'process.exit(0)'], timeoutMs: 5000 }] });
      expect(profile.steps[0]).toEqual({ kind: 'argv', executable: process.execPath, args: ['-e', 'process.exit(0)'], cwd: undefined, timeoutMs: 5000 });
    });

    it('parses playwright step with optional headed + tabProfile', () => {
      const profile = parseVerification({
        steps: [{ kind: 'playwright', spec: 'tests/ui/button.spec.ts', headed: true, tabProfile: 'task-7' }],
        evidence: ['screenshot', 'console'],
      });
      const step = profile.steps[0] as Extract<VerificationStep, { kind: 'playwright' }>;
      expect(step.kind).toBe('playwright');
      expect(step.spec).toBe('tests/ui/button.spec.ts');
      expect(step.headed).toBe(true);
      expect(step.tabProfile).toBe('task-7');
      expect(profile.evidence).toEqual(['screenshot', 'console']);
    });

    it('parses browser-script step', () => {
      const profile = parseVerification({
        steps: [{ kind: 'browser-script', path: 'scripts/visual-check.mjs' }],
      });
      const step = profile.steps[0] as Extract<VerificationStep, { kind: 'browser-script' }>;
      expect(step.kind).toBe('browser-script');
      expect(step.path).toBe('scripts/visual-check.mjs');
    });

    it('parses mcp-tool-call step with arbitrary args', () => {
      const profile = parseVerification({
        steps: [{ kind: 'mcp-tool-call', server: 'chrome-devtools', tool: 'list_console_messages', args: { since: 'load' } }],
      });
      const step = profile.steps[0] as Extract<VerificationStep, { kind: 'mcp-tool-call' }>;
      expect(step.server).toBe('chrome-devtools');
      expect(step.tool).toBe('list_console_messages');
      expect(step.args).toEqual({ since: 'load' });
    });

    it('parses visual-diff step with threshold default', () => {
      const profile = parseVerification({
        steps: [{ kind: 'visual-diff', baseline: 'snapshots/baseline.png', current: 'snapshots/current.png' }],
      });
      const step = profile.steps[0] as Extract<VerificationStep, { kind: 'visual-diff' }>;
      expect(step.kind).toBe('visual-diff');
      expect(step.threshold).toBeUndefined();
    });

    it('rejects unknown step kind', () => {
      expect(() => parseVerification({ steps: [{ kind: 'lol', x: 1 }] })).toThrow(/unknown kind/);
    });

    it('rejects empty steps', () => {
      expect(() => parseVerification({ steps: [] })).toThrow(/non-empty/);
    });

    it('rejects non-object input', () => {
      expect(() => parseVerification(42)).toThrow();
      expect(() => parseVerification('hello')).toThrow();
    });

    it('rejects invalid evidence kind', () => {
      expect(() =>
        parseVerification({
          steps: [{ kind: 'shell', command: 'x' }],
          evidence: ['screenshot', 'mystery-evidence'],
        })
      ).toThrow(/invalid kind/);
    });

    it('rejects negative timeoutMs', () => {
      expect(() =>
        parseVerification({
          steps: [{ kind: 'shell', command: 'x' }],
          timeoutMs: -1,
        })
      ).toThrow(/positive/);
    });

    it('rejects threshold outside [0, 1] for visual-diff', () => {
      expect(() =>
        parseVerification({
          steps: [{ kind: 'visual-diff', baseline: 'a', current: 'b', threshold: 1.5 }],
        })
      ).toThrow(/threshold/);
    });
  });

  describe('compatibility with the runner (no breaking changes)', () => {
    it('a profile produced from a string[] round-trips through parseVerification', () => {
      const lifted: VerificationProfile = liftVerification(['npm run check']);
      // The runner currently stores this as `verification: string[]`. After
      // P1c, it lifts once more internally — but the type stays valid.
      const parsed = parseVerification(['npm run check']);
      expect(parsed.steps).toEqual(lifted.steps);
    });
  });
});