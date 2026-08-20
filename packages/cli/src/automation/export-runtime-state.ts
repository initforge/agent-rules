import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

type Platform = "codex" | "grok" | "antigravity" | "cursor";

const PLATFORM_HOMES: Record<Platform, string> = {
  codex: process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
  grok: process.env.GROK_HOME ?? path.join(os.homedir(), ".grok"),
  antigravity: path.join(os.homedir(), ".gemini", "config"),
  cursor: path.join(os.homedir(), ".cursor"),
};

interface PlatformState {
  platform: Platform;
  runtimeHome: string;
  manifestExists: boolean;
  integrationsStateExists: boolean;
}

export async function exportRuntimeState(platforms: Platform[] = ["codex", "grok", "antigravity", "cursor"]): Promise<PlatformState[]> {
  const results: PlatformState[] = [];

  for (const name of platforms) {
    const runtimeHome = PLATFORM_HOMES[name];
    results.push({
      platform: name,
      runtimeHome,
      manifestExists: await fileExists(path.join(runtimeHome, "agent-rules-manifest.json")),
      integrationsStateExists: await fileExists(path.join(runtimeHome, "agent-rules-integrations.json")),
    });
  }

  return results;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
