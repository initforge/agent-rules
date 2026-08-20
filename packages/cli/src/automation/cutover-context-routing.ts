import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

type Platform = "codex" | "claude" | "grok" | "antigravity" | "cursor";

const PLATFORM_HOMES: Record<Platform, string> = {
  codex: process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
  claude: process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude"),
  grok: process.env.GROK_HOME ?? path.join(os.homedir(), ".grok"),
  antigravity: path.join(os.homedir(), ".gemini", "config"),
  cursor: path.join(os.homedir(), ".cursor"),
};

interface RoutingModeState {
  mode: string;
  platform: string;
  graph_version: number;
  graph_hash: string;
  conformance_version: number;
  conformance_hash: string;
  conformance_schema_hash: string;
  conformance_checked_at_utc: string;
  source: string;
  updated_at_utc: string;
}

export async function cutoverContextRouting(
  repoRoot: string,
  platforms: Platform[] = ["codex", "claude", "grok", "antigravity", "cursor"],
  mode: "strict" = "strict"
): Promise<{ ok: boolean; message: string; states: RoutingModeState[] }> {
  const graphPath = path.join(repoRoot, "generated/context-graph.json");
  const routeCasesPath = path.join(repoRoot, "automation/context-route-cases.json");
  const routeSchemaPath = path.join(repoRoot, "automation/context-route-cases.schema.json");

  // Validate context graph exists
  if (!(await fileExists(graphPath))) {
    return { ok: false, message: `Missing compiled context graph: ${graphPath}`, states: [] };
  }

  // Validate routing conformance contract
  if (!(await fileExists(routeCasesPath)) || !(await fileExists(routeSchemaPath))) {
    return { ok: false, message: "Routing conformance contract is incomplete", states: [] };
  }

  const routeCases = JSON.parse(await fs.readFile(routeCasesPath, "utf8"));
  if (Number(routeCases.version) < 3) {
    return { ok: false, message: "Routing conformance contract version 3+ is required", states: [] };
  }

  // Validate graph
  const graph = JSON.parse(await fs.readFile(graphPath, "utf8"));
  if (Number(graph.version) < 2) {
    return { ok: false, message: "Context graph version 2+ is required before routing cutover", states: [] };
  }

  const ids = graph.nodes.map((n: { id: string }) => n.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, message: "Context graph contains duplicate node IDs", states: [] };
  }

  const required = ["id", "layer", "source", "load_policy", "owner", "routing", "source_hash", "token_estimate"];
  for (const node of graph.nodes) {
    for (const field of required) {
      if (!(field in node)) {
        return { ok: false, message: `Context graph node '${node.id}' is missing '${field}'`, states: [] };
      }
    }
  }

  // Compute hashes
  const graphHash = await sha256File(graphPath);
  const routeCasesHash = await sha256File(routeCasesPath);
  const routeSchemaHash = await sha256File(routeSchemaPath);

  const states: RoutingModeState[] = [];

  for (const name of platforms) {
    const runtimeHome = PLATFORM_HOMES[name];
    if (!(await dirExists(runtimeHome))) {
      return { ok: false, message: `Runtime home missing for ${name}: ${runtimeHome}`, states: [] };
    }

    const stateDir = path.join(runtimeHome, "skill-state");
    await fs.mkdir(stateDir, { recursive: true });

    const state: RoutingModeState = {
      mode,
      platform: name,
      graph_version: Number(graph.version),
      graph_hash: graphHash,
      conformance_version: Number(routeCases.version),
      conformance_hash: routeCasesHash,
      conformance_schema_hash: routeSchemaHash,
      conformance_checked_at_utc: new Date().toISOString(),
      source: graphPath,
      updated_at_utc: new Date().toISOString(),
    };

    const statePath = path.join(stateDir, "routing-mode.json");
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
    states.push(state);
  }

  return {
    ok: true,
    message: `Context routing cutover complete: ${mode} (${platforms.join(", ")})`,
    states,
  };
}

async function sha256File(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
