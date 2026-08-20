import fs from "node:fs/promises";
import path from "node:path";

interface ImportOptions {
  sourcePath: string;
  changeType: "global" | "skill" | "project" | "evidence" | "legacy";
  apply?: boolean;
  allowDeletedSkillRestore?: boolean;
  repoRoot: string;
}

interface ImportReport {
  sourcePath: string;
  changeType: string;
  apply: boolean;
  note: string;
}

export async function importReviewedChanges(options: ImportOptions): Promise<ImportReport> {
  const { sourcePath, changeType, apply = false, allowDeletedSkillRestore = false, repoRoot } = options;
  const resolved = path.resolve(sourcePath);

  const allowedRoots = [
    path.join(repoRoot, "rules"),
    path.join(repoRoot, "skills"),
    path.join(repoRoot, "projects"),
    path.join(repoRoot, "integrations"),
    path.join(repoRoot, "platforms"),
    path.join(repoRoot, "guides"),
    path.join(repoRoot, ".codex"),
    path.join(repoRoot, ".agents"),
  ].filter((root) => fileExistsSync(root));

  if (resolved.startsWith(path.join(repoRoot, "generated"))) {
    throw new Error("Generated build output cannot be imported.");
  }

  const underAllowedRoot = allowedRoots.some((allowed) =>
    resolved.startsWith(allowed)
  );
  if (!underAllowedRoot) {
    throw new Error("Source path is outside reviewed import roots.");
  }

  if (resolved.includes("/evidence/") && changeType !== "evidence") {
    throw new Error("Evidence paths can only be imported as evidence.");
  }
  if (resolved.includes("/legacy/") && changeType !== "legacy") {
    throw new Error("Legacy paths can only be imported as legacy.");
  }
  if (resolved.includes("/archive/") && changeType !== "legacy") {
    throw new Error("Archive paths can only be imported as legacy.");
  }

  const tombstoneDir = path.join(repoRoot, ".agent", "tombstones");
  await fs.mkdir(tombstoneDir, { recursive: true });

  const legacyTombstoneDir = path.join(repoRoot, "plans", "tombstones");
  if (await fileExists(legacyTombstoneDir)) {
    const entries = await fs.readdir(legacyTombstoneDir);
    for (const entry of entries) {
      const src = path.join(legacyTombstoneDir, entry);
      const dest = path.join(tombstoneDir, entry);
      if (!(await fileExists(dest))) {
        await fs.copyFile(src, dest);
      }
    }
  }

  if (changeType === "skill" && !allowDeletedSkillRestore) {
    const skillMatch = resolved.match(/[/\\]skills[/\\]([^/\\]+)[/\\]/);
    if (skillMatch) {
      const skillName = skillMatch[1];
      const canonicalSkill = path.join(repoRoot, "skills", skillName);
      const tombstone = path.join(tombstoneDir, `${skillName}.tombstone`);
      if (!(await fileExists(canonicalSkill)) || (await fileExists(tombstone))) {
        throw new Error(`Skill '${skillName}' was removed from canonical (tombstone). Use allowDeletedSkillRestore after explicit review.`);
      }
    }
  }

  if (!apply) {
    return {
      sourcePath: resolved,
      changeType,
      apply: false,
      note: "Reviewed import only. Inspect diff before using apply. Canonical wins on conflict.",
    };
  }

  return {
    sourcePath: resolved,
    changeType,
    apply: true,
    note: "Reviewed import is intentionally manual after diff approval. After merge: run validate and build.",
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fileExistsSync(filePath: string): boolean {
  try {
    require("node:fs").accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}
