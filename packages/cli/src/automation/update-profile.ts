import { getProfileDir, getProfileConfig, testProfileEnabled, enableProfile } from "./profile-helper.js";

interface UpdateProfileOptions {
  name: string;
  repoRoot: string;
  force?: boolean;
}

export async function updateProfile(options: UpdateProfileOptions): Promise<{ ok: boolean; message: string }> {
  const { name, repoRoot, force = false } = options;

  const profileDir = getProfileDir(repoRoot, name);
  try {
    await import("node:fs/promises").then((fs) => fs.access(profileDir));
  } catch {
    return { ok: false, message: `Profile '${name}' not found at ${profileDir}` };
  }

  const config = await getProfileConfig(repoRoot, name);
  if (!config) {
    return { ok: false, message: `Missing profile.yaml for '${name}'` };
  }

  const enabled = await testProfileEnabled(repoRoot, name);
  const status = enabled ? "enabled" : "disabled";
  console.log(`Profile '${name}' (${config.displayName ?? name}) is ${status}.`);

  if (enabled && force) {
    await enableProfile(repoRoot, name);
    console.log(`Profile '${name}' updated.`);
  } else if (!enabled) {
    console.log("Profile is disabled. Run 'install-profile' to enable.");
  }

  if (config.version) {
    console.log(`Profile version: ${config.version}`);
  }

  return { ok: true, message: `Profile '${name}' status: ${status}` };
}
