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

const NATIVE_REQUIRED: Record<Platform, string> = {
  codex: "agents/agent_rules_implementer.toml",
  cursor: "agents/agent-rules-implementer.md",
  grok: "agents/agent-rules-implementer.toml",
  antigravity: "agents/agent-rules-implementer/agent.md",
};

const TOOLS = ["workctl.py", "workctl.ps1", "workctl.sh", "work-ledger.schema.json"];

interface VerifyResult {
  platform: Platform;
  ok: boolean;
  message: string;
}

export async function verifyRuntimeState(platforms: Platform[] = ["codex", "grok", "antigravity", "cursor"]): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];

  for (const name of platforms) {
    const runtimeHome = PLATFORM_HOMES[name];
    const manifest = path.join(runtimeHome, "agent-rules-manifest.json");
    const state = path.join(runtimeHome, "agent-rules-integrations.json");

    try {
      if (!(await fileExists(manifest))) {
        results.push({ platform: name, ok: false, message: `Missing runtime manifest: ${manifest}` });
        continue;
      }
      if (!(await fileExists(state))) {
        results.push({ platform: name, ok: false, message: `Missing integration state: ${state}` });
        continue;
      }

      const toolsDir = path.join(runtimeHome, "agent-rules-tools");
      for (const tool of TOOLS) {
        if (!(await fileExists(path.join(toolsDir, tool)))) {
          results.push({ platform: name, ok: false, message: `Missing portable workctl tool: ${tool}` });
          continue;
        }
      }

      const nativeRequired = path.join(runtimeHome, NATIVE_REQUIRED[name]);
      if (!(await fileExists(nativeRequired))) {
        results.push({ platform: name, ok: false, message: `Missing native definition: ${nativeRequired}` });
        continue;
      }

      results.push({ platform: name, ok: true, message: "Runtime state PASS" });
    } catch (error) {
      results.push({ platform: name, ok: false, message: (error as Error).message });
    }
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
