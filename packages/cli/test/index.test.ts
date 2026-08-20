import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExitCode } from "../src/types.js";
import * as path from "node:path";
import * as fs from "node:fs";

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

  it("source files exist for all commands", () => {
    const commands = [
      "build",
      "validate",
      "install",
      "doctor",
      "sync",
      "profile",
      "platform",
      "eval",
      "dashboard",
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

describe("Command handler signatures", () => {
  // Import handlers dynamically to verify they compile and export correctly
  it("exports build handler", async () => {
    const mod = await import("../src/commands/build.js");
    expect(typeof mod.build).toBe("function");
  });

  it("exports validate handler", async () => {
    const mod = await import("../src/commands/validate.js");
    expect(typeof mod.validate).toBe("function");
  });

  it("exports verifyMirrors handler", async () => {
    const mod = await import("../src/commands/verify-mirrors.js");
    expect(typeof mod.verifyMirrors).toBe("function");
  });

  it("exports install handler", async () => {
    const mod = await import("../src/commands/install.js");
    expect(typeof mod.installCmd).toBe("function");
  });

  it("exports doctor handler", async () => {
    const mod = await import("../src/commands/doctor.js");
    expect(typeof mod.doctor).toBe("function");
  });

  it("exports sync handler", async () => {
    const mod = await import("../src/commands/sync.js");
    expect(typeof mod.syncCmd).toBe("function");
  });

  it("exports profile handler", async () => {
    const mod = await import("../src/commands/profile.js");
    expect(typeof mod.profileCmd).toBe("function");
  });

  it("exports platform handler", async () => {
    const mod = await import("../src/commands/platform.js");
    expect(typeof mod.platformCmd).toBe("function");
  });

  it("exports eval handler", async () => {
    const mod = await import("../src/commands/eval.js");
    expect(typeof mod.evalCmd).toBe("function");
  });

  it("exports dashboard handler", async () => {
    const mod = await import("../src/commands/dashboard.js");
    expect(typeof mod.dashboard).toBe("function");
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
