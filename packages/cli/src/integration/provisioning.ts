import { handlerForRegistryEntry, resolveIntegrationManifestDir, type HandlerResult, type IntegrationHandler } from "./installer-registry.js";
import { loadIntegrationInventory, type RegistryEntry } from "./inventory.js";
import {
  activationFor,
  aggregateProvisioning,
  type ProviderActivation,
  type ProviderInstallation,
  type ProviderResult,
  type ProvisionAggregateStatus,
} from "./provider-result.js";

/**
 * Shared MCP provisioning orchestrator. Every lifecycle that provisions
 * (init/install/sync/update/reconcile/repair/doctor) MUST go through these
 * functions instead of copying per-command install loops. The orchestrator:
 *   - loads the canonical registry (fail closed on missing/malformed);
 *   - provisions every `kind: mcp` entry regardless of activation policy;
 *   - verifies before installing (idempotent PRE-EXISTING requires PASS);
 *   - keeps installation and activation as two independent states;
 *   - never auto-activates explicit-only/claim-driven MCPs;
 *   - aggregates so a BLOCKED/UNSUPPORTED/NEEDS_USER MCP is never success.
 */

export interface ProvisionOptions {
  /** Report what would happen without executing any mutation. */
  dryRun?: boolean;
  /** Verify-only: never install; report the current provisioning state. */
  readOnly?: boolean;
}

export interface ProvisionSummary {
  kind: "mcp";
  source: string;
  total: number;
  status: ProvisionAggregateStatus;
  success: boolean;
  results: ProviderResult[];
  /** Set when the registry could not be loaded; status is then BLOCKED. */
  error?: string;
}

export async function provisionMcps(repoRoot: string, options: ProvisionOptions = {}): Promise<ProvisionSummary> {
  const inventory = await loadIntegrationInventory(repoRoot);
  const results: ProviderResult[] = [];
  for (const entry of inventory.mcps) {
    results.push(await provisionOne(repoRoot, entry, options));
  }
  const aggregate = aggregateProvisioning(results);
  return { kind: "mcp", source: inventory.source, total: results.length, ...aggregate, results };
}

export async function verifyMcps(repoRoot: string): Promise<ProvisionSummary> {
  return provisionMcps(repoRoot, { readOnly: true });
}

export async function uninstallMcps(repoRoot: string, options: ProvisionOptions = {}): Promise<ProvisionSummary> {
  const inventory = await loadIntegrationInventory(repoRoot);
  const results: ProviderResult[] = [];
  for (const entry of inventory.mcps) {
    const activation = activationFor(entry);
    const handler = handlerForRegistryEntry(repoRoot, entry);
    if (!handler) {
      results.push(blockedResult(entry, activation, `no provisioner for install type ${String(entry.install?.type)}`));
      continue;
    }
    if (options.dryRun) {
      results.push({ id: entry.id, kind: entry.kind, policy: entry.policy, version: entry.source?.version, installation: { status: "PARTIAL", reason: "dry-run: uninstall projected" }, activation });
      continue;
    }
    const dir = await integrationManifestDir(repoRoot, entry.id);
    const result = await safeUninstall(handler, dir, entry);
    results.push(resultFromUninstall(entry, result, activation));
  }
  const aggregate = aggregateProvisioning(results);
  return { kind: "mcp", source: inventory.source, total: results.length, ...aggregate, results };
}

