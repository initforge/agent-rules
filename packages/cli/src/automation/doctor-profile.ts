import fs from "node:fs/promises";
import path from "node:path";
import { getProfileDir, getProfileConfig, getProfileOwnedFiles, testProfileEnabled, getEnabledProfiles } from "./profile-helper.js";

interface DoctorProfileResult {
  ok: boolean;
  problems: string[];
  profiles: Array<{
    name: string;
    enabled: boolean;
    missingFiles: string[];
    version?: string;
  }>;
}

export async function doctorProfile(repoRoot: string, profileName?: string): Promise<DoctorProfileResult> {
  const problems: string[] = [];
  const profiles: DoctorProfileResult["profiles"] = [];

  let names: string[];
  if (profileName) {
    names = [profileName];
  } else {
    names = await getEnabledProfiles(repoRoot);
    if (names.length === 0) {
      // List available profiles
      const profileRoot = path.join(repoRoot, "profiles");
      try {
        const entries = await fs.readdir(profileRoot, { withFileTypes: true });
        const available = entries
          .filter((e) => e.isDirectory())
          .filter((e) => {
            try {
              require("node:fs").accessSync(path.join(profileRoot, e.name, "profile.yaml"));
              return true;
            } catch {
              return false;
            }
          })
          .map((e) => e.name);

        if (available.length === 0) {
          return { ok: true, problems: [], profiles: [] };
        }
        console.log("No profiles enabled. Available:");
        for (const p of available) {
          console.log(`  ${p}`);
        }
        return { ok: true, problems: [], profiles: [] };
      } catch {
        return { ok: true, problems: [], profiles: [] };
      }
    }
  }

  for (const name of names) {
    const profileDir = getProfileDir(repoRoot, name);
    try {
      await fs.access(profileDir);
    } catch {
      problems.push(`Profile directory missing: ${profileDir}`);
      continue;
    }

    const configPath = path.join(profileDir, "profile.yaml");
    try {
      await fs.access(configPath);
    } catch {
      problems.push(`Missing profile.yaml: ${configPath}`);
      continue;
    }

    const enabled = await testProfileEnabled(repoRoot, name);
    const state = enabled ? "ENABLED" : "DISABLED";
    console.log(`Profile '${name}': ${state}`);

    const owned = await getProfileOwnedFiles(repoRoot, name);
    const missing: string[] = [];
    for (const file of owned) {
      const fullPath = path.join(repoRoot, file);
      try {
        await fs.access(fullPath);
      } catch {
        missing.push(file);
      }
    }

    if (missing.length > 0) {
      problems.push(`Profile '${name}' has ${missing.length} missing owned file(s): ${missing.join(", ")}`);
    } else {
      console.log("  All owned files present.");
    }

    const config = await getProfileConfig(repoRoot, name);
    if (config?.version) {
      console.log(`  Version: ${config.version}`);
    }

    profiles.push({
      name,
      enabled,
      missingFiles: missing,
      version: config?.version as string | undefined,
    });
  }

  if (problems.length === 0) {
    console.log("Profile health OK.");
  }

  return {
    ok: problems.length === 0,
    problems,
    profiles,
  };
}
