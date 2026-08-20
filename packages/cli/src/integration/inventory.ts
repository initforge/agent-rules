import fs from "node:fs/promises";
import path from "node:path";

/**
 * Canonical integration inventory loader.
 *
 * `integrations/registry.json` is the single source of truth for every
 * capability entry (id, kind, policy, activation, install mechanism).
 * This loader is the ONLY place the CLI reads the registry; no other module
 * may append hard-coded provider ids. A missing, malformed, or non-conforming
 * registry fails closed (throws) so callers can never continue on an empty or
 * guessed inventory.
 */

export interface RegistrySource {
  type?: string;
  package?: string;
  version?: string;
  commandName?: string;
  url?: string;
}

export interface RegistryInstall {
  type?: string;
  handler?: string;
  script?: string;
  verify?: string;
  uninstall?: string;
}

export interface RegistryEntry {
  id: string;
  kind: string;
  policy: "required" | "recommended" | "optional";
  activation?: string;
  capabilities?: string[];
  source?: RegistrySource;
  install?: RegistryInstall;
  [key: string]: unknown;
}

export interface IntegrationInventory {
  version: number;
  /** Repo-relative registry path; the provenance anchor for evidence/receipts. */
  source: string;
  entries: RegistryEntry[];
  /** Entries whose kind is `mcp` — the full-provision surface. */
  mcps: RegistryEntry[];
}

export const REGISTRY_VERSION = 2;

export async function loadIntegrationInventory(repoRoot: string): Promise<IntegrationInventory> {
  const file = path.join(repoRoot, "integrations", "registry.json");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    throw new Error(`Cannot read canonical integration registry: ${file} (${(error as Error).message})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Canonical integration registry is malformed JSON: ${file}`);
  }
  const value = parsed as { version?: unknown; integrations?: unknown };
  if (typeof value.version !== "number" || value.version !== REGISTRY_VERSION || !Array.isArray(value.integrations)) {
    throw new Error(`Canonical integration registry contract mismatch (expected version ${REGISTRY_VERSION} with an integrations array): ${file}`);
  }
  const ids = new Set<string>();
  const entries: RegistryEntry[] = [];
  for (const entry of value.integrations) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Integration registry contains a non-object entry: ${file}`);
    }
    const record = entry as Partial<RegistryEntry>;
    if (typeof record.id !== "string" || record.id.length === 0) {
      throw new Error(`Integration registry contains an entry without an id: ${file}`);
    }
    if (ids.has(record.id)) throw new Error(`Duplicate integration id in registry: ${record.id}`);
    ids.add(record.id);
    if (typeof record.kind !== "string" || record.kind.length === 0) {
      throw new Error(`Integration ${record.id} has no kind`);
    }
    if (!["required", "recommended", "optional"].includes(record.policy ?? "")) {
      throw new Error(`Integration ${record.id} has an invalid policy (${String(record.policy)})`);
    }
    if (record.install !== undefined && (typeof record.install !== "object" || Array.isArray(record.install))) {
      throw new Error(`Integration ${record.id} has a malformed install contract`);
    }
    entries.push(record as RegistryEntry);
  }
  const mcps = entries.filter((entry) => entry.kind === "mcp");
  return {
    version: value.version,
    source: path.relative(repoRoot, file).replace(/\\/g, "/"),
    entries,
    mcps,
  };
}