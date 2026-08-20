import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const AUTOMATION_DIR = path.join(REPO_ROOT, "automation");

export interface PowershellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function escapeArg(arg: string): string {
  return `'${arg.replace(/'/g, "''")}'`;
}

export async function findPowershell(): Promise<string> {
  const candidates = ["pwsh", "powershell"];
  for (const cmd of candidates) {
    try {
      await access(cmd);
      return cmd;
    } catch {
      continue;
    }
  }
  throw new Error(
    "PowerShell Core (pwsh) or Windows PowerShell is required. Install from https://github.com/PowerShell/PowerShell"
  );
}

export async function runScript(
  scriptName: string,
  args: string[] = [],
  options?: { dryRun?: boolean }
): Promise<PowershellResult> {
  const scriptPath = path.join(AUTOMATION_DIR, `${scriptName}.ps1`);

  try {
    await access(scriptPath);
  } catch {
    return {
      stdout: "",
      stderr: `Script not found: ${scriptPath}`,
      exitCode: 1,
    };
  }

  if (options?.dryRun) {
    const dryMsg = `[dry-run] Would invoke: pwsh -File ${scriptPath} ${args.join(" ")}`;
    console.log(dryMsg);
    return { stdout: dryMsg, stderr: "", exitCode: 0 };
  }

  return new Promise<PowershellResult>((resolve) => {
    const shell = process.platform === "win32" ? "powershell" : "pwsh";
    const child = execFile(
      shell,
      [
        "-NoProfile",
        "-File",
        scriptPath,
        ...args.map(escapeArg),
      ],
      {
        cwd: REPO_ROOT,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300_000,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: error ? ((error as NodeJS.ErrnoException).code === "ETIMEDOUT" ? 124 : (typeof error.code === "number" ? error.code : 1)) : 0,
        });
      }
    );
  });
}

export function getAutomationDir(): string {
  return AUTOMATION_DIR;
}

export function getRepoRoot(): string {
  return REPO_ROOT;
}
