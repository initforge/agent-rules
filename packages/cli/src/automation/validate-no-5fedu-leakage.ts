import fs from "node:fs/promises";
import path from "node:path";

interface LeakageCheckResult {
  ok: boolean;
  problems: string[];
}

export async function validateNo5feduLeakage(repoRoot: string): Promise<LeakageCheckResult> {
  const problems: string[] = [];

  // R1: No 5fedu-* skills in public skills/
  const skillsDir = path.join(repoRoot, "skills");
  if (await dirExists(skillsDir)) {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const leakedSkills = entries.filter((e) => e.isDirectory() && e.name.startsWith("5fedu-"));
    if (leakedSkills.length > 0) {
      problems.push(`[LEAK R1] 5fedu skills found in public skills/: ${leakedSkills.map((e) => e.name).join(", ")}. Must live in profiles/5fedu/skills/.`);
    }
  }

  // R2: No 5fedu project template in projects/
  const projectsDir = path.join(repoRoot, "projects");
  if (await dirExists(projectsDir)) {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    const leakedProject = entries.filter((e) => e.isDirectory() && e.name === "5fedu");
    if (leakedProject.length > 0) {
      problems.push("[LEAK R2] 5fedu project template found in projects/. Must live in profiles/5fedu/projects/.");
    }
    const leakedKnown = await fileExists(path.join(projectsDir, "known-repos.md"));
    if (leakedKnown) {
      problems.push("[LEAK R2] known-repos.md found in projects/. Must live in profiles/5fedu/known-repos.md.");
    }
  }

  // R3: Profile-owned scripts not in automation/ root
  const automationDir = path.join(repoRoot, "automation");
  const profileScriptPrefixes = ["08-install-5fedu-context", "10-export-5fedu-writeback", "audit-5fedu", "migrate-nostime", "migrate-tahapp"];
  for (const prefix of profileScriptPrefixes) {
    const entries = await fs.readdir(automationDir).catch(() => []);
    const matches = entries.filter((e) => e.startsWith(prefix));
    if (matches.length > 0) {
      problems.push(`[LEAK R3] Profile-owned script found in automation/: ${matches[0]}. Must live in profiles/5fedu/automation/.`);
    }
  }

  // R4: Profile-owned automation profiles not in automation/profiles/
  const profileProfilesDir = path.join(automationDir, "profiles");
  if (await dirExists(profileProfilesDir)) {
    const entries = await fs.readdir(profileProfilesDir);
    const leakedProfiles = entries.filter((e) => ["nostime.json", "tah-app.json"].includes(e));
    if (leakedProfiles.length > 0) {
      problems.push(`[LEAK R4] Profile-owned profiles found in automation/profiles/: ${leakedProfiles.join(", ")}. Must live in profiles/5fedu/automation/profiles/.`);
    }
  }

  // R5: Profile directory structure
  const profileDir = path.join(repoRoot, "profiles");
  if (!(await dirExists(profileDir))) {
    problems.push("[LEAK R5] Missing profiles/ directory.");
  } else {
    const profileManifest = path.join(profileDir, "manifest.yaml");
    if (!(await fileExists(profileManifest))) {
      problems.push("[LEAK R5] Missing profiles/manifest.yaml.");
    }
    const fivefeduDir = path.join(profileDir, "5fedu");
    if (await dirExists(fivefeduDir)) {
      const profileYaml = path.join(fivefeduDir, "profile.yaml");
      if (!(await fileExists(profileYaml))) {
        problems.push("[LEAK R5] Missing profiles/5fedu/profile.yaml.");
      }
    }
  }

  return {
    ok: problems.length === 0,
    problems,
  };
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