async function provisionOne(repoRoot: string, entry: RegistryEntry, options: ProvisionOptions): Promise<ProviderResult> {
  const activation = activationFor(entry);
  const version = entry.source?.version;
  const handler = handlerForRegistryEntry(repoRoot, entry);
  if (!handler) {
    return blockedResult(entry, activation, `no provisioner for install type ${String(entry.install?.type)}`);
  }
  if (options.dryRun) {
    return { id: entry.id, kind: entry.kind, policy: entry.policy, version, installation: { status: "PARTIAL", reason: "dry-run: provisioning projected" }, activation };
  }
  const dir = await integrationManifestDir(repoRoot, entry.id);

  if (options.readOnly) {
    const verify = await safeVerify(handler, dir, entry);
    return resultFromVerify(entry, verify, activation);
  }

  // Verify first: an already-installed provider is PRE-EXISTING, and only
  // counts when this current verify passes.
  const first = await safeVerify(handler, dir, entry);
  if (first.ok) return resultFromVerify(entry, first, activation);

  const installed = await safeInstall(handler, dir, entry);
  if (!installed.ok) {
    return {
      id: entry.id, kind: entry.kind, policy: entry.policy, version,
      installation: { status: installed.status ?? "BLOCKED", version: installed.version ?? version, location: installed.location, reason: installed.message },
      activation,
    };
  }
  const second = await safeVerify(handler, dir, entry);
  if (second.ok) {
    return {
      id: entry.id, kind: entry.kind, policy: entry.policy, version,
      installation: { status: "PASS", version: second.version ?? version, location: second.location, evidence: second.message },
      activation,
    };
  }
  return {
    id: entry.id, kind: entry.kind, policy: entry.policy, version,
    installation: {
      // A handler-classified failure (BLOCKED/UNSUPPORTED/NEEDS_USER) is
      // surfaced as-is; an unclassified failure is honestly PARTIAL.
      status: second.status ?? "PARTIAL",
      version: installed.version ?? version,
      location: installed.location,
      reason: `installed but verification failed: ${second.message}`,
    },
    activation,
  };
}

function resultFromVerify(entry: RegistryEntry, verify: HandlerResult, activation: ProviderActivation): ProviderResult {
  if (verify.ok) {
    return {
      id: entry.id, kind: entry.kind, policy: entry.policy, version: entry.source?.version,
      installation: { status: "PRE-EXISTING", version: verify.version ?? entry.source?.version, location: verify.location, evidence: verify.message },
      activation,
    };
  }
  // Read-only reporting path: an unclassified verification failure means the
  // MCP is not installed yet (installable, hence PARTIAL). A handler-classified
  // failure (BLOCKED/UNSUPPORTED/NEEDS_USER) is surfaced as-is.
  return {
    id: entry.id, kind: entry.kind, policy: entry.policy, version: entry.source?.version,
    installation: { status: verify.status ?? "PARTIAL", reason: verify.status ? verify.message : `not installed (current verification: ${verify.message})` },
    activation,
  };
}

function resultFromUninstall(entry: RegistryEntry, result: HandlerResult, activation: ProviderActivation): ProviderResult {
  if (result.ok) {
    return { id: entry.id, kind: entry.kind, policy: entry.policy, version: entry.source?.version, installation: { status: "PASS", location: result.location, evidence: result.message }, activation };
  }
  return { id: entry.id, kind: entry.kind, policy: entry.policy, version: entry.source?.version, installation: { status: result.status ?? "BLOCKED", reason: result.message }, activation };
}

function blockedResult(entry: RegistryEntry, activation: ProviderActivation, reason: string): ProviderResult {
  return {
    id: entry.id, kind: entry.kind, policy: entry.policy, version: entry.source?.version,
    installation: { status: "BLOCKED", reason },
    activation,
  };
}

async function integrationManifestDir(repoRoot: string, id: string): Promise<string> {
  return resolveIntegrationManifestDir(repoRoot, id);
}

async function safeVerify(handler: IntegrationHandler, dir: string, entry: RegistryEntry): Promise<HandlerResult> {
  try {
    return await handler.verify(dir);
  } catch (error) {
    return { ok: false, status: "BLOCKED", message: `${entry.id} verify threw: ${(error as Error).message}` };
  }
}

async function safeInstall(handler: IntegrationHandler, dir: string, entry: RegistryEntry): Promise<HandlerResult> {
  try {
    return await handler.install(dir);
  } catch (error) {
    return { ok: false, status: "BLOCKED", message: `${entry.id} install threw: ${(error as Error).message}` };
  }
}

async function safeUninstall(handler: IntegrationHandler, dir: string, entry: RegistryEntry): Promise<HandlerResult> {
  try {
    return await handler.uninstall(dir);
  } catch (error) {
    return { ok: false, status: "BLOCKED", message: `${entry.id} uninstall threw: ${(error as Error).message}` };
  }
}