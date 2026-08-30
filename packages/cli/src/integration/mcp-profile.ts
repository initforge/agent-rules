import type { IntegrationInventory, RegistryEntry } from "./inventory.js";

/**
 * REQ-008 — install profiles and the three-concept MCP model (installed
 * package vs host exposure vs process activation).
 *
 * `AGENT_RULES_INTEGRATION_PROFILE` selects which integrations get installed
 * on disk (default `core`). `AGENT_RULES_GLOBAL_MCP_PROFILE` selects which
 * MCP entries are registered with native hosts (default `all`). Registration
 * is separate from connecting to or using a provider during a task.
 *
 * Explicit-only integrations are never exposed through a global profile.
 * A package-owned launcher may still be automatically available on disk;
 * availability never grants permission to connect, launch or call it.
 */

export const GLOBAL_MCP_PROFILES = ["none", "core", "research", "frontend", "qa", "all"] as const;
export type GlobalMcpProfile = (typeof GLOBAL_MCP_PROFILES)[number];

export const INTEGRATION_PROFILES = ["core", "qa", "frontend", "research", "all"] as const;
export type IntegrationProfile = (typeof INTEGRATION_PROFILES)[number];

export const GLOBAL_MCP_PROFILE_ENV = "AGENT_RULES_GLOBAL_MCP_PROFILE";
export const INTEGRATION_PROFILE_ENV = "AGENT_RULES_INTEGRATION_PROFILE";

export function resolveGlobalMcpProfile(env: NodeJS.ProcessEnv = process.env): GlobalMcpProfile {
  const raw = env[GLOBAL_MCP_PROFILE_ENV];
  if (raw === undefined || raw.trim() === "") return "all";
  if (!GLOBAL_MCP_PROFILES.includes(raw as GlobalMcpProfile)) {
    throw new Error(`${GLOBAL_MCP_PROFILE_ENV} must be one of ${GLOBAL_MCP_PROFILES.join(", ")}; got ${raw}`);
  }
  return raw as GlobalMcpProfile;
}

export function resolveIntegrationProfile(env: NodeJS.ProcessEnv = process.env): IntegrationProfile {
  const raw = env[INTEGRATION_PROFILE_ENV];
  if (raw === undefined || raw.trim() === "") return "core";
  if (!INTEGRATION_PROFILES.includes(raw as IntegrationProfile)) {
    throw new Error(`${INTEGRATION_PROFILE_ENV} must be one of ${INTEGRATION_PROFILES.join(", ")}; got ${raw}`);
  }
  return raw as IntegrationProfile;
}

export function isExplicitOnly(entry: RegistryEntry): boolean {
  return entry.activation === "explicit-only";
}

/** Per-entry profiles array (e.g. ["qa", "frontend"]); empty means no global profile. */
export function entryProfiles(entry: RegistryEntry): string[] {
  const value = entry.profiles;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Entries the installer may install on disk: those inside the install profile,
 * plus explicit-only entries the operator explicitly selected.
 */
export function selectInstallEntries(inventory: IntegrationInventory, profile: IntegrationProfile, explicitIds: readonly string[] = []): RegistryEntry[] {
  const explicit = new Set(explicitIds);
  return inventory.entries.filter((entry) => {
    if (isExplicitOnly(entry)) return explicit.has(entry.id) || entry.availability === 'automatic';
    if (entry.policy === "optional") return false;
    if (profile === "all") return true;
    return entryProfiles(entry).includes(profile);
  });
}

/**
 * Entries that may be exposed through global host configs for a global MCP
 * profile. The explicit `none` profile exposes nothing. Explicit-only and
 * optional entries are never globally exposed.
 */
export function selectGlobalAdapterEntries(inventory: IntegrationInventory, profile: GlobalMcpProfile): RegistryEntry[] {
  if (profile === "none") return [];
  return inventory.entries.filter((entry) => {
    if (entry.kind !== "mcp") return false;
    if (entry.policy === "optional") return false;
    if (isExplicitOnly(entry)) return false;
    if (profile === "all") return true;
    return entryProfiles(entry).includes(profile);
  });
}
