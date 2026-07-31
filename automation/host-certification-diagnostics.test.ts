import { describe, expect, it } from 'vitest';
import { collectHostCertificationDiagnostics, REQUIRED_DIAGNOSTIC_HOSTS } from './host-certification-diagnostics.js';

const model = 'qwencoder/qwen3.7-max';
const hosts = Object.fromEntries(REQUIRED_DIAGNOSTIC_HOSTS.map((host) => [host, `/native/${host}`]));

describe('host certification diagnostics', () => {
  it('reports observations without creating an attestation', async () => {
    const result = await collectHostCertificationDiagnostics({
      requestedModel: model, repositoryRoot: process.cwd(), artifactPath: '/does/not/exist',
      resolveExecutable: async (host) => hosts[host],
      run: async (executable) => ({ exitCode: 0, stdout: `${executable} 1.2.3\n`, stderr: '' }),
    });
    expect(result).toHaveLength(5);
    expect(result.every((item) => item.requestedModel === model)).toBe(true);
    expect(result.every((item) => item.nativeExecution.state === 'UNVERIFIED')).toBe(true);
    expect(result.every((item) => item.artifact.missingCapability === 'MISSING_ARTIFACT')).toBe(true);
    expect(result[0]).not.toHaveProperty('capabilityStatus');
  });

  it('never treats a version probe as native model execution', async () => {
    const [item] = await collectHostCertificationDiagnostics({
      requestedModel: model, repositoryRoot: process.cwd(), resolveExecutable: async () => '/native/opencode',
      run: async () => ({ exitCode: 0, stdout: '1.2.3\n', stderr: '' }),
    });
    expect(item.nativeExecution).toMatchObject({ state: 'UNVERIFIED' });
    expect(item.nativeExecution).not.toHaveProperty('evidenceSha256');
  });

  it('distinguishes absent host, session, commit, and artifact capabilities', async () => {
    const result = await collectHostCertificationDiagnostics({
      requestedModel: model, repositoryRoot: '/does/not/exist',
      resolveExecutable: async (host) => host === 'opencode' ? '/native/opencode' : Promise.reject(new Error('not installed')),
      run: async () => ({ exitCode: 1, stdout: '', stderr: 'blocked' }),
    });
    const opencode = result.find((item) => item.host === 'opencode')!;
    expect(opencode.version.missingCapability).toBe('MISSING_VERSION');
    expect(opencode.nativeExecution.missingCapability).toBe('MISSING_NATIVE_EXECUTION');
    expect(opencode.sessionModel.missingCapability).toBe('MISSING_SESSION_MODEL');
    expect(opencode.commit.missingCapability).toBe('MISSING_COMMIT');
    expect(opencode.artifact.missingCapability).toBe('MISSING_ARTIFACT');
    expect(result.find((item) => item.host === 'codex')!.installed.missingCapability).toBe('MISSING_HOST');
  });
});
