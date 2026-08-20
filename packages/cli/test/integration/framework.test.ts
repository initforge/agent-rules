import { describe, expect, it } from "vitest";
import { detectPlatform, expandInstallDir } from "../../src/integration/platform-detect.js";
import { getHandler, listRegistrations } from "../../src/integration/installer-registry.js";
import { npmVerify, npmUninstall } from "../../src/integration/handlers/npm.js";

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
});

describe("installer-registry", () => {
  it("lists registered integrations", () => {
    const registrations = listRegistrations();
    expect(registrations).toContain("codebase-memory-mcp");
    expect(registrations).toContain("playwright-mcp");
    expect(registrations).toContain("chrome-devtools-mcp");
    expect(registrations).toContain("context7");
    expect(registrations).toContain("rtk");
  });

  it("returns handler for known integration", () => {
    const handler = getHandler("playwright-mcp");
    expect(handler).toBeDefined();
    expect(handler!.install).toBeInstanceOf(Function);
    expect(handler!.verify).toBeInstanceOf(Function);
    expect(handler!.uninstall).toBeInstanceOf(Function);
  });

  it("returns undefined for unknown integration", () => {
    const handler = getHandler("nonexistent-integration");
    expect(handler).toBeUndefined();
  });
});

describe("npm handler", () => {
  it("uninstall is a no-op for npx packages", async () => {
    const result = await npmUninstall("@playwright/mcp");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("no uninstall needed");
  });
});
