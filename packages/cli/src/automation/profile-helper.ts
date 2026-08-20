import fs from "node:fs/promises";
import path from "node:path";

interface ProfileConfig {
  name?: string;
  description?: string;
  enabledByDefault?: boolean;
  [key: string]: unknown;
}

export function getProfileRoot(repoRoot: string): string {
  return path.join(repoRoot, "profiles");
}

export function getProfileManifest(repoRoot: string): string {
  return path.join(getProfileRoot(repoRoot), "manifest.yaml");
}

export function getProfileDir(repoRoot: string, name: string): string {
  return path.join(getProfileRoot(repoRoot), name);
}

export async function getProfileConfig(repoRoot: string, name: string): Promise<ProfileConfig | null> {
  const configPath = path.join(getProfileDir(repoRoot, name), "profile.yaml");
  try {
    const content = await fs.readFile(configPath, "utf8");
    const config: ProfileConfig = {};
    for (const line of content.split("\n")) {
      const match1 = line.match(/^(\w+):\s*"(.+)"/);
      if (match1) {
        config[match1[1]] = match1[2];
      }
      const match2 = line.match(/^enabledByDefault:\s*(.+)/);
      if (match2) {
        config.enabledByDefault = match2[1].trim() === "true";
      }
    }
    return config;
  } catch {
    return null;
  }
}

export async function getProfileOwnedFiles(repoRoot: string, name: string): Promise<string[]> {
  const configPath = path.join(getProfileDir(repoRoot, name), "profile.yaml");
  try {
    const content = await fs.readFile(configPath, "utf8");
    const files: string[] = [];
    let inOwned = false;
    for (const line of content.split("\n")) {
      if (/^ownedFiles:/.test(line)) {
        inOwned = true;
        continue;
      }
      if (inOwned) {
        const match = line.match(/^\s+- "(.+)"/);
        if (match) {
          files.push(match[1]);
        } else if (/^\w/.test(line)) {
          inOwned = false;
        }
      }
    }
    return files;
  } catch {
    return [];
  }
}

export async function testProfileEnabled(repoRoot: string, name: string): Promise<boolean> {
  const marker = path.join(repoRoot, ".agent/profiles", `${name}.enabled`);
  try {
    await fs.access(marker);
    return true;
  } catch {
    return false;
  }
}

export async function enableProfile(repoRoot: string, name: string): Promise<void> {
  const profileDir = getProfileDir(repoRoot, name);
  try {
    await fs.access(profileDir);
  } catch {
    throw new Error(`Profile '${name}' not found at ${profileDir}`);
  }

  const markerDir = path.join(repoRoot, ".agent/profiles");
  await fs.mkdir(markerDir, { recursive: true });
  await fs.writeFile(
    path.join(markerDir, `${name}.enabled`),
    `enabled: ${new Date().toISOString()}\n`,
    "utf8"
  );
  console.log(`Profile '${name}' enabled.`);
}

export async function disableProfile(repoRoot: string, name: string): Promise<void> {
  const marker = path.join(repoRoot, ".agent/profiles", `${name}.enabled`);
  try {
    await fs.unlink(marker);
    console.log(`Profile '${name}' disabled.`);
  } catch {
    console.log(`Profile '${name}' is not enabled.`);
  }
}

export async function getEnabledProfiles(repoRoot: string): Promise<string[]> {
  const profileDir = path.join(repoRoot, ".agent/profiles");
  try {
    const entries = await fs.readdir(profileDir);
    return entries
      .filter((e) => e.endsWith(".enabled"))
      .map((e) => e.replace(".enabled", ""));
  } catch {
    return [];
  }
}

export async function testProfileOwnedFile(repoRoot: string, name: string, relativePath: string): Promise<boolean> {
  const owned = await getProfileOwnedFiles(repoRoot, name);
  const normalized = relativePath.replace(/\\/g, "/");
  for (const pattern of owned) {
    const patNormalized = pattern
      .replace(/\\/g, "/")
      .replace(/\*\*/g, "__RECURSIVE__")
      .replace(/\*/g, "[^/]*")
      .replace("__RECURSIVE__", ".*");
    if (new RegExp(`^${patNormalized}$`).test(normalized)) {
      return true;
    }
  }
  return false;
}
