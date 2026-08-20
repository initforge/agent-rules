import os from "node:os";

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
