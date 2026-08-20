import fs from "node:fs/promises";
import path from "node:path";

interface ProfileInfo {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  enabledByDefault?: boolean;
}

export async function discoverProfiles(repoRoot: string): Promise<ProfileInfo[]> {
  const manifestPath = path.join(repoRoot, "profiles/manifest.yaml");
  try {
    const manifest = await fs.readFile(manifestPath, "utf8");
    const profiles: ProfileInfo[] = [];
    let profileSection = false;
    let currentProfile: ProfileInfo | null = null;

    for (const line of manifest.split("\n")) {
      if (/^profiles:/.test(line)) {
        profileSection = true;
        continue;
      }
      if (!profileSection) continue;

      const nameMatch = line.match(/^  (\S+):/);
      if (nameMatch) {
        if (currentProfile) {
          profiles.push(currentProfile);
        }
        currentProfile = { name: nameMatch[1] };
      }

      if (currentProfile) {
        const displayNameMatch = line.match(/^\s+displayName:\s*"(.+)"/);
        if (displayNameMatch) currentProfile.displayName = displayNameMatch[1];

        const descMatch = line.match(/^\s+description:\s*"(.+)"/);
        if (descMatch) currentProfile.description = descMatch[1];

        const versionMatch = line.match(/^\s+version:\s*"(.+)"/);
        if (versionMatch) currentProfile.version = versionMatch[1];

        const enabledMatch = line.match(/^\s+enabledByDefault:\s*(.+)/);
        if (enabledMatch) currentProfile.enabledByDefault = enabledMatch[1].trim() === "true";
      }
    }

    if (currentProfile) {
      profiles.push(currentProfile);
    }

    return profiles;
  } catch {
    return [];
  }
}
