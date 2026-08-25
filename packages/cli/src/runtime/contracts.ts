import fs from 'node:fs';
import path from 'node:path';
function loadPlatforms(): readonly string[] {
  try {
    const candidates = [
      path.join(process.cwd(), 'platforms', 'platform-contracts.json'),
      path.resolve(import.meta.dirname ?? '.', '../../../../platforms/platform-contracts.json'),
    ];
    for (const p of candidates) if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p,'utf8')) as { registry?: { host_ids: string[] } };
      if (j.registry?.host_ids?.length) return j.registry.host_ids;
    }
  } catch {}
  return ["opencode", "codex", "claude", "grok", "antigravity", "cursor", "deepseek-harness", "command-code"];
}
export const RUNTIME_PLATFORMS = loadPlatforms() as unknown as ["opencode", "codex", "claude", "grok", "antigravity", "cursor", "deepseek-harness", "command-code"];
export type RuntimePlatform = (typeof RUNTIME_PLATFORMS)[number];

// ── Host reconciliation contract — single source is platforms/platform-contracts.json (v3 NativeHostContract)
// RUNTIME_PLATFORMS is now loaded from the canonical registry at runtime (fallback only when file absent).
// HostId aliases RuntimePlatform so the transactional runtime installer and the reconciler share one identity set.

export type HostId = RuntimePlatform;
export const REGISTERED_HOSTS: readonly HostId[] = RUNTIME_PLATFORMS;

export type HostStatus = "installed" | "absent" | "unsupported";

export type HostSignalKind =
  | "binary-on-path"
  | "desktop-process"
  | "known-install-root"
  | "config-dir"
  | "install-receipt"
  | "live-probe";

/** One detection observation. `live` marks signals that prove an application
 *  is actually present. A config directory or a stale harness receipt alone
 *  is NOT proof of installation and is therefore never `live`. */
export interface HostSignal {
  kind: HostSignalKind;
  detail: string;
  live: boolean;
}

export interface HostDetection {
  host: string;
  status: HostStatus;
  installed: boolean;
  signals: HostSignal[];
  installRoot?: string;
  configDir?: string;
  /** Stale evidence found but no live application signal. */
  staleEvidence: boolean;
  reason?: string;
  /** Availability never grants task authority. Always false by contract. */
  readonly taskAuthority: false;
}

export interface HostInventoryEntry {
  host: string;
  status: HostStatus;
  installed: boolean;
  signals: HostSignal[];
  installRoot?: string;
  configDir?: string;
  staleEvidence: boolean;
  runtimeReceipt?: { present: boolean; effectivePlanSha256?: string };
  readonly taskAuthority: false;
}

export interface DesiredSkill {
  id: string;
  source: string;
}

export interface DesiredProvider {
  id: string;
  mode: "required" | "optional";
}

export interface DesiredRuntime {
  skills: DesiredSkill[];
  providers: DesiredProvider[];
  /** e.g. `agent-rules-runtime@<effective-plan-sha256>` */
  runtimeState: string;
  source: string;
}

export interface RuntimeProjection {
  host: string;
  status: HostStatus;
  desired: DesiredRuntime;
  actual: {
    skills: DesiredSkill[];
    providers: DesiredProvider[];
    runtimeState: string;
  };
  drift: {
    skills: string[];
    providers: string[];
    runtimeState: boolean;
  };
  /** True when every drifted item is harness-owned and safely repairable. */
  safeToRepair: boolean;
}

export type RepairActionKind = "report-only" | "swap-managed-file" | "restore-backup" | "noop";

export interface RepairAction {
  kind: RepairActionKind;
  target?: string;
  reason: string;
}

