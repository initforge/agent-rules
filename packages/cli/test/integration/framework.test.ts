import { describe, expect, it } from "vitest";
import { detectPlatform, expandInstallDir, resolveInstallDir } from "../../src/integration/platform-detect.js";
import { handlerForRegistryEntry } from "../../src/integration/installer-registry.js";
import { loadIntegrationInventory } from "../../src/integration/inventory.js";
import { npmUninstall } from "../../src/integration/handlers/npm.js";
import { getRepoRoot } from "../../src/adapters/repo.js";

describe("platform-detect", () => {
  it("detects current platform", () => {
    const info = detectPlatform();
    expect(info.platform).toMatch(/^(windows|linux|darwin)$/);
    expect(info.arch).toMatch(/^(amd64|arm64)$/);
    expect(info.key).toMatch(/^(windows|linux|darwin)-(amd64|arm64)$/);
    expect(info.home).toBeTruthy();
  });

  it("expands $HOME in install dirs", () => {
    const result = expandInstallDir("$HOME/.local/share/test", "/home/user");
    expect(result).toBe("/home/user/.local/share/test");
  });

  it("expands %LOCALAPPDATA% in install dirs", () => {
    const result = expandInstallDir("%LOCALAPPDATA%\\Programs\\test", "/home/user");
    expect(result).toContain("Programs\\test");
  });

  it("resolves a durable install dir from a manifest installDirs map", () => {
    const info = { platform: "linux", arch: "amd64", key: "linux-amd64", home: "/home/user" };
    expect(resolveInstallDir({ linux: "$HOME/.local/share/x", windows: "%LOCALAPPDATA%\\x" }, info)).toBe("/home/user/.local/share/x");
    expect(resolveInstallDir({ windows: "%LOCALAPPDATA%\\x" }, info)).toBeUndefined();
  });
});

describe("registry-driven installer-registry", () => {
  it("resolves a handler for every canonical registry entry (single source of truth)", async () => {
    const root = getRepoRoot();
    const inventory = await loadIntegrationInventory(root);
    expect(inventory.entries.length).toBeGreaterThan(0);
    for (const entry of inventory.entries) {
      expect(handlerForRegistryEntry(root, entry), `handler for ${entry.id}`).toBeDefined();
    }
  });

  it("returns undefined for an unknown install type (fails closed, never silent)", async () => {
    const root = getRepoRoot();
    const inventory = await loadIntegrationInventory(root);
    const entry = { ...inventory.entries[0], id: "unresolvable", install: { type: "unknown-type" } };
    expect(handlerForRegistryEntry(root, entry)).toBeUndefined();
  });
});

describe("npm handler", () => {
  it("uninstall without a managed install dir is an honest failure, not a pretend no-op", async () => {
    const result = await npmUninstall({ packageName: "@playwright/mcp" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("BLOCKED");
    expect(result.message).toContain("installDir");
  });
});