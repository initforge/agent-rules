import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildConvergenceModel,
  classifyHostMcpConfig,
  convergeHostMcpConfig,
  parseHostConfig,
  hostHome,
  HOST_CONFIG_FILES,
} from "../../src/runtime/mcp-convergence.js";

/**
 * REQ-008/REQ-009 — host config convergence to the idle-zero default:
 * owned entries removed or disabled, legacy entries backed up then migrated,
 * user-modified entries NEVER_USER (never blind-deleted), unrelated user
 * entries untouched. All against temp homes — no real user config mutation.
 */

async function tempRepo(): Promise<string> {
  const root = await fs.mkdtempSync(path.join(os.tmpdir(), "mcp-conv-"));
  const integ = path.join(root, "integrations", "recommended", "context7", "adapters");
  fs.mkdirSync(integ, { recursive: true });
  const registry = {
    version: 2,
    integrations: [{
      id: "context7",
      kind: "mcp",
      policy: "recommended",
      profiles: ["research"],
      activation: "automatic",
      source: { type: "npm", package: "@upstash/context7-mcp", version: "3.2.5", mcpServerKey: "context7" },
      install: { type: "npm-npx", handler: "npm", script: "" },
    }],
  };
  fs.writeFileSync(path.join(root, "integrations", "registry.json"), JSON.stringify(registry, null, 2));
  const adapter = {
    mcpServers: {
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp@3.2.5"],
      },
    },
  };
  fs.writeFileSync(path.join(integ, "opencode.json"), JSON.stringify(adapter, null, 2));
  fs.writeFileSync(path.join(integ, "codex.toml"), "[mcp_servers.context7]\ncommand = 'npx'\nargs = ['-y', '@upstash/context7-mcp@3.2.5']\n");
  return root;
}

function tempEnv(): NodeJS.ProcessEnv & { HOME: string; USERPROFILE: string } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-conv-home-"));
  return { ...process.env, HOME: home, USERPROFILE: home } as NodeJS.ProcessEnv & { HOME: string; USERPROFILE: string };
}

describe("host MCP config convergence", () => {
  let repo: string;
  let env: NodeJS.ProcessEnv & { HOME: string; USERPROFILE: string };

  beforeEach(async () => {
    repo = await tempRepo();
    env = tempEnv();
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(env.HOME, { recursive: true, force: true });
  });

  function opencodeConfigPath(): string {
    return path.join(hostHome("opencode", env), HOST_CONFIG_FILES.opencode);
  }

  it("classifies an owned entry and leaves user entries untouched", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      mcp: {
        context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@3.2.5"] },
        "user-tool": { command: "some-custom-tool", args: [] },
      },
    }));
    const result = await classifyHostMcpConfig(repo, "opencode", { env });
    expect(result.status).toBe("CONVERGED");
    const context7 = result.entries.find((entry) => entry.id === "context7")!;
    expect(context7.disposition).toBe("owned-remove");
    const userTool = result.entries.find((entry) => entry.id === "user-tool")!;
    expect(userTool.disposition).toBe("user-owned");
  });

  it("converges owned entries to removed with a backup receipt (default profile none)", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mcp: { context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@3.2.5"] } } }));
    const result = await convergeHostMcpConfig(repo, "opencode", { env });
    expect(result.status).toBe("CONVERGED");
    expect(result.backup_path).toBeTruthy();
    expect(fs.existsSync(result.backup_path!)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(config.mcp).toBeUndefined();
  });

  it("opencode disabled descriptors keep the entry non-spawning", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mcp: { context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@3.2.5"] } } }));
    const result = await convergeHostMcpConfig(repo, "opencode", { env, globalMcpProfile: "core" });
    expect(result.status).toBe("CONVERGED");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcp: Record<string, { enabled?: boolean; disabled?: boolean }> };
    expect(config.mcp.context7.disabled).toBe(true);
    expect(config.mcp.context7.enabled).toBe(false);
  });

  it("user-modified entries produce NEEDS_USER and are never deleted", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      mcp: {
        context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@1.0.0-customized"] },
      },
    }));
    const result = await convergeHostMcpConfig(repo, "opencode", { env });
    expect(result.status).toBe("NEEDS_USER");
    expect(result.entries[0]!.disposition).toBe("user-modified");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcp: Record<string, unknown> };
    expect(config.mcp.context7).toBeTruthy(); // untouched
  });

  it("a clean host (no agent-rules entries) stays CLEAN without backups", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mcp: { "user-tool": { command: "x", args: [] } } }));
    const result = await convergeHostMcpConfig(repo, "opencode", { env });
    expect(result.status).toBe("CLEAN");
    expect(result.backup_path).toBeUndefined();
  });

  it("codex entries are disabled via enabled=false under a non-none profile", async () => {
    const configPath = path.join(hostHome("codex", env), HOST_CONFIG_FILES.codex);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "[mcp_servers.context7]\ncommand = 'npx'\nargs = ['-y', '@upstash/context7-mcp@3.2.5']\n");
    const result = await convergeHostMcpConfig(repo, "codex", { env, globalMcpProfile: "research" });
    expect(result.status).toBe("CONVERGED");
    const content = fs.readFileSync(configPath, "utf8");
    expect(content).toContain("enabled = false");
  });

  it("trailing non-MCP sections (e.g. [projects...]) survive convergence", async () => {
    const configPath = path.join(hostHome("codex", env), HOST_CONFIG_FILES.codex);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const original = [
      "[mcp_servers.context7]",
      "command = 'npx'",
      "args = ['-y', '@upstash/context7-mcp@3.2.5']",
      "",
      "[projects.'p:\\agent-rules']",
      "trust_level = \"trusted\"",
      "",
      "[desktop]",
      "conversationDetailMode = \"STEPS_COMMANDS\"",
    ].join("\n");
    fs.writeFileSync(configPath, original);
    const result = await convergeHostMcpConfig(repo, "codex", { env });
    expect(result.status).toBe("CONVERGED");
    const content = fs.readFileSync(configPath, "utf8");
    expect(content).not.toContain("mcp_servers.context7");
    expect(content).toContain("[projects.'p:\\agent-rules']");
    expect(content).toContain("[desktop]");
    expect(content).toContain('trust_level = "trusted"');
  });

  it("dry-run converges nothing but reports the disposition", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mcp: { context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@3.2.5"] } } }));
    const result = await convergeHostMcpConfig(repo, "opencode", { env, dryRun: true });
    expect(result.status).toBe("CONVERGED");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcp: Record<string, unknown> };
    expect(config.mcp.context7).toBeTruthy(); // not mutated
  });

  it("parseHostConfig reads disabled markers from opencode configs", () => {
    const parsed = parseHostConfig("opencode", JSON.stringify({ mcp: { a: { command: "x" }, b: { command: "y", disabled: true } } }));
    expect(parsed.serverEntries.find((entry) => entry.id === "a")!.disabled).toBe(false);
    expect(parsed.serverEntries.find((entry) => entry.id === "b")!.disabled).toBe(true);
  });

  it("buildConvergenceModel resolves the known fingerprint for opencode", async () => {
    const model = await buildConvergenceModel(repo, "opencode", env);
    expect(model.knownNames.has("context7")).toBe(true);
    expect(model.fingerprints.some((fp) => fp.serverName === "context7" && fp.sha256.length === 64)).toBe(true);
  });
});