export interface HostRepairReceipt {
  schema: "agent-rules/host-reconcile-receipt";
  version: 1;
  host: string;
  status: "in-sync" | "drifted" | "repaired" | "partial" | "absent" | "unsupported";
  projectedAt: string;
  repairedAt?: string;
  desired: DesiredRuntime;
  drift: { skills: string[]; providers: string[]; runtimeState: boolean };
  actions: RepairAction[];
  transaction?: {
    journal: string;
    backup: string;
    phase: "prepared" | "backed-up" | "committed";
  };
  mutated: boolean;
  readonly taskAuthority: false;
}

/** Injectable live facts so detection is deterministic and testable. */
export interface HostProbes {
  pathEntries: () => string[];
  processList: (pattern: string) => Promise<string[]>;
  runProbe: (binary: string, args: string[]) => Promise<{ ok: boolean; stdout: string }>;
  fileExists: (filePath: string) => Promise<boolean>;
  readFileText: (filePath: string) => Promise<string | undefined>;
}

export interface RepairOptions {
  reportOnly: boolean;
  /** Resolver for harness-owned desired managed content; only entries listed
   *  in the host ownership manifest may be swapped. Absent entries are
   *  reported report-only and never written (invariant: repair never
   *  overwrites unmanaged user configuration blindly). */
  desiredManagedFiles?: (root: string, detection: HostDetection) => Promise<ManagedContent[]>;
  failpoint?: "crash-after-backup-before-swap";
}

export interface ManagedContent {
  relativePath: string;
  sha256: string;
  content: Buffer;
  source: string;
}

export interface ProbeResult {
  live: boolean;
  detail: string;
}

/** The common HostAdapter contract shared by all registered hosts:
 *  detect / inventory / project / probe / repair / rollback. Unknown hosts
 *  have no adapter and must return UNSUPPORTED (never a false parity PASS). */
export interface HostAdapter {
  readonly id: HostId;
  detect(probes?: Partial<HostProbes>): Promise<HostDetection>;
  inventory(detection: HostDetection): Promise<HostInventoryEntry>;
  project(desired: DesiredRuntime, detection: HostDetection): Promise<RuntimeProjection>;
  probe(projection: RuntimeProjection): Promise<ProbeResult>;
  repair(projection: RuntimeProjection, options: RepairOptions): Promise<HostRepairReceipt>;
  rollback(receipt: HostRepairReceipt): Promise<void>;
}

export interface RuntimeFile { path: string; sha256: string }
export interface SourceManifest { version: number; platform: RuntimePlatform; files: RuntimeFile[] }
export interface ActivationRecord {
  kind: "managed-file" | "managed-directory-link";
  id: "global-instructions" | "global-rules";
  sha256?: string;
  linkTarget?: string;
}
export interface RuntimeReceipt {
  schema: "agent-rules/runtime-receipt";
  version: 1;
  platform: RuntimePlatform;
  installedAt: string;
  source: {
    manifestSha256: string;
    artifactSha256: string;
    effectivePlanSha256: string;
    effectivePlanLedger: string;
    effectivePlanLedgerSha256: string;
    repositoryContext: { gitHead: string; gitTree: string; relation: "context-only-not-artifact-attestation" };
  };
  activation: ActivationRecord;
  files: RuntimeFile[];
}
export interface RuntimeInstallerOptions {
  repositoryRoot: string;
  platformRoots?: Partial<Record<RuntimePlatform, string>>;
  dryRun?: boolean;
  failpoint?: "after-stage" | "after-journal" | "after-backup" | "crash-after-backup" | "crash-after-swap-before-activation" |
    "crash-after-swap" | "crash-rollback-after-target-move" | "crash-rollback-after-backed-up-journal" |
    "crash-rollback-after-backup-restore" | "crash-rollback-after-staging-backup" |
    "crash-rollback-after-commit-journal" | "crash-migration-after-archive";
}
export interface RuntimeLifecycleResult {
  platform: RuntimePlatform;
  targetRoot: string;
  runtimePath: string;
  dryRun: boolean;
  receipt?: RuntimeReceipt;
  migration?: { receiptPath: string; archivePath: string; legacyManifestSha256: string; fileCount: number };
}
