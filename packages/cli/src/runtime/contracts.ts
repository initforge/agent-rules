export const RUNTIME_PLATFORMS = ["codex", "grok", "antigravity", "cursor", "opencode"] as const;
export type RuntimePlatform = (typeof RUNTIME_PLATFORMS)[number];

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
