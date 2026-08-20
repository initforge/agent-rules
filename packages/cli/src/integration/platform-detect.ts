import os from "node:os";
import path from "node:path";

export type Platform = "windows" | "linux" | "darwin";
export type Arch = "amd64" | "arm64";

export interface PlatformInfo {
  platform: Platform;
  arch: Arch;
  key: `${Platform}-${Arch}`;
  home: string;
}

export function detectPlatform(): PlatformInfo {
  const platform: Platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "darwin"
        : "linux";

  const arch: Arch =
    process.arch === "arm64" ? "arm64" : "amd64";

  const home = os.homedir();

  return { platform, arch, key: `${platform}-${arch}`, home };
}

export function expandInstallDir(template: string, home: string): string {
  return template
    .replace(/\$HOME/g, home)
    .replace(/%LOCALAPPDATA%/g, process.env.LOCALAPPDATA ?? home)
    .replace(/%APPDATA%/g, process.env.APPDATA ?? home);
}

/** Resolve the durable managed installation surface for a manifest's installDirs. */
export function resolveInstallDir(installDirs: Record<string, string> | undefined, info: PlatformInfo): string | undefined {
  const template = installDirs?.[info.platform] ?? installDirs?.linux;
  if (!template) return undefined;
  return expandInstallDir(template, info.home);
}

/** Canonical default managed surface for npm installs whose manifest does not
 *  declare installDirs. User-level and outside the repository (rule 42). */
export function defaultNpmInstallDir(id: string, info: PlatformInfo): string {
  const base = info.platform === "windows"
    ? process.env.LOCALAPPDATA ?? info.home
    : path.join(info.home, ".local", "share");
  return path.join(base, "agent-rules", "integrations", id);
}
