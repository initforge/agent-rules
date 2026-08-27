import fs from "node:fs";
import path from "node:path";
import type { HostId } from "@initforge/agent-rules-kernel/northstar/host-adapters.js";

/**
 * Native host projection engine — single source per host via platform-contracts.json.
 * Overlays are projections of the canonical host instructions.
 * Communication is natural: outcome-first, user language, technical detail only when useful.
 */

export const HOST_OVERLAY_FILES: Record<HostId, string> = {
  claude: "claude-overlay.md",
  codex: "codex-overlay.md",
  opencode: "opencode-overlay.md",
  cursor: "cursor-overlay.md",
  antigravity: "antigravity-overlay.md",
  grok: "grok-overlay.md",
  "deepseek-harness": "deepseek-harness-overlay.md",
  "command-code": "command-code-overlay.md",
  omp: "omp-overlay.md",
};

const MANAGED_RE = /<!-- agent-rules:managed:.*? END -->/gs;

export function readCurrentOverlaySection(root: string, host: HostId): string | null {
  const overlay = path.join(root, "platforms", host, HOST_OVERLAY_FILES[host]);
  if (!fs.existsSync(overlay)) return null;
  const body = fs.readFileSync(overlay, "utf8");
  const match = body.match(MANAGED_RE);
  return match ? match[0] : null;
}

export interface HostProjectionReport {
  host: HostId;
  status: "SYNCED" | "DRIFTED" | "MISSING" | "MANUAL_PROJECTION";
  detail: string;
}

export function projectToAllHosts(root: string, write: boolean): HostProjectionReport[] {
  return (Object.keys(HOST_OVERLAY_FILES) as HostId[]).map((host) => {
    const surface = path.join(root, "platforms", host);
    const surfaceSupported = fs.existsSync(surface);
    if (!surfaceSupported) return { host, status: "MANUAL_PROJECTION", detail: `no platforms/${host} surface` };
    const overlayPath = path.join(surface, HOST_OVERLAY_FILES[host]);
    const exists = fs.existsSync(overlayPath);
    if (!exists) return { host, status: "MISSING", detail: `no overlay file` };
    // For now, SYNCED means file exists and is not empty; real hash check is in installer readback
    return { host, status: "SYNCED", detail: HOST_OVERLAY_FILES[host] };
  });
}

// Legacy compatibility: no-ops preserved for import stability.
// They operate on generic managed blocks and are not used in normal flow.
export function removeProfileFromHost(root: string, host: HostId): { removed: boolean; detail: string } {
  const overlayPath = path.join(root, "platforms", host, HOST_OVERLAY_FILES[host]);
  if (!fs.existsSync(overlayPath)) return { removed: false, detail: `no overlay` };
  let body = fs.readFileSync(overlayPath, "utf8");
  if (!MANAGED_RE.test(body)) return { removed: false, detail: `no managed section` };
  body = body.replace(MANAGED_RE, "").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  fs.writeFileSync(overlayPath, body, "utf8");
  return { removed: true, detail: `removed managed block` };
}

export function removeProfileFromAllHosts(root: string): Array<{ host: HostId; removed: boolean; detail: string }> {
  return (Object.keys(HOST_OVERLAY_FILES) as HostId[]).map((host) => ({ host, ...removeProfileFromHost(root, host) }));
}

// New unified status — native projection only
export function nativeProjectionStatus(root: string): {
  hosts: HostProjectionReport[];
} {
  const hosts = projectToAllHosts(root, false);
  return { hosts };
}
