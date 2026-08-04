import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGED_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const TEST_REPOSITORY_ROOT = process.env.AGENT_RULES_REPOSITORY_ROOT;
if (TEST_REPOSITORY_ROOT && process.env.NODE_ENV !== "test") {
  throw new Error("AGENT_RULES_REPOSITORY_ROOT is test-only and unavailable in production");
}
// ponytail: repository injection is limited to subprocess package tests; production roots require a signed installer contract.
const REPO_ROOT = TEST_REPOSITORY_ROOT ? path.resolve(TEST_REPOSITORY_ROOT) : PACKAGED_ROOT;
const AUTOMATION_DIR = path.join(REPO_ROOT, "automation");

export interface PowershellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function findPowershell(): Promise<string> {
  // Probe by execution, not by `access()`: `access("pwsh")` resolves relative to
  // cwd and therefore never finds a binary on PATH.
  // pwsh (PowerShell 7+) is cross-platform and preferred; `powershell` (5.1) is a
  // Windows-only fallback and must never be attempted on Linux/macOS.
  const candidates = process.platform === "win32" ? ["pwsh", "powershell"] : ["pwsh"];
  for (const cmd of candidates) {
    const found = await new Promise<boolean>((resolve) => {
      execFile(cmd, ["-NoProfile", "-Command", "exit 0"], { timeout: 15_000 }, (error) => {
        resolve(!error);
      });
    });
    if (found) return cmd;
  }
  throw new Error(
    "PowerShell Core (pwsh) is required. Install from https://github.com/PowerShell/PowerShell#get-powershell"
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

  let shell: string;
  try {
    shell = await findPowershell();
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 127,
    };
  }

  return new Promise<PowershellResult>((resolve) => {
    const child = execFile(
      shell,
      [
        "-NoProfile",
        "-File",
        scriptPath,
        ...args,
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
