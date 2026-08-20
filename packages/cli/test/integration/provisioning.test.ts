import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadIntegrationInventory } from "../../src/integration/inventory.js";
import { provisionMcps, verifyMcps, uninstallMcps } from "../../src/integration/provisioning.js";
import { registerHandler, clearHandlerOverrides, type IntegrationHandler, type HandlerResult } from "../../src/integration/installer-registry.js";

/**
 * Regression tests for framework-level MCP behavior: every `kind: mcp` entry
 * in the canonical registry is always fully provisioned, independent of
 * activation; installation and activation are two independent states; an MCP
 * that is BLOCKED/UNSUPPORTED/NEEDS_USER is never full-install success.
 *
 * Uses temp directories, fake handlers and fake executables — never real
 * installs or user-home mutation.
 */

const MCP_ID = "playwright-mcp";
const CLI_ID = "rtk";

async function tempRepo(entries: unknown): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prov-test-"));
  const integ = path.join(root, "integrations");
  await fs.mkdir(integ, { recursive: true });
  await fs.writeFile(
    path.join(integ, "registry.json"),
    JSON.stringify({ version: 2, integrations: entries }, null, 2),
  );
  for (const entry of entries as Array<{ id: string }>) {
    await fs.mkdir(path.join(integ, "recommended", entry.id), { recursive: true });
    await fs.writeFile(path.join(integ, "recommended", entry.id, "manifest.json"), "{}");
  }
  return root;
}

function fakeHandler(verify: HandlerResult, install: HandlerResult = { ok: true, message: "installed", location: "/fake/managed" }): IntegrationHandler {
  return {
    install: async () => install,
    verify: async () => verify,
    uninstall: async () => ({ ok: true, message: "uninstalled" }),
  };
}

function mcpEntry(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    kind: "mcp",
    policy: "recommended",
    profiles: [],
    source: { type: "npm", version: "1.0.0" },
    capabilities: ["browser.explore"],
    triggers: [],
    sideEffects: "read-only",
    tokenClass: "low",
    permissions: ["read-only"],
    install: { type: "npm-global", handler: id, script: "", verify: "", uninstall: "" },
    nativeHosts: [],
    fallback: "",
    deprecatedAliases: [],
    priority: 10,
    activation: "automatic",
    ...overrides,
  };
}

