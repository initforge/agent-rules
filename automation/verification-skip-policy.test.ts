import { describe, expect, it } from 'vitest';
import { evaluateVitestSkipPolicy } from './verification-skip-policy.mjs';

const root = '/repo';
const linuxName = 'createExecutableSnapshot replaces Windows file and directory DACLs and verifies the exact one-ACE policy';
const posixOne = 'createExecutableSnapshot rejects POSIX symlink targets via O_NOFOLLOW';
const posixTwo = 'createExecutableSnapshot applies and verifies POSIX 0o500 snapshot mode';
const policy = {
  version: 1,
  always: [],
  platforms: {
    linux: [{ file: 'automation/host-attestation.test.ts', fullName: linuxName, rationale: 'Windows-only native ACL verification is not executable on Linux.' }],
    win32: [
      { file: 'automation/host-attestation.test.ts', fullName: posixOne, rationale: 'POSIX-only O_NOFOLLOW behavior is not executable on Windows.' },
      { file: 'automation/host-attestation.test.ts', fullName: posixTwo, rationale: 'POSIX-only mode bits are not executable on Windows.' },
    ],
  },
};

function report(platformSkips: string[]) {
  return {
    testResults: [
      { name: '/repo/automation/host-attestation.test.ts', assertionResults: platformSkips.map((fullName) => ({ fullName, title: fullName, status: 'skipped' })) },
    ],
  };
}

describe('verification skip policy', () => {
  it('accepts only the exact platform skip set', () => {
    expect(evaluateVitestSkipPolicy(report([linuxName]), policy, 'linux', root).ok).toBe(true);
    expect(evaluateVitestSkipPolicy(report([posixOne, posixTwo]), policy, 'win32', root).ok).toBe(true);
  });

  it('rejects an unexpected skip even when the file is approved', () => {
    const result = evaluateVitestSkipPolicy(report([linuxName, 'createExecutableSnapshot some new skipped test']), policy, 'linux', root);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('unexpected skips');
  });

  it('rejects a stale policy when an expected platform skip disappears', () => {
    const result = evaluateVitestSkipPolicy(report([]), policy, 'linux', root);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('expected platform skips missing');
  });

  it('rejects platforms without an explicit policy entry', () => {
    const result = evaluateVitestSkipPolicy(report([]), policy, 'freebsd', root);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('no explicit entry');
  });
});
