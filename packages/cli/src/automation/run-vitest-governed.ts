import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

interface RunVitestGovernedOptions {
  taskId: string;
  testFiles: string[];
  ownedPaths: string[];
  root: string;
  timeoutMs?: number;
}

interface VitestReceipt {
  taskId: string;
  filesChanged: string[];
  commandsRun: string[];
  exitCodes: number[];
  testsRun: string[];
  evidencePaths: string[];
  diffHashes: Record<string, string>;
  status: "PASS" | "FAIL";
  retries: number;
  assumptions: string[];
  unresolvedFindings: string[];
}

export async function runVitestGoverned(options: RunVitestGovernedOptions): Promise<{ ok: boolean; exitCode: number; message: string }> {
  const { taskId, testFiles, root, timeoutMs = 120_000 } = options;
  const startTime = Date.now();

  // Validate test files exist
  const missingFiles: string[] = [];
  for (const file of testFiles) {
    try {
      await fs.access(path.join(root, file));
    } catch {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    return {
      ok: false,
      exitCode: 1,
      message: `Missing test files: ${missingFiles.join(", ")}`,
    };
  }

  // Build vitest args
  const vitestArgs = [
    "run",
    "--config",
    path.join(root, "vitest.verify.config.ts"),
    ...testFiles,
  ];

  // Run via governed launcher
  const launcher = path.join(root, "automation/run-governed-vitest.mjs");
  const launcherArgs = [
    launcher,
    "--project-root", root,
    "--cwd", root,
    "--mode", "focused",
    "--timeout-ms", String(timeoutMs),
    "--",
    ...vitestArgs,
  ];

  return new Promise((resolve) => {
    const child = spawn("node", launcherArgs, {
      cwd: root,
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", async (exitCode) => {
      const durationMs = Date.now() - startTime;

      const receipt: VitestReceipt = {
        taskId,
        filesChanged: testFiles,
        commandsRun: [`governed-vitest run --config vitest.verify.config.ts ${testFiles.length} files`],
        exitCodes: [exitCode ?? 1],
        testsRun: [],
        evidencePaths: [],
        diffHashes: {},
        status: (exitCode ?? 1) === 0 ? "PASS" : "FAIL",
        retries: 0,
        assumptions: [],
        unresolvedFindings: stderr ? [stderr] : [],
      };

      // Write receipt
      const receiptDir = path.join(root, ".agent", "runs");
      await fs.mkdir(receiptDir, { recursive: true });
      await fs.writeFile(
        path.join(receiptDir, `${taskId}-receipt.json`),
        JSON.stringify(receipt),
        "utf8"
      );

      if ((exitCode ?? 1) === 0) {
        console.log(`PASS: Governed vitest completed successfully`);
        console.log(`  Duration: ${durationMs}ms`);
        console.log(`  Tests: ${testFiles.length} file(s)`);
        resolve({ ok: true, exitCode: 0, message: "Governed vitest completed" });
      } else {
        console.log(`FAIL: Vitest exited with code ${exitCode}`);
        console.log(`  Duration: ${durationMs}ms`);
        if (stderr) console.log(`  Stderr: ${stderr}`);
        resolve({ ok: false, exitCode: exitCode ?? 1, message: `Vitest failed with code ${exitCode}` });
      }
    });

    child.on("error", (error) => {
      resolve({ ok: false, exitCode: 1, message: `Failed to spawn vitest: ${error.message}` });
    });
  });
}
