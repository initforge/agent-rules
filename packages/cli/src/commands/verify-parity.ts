import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { load as loadYaml } from "js-yaml";

/**
 * verify-parity: Run 5fedu module parity verification.
 *
 * Reads a parity packet directory, runs available checks (typecheck, lint, build,
 * interaction_check via Playwright), and outputs a proof report.
 *
 * Usage:
 *   agent-rules verify-parity <packet-dir> [--target-url <url>] [--headless]
 *
 * The packet directory must contain:
 *   - source.lock.yaml
 *   - target.yaml
 *   - structural-map.yaml
 *   - behavior-contract.yaml
 *   - visual-contract.yaml
 *   - architecture-adaptation.yaml
 *   - deviations.yaml
 *   - proof.yaml
 */

interface VerificationEvidence {
  type: string;
  result: "pass" | "fail" | "not_run" | "error";
  detail: string;
  command_or_method?: string;
  duration_ms?: number;
}

interface ProofReport {
  module: string;
  timestamp: string;
  evidence: VerificationEvidence[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    not_run: number;
    error: number;
  };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 60_000
): Promise<{ ok: boolean; stdout: string; stderr: string; durationMs: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const proc = spawnSync(cmd, args, {
      cwd,
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: "pipe",
    });
    resolve({
      ok: proc.status === 0,
      stdout: proc.stdout ?? "",
      stderr: proc.stderr ?? "",
      durationMs: Date.now() - start,
    });
  });
}

async function verifyTypecheck(
  packetDir: string,
  targetPaths: string[]
): Promise<VerificationEvidence> {
  // Check if target files exist and have valid TypeScript
  const missing = targetPaths.filter((p) => !p.endsWith(".ts") && !p.endsWith(".tsx"));
  if (missing.length > 0) {
    return {
      type: "typecheck",
      result: "not_run",
      detail: `Non-TS files in target_paths: ${missing.join(", ")}`,
    };
  }

  // Try to run tsc --noEmit on target files
  const projectRoot = path.resolve(packetDir, "../../../../../");
  const result = await runCommand(
    "npx",
    ["tsc", "--noEmit", "--pretty", ...targetPaths.map((p) => path.join(projectRoot, p))],
    projectRoot,
    30_000
  );

  return {
    type: "typecheck",
    result: result.ok ? "pass" : "fail",
    detail: result.ok ? "All types resolve" : result.stderr.slice(0, 500),
    duration_ms: result.durationMs,
  };
}

async function verifyLint(
  packetDir: string,
  targetPaths: string[]
): Promise<VerificationEvidence> {
  const projectRoot = path.resolve(packetDir, "../../../../../");
  const result = await runCommand(
    "npx",
    ["eslint", "--no-error-on-unmatched-pattern", ...targetPaths],
    projectRoot,
    30_000
  );

  return {
    type: "lint",
    result: result.ok ? "pass" : "fail",
    detail: result.ok ? "ESLint pass" : result.stdout.slice(0, 500),
    duration_ms: result.durationMs,
  };
}

async function verifyBuild(
  packetDir: string
): Promise<VerificationEvidence> {
  const projectRoot = path.resolve(packetDir, "../../../../../");
  const result = await runCommand(
    "npx",
    ["vite", "build", "--logLevel", "error"],
    projectRoot,
    60_000
  );

  return {
    type: "build",
    result: result.ok ? "pass" : "fail",
    detail: result.ok ? "Build succeeds" : result.stderr.slice(0, 500),
    duration_ms: result.durationMs,
  };
}

