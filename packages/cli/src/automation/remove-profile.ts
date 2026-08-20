import { disableProfile, testProfileEnabled } from "./profile-helper.js";

interface RemoveProfileOptions {
  name: string;
  repoRoot: string;
  force?: boolean;
}

export async function removeProfile(options: RemoveProfileOptions): Promise<{ ok: boolean; message: string }> {
  const { name, repoRoot, force = false } = options;

  const enabled = await testProfileEnabled(repoRoot, name);
  if (!enabled) {
    if (!force) {
      return { ok: true, message: `Profile '${name}' is not enabled.` };
    }
  }

  if (!force) {
    // In a real CLI, we would prompt for confirmation
    // For now, we require --force to remove
    return { ok: false, message: `Use force to remove profile '${name}'.` };
  }

  await disableProfile(repoRoot, name);
  return { ok: true, message: `Profile '${name}' removed (files preserved at profiles/${name}/).` };
}
