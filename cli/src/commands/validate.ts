import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { runScript, getRepoRoot } from "../adapters/powershell.js";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Validate: runs 03-validate-context.ps1 plus schema tests.
 * Future: native validation will replace PowerShell backend.
 */
export async function validate(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const root = getRepoRoot();
  const automationDir = path.join(root, "automation");
  const errors: string[] = [];

  if (options.dryRun) {
    console.log("[dry-run] Would run context validation and schema tests");
    return {
      exitCode: ExitCode.Success,
      message: "Dry-run skipped validation",
    };
  }

  // 1. Run context validation
  const ctxResult = await runScript("03-validate-context");
  if (ctxResult.exitCode !== 0) {
    errors.push(`03-validate-context.ps1 failed (exit ${ctxResult.exitCode})`);
  }
  if (options.verbose) {
    console.log(ctxResult.stdout);
  }

  // 2. Run schema tests
  const pyPaths = ["python", "python3"];
  let pythonCmd = "python";
  for (const cmd of pyPaths) {
    try {
      await fs.access(cmd);
      pythonCmd = cmd;
      break;
    } catch {
      continue;
    }
  }

  const schemaTestPath = path.join(automationDir, "test-artifact-schemas.py");
  try {
    await fs.access(schemaTestPath);
  } catch {
    errors.push("test-artifact-schemas.py not found");
  }

  if (errors.length === 0) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = execFile(
          pythonCmd,
          [schemaTestPath],
          { cwd: root, timeout: 60_000 },
          (error, stdout, stderr) => {
            if (options.verbose) {
              console.log(stdout);
            }
            if (error) {
              errors.push(`Schema tests failed: ${stderr || error.message}`);
            } else if (stderr) {
              console.error(stderr);
            }
            resolve();
          }
        );
      });
    } catch (err) {
      errors.push(`Schema tests threw: ${err}`);
    }
  }

  const success = errors.length === 0;
  return {
    exitCode: success ? ExitCode.Success : ExitCode.ValidationFailed,
    message: success
      ? "All validations passed"
      : `Validation failed: ${errors.join("; ")}`,
    data: { errors, legacyScripts: ["03-validate-context.ps1", "test-artifact-schemas.py"] },
  };
}
