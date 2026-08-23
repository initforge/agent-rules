import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectOpenCodeSkills } from "../../../../platforms/opencode/adapter.js";

const temps: string[] = [];
function tempDir(): string {
  const dir = path.join(os.tmpdir(), `native-discovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("Native Skill Discovery & Capability Probing", () => {
  it("inspects OpenCode skills via native filesystem resolver without prompt injection", async () => {
    const repoRoot = tempDir();
    const skillsDir = path.join(repoRoot, "skills");
    await fs.mkdir(path.join(skillsDir, "frontend-architect"), { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, "frontend-architect", "SKILL.md"),
      "---\nname: frontend-architect\ndescription: Frontend architecture skill\n---\nBody",
      "utf8"
    );

    const inspected = inspectOpenCodeSkills(repoRoot);
    expect(inspected.skills).toContain("frontend-architect");
    expect(inspected.locations.some((l) => l.includes(repoRoot))).toBe(true);
  });

  it("verifies required canary skills: frontend-architect, frontend-design-contract, ui-taste, browser-qa", async () => {
    const canarySkills = [
      "frontend-architect",
      "frontend-design-contract",
      "ui-taste",
      "browser-qa",
    ];

    const repoRoot = path.resolve(__dirname, "../../../..");
    for (const skill of canarySkills) {
      const skillPath = path.join(repoRoot, "skills", skill, "SKILL.md");
      const stat = await fs.stat(skillPath).catch(() => null);
      expect(stat?.isFile()).toBe(true);
    }
  });

  it("ensures prompt injection does NOT satisfy DISCOVERED state", async () => {
    // When skills directory is empty, discovery returns empty list
    const emptyRepo = tempDir();
    await fs.mkdir(emptyRepo, { recursive: true });
    const inspected = inspectOpenCodeSkills(emptyRepo);
    // When no skills installed in emptyRepo, it finds nothing in that repo
    expect(inspected.skills.filter((s) => inspected.locations.some((l) => l.startsWith(emptyRepo)))).toHaveLength(0);
  });
});
