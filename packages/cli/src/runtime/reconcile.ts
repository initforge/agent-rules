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

export interface ReconcileOptions {
  /** Only hosts that are actually installed are reconciled. */
  installedOnly: boolean;
  /** Never mutate; emit report-only drift receipts. */
  reportOnly: boolean;
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
  const desired = options.desired ?? emptyDesired();
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

  return {
    requestedHosts: hosts,
    reconciled: results,
    installedCount,
    unknownCount,
    receipts,
    taskAuthority: false,
  };
}

export async function reconcileAll(options: ReconcileOptions): Promise<ReconcileResult> {
  return reconcileHosts([...REGISTERED_HOSTS], options);
}
