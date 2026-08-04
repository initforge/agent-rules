export type CleanupClassification = "delete" | "rescue" | "keep";
export type CleanupMode = "delete" | "rescue" | "inventory";

export interface ClassifiedItem {
  /** Absolute resolved path */
  path: string;
  /** Path relative to repo root */
  rel: string;
  kind: "file" | "directory";
  /** 0 for directories */
  sizeBytes: number;
  classification: CleanupClassification;
  reason: string;
}

export interface CleanupReceipt {
  schema: "artifact/cleanup-receipt";
  version: 1;
  receiptId: string;
  createdAt: string;
  repoRoot: string;
  mode: CleanupMode;
  dryRun: boolean;
  irreversible: boolean;
  gitHead: string | null;
  /** Rescue destination root (null for delete) */
  quarantineDir: string | null;
  items: ClassifiedItem[];
  rollback: string[];
  hash: string;
}

/**
 * Non-production guard: segments that are never deletable/rescuable.
 * Fail-closed — junk under any of these is classified `keep`.
 * Covers the B05 mandate (no generated/**, .agent/** etc. mutation).
 */
export const PROTECTED_SEGMENTS: readonly string[] = [
  ".git",
  "node_modules",
  "dist",
  "generated",
  ".agent",
  "src",
  "packages",
  "docs",
  "rules",
  "skills",
  "schemas",
  "platforms",
  "integrations",
  "profiles",
  "evals",
  "automation",
  ".github",
  ".cleanup-quarantine",
  ".cleanup-receipts",
];

/** Exact basenames treated as junk (deletable). */
export const JUNK_BASENAMES: ReadonlySet<string> = new Set([
  ".DS_Store",
  "__pycache__",
  "coverage",
  ".next",
  ".cache",
  ".turbo",
  ".eslintcache",
  "Thumbs.db",
]);

/** Extensions treated as junk (deletable). Lowercase. */
export const JUNK_EXTENSIONS: ReadonlySet<string> = new Set([
  ".log",
  ".tmp",
  ".bak",
  ".pyc",
  ".swp",
  ".orig",
  ".rej",
]);
