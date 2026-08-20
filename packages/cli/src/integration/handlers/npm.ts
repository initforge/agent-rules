import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface NpmInstallOptions {
  packageName: string;
  version?: string;
  extraArgs?: string[];
}

export async function npmInstall(options: NpmInstallOptions): Promise<{ ok: boolean; message: string }> {
  const { packageName, version, extraArgs = [] } = options;
  const spec = version ? `${packageName}@${version}` : `${packageName}@latest`;

  try {
    await execFileAsync("npx", ["-y", spec, ...extraArgs, "--help"], {
      timeout: 120_000,
    });
    return { ok: true, message: `Installed ${spec} via npx` };
  } catch (error) {
    return { ok: false, message: `npx install failed for ${spec}: ${(error as Error).message}` };
  }
}

export async function npmVerify(packageName: string, version?: string): Promise<{ ok: boolean; message: string }> {
  const spec = version ? `${packageName}@${version}` : `${packageName}@latest`;
  try {
    await execFileAsync("npx", ["-y", spec, "--help"], {
      timeout: 30_000,
    });
    return { ok: true, message: `${spec} PASS` };
  } catch (error) {
    return { ok: false, message: `${spec} verify failed: ${(error as Error).message}` };
  }
}

export async function npmUninstall(_packageName: string): Promise<{ ok: true; message: string }> {
  // npx-based packages don't need explicit uninstall
  return { ok: true, message: "npx-based package; no uninstall needed" };
}
