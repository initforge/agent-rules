import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getGlobalSkillRoots,
  getHarnessHome,
  projectSkillsToGlobal,
  writeGlobalOwnershipManifest,
  writeWorkspaceOwnershipManifest,
} from "../../../cli/src/runtime/composed-installer.js";
import { RUNTIME_PLATFORMS } from "../../../cli/src/runtime/contracts.js";

const temps: string[] = [];
function tempDir(): string {
  const dir = path.join(os.tmpdir(), `composed-installer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("Composed Installer & Skill Projection", () => {
  it("projects skills across all 8 canonical hosts to their respective global roots", async () => {
    const roots = getGlobalSkillRoots();
    for (const platform of RUNTIME_PLATFORMS) {
      expect(roots[platform]).toBeDefined();
      expect(Array.isArray(roots[platform])).toBe(true);
      expect(roots[platform].length).toBeGreaterThan(0);
    }
    expect(roots.codex[0]).toMatch(/\.agents[\\/]skills$/);
    expect(roots.claude[0]).toMatch(/\.claude[\\/]skills$/);
    expect(roots.opencode[0]).toMatch(/\.config[\\/]opencode[\\/]skills$/);
    expect(roots.antigravity[0]).toMatch(/\.gemini[\\/]config[\\/]skills$/);
    expect(roots.antigravity[1]).toMatch(/\.gemini[\\/]antigravity-cli[\\/]skills$/);
    expect(roots.cursor[0]).toMatch(/\.cursor[\\/]skills$/);
    expect(roots.grok[0]).toMatch(/\.grok[\\/]skills$/);
  });

  it("projects generic skills to user global roots with preserved SKILL.md", async () => {
    const sourceRoot = tempDir();
    const targetRoot = tempDir();
    const skillDir = path.join(sourceRoot, "frontend-architect");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: frontend-architect\n---\nBody", "utf8");

    const { projected } = await projectSkillsToGlobal(sourceRoot, "codex", { targetRoots: [targetRoot] });
    expect(projected).toContain("frontend-architect");
    expect(await fs.readFile(path.join(targetRoot, "frontend-architect", "SKILL.md"), "utf8")).toContain("frontend-architect");
  });

  it("writes global ownership manifest to harness home and workspace manifest to .agent", async () => {
    const fakeRepo = tempDir();
    const globalManifestPath = await writeGlobalOwnershipManifest({
      schema: "agent-rules/global-ownership-manifest/v1",
      version: 1,
      updatedAt: new Date().toISOString(),
      effectivePlanSha256: "0".repeat(64),
      projections: {
        "rule-01": {
          platform: "codex",
          path: "/fake/path/AGENTS.md",
          kind: "rule",
          sha256: "0".repeat(64),
        },
      },
    });

    const workspaceManifestPath = await writeWorkspaceOwnershipManifest(fakeRepo, {
      schema: "agent-rules/workspace-ownership-manifest/v1",
      version: 1,
      repositoryRoot: fakeRepo,
      updatedAt: new Date().toISOString(),
      effectivePlanSha256: "0".repeat(64),
      projections: {},
    });

    const globalContent = JSON.parse(await fs.readFile(globalManifestPath, "utf8"));
    const wsContent = JSON.parse(await fs.readFile(workspaceManifestPath, "utf8"));

    expect(globalContent.schema).toBe("agent-rules/global-ownership-manifest/v1");
    expect(wsContent.schema).toBe("agent-rules/workspace-ownership-manifest/v1");
    expect(wsContent.repositoryRoot).toBe(fakeRepo);
  });
});
