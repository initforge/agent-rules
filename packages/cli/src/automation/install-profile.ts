import fs from "node:fs/promises";
import path from "node:path";
import { getProfileDir, getProfileConfig, getProfileOwnedFiles, enableProfile, testProfileEnabled } from "./profile-helper.js";

interface InstallProfileOptions {
  name: string;
  repoRoot: string;
  force?: boolean;
}

export async function installProfile(options: InstallProfileOptions): Promise<{ ok: boolean; message: string }> {
  const { name, repoRoot, force = false } = options;

  const profileDir = getProfileDir(repoRoot, name);
  try {
    await fs.access(profileDir);
  } catch {
    return { ok: false, message: `Profile '${name}' not found at ${profileDir}` };
  }

  const config = await getProfileConfig(repoRoot, name);
  if (!config) {
    return { ok: false, message: `Missing profile.yaml for '${name}'` };
  }

  const enabled = await testProfileEnabled(repoRoot, name);
  if (enabled && !force) {
    return { ok: true, message: `Profile '${name}' is already enabled. Use force to re-enable.` };
  }

  // Validate harness compatibility
  const manifestPath = path.join(repoRoot, "rules/manifest.yaml");
  try {
    const manifest = await fs.readFile(manifestPath, "utf8");
    const versionMatch = manifest.match(/version:\s*(\S+)/);
    if (versionMatch) {
      const manifestVersion = versionMatch[1];
      const minVersion = config.minHarnessVersion ?? "0.0.0";
      console.log(`Harness version: ${manifestVersion}, profile requires: ${minVersion}`);
    }
  } catch {
    // No manifest
  }

  await enableProfile(repoRoot, name);

  console.log(`Profile '${name}' (${config.displayName ?? name}) installed and enabled.`);

  const owned = await getProfileOwnedFiles(repoRoot, name);
  if (owned.length > 0) {
    console.log("\nProfile-owned files are now available:");
    for (const file of owned) {
      const fullPath = path.join(repoRoot, file);
      try {
        await fs.access(fullPath);
        console.log(`  ✓ ${file}`);
      } catch {
        console.log(`  ? ${file} (not found)`);
      }
    }
  }

  return { ok: true, message: `Profile '${name}' installed and enabled` };
}
