import path from "node:path";
import {
  REGISTERED_HOSTS,
  type DesiredRuntime,
  type HostAdapter,
  type HostDetection,
  type HostInventoryEntry,
  type HostRepairReceipt,
  type RepairOptions,
  type RuntimeProjection,
} from "./contracts.js";
import { createHostAdapters, isRegisteredHost, unsupportedHostDetection } from "./host-adapters.js";
import { verifyMcps, provisionMcps, type ProvisionSummary } from "../integration/provisioning.js";
import { resolveIntegrationProfile } from "../integration/mcp-profile.js";

export interface ReconcileOptions {
  /** Only hosts that are actually installed are reconciled. */
  installedOnly: boolean;
  /** Never mutate; emit report-only drift receipts. */
  reportOnly: boolean;
  /** Repository root used to load the desired runtime + canonical MCP state. */
  root?: string;
  desired?: DesiredRuntime;
  repairOptions?: Omit<RepairOptions, "reportOnly">;
}

export interface ReconcileHostResult {
  host: string;
  status: "installed" | "absent" | "unsupported";
  installed: boolean;
  detection: HostDetection;
  inventory?: HostInventoryEntry;
  projection?: RuntimeProjection;
  receipt?: HostRepairReceipt;
  skipped: boolean;
  reason?: string;
  readonly taskAuthority: false;
}

export interface ReconcileResult {
  requestedHosts: string[];
  reconciled: ReconcileHostResult[];
  installedCount: number;
  unknownCount: number;
  receipts: HostRepairReceipt[];
  /**
   * Canonical MCP provisioning state (verify-only, never mutated during
   * reconcile). Installation and activation are reported as independent
   * states; this is distinct from the projected host runtime above.
   */
  providerProvisioning: ProvisionSummary;
  /**
   * Profile-scoped MCP gating surface (default core). Explicit-only and
   * optional entries the operator never selected cannot poison the exit code.
   */
  providerGating: ProvisionSummary;
  readonly taskAuthority: false;
}

function emptyDesired(): DesiredRuntime {
  return { skills: [], providers: [], runtimeState: "", source: "harness-reconcile" };
}

/** Default desired-set loader. Slices may extend this via `desired` option;
 *  the empty desired set is the honest default when the selected set has not
 *  been materialized yet (S2 keeps the selected set empty until qualification). */
export async function loadDesiredRuntime(root: string): Promise<DesiredRuntime> {
  const fs = await import("node:fs");
  const selectionPath = path.join(root, ".agent", "artifacts", "selection-manifest.json");
  if (fs.existsSync(selectionPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(selectionPath, "utf8")) as { selected_external_skills?: Array<{ id: string; source?: string }> };
      return {
        skills: (raw.selected_external_skills ?? []).map((skill) => ({ id: skill.id, source: skill.source ?? skill.id })),
        providers: [],
        runtimeState: "",
        source: "selection-manifest",
      };
    } catch { /* fall through to empty */ }
  }
  return emptyDesired();
}

export async function reconcileHosts(hosts: string[], options: ReconcileOptions): Promise<ReconcileResult> {
  const adapters = createHostAdapters();
  // The desired runtime is loaded from the canonical selection manifest on the
  // real execution path; an explicitly supplied desired set wins for tests.
  const root = options.root ?? process.cwd();
  const desired = options.desired ?? await loadDesiredRuntime(root);
  const results: ReconcileHostResult[] = [];
  const receipts: HostRepairReceipt[] = [];
  let installedCount = 0;
  let unknownCount = 0;

  for (const host of hosts) {
    if (!isRegisteredHost(host)) {
      unknownCount += 1;
      results.push({
        host,
        status: "unsupported",
        installed: false,
        detection: unsupportedHostDetection(host),
        skipped: false,
        reason: "UNSUPPORTED: not a registered host adapter",
        taskAuthority: false,
      });
      continue;
    }
    const adapter: HostAdapter = adapters[host];
    const detection = await adapter.detect();
    if (!detection.installed) {
      results.push({
        host,
        status: "absent",
        installed: false,
        detection,
        skipped: true,
        reason: options.installedOnly ? "skipped: not installed (installed-only)" : "absent",
        taskAuthority: false,
      });
      continue;
    }
    installedCount += 1;
    const inventory = await adapter.inventory(detection);
    const projection = await adapter.project(desired, detection);
    const receipt = await adapter.repair(projection, { reportOnly: options.reportOnly, ...options.repairOptions });
    if (receipt.mutated || receipt.status === "drifted") receipts.push(receipt);
    results.push({ host, status: "installed", installed: true, detection, inventory, projection, receipt, skipped: false, taskAuthority: false });
  }

  // Canonical MCP provisioning is a separate, independent surface: reconcile
  // reads current installation/activation state and never mutates it.
  let providerProvisioning: ProvisionSummary;
  try {
    providerProvisioning = await verifyMcps(root);
  } catch (error) {
    providerProvisioning = {
      kind: "mcp", source: "integrations/registry.json", total: 0,
      status: "BLOCKED", success: false, results: [], error: (error as Error).message,
    };
  }
  // REQ-011: the exit-code gating surface is the install profile (default
  // core) — explicit-only and optional entries the operator never selected
  // cannot poison a reconcile green. Reported alongside the full inventory.
  let providerGating: ProvisionSummary;
  try {
    providerGating = await provisionMcps(root, { readOnly: true, installProfile: resolveIntegrationProfile() });
  } catch (error) {
    providerGating = {
      kind: "mcp", source: "integrations/registry.json", total: 0,
      status: "BLOCKED", success: false, results: [], error: (error as Error).message,
    };
  }

  return {
    requestedHosts: hosts,
    reconciled: results,
    installedCount,
    unknownCount,
    receipts,
    providerProvisioning,
    providerGating,
    taskAuthority: false,
  };
}

export async function reconcileAll(options: ReconcileOptions): Promise<ReconcileResult> {
  return reconcileHosts([...REGISTERED_HOSTS], options);
}
