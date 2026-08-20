import { createHostAdapters, HOST_SPECS, isRegisteredHost, unsupportedHostDetection } from "../runtime/host-adapters.js";
import { REGISTERED_HOSTS } from "../runtime/contracts.js";

interface VerifyResult {
  host: string;
  ok: boolean;
  installed: boolean;
  message: string;
}

/**
 * Live installed-only runtime verification for all seven registered hosts.
 * A config directory or a stale harness receipt alone is never proof of an
 * installed application (REQ-006); unknown hosts are UNSUPPORTED.
 */
export async function verifyRuntimeState(hosts: string[] = [...REGISTERED_HOSTS]): Promise<VerifyResult[]> {
  const adapters = createHostAdapters();
  const results: VerifyResult[] = [];

  for (const host of hosts) {
    if (!isRegisteredHost(host)) {
      const detection = unsupportedHostDetection(host);
      results.push({ host, ok: false, installed: false, message: `UNSUPPORTED: ${detection.reason}` });
      continue;
    }
    const spec = HOST_SPECS[host];
    if (!spec) {
      results.push({ host, ok: false, installed: false, message: "missing host spec" });
      continue;
    }
    try {
      const detection = await adapters[host].detect();
      if (!detection.installed) {
        results.push({
          host,
          ok: true,
          installed: false,
          message: detection.staleEvidence
            ? `Absent: stale config evidence without a live application signal (${detection.configDir})`
            : "Absent: no live application signal",
        });
        continue;
      }
      const inventory = await adapters[host].inventory(detection);
      const receipt = inventory.runtimeReceipt;
      if (receipt && receipt.present) {
        results.push({ host, ok: true, installed: true, message: `Installed: runtime receipt present (${receipt.effectivePlanSha256?.slice(0, 12) ?? "unknown"})` });
      } else {
        results.push({ host, ok: true, installed: true, message: "Installed: live application signal, no harness runtime receipt yet" });
      }
    } catch (error) {
      results.push({ host, ok: false, installed: false, message: (error as Error).message });
    }
  }

  return results;
}