describe("canonical MCP provisioning", () => {
  let roots: string[] = [];
  const registered = new Set<string>();

  beforeEach(() => {
    registered.clear();
  });

  afterEach(async () => {
    clearHandlerOverrides();
    for (const root of roots) await fs.rm(root, { recursive: true, force: true });
    roots = [];
  });

  function register(id: string, handler: IntegrationHandler): void {
    registered.add(id);
    registerHandler(id, handler);
  }

  it("loads every kind:mcp entry from the canonical inventory", async () => {
    const root = await tempRepo([mcpEntry("a-mcp"), mcpEntry("b-mcp"), { ...mcpEntry("c-cli"), id: "c-cli", kind: "cli-tool" }]);
    roots.push(root);
    const inventory = await loadIntegrationInventory(root);
    expect(inventory.mcps.map((e) => e.id)).toEqual(["a-mcp", "b-mcp"]);
  });

  it("fails closed when the registry is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prov-missing-"));
    roots.push(root);
    await expect(loadIntegrationInventory(root)).rejects.toThrow(/Cannot read canonical integration registry/);
  });

  it("fails closed when the registry is malformed JSON", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prov-malformed-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "integrations"), { recursive: true });
    await fs.writeFile(path.join(root, "integrations", "registry.json"), "{ not json");
    await expect(loadIntegrationInventory(root)).rejects.toThrow(/malformed JSON/);
  });

  it("fails closed on a non-v2 registry contract", async () => {
    const root = await tempRepo([]);
    roots.push(root);
    await fs.writeFile(path.join(root, "integrations", "registry.json"), JSON.stringify({ version: 1, integrations: [] }));
    await expect(loadIntegrationInventory(root)).rejects.toThrow(/contract mismatch/);
  });

  it("attempts provisioning for every MCP entry (none silently skipped)", async () => {
    const root = await tempRepo([mcpEntry("a-mcp"), mcpEntry("b-mcp")]);
    roots.push(root);
    register("a-mcp", fakeHandler({ ok: true, message: "PASS" }));
    register("b-mcp", fakeHandler({ ok: true, message: "PASS" }));
    const summary = await provisionMcps(root);
    expect(summary.total).toBe(2);
    expect(summary.success).toBe(true);
    expect(summary.status).toBe("PASS");
  });

  it("a single BLOCKED MCP poisons the aggregate and never reports success", async () => {
    const root = await tempRepo([mcpEntry("ok-mcp"), mcpEntry("bad-mcp")]);
    roots.push(root);
    register("ok-mcp", fakeHandler({ ok: true, message: "PASS" }));
    register("bad-mcp", fakeHandler({ ok: false, status: "BLOCKED", message: "no provisioner" }));
    const summary = await provisionMcps(root);
    expect(summary.status).toBe("BLOCKED");
    expect(summary.success).toBe(false);
    expect(summary.results.find((r) => r.id === "bad-mcp")?.installation.status).toBe("BLOCKED");
    expect(summary.results.find((r) => r.id === "ok-mcp")?.installation.status).toBe("PRE-EXISTING");
  });

  it("UNSUPPORTED MCP is not counted as full-install PASS", async () => {
    const root = await tempRepo([mcpEntry("ok-mcp"), mcpEntry("nix-mcp")]);
    roots.push(root);
    register("ok-mcp", fakeHandler({ ok: true, message: "PASS" }));
    register("nix-mcp", fakeHandler({ ok: false, status: "UNSUPPORTED", message: "host cannot run this" }));
    const summary = await provisionMcps(root);
    expect(summary.status).toBe("UNSUPPORTED");
    expect(summary.success).toBe(false);
  });

  it("PRE-EXISTING only counts as success when the current verify passes", async () => {
    const root = await tempRepo([mcpEntry("stale-mcp")]);
    roots.push(root);
    // Verify fails → orchestrator installs → verify passes → PASS (fresh install).
    register("stale-mcp", fakeHandler({ ok: true, message: "PASS", version: "1.0.0", location: "/fake" }, { ok: true, message: "installed", location: "/fake" }));
    const summary = await provisionMcps(root);
    expect(summary.results[0].installation.status).toBe("PRE-EXISTING");

    // A PRE-EXISTING report requires a PASSING verify; a failing verify can never PASS.
    register("stale-mcp", fakeHandler({ ok: false, message: "binary missing" }));
    const summary2 = await verifyMcps(root);
    expect(summary2.results[0].installation.status).not.toBe("PRE-EXISTING");
    expect(summary2.success).toBe(false);
  });

  it("explicit-only MCPs are provisioned but never auto-activated", async () => {
    const root = await tempRepo([mcpEntry("pencil-mcp", { activation: "explicit-only" })]);
    roots.push(root);
    register("pencil-mcp", fakeHandler({ ok: true, message: "PASS" }));
    const summary = await provisionMcps(root);
    const result = summary.results[0];
    expect(result.installation.status).toBe("PRE-EXISTING");
    expect(result.activation.policy).toBe("explicit-only");
    expect(result.activation.status).toBe("NOT_ACTIVATED");
  });

  it("receipts carry id, version, location, status, reason and evidence", async () => {
    const root = await tempRepo([mcpEntry("ctx-mcp", { source: { type: "npm", version: "3.2.5" } })]);
    roots.push(root);
    register("ctx-mcp", fakeHandler({ ok: true, message: "PASS 3.2.5", version: "3.2.5", location: "/managed/ctx" }));
    const summary = await provisionMcps(root);
    const result = summary.results[0];
    expect(result.id).toBe("ctx-mcp");
    expect(result.installation.status).toBe("PRE-EXISTING");
    expect(result.installation.version).toBe("3.2.5");
    expect(result.installation.location).toBe("/managed/ctx");
    expect(result.installation.evidence).toContain("PASS");
  });

  it("provisioning targets only kind:mcp entries — non-MCP cli-tools are not auto-provisioned", async () => {
    const root = await tempRepo([mcpEntry("mcp-only"), { ...mcpEntry(CLI_ID), id: CLI_ID, kind: "cli-tool" }]);
    roots.push(root);
    register("mcp-only", fakeHandler({ ok: true, message: "PASS" }));
    register(CLI_ID, fakeHandler({ ok: false, status: "BLOCKED", message: "must never be called" }));
    const summary = await provisionMcps(root);
    expect(summary.total).toBe(1);
    expect(summary.success).toBe(true);
    expect(summary.results.map((r) => r.id)).toEqual(["mcp-only"]);
  });

  it("uninstall never pretends success for an unresolvable MCP", async () => {
    const root = await tempRepo([mcpEntry("ghost-mcp")]);
    roots.push(root);
    const summary = await uninstallMcps(root);
    expect(summary.success).toBe(false);
    expect(summary.results[0].installation.status).toBe("BLOCKED");
  });

  it("read-only reporting never fabricates PASS for an uninstalled MCP", async () => {
    const root = await tempRepo([mcpEntry("fresh-mcp")]);
    roots.push(root);
    register("fresh-mcp", fakeHandler({ ok: false, message: "binary missing" }));
    const summary = await verifyMcps(root);
    expect(summary.results[0].installation.status).toBe("PARTIAL");
    expect(summary.success).toBe(false);
  });
});