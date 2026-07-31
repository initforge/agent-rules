import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CERTIFICATION_REQUIRED_HOSTS } from '../packages/engine/src/contracts.js';

const execFileAsync = promisify(execFile);
export const REQUIRED_DIAGNOSTIC_HOSTS = [...CERTIFICATION_REQUIRED_HOSTS] as const;
export const MISSING_CAPABILITIES = [
  'MISSING_HOST', 'MISSING_VERSION', 'MISSING_NATIVE_EXECUTION',
  'MISSING_SESSION_MODEL', 'MISSING_COMMIT', 'MISSING_ARTIFACT',
] as const;
export type MissingCapability = typeof MISSING_CAPABILITIES[number];
export type DiagnosticState = 'OBSERVED' | 'MISSING' | 'UNVERIFIED';

export interface DiagnosticValue {
  readonly state: DiagnosticState;
  readonly value?: string;
  readonly evidenceSha256?: string;
  readonly missingCapability?: MissingCapability;
  readonly reason?: string;
}

export interface SessionModelObservation {
  readonly value: string;
  readonly rawEvidence: Uint8Array;
  readonly sourceUri: string;
}

export interface HostCertificationDiagnostic {
  readonly host: typeof REQUIRED_DIAGNOSTIC_HOSTS[number];
  readonly requestedModel: string;
  readonly installed: DiagnosticValue;
  readonly version: DiagnosticValue;
  readonly nativeExecution: DiagnosticValue;
  readonly sessionModel: DiagnosticValue;
  readonly commit: DiagnosticValue;
  readonly artifact: DiagnosticValue;
}

export interface HostDiagnosticOptions {
  readonly requestedModel: string;
  readonly repositoryRoot: string;
  readonly artifactPath?: string;
  readonly resolveExecutable?: (host: typeof REQUIRED_DIAGNOSTIC_HOSTS[number]) => Promise<string>;
  readonly sessionModels?: Readonly<Record<string, SessionModelObservation>>;
  readonly run?: (executable: string, args: readonly string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

const defaultRun: HostDiagnosticOptions['run'] = async (executable, args) => {
  try {
    const result = await execFileAsync(executable, [...args], { maxBuffer: 1024 * 1024 });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    return { exitCode: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? String(error) };
  }
};

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const observed = (value: string, evidence: Uint8Array): DiagnosticValue => ({ state: 'OBSERVED', value, evidenceSha256: sha256(evidence) });
const missing = (missingCapability: MissingCapability, reason: string): DiagnosticValue => ({ state: 'MISSING', missingCapability, reason });
const unverified = (reason: string): DiagnosticValue => ({ state: 'UNVERIFIED', reason });

async function gitCommit(root: string): Promise<DiagnosticValue> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD']);
    const value = stdout.trim();
    return /^[0-9a-f]{40,64}$/i.test(value) ? observed(value, new TextEncoder().encode(stdout)) : missing('MISSING_COMMIT', 'git HEAD is not a commit ID');
  } catch { return missing('MISSING_COMMIT', 'repository HEAD unavailable'); }
}

async function artifact(filePath: string | undefined): Promise<DiagnosticValue> {
  if (!filePath) return missing('MISSING_ARTIFACT', 'artifact path was not supplied');
  try {
    const metadata = await lstat(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return missing('MISSING_ARTIFACT', 'artifact is not a regular file');
    const bytes = new Uint8Array(await readFile(filePath));
    return observed(path.resolve(filePath), bytes);
  } catch { return missing('MISSING_ARTIFACT', 'artifact is unavailable'); }
}

export async function collectHostCertificationDiagnostics(options: HostDiagnosticOptions): Promise<HostCertificationDiagnostic[]> {
  if (!options.requestedModel.trim()) throw new Error('requestedModel is required');
  const run = options.run ?? defaultRun;
  const commit = await gitCommit(options.repositoryRoot);
  const artifactValue = await artifact(options.artifactPath);
  return Promise.all(REQUIRED_DIAGNOSTIC_HOSTS.map(async (host) => {
    let executable: string;
    try {
      executable = await (options.resolveExecutable ?? (async () => { throw new Error('resolver not supplied'); }))(host);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { host, requestedModel: options.requestedModel, installed: missing('MISSING_HOST', reason), version: missing('MISSING_VERSION', 'host is not installed'), nativeExecution: missing('MISSING_NATIVE_EXECUTION', 'host executable unavailable'), sessionModel: options.sessionModels?.[host] ? unverified('session evidence supplied without executable') : missing('MISSING_SESSION_MODEL', 'no session observation supplied'), commit, artifact: artifactValue };
    }
    const version = await run(executable, ['--version']);
    const raw = new TextEncoder().encode(`${version.stdout}|stderr:${version.stderr}`);
    const value = `${version.stdout}${version.stderr}`.trim();
    const session = options.sessionModels?.[host];
    return {
      host, requestedModel: options.requestedModel,
      installed: observed(executable, new TextEncoder().encode(executable)),
      version: version.exitCode === 0 && value ? observed(value, raw) : missing('MISSING_VERSION', 'version probe failed'),
      nativeExecution: version.exitCode === 0 ? observed('executed --version', raw) : missing('MISSING_NATIVE_EXECUTION', 'native version probe failed'),
      sessionModel: session ? observed(session.value, session.rawEvidence) : missing('MISSING_SESSION_MODEL', 'no session observation supplied'),
      commit, artifact: artifactValue,
    };
  }));
}