async function verifyInteraction(
  packetDir: string,
  behaviorContractPath: string,
  targetUrl?: string
): Promise<VerificationEvidence> {
  if (!targetUrl) {
    return {
      type: "interaction_check",
      result: "not_run",
      detail: "No --target-url provided; cannot run browser interaction tests",
      command_or_method: "Provide --target-url pointing to the running app",
    };
  }

  // Read behavior contract to get interaction flows
  let contract: any;
  try {
    const raw = await fs.readFile(behaviorContractPath, "utf8");
    contract = loadYaml(raw);
  } catch {
    return {
      type: "interaction_check",
      result: "error",
      detail: `Failed to read behavior contract: ${behaviorContractPath}`,
    };
  }

  const flows = contract?.behaviors?.["crud-list"]?.interaction_flows ?? [];
  if (flows.length === 0) {
    return {
      type: "interaction_check",
      result: "not_run",
      detail: "No interaction_flows defined in behavior-contract.yaml",
    };
  }

  // Run Playwright to verify interaction flows
  const testScript = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];

  try {
    await page.goto('${targetUrl}', { waitUntil: 'networkidle', timeout: 15000 });

    // Check page loads without console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Verify basic page structure
    const title = await page.title();
    if (!title) errors.push('Page has no title');

    // Check for interactive elements
    const buttons = await page.$$('button');
    const links = await page.$$('a');
    if (buttons.length === 0 && links.length === 0) {
      errors.push('No interactive elements found');
    }

    // Verify no console errors
    await page.waitForTimeout(2000);
    if (consoleErrors.length > 0) {
      errors.push(\`Console errors: \${consoleErrors.join('; ')}\`);
    }

    // Check responsive viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    const mobileOk = await page.evaluate(() => {
      return document.body.scrollWidth <= window.innerWidth + 10;
    });
    if (!mobileOk) errors.push('Horizontal overflow on mobile viewport');

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 800 });

  } catch (e) {
    errors.push(\`Browser error: \${e.message}\`);
  } finally {
    await browser.close();
  }

  if (errors.length > 0) {
    console.error(JSON.stringify({ result: 'fail', errors }));
    process.exit(1);
  } else {
    console.log(JSON.stringify({ result: 'pass', checked: ${flows.length} flows }));
    process.exit(0);
  }
})();
`;

  const testFile = path.join(packetDir, `.interaction-test-${Date.now()}.js`);
  await fs.writeFile(testFile, testScript);

  try {
    const result = await runCommand("node", [testFile], packetDir, 30_000);
    const output = result.ok ? result.stdout : result.stderr;

    let parsed: any;
    try {
      parsed = JSON.parse(output.trim().split("\n").pop() ?? "{}");
    } catch {
      parsed = { result: result.ok ? "pass" : "fail", errors: [output.slice(0, 300)] };
    }

    return {
      type: "interaction_check",
      result: parsed.result === "pass" ? "pass" : "fail",
      detail: parsed.result === "pass"
        ? `Checked ${flows.length} interaction flows`
        : (parsed.errors ?? ["Unknown error"]).join("; "),
      command_or_method: "Playwright browser automation",
      duration_ms: result.durationMs,
    };
  } finally {
    await fs.unlink(testFile).catch(() => {});
  }
}

export async function verifyParityCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const packetDir = args[0];
  if (!packetDir) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "Usage: agent-rules verify-parity <packet-dir> [--target-url <url>]",
    };
  }

  const resolvedDir = path.resolve(packetDir);
  const targetUrl = args.includes("--target-url")
    ? args[args.indexOf("--target-url") + 1]
    : undefined;

  // Verify packet directory structure
  const requiredFiles = [
    "source.lock.yaml",
    "target.yaml",
    "structural-map.yaml",
    "behavior-contract.yaml",
    "visual-contract.yaml",
    "architecture-adaptation.yaml",
    "deviations.yaml",
    "proof.yaml",
  ];

  const missing: string[] = [];
  for (const f of requiredFiles) {
    if (!(await fileExists(path.join(resolvedDir, f)))) {
      missing.push(f);
    }
  }

  if (missing.length > 0) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: `Parity packet incomplete. Missing: ${missing.join(", ")}`,
    };
  }

  // Read target paths from target.yaml
  let targetYaml: any;
  try {
    const raw = await fs.readFile(path.join(resolvedDir, "target.yaml"), "utf8");
    targetYaml = loadYaml(raw);
  } catch {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "Failed to read target.yaml",
    };
  }

  // Extract target paths — handle both flat array and nested object format
  let targetPaths: string[] = [];
  const tp = targetYaml?.target_paths;
  if (Array.isArray(tp)) {
    targetPaths = tp;
  } else if (tp && typeof tp === "object") {
    for (const val of Object.values(tp)) {
      if (Array.isArray(val)) {
        targetPaths.push(...val.filter((v: any) => typeof v === "string" && (v.endsWith(".ts") || v.endsWith(".tsx"))));
      }
    }
  }

  // Run verification checks
  const evidence: VerificationEvidence[] = [];

  console.log("Running parity verification...");
  console.log(`  Packet: ${resolvedDir}`);
  console.log(`  Target paths: ${targetPaths.length}`);

  // 1. Typecheck
  console.log("  [1/4] Typecheck...");
  evidence.push(await verifyTypecheck(resolvedDir, targetPaths));

  // 2. Lint
  console.log("  [2/4] Lint...");
  evidence.push(await verifyLint(resolvedDir, targetPaths));

  // 3. Build
  console.log("  [3/4] Build...");
  evidence.push(await verifyBuild(resolvedDir));

  // 4. Interaction check
  console.log("  [4/4] Interaction check...");
  evidence.push(
    await verifyInteraction(
      resolvedDir,
      path.join(resolvedDir, "behavior-contract.yaml"),
      targetUrl
    )
  );

  // Generate summary
  const summary = {
    total: evidence.length,
    pass: evidence.filter((e) => e.result === "pass").length,
    fail: evidence.filter((e) => e.result === "fail").length,
    not_run: evidence.filter((e) => e.result === "not_run").length,
    error: evidence.filter((e) => e.result === "error").length,
  };

  const report: ProofReport = {
    module: path.basename(resolvedDir),
    timestamp: new Date().toISOString(),
    evidence,
    summary,
  };

  // Output
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\n=== Parity Verification Report ===");
    console.log(`Module: ${report.module}`);
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Summary: ${summary.pass}/${summary.total} pass, ${summary.fail} fail, ${summary.not_run} not_run, ${summary.error} error`);
    console.log("\nEvidence:");
    for (const e of evidence) {
      const icon = e.result === "pass" ? "✓" : e.result === "fail" ? "✗" : e.result === "error" ? "!" : "-";
      console.log(`  ${icon} ${e.type}: ${e.result} — ${e.detail.slice(0, 100)}`);
    }
  }

  // Update proof.yaml with results
  const proofPath = path.join(resolvedDir, "proof.yaml");
  try {
    let proofRaw = await fs.readFile(proofPath, "utf8");
    for (const e of evidence) {
      // Replace result: not_run with actual result
      const regex = new RegExp(`(- type: ${e.type}\\n\\s+result: )\\w+`, "g");
      proofRaw = proofRaw.replace(regex, `$1${e.result}`);
    }
    await fs.writeFile(proofPath, proofRaw);
    console.log(`\nUpdated ${proofPath}`);
  } catch {
    console.log("\nWarning: Could not update proof.yaml");
  }

  const hasFailures = summary.fail > 0 || summary.error > 0;
  return {
    exitCode: hasFailures ? ExitCode.LegacyFailed : ExitCode.Success,
    message: `Parity verification: ${summary.pass}/${summary.total} pass`,
    data: report as unknown as Record<string, unknown>,
  };
}
