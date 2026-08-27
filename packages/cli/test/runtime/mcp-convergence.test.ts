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
  hostMcpConfigPath,
  HOST_CONFIG_FILES,
  registerHostMcpAdapters,
  inspectHostMcpRegistration,
  setMcpRegistrationEnabled,
} from "../../src/runtime/mcp-convergence.js";

/**
 * REQ-008/REQ-009 — host config convergence for an explicitly disabled
 * profile. Normal setup now registers the standard providers.
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
  const isolated = { ...process.env, HOME: home, USERPROFILE: home } as NodeJS.ProcessEnv & { HOME: string; USERPROFILE: string };
  // Do not accidentally resolve a real host config while testing an isolated
  // temp home; these variables take precedence over HOME in hostHome().
  delete isolated.CODEX_HOME;
  delete isolated.CLAUDE_CONFIG_DIR;
  delete isolated.OPENCODE_HOME;
  delete isolated.DSH_HOME;
  delete isolated.COMMAND_CODE_HOME;
  delete isolated.GROK_HOME;
  return isolated;
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

  it("uses Claude's user registry beside, not inside, CLAUDE_CONFIG_DIR", () => {
    expect(hostMcpConfigPath("claude", env)).toBe(path.join(env.HOME, ".claude.json"));
  });

  it("classifies an owned entry and leaves user entries untouched", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      mcp: {
        context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@3.2.5"] },
        "user-tool": { command: "some-custom-tool", args: [] },
      },
    }));
    const result = await classifyHostMcpConfig(repo, "opencode", { env, globalMcpProfile: "none" });
    expect(result.status).toBe("CONVERGED");
    const context7 = result.entries.find((entry) => entry.id === "context7")!;
    expect(context7.disposition).toBe("owned-remove");
    const userTool = result.entries.find((entry) => entry.id === "user-tool")!;
    expect(userTool.disposition).toBe("user-owned");
  });

  it("converges owned entries to removed with a backup receipt (explicit profile none)", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mcp: { context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@3.2.5"] } } }));
    const result = await convergeHostMcpConfig(repo, "opencode", { env, globalMcpProfile: "none" });
    expect(result.status).toBe("CONVERGED");
    expect(result.backup_path).toBeTruthy();
    expect(fs.existsSync(result.backup_path!)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(config.mcp).toBeUndefined();
  });

  it("normal registration re-enables a provably managed disabled descriptor", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mcp: { context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@3.2.5"] } } }));
    const result = await registerHostMcpAdapters(repo, "opencode", { env, profile: "research" });
    expect(result.status).toBe("REGISTERED");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcp: Record<string, { enabled?: boolean; disabled?: boolean }> };
    expect(config.mcp.context7.disabled).toBeUndefined();
    expect(config.mcp.context7.enabled).toBeUndefined();
  });

  it("preserves an explicit disable across a later normal registration", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mcp: { context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@3.2.5"] } } }));
    setMcpRegistrationEnabled("context7", false, env);
    const disabled = await convergeHostMcpConfig(repo, "opencode", { env, globalMcpProfile: "none", integrationIds: ["context7"] });
    expect(disabled.status).toBe("CONVERGED");
    const registration = await registerHostMcpAdapters(repo, "opencode", { env, profile: "research", integrationIds: ["context7"] });
    expect(registration.status).toBe("NO_ADAPTER");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcp?: Record<string, unknown> };
    expect(config.mcp?.context7).toBeUndefined();
    const inspection = await inspectHostMcpRegistration(repo, "opencode", { env, profile: "research" });
    expect(inspection.entries).toEqual([expect.objectContaining({ id: "context7", status: "MCP_DISABLED" })]);
  });

  it("user-modified entries produce NEEDS_USER and are never deleted", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      mcp: {
        context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@1.0.0-customized"] },
      },
    }));
    const result = await convergeHostMcpConfig(repo, "opencode", { env, globalMcpProfile: "none" });
    expect(result.status).toBe("NEEDS_USER");
    expect(result.entries[0]!.disposition).toBe("user-modified");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcp: Record<string, unknown> };
    expect(config.mcp.context7).toBeTruthy(); // untouched
  });

  it("a clean host (no agent-rules entries) stays CLEAN without backups", async () => {
    const configPath = opencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mcp: { "user-tool": { command: "x", args: [] } } }));
    const result = await convergeHostMcpConfig(repo, "opencode", { env, globalMcpProfile: "none" });
    expect(result.status).toBe("CLEAN");
    expect(result.backup_path).toBeUndefined();
  });

  it("legacy convergence refuses non-none profiles instead of disabling MCPs", async () => {
    const configPath = path.join(hostHome("codex", env), HOST_CONFIG_FILES.codex);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "[mcp_servers.context7]\ncommand = 'npx'\nargs = ['-y', '@upstash/context7-mcp@3.2.5']\n");
    const result = await convergeHostMcpConfig(repo, "codex", { env, globalMcpProfile: "research" });
    expect(result.status).toBe("SKIPPED");
    const content = fs.readFileSync(configPath, "utf8");
    expect(content).not.toContain("enabled = false");
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
    const result = await convergeHostMcpConfig(repo, "codex", { env, globalMcpProfile: "none" });
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
    const result = await convergeHostMcpConfig(repo, "opencode", { env, globalMcpProfile: "none", dryRun: true });
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

  it("uses the native Command Code home and knows its managed MCP adapters", async () => {
    expect(hostHome("deepseek-harness", env)).toBe(path.join(env.HOME, ".dsh"));
    expect(hostHome("command-code", env)).toBe(path.join(env.HOME, ".commandcode"));
    const workspaceRepo = fs.existsSync(path.join(process.cwd(), "integrations", "registry.json"))
      ? process.cwd()
      : path.resolve(process.cwd(), "../..");
    const model = await buildConvergenceModel(workspaceRepo, "command-code", env);
    expect(model.knownNames).toEqual(new Set(["chrome-devtools", "codebase-memory", "context7", "playwright"]));
  });

  it("uses the active OMP profile directory and OMP-native mcpServers shape", async () => {
    env.OMP_PROFILE = "work";
    const configPath = path.join(hostHome("omp", env), HOST_CONFIG_FILES.omp);
    expect(configPath).toBe(path.join(env.HOME, ".omp", "profiles", "work", "agent", "mcp.json"));
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { context7: { command: "npx", args: ["-y", "@upstash/context7-mcp@3.2.5"] } } }));
    const parsed = parseHostConfig("omp", fs.readFileSync(configPath, "utf8"));
    expect(parsed.serverEntries.map((entry) => entry.id)).toEqual(["context7"]);
  });

  it("repairs only the exact legacy OMP Codebase Memory projection", async () => {
    const workspaceRepo = fs.existsSync(path.join(process.cwd(), "integrations", "registry.json"))
      ? process.cwd()
      : path.resolve(process.cwd(), "../..");
    const configPath = path.join(hostHome("omp", env), HOST_CONFIG_FILES.omp);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        "codebase-memory": { command: "codebase-memory-mcp", args: [] },
        mine: { command: "my-memory", args: ["--keep"] },
      },
    }));
    const result = await registerHostMcpAdapters(workspaceRepo, "omp", { env, profile: "all" });
    expect(result.status).toBe("REGISTERED");
    const next = JSON.parse(fs.readFileSync(configPath, "utf8")) as { mcpServers: Record<string, { command: string; args: string[] }> };
    expect(next.mcpServers["codebase-memory"]!.command).toMatch(/codebase-memory-mcp(\.exe)?$/i);
    expect(next.mcpServers.mine).toEqual({ command: "my-memory", args: ["--keep"] });
  });

  it("registers normal MCP setup with a backup and removes only the known Codex legacy alias", async () => {
    const registryPath = path.join(repo, "integrations", "registry.json");
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as { integrations: unknown[] };
    registry.integrations.push({
      id: "chrome-devtools-mcp", kind: "mcp", policy: "recommended", profiles: ["qa"], activation: "automatic",
      source: { type: "npm", package: "chrome-devtools-mcp", version: "1.7.0", mcpServerKey: "chrome-devtools" },
      install: { type: "npm-npx", handler: "npm", script: "" },
    });
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    const adapters = path.join(repo, "integrations", "recommended", "chrome-devtools-mcp", "adapters");
    fs.mkdirSync(adapters, { recursive: true });
    fs.writeFileSync(adapters + path.sep + "codex.toml", "[mcp_servers.chrome-devtools]\ncommand = 'npx'\nargs = ['-y', 'chrome-devtools-mcp@1.7.0', '--isolated']\nstartup_timeout_sec = 120\n");
    const configPath = path.join(hostHome("codex", env), HOST_CONFIG_FILES.codex);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, [
      "[mcp_servers.chrome-devtools]", "command = 'npx'", "args = ['-y', 'chrome-devtools-mcp@1.7.0', '--isolated']", "startup_timeout_sec = 120", "enabled = false", "",
      "[mcp_servers.chrome_devtools]", "command = 'npx'", "args = ['-y', 'chrome-devtools-mcp@1.7.0', '--isolated']", "startup_timeout_sec = 120", "",
      "[projects.'p:\\\\user-project']", "trust_level = 'trusted'", "",
    ].join("\n"));
    const result = await registerHostMcpAdapters(repo, "codex", { env, profile: "all" });
    expect(result.conflicts).toEqual([]);
    expect(result.status).toBe("REGISTERED");
    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath!)).toBe(true);
    const content = fs.readFileSync(configPath, "utf8");
    expect(content).toContain("[mcp_servers.chrome-devtools]");
    expect(content).not.toContain("[mcp_servers.chrome_devtools]");
    expect(content).toContain("[projects.'p:\\\\user-project']");
  });

  it("reports registration separately from a disabled host entry", async () => {
    const configPath = path.join(hostHome("codex", env), HOST_CONFIG_FILES.codex);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "[mcp_servers.context7]\ncommand = 'npx'\nargs = ['-y', '@upstash/context7-mcp@3.2.5']\nenabled = false\n");
    const inspection = await inspectHostMcpRegistration(repo, "codex", { env, profile: "research" });
    expect(inspection.status).toBe("MISSING");
    expect(inspection.entries).toEqual([expect.objectContaining({ id: "context7", status: "MCP_DISABLED" })]);
  });

  it("keeps a compatible user-pinned provider visible without overwriting it", async () => {
    const configPath = path.join(hostHome("codex", env), HOST_CONFIG_FILES.codex);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "[mcp_servers.context7]\ncommand = 'cmd.exe'\nargs = ['/d', '/s', '/c', 'npx', '-y', '@upstash/context7-mcp@latest']\n");
    const inspection = await inspectHostMcpRegistration(repo, "codex", { env, profile: "research" });
    expect(inspection.status).toBe("REGISTERED");
    expect(inspection.entries).toEqual([expect.objectContaining({ id: "context7", status: "MCP_REGISTERED" })]);
    expect(fs.readFileSync(configPath, "utf8")).toContain("@latest");
  });
});
