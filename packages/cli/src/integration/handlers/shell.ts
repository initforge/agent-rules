import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface ShellInstallOptions {
  command: string;
  verifyCommand?: string;
  installUrl?: string;
}

export async function shellInstall(options: ShellInstallOptions): Promise<{ ok: boolean; message: string }> {
  const { command, installUrl } = options;

  // Check if already installed
  if (options.verifyCommand) {
    try {
      await execAsync(options.verifyCommand, { timeout: 10_000 });
      return { ok: true, message: "Already installed" };
    } catch {
      // Not installed, proceed
    }
  }

  try {
    if (installUrl) {
      // curl | sh pattern
      await execAsync(`curl -fsSL ${installUrl} | sh`, { timeout: 120_000 });
    } else {
      await execAsync(command, { timeout: 120_000 });
    }
    return { ok: true, message: `Installed via: ${command}` };
  } catch (error) {
    return { ok: false, message: `Install failed: ${(error as Error).message}` };
  }
}

export async function shellVerify(command: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { stdout } = await execAsync(command, { timeout: 10_000 });
    return { ok: true, message: `PASS: ${stdout.trim()}` };
  } catch (error) {
    return { ok: false, message: `Verify failed: ${(error as Error).message}` };
  }
}

export async function shellUninstall(_command: string): Promise<{ ok: true; message: string }> {
  return { ok: true, message: "Manual uninstall required" };
}
