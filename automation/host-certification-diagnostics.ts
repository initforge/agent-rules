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
export type CertificationAvailability = 'READY' | 'WAITING_EXTERNAL';
/**
 * Distinguishes the two exit-78 situations so operators can tell "no native
 * runner is observable on this host" from "an installed native host genuinely
 * failed its probes".
 */
export type CertificationReason = 'READY' | 'RUNNERS_UNAVAILABLE' | 'NATIVE_HOST_FAILED';

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

export interface LocalCertificationDiagnostics {
  readonly schema: 'local-host-certification-diagnostics/v1';
  readonly requestedModel: string;
  readonly status: CertificationAvailability;
  /** READY | RUNNERS_UNAVAILABLE (no native host observable) | NATIVE_HOST_FAILED (installed host genuinely failed). */
  readonly reason: CertificationReason;
  readonly hosts: readonly HostCertificationDiagnostic[];
}

const defaultRun: HostDiagnosticOptions['run'] = async (executable, args) => {
  try {
    const result = await execFileAsync(executable, [...args], { maxBuffer: 1024 * 1024, timeout: 5000 });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    return { exitCode: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? String(error) };
  }
};

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const observed = (value: string, evidence: Uint8Array): DiagnosticValue => ({ state: 'OBSERVED', value, evidenceSha256: sha256(evidence) });
const missing = (missingCapability: MissingCapability, reason: string): DiagnosticValue => ({ state: 'MISSING', missingCapability, reason });
const unverified = (reason: string): DiagnosticValue => ({ state: 'UNVERIFIED', reason });

const localResolver = async (host: typeof REQUIRED_DIAGNOSTIC_HOSTS[number]) => {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = await defaultRun(command, [host]);
  if (result.exitCode !== 0 || !result.stdout.trim()) throw new Error(`${host} is not on PATH`);
  return result.stdout.trim().split(/\r?\n/)[0];
};

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
      executable = await (options.resolveExecutable ?? localResolver)(host);
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
      nativeExecution: version.exitCode === 0 ? unverified('version probe is not native model execution') : missing('MISSING_NATIVE_EXECUTION', 'native version probe failed'),
      sessionModel: session ? observed(session.value, session.rawEvidence) : missing('MISSING_SESSION_MODEL', 'no session observation supplied'),
      commit, artifact: artifactValue,
    };
  }));
}

/**
 * Derive the WAITING_EXTERNAL reason from the host diagnostics: any observable
 * host that is not fully observed means an installed native host genuinely
 * failed; zero observable hosts means the runners are unavailable here.
 */
export function certificationReason(hosts: readonly HostCertificationDiagnostic[]): CertificationReason {
  const ready = hosts.every(host => Object.values(host).every(value => typeof value !== 'object' || value.state === 'OBSERVED'));
  if (ready) return 'READY';
  const anyHostObservable = hosts.some(host => host.installed.state === 'OBSERVED' || host.sessionModel.state === 'OBSERVED');
  return anyHostObservable ? 'NATIVE_HOST_FAILED' : 'RUNNERS_UNAVAILABLE';
}

export async function collectLocalCertificationDiagnostics(requestedModel: string, repositoryRoot: string): Promise<LocalCertificationDiagnostics> {
  const hosts = await collectHostCertificationDiagnostics({ requestedModel, repositoryRoot });
  const reason = certificationReason(hosts);
  return {
    schema: 'local-host-certification-diagnostics/v1', requestedModel,
    status: reason === 'READY' ? 'READY' : 'WAITING_EXTERNAL',
    reason,
    hosts,
  };
}
