import fs from "node:fs/promises";
import path from "node:path";
import { handlerForRegistryEntry } from "../integration/installer-registry.js";

interface RegistryValidationResult {
  ok: boolean;
  errors: string[];
}

const REQUIRED_V2 = [
  "id", "displayName", "kind", "policy", "profiles", "source", "integrity",
  "trust", "capabilities", "triggers", "sideEffects", "tokenClass",
  "permissions", "install", "nativeHosts", "fallback", "deprecatedAliases",
];

const POLICIES = ["required", "recommended", "optional"];
const KINDS = ["mcp", "tool", "adapter", "native", "cli-tool"];
const TOKEN_CLASSES = ["low", "medium", "high"];
const TRUST_STATUSES = ["advisory-only", "declared", "adapter-verified", "native-live"];
const SOURCE_TYPES = ["github", "npm", "git", "local", "rust-cargo"];
const INSTALL_TYPES = ["binary", "npm-global", "npm-npx", "npx-github", "git", "local", "shell", "cargo"];

export async function validateToolRegistry(repoRoot: string): Promise<RegistryValidationResult> {
  const errors: string[] = [];
  const registryPath = path.join(repoRoot, "integrations/registry.json");
  const contractsPath = path.join(repoRoot, "platforms/platform-contracts.json");

  // Load registry
  let registry: Record<string, unknown>;
  try {
    registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
  } catch {
    return { ok: false, errors: [`Cannot read registry: ${registryPath}`] };
  }

  // Validate version
  const version = Number(registry.version);
  if (version < 1 || version > 2) {
    errors.push(`Expected version 1 or 2, got ${version}`);
  }

  // Validate integrations
  const integrations = registry.integrations as Record<string, unknown>[];
  if (!Array.isArray(integrations) || integrations.length === 0) {
    errors.push("integrations must be a non-empty array");
    return { ok: false, errors };
  }

  // Load platform contracts for native host validation
  let hosts: string[] = [];
  try {
    const contracts = JSON.parse(await fs.readFile(contractsPath, "utf8"));
    hosts = Object.keys(contracts.platforms ?? {});
  } catch {
    errors.push(`Platform contracts not found: ${contractsPath}`);
  }

  const ids = new Set<string>();
  const aliases = new Set<string>();

  for (const tool of integrations) {
    // Validate required fields
    for (const field of REQUIRED_V2) {
      if (!(field in tool)) {
        errors.push(`Integration missing '${field}'`);
      }
    }

    const id = tool.id as string;
    if (!id) continue;

    // Check duplicate IDs
    if (ids.has(id)) {
      errors.push(`Duplicate id '${id}'`);
    }
    ids.add(id);

    // Check deprecated aliases
    const toolAliases = (tool.deprecatedAliases as string[]) ?? [];
    for (const alias of toolAliases) {
      if (!alias) continue;
      if (ids.has(alias) || aliases.has(alias)) {
        errors.push(`Alias '${alias}' of '${id}' conflicts with existing id/alias`);
      }
      aliases.add(alias);
    }

    // Validate enums
    const policy = tool.policy as string;
    if (policy && !POLICIES.includes(policy)) {
      errors.push(`Invalid policy '${policy}' for '${id}'`);
    }

    const kind = tool.kind as string;
    if (kind && !KINDS.includes(kind)) {
      errors.push(`Invalid kind '${kind}' for '${id}'`);
    }

    const tokenClass = tool.tokenClass as string;
    if (tokenClass && !TOKEN_CLASSES.includes(tokenClass)) {
      errors.push(`Invalid tokenClass '${tokenClass}' for '${id}'`);
    }

    const trust = tool.trust as string;
    if (trust && !TRUST_STATUSES.includes(trust)) {
      errors.push(`Invalid trust '${trust}' for '${id}'`);
    }

    // Validate source type
    const source = tool.source as Record<string, unknown>;
    if (source?.type && !SOURCE_TYPES.includes(source.type as string)) {
      errors.push(`Invalid source type '${source.type}' for '${id}'`);
    }

    // Validate install type
    const install = tool.install as Record<string, unknown>;
    if (install?.type && !INSTALL_TYPES.includes(install.type as string)) {
      errors.push(`Invalid install type '${install.type}' for '${id}'`);
    }

    // Validate native hosts
    const nativeHosts = (tool.nativeHosts as string[]) ?? [];
    for (const host of nativeHosts) {
      if (!hosts.includes(host)) {
        errors.push(`Unknown native host '${host}' for '${id}'`);
      }
    }

    // Every registry entry must resolve to a real install handler through the
    // shared registry-driven builder. An unknown/missing install.type fails
    // closed instead of being silently skipped at provision time.
    if (handlerForRegistryEntry(repoRoot, tool as import("../integration/inventory.js").RegistryEntry) === undefined) {
      errors.push(`No resolvable install handler for '${id}' (install.type=${String((tool.install as Record<string, unknown> | undefined)?.type)})`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
