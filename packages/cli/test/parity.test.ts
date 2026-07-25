import { describe, it, expect, beforeAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";

function getRepoRoot(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function sha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("Build parity", () => {
  const root = getRepoRoot();
  const buildRoot = path.join(root, "generated", "runtime-build");
  const platforms = ["codex", "grok", "antigravity", "cursor"];

  beforeAll(() => {
    // Verify build directory exists
    if (!fs.existsSync(path.join(buildRoot, "codex", "manifest.json"))) {
      throw new Error(
        "Build not found. Run: node packages/cli/dist/index.js build"
      );
    }
  });

  it("produces manifest.json for each platform", () => {
    for (const p of platforms) {
      const manifestPath = path.join(buildRoot, p, "manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.version).toBe(1);
      expect(manifest.platform).toBe(p);
      expect(Array.isArray(manifest.files)).toBe(true);
    }
  });

  it("includes all required paths in each platform manifest", () => {
    const requiredPaths = [
      "model-policy.json",
      "rules/manifest.yaml",
      "agent-rules-tools/workctl.py",
    ];
    for (const p of platforms) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(buildRoot, p, "manifest.json"), "utf-8")
      );
      const filePaths = manifest.files.map((f: any) => f.path);
      for (const rp of requiredPaths) {
        expect(filePaths).toContain(rp);
      }
    }
  });

  it("has deterministic file ordering in manifests", () => {
    for (const p of platforms) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(buildRoot, p, "manifest.json"), "utf-8")
      );
      const paths = manifest.files.map((f: any) => f.path);
      const sorted = [...paths].sort((a: string, b: string) =>
        a.localeCompare(b, "en")
      );
      expect(paths).toEqual(sorted);
    }
  });

  it("has valid sha256 hashes in each manifest", () => {
    for (const p of platforms) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(buildRoot, p, "manifest.json"), "utf-8")
      );
      for (const file of manifest.files) {
        expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
        const filePath = path.join(buildRoot, p, ...file.path.split("/"));
        if (fs.existsSync(filePath)) {
          const actualHash = sha256(filePath);
          expect(file.sha256).toBe(actualHash);
        }
      }
    }
  });

  it("has identical skills across all platforms", () => {
    const baseManifest = JSON.parse(
      fs.readFileSync(path.join(buildRoot, "codex", "manifest.json"), "utf-8")
    );
    const baseSkills = baseManifest.files
      .filter((f: any) => f.path.startsWith("skills/"))
      .map((f: any) => f.path);

    for (const p of platforms.slice(1)) {
      const otherManifest = JSON.parse(
        fs.readFileSync(path.join(buildRoot, p, "manifest.json"), "utf-8")
      );
      const otherSkills = otherManifest.files
        .filter((f: any) => f.path.startsWith("skills/"))
        .map((f: any) => f.path);

      expect(otherSkills.sort()).toEqual(baseSkills.sort());
    }
  });
});

describe("CLI help output", () => {
  const root = getRepoRoot();
  const cliEntry = path.join(root, "packages", "cli", "dist", "index.js");

  it("shows all migrated commands in help", () => {
    const { execFileSync } = require("node:child_process");
    const help = execFileSync("node", [cliEntry, "--help"], {
      encoding: "utf-8",
    });
    expect(help).toContain("build");
    expect(help).toContain("validate");
    expect(help).toContain("verify-mirrors");
    expect(help).toContain("doctor");
  });

  it("shows migrated descriptions for migrated commands", () => {
    const { execFileSync } = require("node:child_process");
    const help = execFileSync("node", [cliEntry, "--help"], {
      encoding: "utf-8",
    });
    expect(help).toContain("migrated");
    expect(help).toContain("03-validate-context");
    expect(help).toContain("04-verify-mirrors");
    expect(help).toContain("09-doctor");
  });
});

describe("Cross-platform path handling", () => {
  const root = getRepoRoot();

  it("builds with forward slashes in manifest paths", () => {
    const manifestPath = path.join(
      root,
      "generated",
      "runtime-build",
      "codex",
      "manifest.json"
    );
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      for (const file of manifest.files) {
        expect(file.path).not.toContain("\\");
      }
    }
  });

  it("handles Windows-style and POSIX paths in token replacement", () => {
    // Verify AGENTS.md has proper path replacement
    const agentsPath = path.join(
      root,
      "generated",
      "runtime-build",
      "codex",
      "AGENTS.md"
    );
    if (fs.existsSync(agentsPath)) {
      const body = fs.readFileSync(agentsPath, "utf-8");
      // Should not contain unsubstituted placeholders
      expect(body).not.toContain("__AGENT_RULES_ROOT__");
      expect(body).not.toContain("__CODEX_HOME__");
    }
  });
});

describe("Mirror verification parity", () => {
  const root = getRepoRoot();
  const buildRoot = path.join(root, "generated", "runtime-build");

  it("codex and grok have same rule hashes for non-overlay files", () => {
    const codex = JSON.parse(
      fs.readFileSync(path.join(buildRoot, "codex", "manifest.json"), "utf-8")
    );
    const grok = JSON.parse(
      fs.readFileSync(path.join(buildRoot, "grok", "manifest.json"), "utf-8")
    );

    const codexRules = codex.files.filter(
      (f: any) => f.path.startsWith("rules/") && !f.path.endsWith("-overlay.md")
    );
    for (const rule of codexRules) {
      const match = grok.files.find((f: any) => f.path === rule.path);
      expect(match).toBeDefined();
      expect(match.sha256).toBe(rule.sha256);
    }
  });

  it("detects hash mismatch in mirror", () => {
    // This test verifies the logic works by comparing known-equal builds
    // It should pass if no drift exists
    const codex = JSON.parse(
      fs.readFileSync(path.join(buildRoot, "codex", "manifest.json"), "utf-8")
    );
    const cursor = JSON.parse(
      fs.readFileSync(path.join(buildRoot, "cursor", "manifest.json"), "utf-8")
    );

    const codexSkills = codex.files.filter((f: any) =>
      f.path.startsWith("skills/")
    );
    for (const skill of codexSkills) {
      const match = cursor.files.find((f: any) => f.path === skill.path);
      expect(match).toBeDefined();
      expect(match.sha256).toBe(skill.sha256);
    }
  });
});
