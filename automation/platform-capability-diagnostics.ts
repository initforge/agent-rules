import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const SUPPORTED_PLATFORMS = ['linux', 'windows', 'macos'] as const;
export type SupportedPlatform = typeof SUPPORTED_PLATFORMS[number];
export type CapabilityState = 'OBSERVED' | 'UNAVAILABLE' | 'BLOCKED';

export interface PlatformCapabilityDiagnostic {
  readonly platform: SupportedPlatform;
  readonly state: CapabilityState;
  readonly observedPlatform: string;
  readonly scope: 'host-identity-only';
  readonly reason: string;
  readonly checks: Readonly<Record<string, { state: CapabilityState; reason: string }>>;
}

export interface PlatformCapabilityReceipt {
  readonly schema: 'harness/platform-capability-diagnostics/v1';
  readonly generatedAt: string;
  readonly currentPlatform: SupportedPlatform;
  readonly provenance: {
    readonly repositoryRoot: string;
    readonly gitHead: string;
    readonly planId: string;
    readonly planRevision: number;
    readonly pointerGeneration: number;
    readonly ledgerPath: string;
    readonly ledgerSha256: string;
  };
  readonly platforms: readonly PlatformCapabilityDiagnostic[];
  readonly note: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalPlatform(value: string): SupportedPlatform {
  if (value === 'linux') return 'linux';
  if (value === 'win32' || value === 'windows') return 'windows';
  if (value === 'darwin' || value === 'macos') return 'macos';
  throw new Error(`unsupported host platform: ${value}`);
}

function gitHead(root: string): string {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'UNAVAILABLE';
  }
}

function checkSet(state: CapabilityState, reason: string): Readonly<Record<string, { state: CapabilityState; reason: string }>> {
  return {
    runtime_identity: { state, reason },
    native_process_adapter: { state, reason: state === 'OBSERVED' ? 'current runtime is executing on this host' : reason },
    clean_install: { state: 'UNAVAILABLE', reason: 'not claimed by host-identity diagnostics; requires a native install run' },
    browser_mobile: { state: 'UNAVAILABLE', reason: 'not claimed by host-identity diagnostics; requires the applicable live capability cell' },
  };
}

export function collectPlatformCapabilityDiagnostics(
  repositoryRoot: string,
  observedRuntimePlatform = process.platform,
): PlatformCapabilityReceipt {
  const root = path.resolve(repositoryRoot);
  const currentPlatform = canonicalPlatform(observedRuntimePlatform);
  const pointerPath = path.join(root, '.agent', 'current.json');
  const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8')) as {
    generation?: number;
    plan_id?: string;
    canonical_ledger?: { path?: string; observed_revision?: number };
  };
  const ledgerPath = pointer.canonical_ledger?.path;
  if (!pointer.plan_id || !Number.isInteger(pointer.generation) || !ledgerPath) {
    throw new Error('current pointer is missing plan, generation, or canonical ledger binding');
  }
  const resolvedLedger = path.resolve(root, ledgerPath);
  if (!resolvedLedger.startsWith(`${root}${path.sep}`) || !fs.statSync(resolvedLedger).isFile()) {
    throw new Error('canonical ledger path is outside the repository or not a file');
  }
  const ledgerBytes = fs.readFileSync(resolvedLedger);
  const platforms = SUPPORTED_PLATFORMS.map((platform): PlatformCapabilityDiagnostic => {
    if (platform === currentPlatform) {
      return {
        platform,
        state: 'OBSERVED',
        observedPlatform: observedRuntimePlatform,
        scope: 'host-identity-only',
        reason: 'runtime platform identity observed on the current host; this is not native scenario certification',
        checks: checkSet('OBSERVED', 'current runtime platform identity observed'),
      };
    }
    const reason = `native ${platform} host is unavailable on the current ${currentPlatform} host; no result inferred from static configuration`;
    return {
      platform,
      state: 'UNAVAILABLE',
      observedPlatform: observedRuntimePlatform,
      scope: 'host-identity-only',
      reason,
      checks: checkSet('UNAVAILABLE', reason),
    };
  });
  return {
    schema: 'harness/platform-capability-diagnostics/v1',
    generatedAt: new Date().toISOString(),
    currentPlatform,
    provenance: {
      repositoryRoot: root,
      gitHead: gitHead(root),
      planId: pointer.plan_id,
      planRevision: pointer.canonical_ledger?.observed_revision ?? 0,
      pointerGeneration: pointer.generation as number,
      ledgerPath,
      ledgerSha256: sha256(ledgerBytes),
    },
    platforms,
    note: 'This receipt proves truthful capability classification only. OBSERVED is host identity, not a PASS for clean-install, browser, mobile, or cross-OS behavior.',
  };
}

async function main(): Promise<void> {
  const output = process.env.PLATFORM_DIAGNOSTICS_OUTPUT;
  const receipt = collectPlatformCapabilityDiagnostics(process.cwd());
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  if (output) fs.writeFileSync(path.resolve(output), json, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(json);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
