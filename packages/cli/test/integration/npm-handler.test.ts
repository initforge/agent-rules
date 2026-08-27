import { describe, expect, it, vi, beforeEach } from "vitest";
import { npmInstall, npmVerify } from "../../src/integration/handlers/npm.js";

/**
 * npm handler regression tests: a full install requires a pinned version and a
 * durable managed install directory. `npx -y` transient caching can never be
 * PASS, and commands must run through argv (no shell interpolation).
 */

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(async () => undefined),
}));

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mocks.execFile(...args),
}));

vi.mock("node:util", () => ({
  promisify: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("node:fs/promises", () => ({
  stat: (...args: unknown[]) => mocks.stat(...args),
  mkdir: (...args: unknown[]) => mocks.mkdir(...args),
  default: {
    stat: (...args: unknown[]) => mocks.stat(...args),
    mkdir: (...args: unknown[]) => mocks.mkdir(...args),
  },
}));

describe("npm managed-install handler", () => {
  beforeEach(() => {
    mocks.execFile.mockReset();
    mocks.stat.mockReset();
    mocks.stat.mockResolvedValue({});
  });

  it("rejects a missing version pin (npx-cache-style @latest is never a full install)", async () => {
    const result = await npmInstall({ packageName: "@playwright/mcp", installDir: "/managed/dir" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("BLOCKED");
    expect(result.message).toContain("pinned version");
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it("rejects an install without a durable managed install directory", async () => {
    const result = await npmInstall({ packageName: "@playwright/mcp", version: "0.0.78" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("BLOCKED");
    expect(result.message).toContain("managed install directory");
  });

  it("installs a pinned package into the managed surface via argv (no shell string)", async () => {
    mocks.execFile.mockResolvedValue({ stdout: "", stderr: "" });
    const result = await npmInstall({
      packageName: "@playwright/mcp",
      version: "0.0.78",
      commandName: "playwright-mcp",
      installDir: "/managed/npm-global",
    });
    expect(result.ok).toBe(true);
    expect(result.location).toBe("/managed/npm-global");
    // Windows-safe argv: npm's JS entrypoint under the current Node runtime;
    // other platforms keep the native npm command. Neither uses a shell.
    const args = mocks.execFile.mock.calls[0];
    expect(args[0]).toBe(process.platform === "win32" ? process.execPath : "npm");
    expect(Array.isArray(args[1])).toBe(true);
    expect(args[1]).toEqual(expect.arrayContaining(["--prefix", "/managed/npm-global", "@playwright/mcp@0.0.78"]));
    if (process.platform === "win32") expect(args[1][0]).toMatch(/npm-cli\.js$/i);
    expect(args[1]).not.toContain("sh");
    expect(args[1]).not.toContain("npx");
  });

  it("verify fails closed when the managed binary is absent", async () => {
    mocks.stat.mockRejectedValue(new Error("ENOENT"));
    const result = await npmVerify({ packageName: "@playwright/mcp", version: "0.0.78", commandName: "playwright-mcp", installDir: "/managed/npm-global" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("missing managed binary");
  });
});
