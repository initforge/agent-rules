import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { VerificationEngine, NotImplementedError, parseCommand } from '../src/runner/verifier.js';
import type { VerificationProfile } from '../src/runner/profile.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-test-'));

// Helper: write a tiny JS file to disk and exec it via Node. SafeArgvRunner
// forbids shell-metacharacter args (including `"` for `-e "..."` AND `\` in
// paths on Windows), so we can't inline the script body and we can't pass a
// Windows-style path. Materialise the script and use POSIX-style slashes —
// Node resolves them on Windows just fine.
function scriptFile(name: string, source: string): string {
  const file = path.join(TMP, name);
  fs.writeFileSync(file, source);
  // Normalise to forward slashes; ARG_METACHAR rejects `\\`.
  return file.split(path.sep).join('/');
}

const PASS_SCRIPT = scriptFile('pass.js', 'process.exit(0);');
const FAIL7_SCRIPT = scriptFile('fail7.js', 'process.exit(7);');
const FAIL1_SCRIPT = scriptFile('fail1.js', 'process.exit(1);');

describe('VerificationEngine (runner/verifier)', () => {
  describe('parseCommand', () => {
    it('splits on whitespace without invoking a shell', () => {
      const inv = parseCommand('npm  run  check', '/tmp');
      expect(inv.executable).toBe('npm');
      expect(inv.args).toEqual(['run', 'check']);
      expect(inv.cwd).toBe('/tmp');
    });

    it('rejects empty command', () => {
      expect(() => parseCommand('   ', '/tmp')).toThrow(/empty/);
    });
  });

  describe('shell steps (backward compatibility)', () => {
    it('passes when exit code is 0', async () => {
    const engine = new VerificationEngine({ cwd: TMP });
    const profile: VerificationProfile = {
      steps: [{ kind: 'shell', command: `node ${PASS_SCRIPT}` }],
      evidence: [],
    };
    const out = await engine.evaluate(profile);
    expect(out.passed).toBe(true);
    expect(out.stepResults[0].exitCode).toBe(0);
  });

    it('fails when exit code is non-zero', async () => {
    const engine = new VerificationEngine({ cwd: TMP });
    const profile: VerificationProfile = {
      steps: [{ kind: 'shell', command: `node ${FAIL7_SCRIPT}` }],
      evidence: [],
    };
    const out = await engine.evaluate(profile);
    expect(out.passed).toBe(false);
    expect(out.stepResults[0].exitCode).toBe(7);
  });

    it('returns 127 when executable is missing', async () => {
      const engine = new VerificationEngine({ cwd: TMP });
      const profile: VerificationProfile = {
        steps: [{ kind: 'shell', command: 'definitely-not-a-real-binary-xyz' }],
        evidence: [],
      };
      const out = await engine.evaluate(profile);
      expect(out.stepResults[0].exitCode).toBe(127);
      expect(out.passed).toBe(false);
    });

    it('rejects shell metacharacters via SafeArgvRunner', async () => {
      const engine = new VerificationEngine({ cwd: TMP });
      const profile: VerificationProfile = {
        steps: [{ kind: 'shell', command: 'echo $(whoami)' }],
        evidence: [],
      };
      const out = await engine.evaluate(profile);
      expect(out.stepResults[0].exitCode).toBe(-1);
    });

    it('handles a profile with multiple shell steps', async () => {
    const engine = new VerificationEngine({ cwd: TMP });
    const profile: VerificationProfile = {
      steps: [
        { kind: 'shell', command: `node ${PASS_SCRIPT}` },
        { kind: 'shell', command: `node ${FAIL1_SCRIPT}` },
      ],
      evidence: [],
    };
    const out = await engine.evaluate(profile);
    expect(out.passed).toBe(false);
    expect(out.stepResults.map((r) => r.exitCode)).toEqual([0, 1]);
  });
  });

  describe('non-shell step kinds (P2 stub)', () => {
    it('playwright throws NotImplementedError', async () => {
      const engine = new VerificationEngine({ cwd: TMP });
      const profile: VerificationProfile = {
        steps: [{ kind: 'playwright', spec: 'tests/x.spec.ts' }],
        evidence: [],
      };
      await expect(engine.evaluate(profile)).rejects.toBeInstanceOf(NotImplementedError);
    });

    it('browser-script throws NotImplementedError', async () => {
      const engine = new VerificationEngine({ cwd: TMP });
      const profile: VerificationProfile = {
        steps: [{ kind: 'browser-script', path: 'scripts/x.mjs' }],
        evidence: [],
      };
      await expect(engine.evaluate(profile)).rejects.toBeInstanceOf(NotImplementedError);
    });

    it('mcp-tool-call throws NotImplementedError', async () => {
      const engine = new VerificationEngine({ cwd: TMP });
      const profile: VerificationProfile = {
        steps: [{ kind: 'mcp-tool-call', server: 'chrome-devtools', tool: 'list_console_messages' }],
        evidence: [],
      };
      await expect(engine.evaluate(profile)).rejects.toBeInstanceOf(NotImplementedError);
    });

    it('visual-diff throws NotImplementedError (threshold not wired)', async () => {
      const engine = new VerificationEngine({ cwd: TMP });
      const profile: VerificationProfile = {
        steps: [{ kind: 'visual-diff', baseline: '/nonexistent.png', current: '/nonexistent.png' }],
        evidence: [],
      };
      await expect(engine.evaluate(profile)).rejects.toBeInstanceOf(NotImplementedError);
    });
  });

  describe('evidence collection (shell path)', () => {
    it('produces no evidence refs for shell steps', async () => {
    const engine = new VerificationEngine({ cwd: TMP });
    const profile: VerificationProfile = {
      steps: [{ kind: 'shell', command: `node ${PASS_SCRIPT}` }],
      evidence: [],
    };
    const out = await engine.evaluate(profile);
    expect(out.evidence).toEqual([]);
  });
  });

  describe('evidence dir', () => {
    it('creates the evidence dir if it does not exist', () => {
      const dir = path.join(TMP, 'evidence', 'task-1');
      expect(fs.existsSync(dir)).toBe(false);
      new VerificationEngine({ cwd: TMP, evidenceDir: dir });
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe('validateShell (static helper)', () => {
    it('accepts benign commands', () => {
      const v = VerificationEngine.validateShell('npm test', TMP);
      expect(v.valid).toBe(true);
    });

    it('rejects empty commands', () => {
      const v = VerificationEngine.validateShell('   ', TMP);
      expect(v.valid).toBe(false);
    });

    it('rejects unsafe metacharacters', () => {
      const v = VerificationEngine.validateShell('rm -rf /; echo done', TMP);
      expect(v.valid).toBe(false);
    });
  });
});