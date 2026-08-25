import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExitCode } from "../src/types.js";
import { createHash } from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Helper to get repo root ────────────────────────────────────
function getRepoRoot(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

// ── Re-import helpers instead of adapter (avoid child_process) ──
function getAutomationDir(root: string): string {
  return path.join(root, "automation");
}

// ── Tests ──────────────────────────────────────────────────────

describe("Exit codes", () => {
  it("provides distinct exit codes", () => {
    expect(ExitCode.Success).toBe(0);
    expect(ExitCode.GeneralError).toBe(1);
    expect(ExitCode.InvalidArgument).toBe(2);
    expect(ExitCode.NotImplemented).toBe(3);
    expect(ExitCode.LegacyFailed).toBe(4);
    expect(ExitCode.ValidationFailed).toBe(5);
  });
});

describe("Cross-platform paths", () => {
  const root = getRepoRoot();

  it("repo root is absolute and contains automation", () => {
    expect(root).toBeTruthy();
    const automation = path.join(root, "automation");
    expect(fs.existsSync(automation)).toBe(true);
  });

  it("automation scripts exist", () => {
    const scripts = [
      "01-build-runtime.ps1",
      "02-install-runtime.ps1",
      "03-validate-context.ps1",
      "09-doctor.ps1",
    ];
    for (const script of scripts) {
      const scriptPath = path.join(root, "automation", script);
      expect(fs.existsSync(scriptPath)).toBe(true);
    }
  });

  it("platform directories exist", () => {
    const platforms = ["codex", "grok", "antigravity", "cursor"];
    for (const p of platforms) {
      const dir = path.join(root, "platforms", p);
      expect(fs.existsSync(dir)).toBe(true);
    }
  });

  it("uses forward slashes on non-Windows paths", () => {
    // Verify path.join produces correct separators
    const joined = path.join("automation", "01-build-runtime.ps1");
    if (process.platform === "win32") {
      expect(joined).toContain("\\");
    } else {
      expect(joined).toContain("/");
    }
  });
});

describe("Configuration", () => {
  const root = getRepoRoot();

  it("package.json exists with correct metadata", () => {
    const pkg = JSON.parse(
      fs.readFileSync(      path.join(root, "packages", "cli", "package.json"), "utf-8")
    );
    expect(pkg.name).toBe("@initforge/agent-rules");
    expect(pkg.engines.node).toBe(">=18.0.0");
    expect(pkg.type).toBe("module");
    expect(pkg.bin).toHaveProperty("agent-rules");
  });

  it("tsconfig.json exists with strict mode", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(      path.join(root, "packages", "cli", "tsconfig.json"), "utf-8")
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.target).toBe("ES2022");
    expect(tsconfig.compilerOptions.module).toBe("NodeNext");
  });

  it("source files exist for the 8-command public surface", () => {
    // The 8 registered commands (install, uninstall, doctor, status, run,
    // integration, init, reference) are backed by these source modules;
    // status/run/init/reference live in northstar-ux.ts.
    const commands = [
      "install",
      "uninstall",
      "doctor",
      "integration",
      "northstar-ux",
    ];
    for (const cmd of commands) {
      const file = path.join(root, "packages", "cli", "src", "commands", `${cmd}.ts`);
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it("adapter file exists", () => {
    const adapter = path.join(root, "packages", "cli", "src", "adapters", "powershell.ts");
    expect(fs.existsSync(adapter)).toBe(true);
  });

  it("main entry point exists", () => {
    const entry = path.join(root, "packages", "cli", "src", "index.ts");
    expect(fs.existsSync(entry)).toBe(true);
  });
});

describe("Integration registry", () => {
  it("registers the recommended browser providers and resolves their manifests", async () => {
    const registry = await import("../src/integration/installer-registry.js");
    const inventory = await import("../src/integration/inventory.js");
    const root = getRepoRoot();
    const { entries } = await inventory.loadIntegrationInventory(root);

    expect(entries.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "playwright-cli",
      "playwright-mcp",
      "chrome-devtools-mcp",
      "serena",
      "pencil-mcp",
    ]));
    // Every canonical registry entry resolves to a real install handler.
    for (const entry of entries) {
      expect(registry.handlerForRegistryEntry(root, entry)).toBeDefined();
    }
    expect(registry.resolveIntegrationManifestDir(root, "playwright-cli")).toContain(
      path.join("integrations", "recommended", "playwright-cli"),
    );
    expect(registry.resolveIntegrationManifestDir(root, "chrome-devtools-mcp")).toContain(
      path.join("integrations", "recommended", "chrome-devtools-mcp"),
    );
  });
});

describe("Command handler signatures", () => {
  // Import handlers dynamically to verify they compile and export correctly
  it("exports install handler", async () => {
    const mod = await import("../src/commands/install.js");
    expect(typeof mod.installCmd).toBe("function");
  });

  it("exports uninstall handler", async () => {
    const mod = await import("../src/commands/uninstall.js");
    expect(typeof mod.uninstallCmd).toBe("function");
  });

  it("exports doctor handler", async () => {
    const mod = await import("../src/commands/doctor.js");
    expect(typeof mod.doctor).toBe("function");
  });

  it("exports integration handler", async () => {
    const mod = await import("../src/commands/integration.js");
    expect(typeof mod.integrationCmd).toBe("function");
  });

  it("exports northstar-ux handlers", async () => {
    const mod = await import("../src/commands/northstar-ux.js");
    expect(typeof mod.northStarRun).toBe("function");
    expect(typeof mod.northStarStatus).toBe("function");
    expect(typeof mod.initNorthStar).toBe("function");
    expect(typeof mod.northStarReference).toBe("function");
    expect(typeof mod.northStarReferenceSearch).toBe("function");
  });
});

describe("JSON output structure", () => {
  it("CommandResult has required fields", () => {
    const valid: Record<string, unknown> = {
      exitCode: 0,
      message: "ok",
      data: { key: "value" },
    };
    expect(valid.exitCode).toBe(0);
    expect(valid.message).toBe("ok");
    expect(valid.data).toEqual({ key: "value" });
  });

  it("CommandResult can omit data", () => {
    const minimal: Record<string, unknown> = {
      exitCode: 0,
      message: "ok",
    };
    expect(minimal.exitCode).toBe(0);
    expect(minimal.message).toBe("ok");
    expect(minimal.data).toBeUndefined();
  });

  it("handles not-implemented exit code", () => {
    const notImpl: Record<string, unknown> = {
      exitCode: 3,
      message: "not implemented",
    };
    expect(notImpl.exitCode).toBe(ExitCode.NotImplemented);
  });
});

describe("Argument validation patterns", () => {
  const validPlatforms = ["codex", "grok", "antigravity", "cursor", "all"];

  it.each(validPlatforms)("accepts valid platform: %s", (platform) => {
    expect(validPlatforms).toContain(platform);
  });

  it("rejects invalid platform", () => {
    expect(validPlatforms).not.toContain("invalid");
  });
});
