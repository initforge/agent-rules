import fs from "node:fs";
import path from "node:path";
import {
  loadCanonicalOperatorProfile,
  renderProfileForHost,
  computeProjectionStatus,
  readInstalledState,
  resolveEffectiveProfile,
  type OperatorProfile,
  type OperatorProjectionStatus,
} from "@initforge/agent-rules-kernel/northstar/operator-profile.js";
import type { HostId } from "@initforge/agent-rules-kernel/northstar/host-adapters.js";

/**
 * Single-canonical-source projection engine (REQ-C06/C08).
 * Every host receives the same rendered body from one source hash; hosts
 * without an official overlay surface report MANUAL_PROJECTION instead of
 * being silently skipped.
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
};

const SECTION_RE = (id: string) =>
  new RegExp(`<!-- agent-rules:operator-profile:${id} BEGIN[\\s\\S]*?-->[\\s\\S]*?<!-- agent-rules:operator-profile:${id} END -->`);

export function expectedSectionForHost(root: string, profileId: string, host: HostId): { profile: OperatorProfile; expected: string } | null {
  try {
    const { profile } = loadCanonicalOperatorProfile(root, profileId);
    return { profile, expected: renderProfileForHost(profile, host) };
  } catch {
    return null;
  }
}

export interface HostProjectionReport {
  host: HostId;
  status: OperatorProjectionStatus;
  detail: string;
}

export function readCurrentOverlaySection(root: string, host: HostId, profileId: string): string | null {
  const overlay = path.join(root, "platforms", host, HOST_OVERLAY_FILES[host]);
  if (!fs.existsSync(overlay)) return null;
  const body = fs.readFileSync(overlay, "utf8");
  const match = body.match(SECTION_RE(profileId));
  return match ? match[0] : null;
}

export function projectProfileToHost(root: string, profileId: string, host: HostId, write: boolean): HostProjectionReport {
  const surface = path.join(root, "platforms", host);
  const surfaceSupported = fs.existsSync(surface);
  if (!surfaceSupported) {
    return { host, status: "MANUAL_PROJECTION", detail: `no platforms/${host} projection surface; manual distribution required` };
  }
  const expected = expectedSectionForHost(root, profileId, host);
  if (!expected) {
    return { host, status: "UNSUPPORTED", detail: `canonical profile ${profileId} missing or invalid` };
  }
  const actual = readCurrentOverlaySection(root, host, profileId);
  if (!write) {
    return { host, status: computeProjectionStatus({ expectedContent: expected.expected, actualContent: actual, surfaceSupported }), detail: `${HOST_OVERLAY_FILES[host]}` };
  }
  const overlayPath = path.join(surface, HOST_OVERLAY_FILES[host]);
  let body = "";
  if (fs.existsSync(overlayPath)) body = fs.readFileSync(overlayPath, "utf8");
  const re = SECTION_RE(profileId);
  body = re.test(body) ? body.replace(re, expected.expected) : `${body.trimEnd()}\n\n${expected.expected}\n`;
  fs.writeFileSync(overlayPath, body, "utf8");
  return { host, status: "SYNCED", detail: `${HOST_OVERLAY_FILES[host]} <- source ${profileId}` };
}

export function projectToAllHosts(root: string, profileId: string, write: boolean): HostProjectionReport[] {
  return (Object.keys(HOST_OVERLAY_FILES) as HostId[]).map((host) => projectProfileToHost(root, profileId, host, write));
}

export function operatorProfileStatus(root: string): {
  installed: boolean;
  active: boolean;
  profile_id: string | null;
  version: string | null;
  source_sha256: string | null;
  session_override_active: boolean;
  precedence_chain: string[];
  hosts: HostProjectionReport[];
} {
  const state = readInstalledState(root);
  const profileId = state?.profile_id ?? "vibe-product";
  const hosts = projectToAllHosts(root, profileId, false);
  const resolution = resolveEffectiveProfile({ repoRoot: root });
  return {
    installed: state !== null,
    active: state?.active === true,
    profile_id: state?.profile_id ?? null,
    version: state?.version ?? null,
    source_sha256: state?.source_sha256 ?? null,
    session_override_active: state?.session_override != null,
    precedence_chain: resolution.precedence_chain,
    hosts,
  };
}
