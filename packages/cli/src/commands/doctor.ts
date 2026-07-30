import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/powershell.js";
import { execFile } from "node:child_process";
import * as crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

interface DoctorCheck {
  platform: string;
  check: string;
  status: string;
  detail: string;
}

async function sha256(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").toLowerCase();
}

async function checkFile(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

interface PlatformHomeMap {
  codex: string;
  grok: string;
  antigravity: string;
  cursor: string;
  [key: string]: string;
}

function getPlatformHomes(root: string): PlatformHomeMap {
  const userHome = process.env.USERPROFILE || process.env.HOME || "";
  return {
    codex: process.env.CODEX_HOME || path.join(userHome, ".codex"),
    grok: process.env.GROK_HOME || path.join(userHome, ".grok"),
    antigravity: path.join(userHome, ".gemini", "config"),
    cursor: path.join(userHome, ".cursor"),
    opencode: path.join(userHome, ".config", "opencode"),
  };
}

async function runPython(scriptPath: string, args: string[], root: string): Promise<{ ok: boolean; output: string }> {
  const candidates = ["python", "python3"];
  let python = "python";
  for (const c of candidates) {
    try { await fs.access(c); python = c; break; } catch { /* try next */ }
  }
  return new Promise((resolve) => {
    const child = execFile(
      python, [scriptPath, ...args],
      { cwd: root, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ ok: !err, output: stdout + (stderr ? `\n${stderr}` : "") });
      }
    );
  });
}

export async function doctor(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const root = getRepoRoot();
  const platformArg = args[0] || "all";
  const skipIntegrationVerify = args.includes("--skip-integration-verify");
  const valid = ["codex", "grok", "antigravity", "cursor", "all"];
  if (!valid.includes(platformArg)) {
    return { exitCode: ExitCode.InvalidArgument, message: `Invalid platform: ${platformArg}` };
  }

  if (options.dryRun) {
    console.log(`[dry-run] Would run doctor for ${platformArg}`);
    return { exitCode: ExitCode.Success, message: "Dry-run: doctor skipped" };
  }

  const allPlatforms = ["codex", "grok", "antigravity", "cursor", "opencode"] as const;
  type PlatformName = typeof allPlatforms[number];
  const platforms: PlatformName[] = platformArg === "all" ? [...allPlatforms] : [platformArg as PlatformName];
  const homes = getPlatformHomes(root);
  const report: DoctorCheck[] = [];

  // Run native contract test
  const nativeTest = path.join(root, "automation", "test-native-agent-policy.py");
  let nativeContractOk = false;
  if (await checkFile(nativeTest)) {
    const r = await runPython(nativeTest, ["--build"], root);
    nativeContractOk = r.ok;
  }

  const mcpConfigMap: { [key in PlatformName]: string } = {
    codex: "config.toml",
    grok: "mcp.json",
    antigravity: "mcp_config.json",
    cursor: "mcp.json",
    opencode: "opencode.json",
  };
  const mcpConfigPaths: { [key in PlatformName]?: string } = {};
  for (const p of platforms) {
    mcpConfigPaths[p] = path.join(homes[p], mcpConfigMap[p] || "mcp.json");
  }

  for (const name of platforms) {
    const runtimeHome = homes[name];
    const manifestPath = path.join(runtimeHome, "agent-rules-manifest.json");

    if (!(await checkFile(manifestPath))) {
      report.push({ platform: name, check: "runtime-manifest", status: "MISSING", detail: manifestPath });
      continue;
    }

    report.push({ platform: name, check: "install", status: "INSTALL_PASS", detail: "runtime manifest is present" });

    // Check native structure
    const buildDir = path.join(root, "generated", "runtime-build", name);
    const nativeDir = path.join(buildDir, "native");

    const groups = name === "grok"
      ? [{ build: "native/agents", dest: "agents", manifest: "agent-rules-native-agents.json" },
         { build: "native/personas", dest: "personas", manifest: "agent-rules-native-personas.json" }]
      : [{ build: "native/agents", dest: "agents", manifest: "agent-rules-native-agents.json" }];

    let nativeProblems: string[] = [];
    if (!nativeContractOk) nativeProblems.push("source/build native schema contract failed");

    for (const g of groups) {
      const bd = path.join(buildDir, g.build);
      if (!(await checkFile(bd))) { nativeProblems.push(`missing build ${g.build}`); continue; }

      const dest = path.join(runtimeHome, g.dest);
      const ownership = path.join(runtimeHome, g.manifest);

      const buildFiles = await walkDir(bd);
      const buildRel = buildFiles.map((f) => path.relative(bd, f).replace(/\\/g, "/")).sort();

      if (!(await checkFile(ownership))) { nativeProblems.push(`missing ownership ${g.manifest}`); continue; }
      let owned: string[];
      try {
        owned = JSON.parse(await fs.readFile(ownership, "utf-8"));
        if (!Array.isArray(owned)) owned = [String(owned)];
        owned = owned.sort();
      } catch { nativeProblems.push(`invalid ownership ${g.manifest}`); continue; }

      // Compare
      if (JSON.stringify(buildRel) !== JSON.stringify(owned)) {
        nativeProblems.push(`ownership mapping drift ${g.manifest}`);
        continue;
      }

      for (const rel of buildRel) {
        const installedPath = path.join(dest, rel);
        const buildPath = path.join(bd, rel);
        if (!(await checkFile(installedPath))) {
          nativeProblems.push(`missing ${g.dest}/${rel}`);
          continue;
        }
        try {
          const ih = await sha256(installedPath);
          const bh = await sha256(buildPath);
          if (ih !== bh) nativeProblems.push(`hash drift ${g.dest}/${rel}`);
        } catch { nativeProblems.push(`cannot hash ${g.dest}/${rel}`); }
      }
    }

    if (nativeProblems.length === 0) {
      report.push({ platform: name, check: "native-structure", status: "NATIVE_CAPABLE", detail: "required native files, ownership mapping, and build hashes match" });
    } else {
      report.push({ platform: name, check: "native-structure", status: "NATIVE_PARTIAL", detail: nativeProblems.join("; ") });
    }

    // Native activation
    const nativeCliMap: { [key in PlatformName]: string } = { codex: "codex", cursor: "cursor", grok: "grok", antigravity: "gemini", opencode: "opencode" };
    report.push({
      platform: name, check: "native-activation", status: "NATIVE_UNVERIFIED",
      detail: `${nativeCliMap[name]} CLI availability check; no trusted host-activation receipt exists`,
    });

    // Tools
    const toolsPath = path.join(runtimeHome, "agent-rules-tools");
    const toolFiles = ["workctl.py", "workctl.ps1", "workctl.sh", "work-ledger.schema.json"];
    const toolsOk = (await Promise.all(toolFiles.map((t) => checkFile(path.join(toolsPath, t))))).every(Boolean);
    report.push({
      platform: name, check: "orchestration", status: toolsOk ? "ORCHESTRATION_CAPABLE" : "ORCHESTRATION_PARTIAL",
      detail: toolsOk ? "portable workctl bundle available; no trusted native subagent receipt" : "portable workctl bundle incomplete",
    });

    // Model policy check
    const sourcePolicy = path.join(root, "automation", "model-policy.json");
    const installedPolicy = path.join(runtimeHome, "model-policy.json");
    let policyStatus: string;
    if ((await checkFile(sourcePolicy)) && (await checkFile(installedPolicy))) {
      const sh = await sha256(sourcePolicy);
      const ih = await sha256(installedPolicy);
      policyStatus = sh === ih ? "MODEL_POLICY_MATCH" : "MODEL_POLICY_DRIFT";
    } else if (await checkFile(installedPolicy)) {
      policyStatus = "MODEL_POLICY_DRIFT";
    } else {
      policyStatus = "MODEL_POLICY_MISSING";
    }
    report.push({ platform: name, check: "model-policy-install", status: policyStatus, detail: "source-to-runtime policy hash only" });

    // Build manifest comparison
    const buildManifest = path.join(buildDir, "manifest.json");
    if (await checkFile(buildManifest)) {
      try {
        const installed = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
        const expected = JSON.parse(await fs.readFile(buildManifest, "utf-8"));
        const instPaths = installed.files.map((f: any) => f.path).sort();
        const expPaths = expected.files.map((f: any) => f.path).sort();
        const extra = expPaths.filter((p: string) => !instPaths.includes(p));
        const missing = instPaths.filter((p: string) => !expPaths.includes(p));

        if (extra.length > 0) report.push({ platform: name, check: "stale-files", status: "WARN", detail: extra.join(", ") });
        if (missing.length > 0) report.push({ platform: name, check: "missing-files", status: "MISSING", detail: missing.join(", ") });

        // Check hashes for non-native files
        const hashMismatch: string[] = [];
        for (const exp of expected.files.filter((f: any) => !f.path.startsWith("native/"))) {
          const ins = installed.files.find((f: any) => f.path === exp.path);
          if (ins && ins.sha256 !== exp.sha256) hashMismatch.push(exp.path);
        }
        if (hashMismatch.length > 0) {
          report.push({ platform: name, check: "sha256-drift", status: "NOT_LIVE", detail: hashMismatch.join(", ") });
        }

        if (extra.length === 0 && missing.length === 0 && hashMismatch.length === 0) {
          report.push({ platform: name, check: "manifest-parity", status: "OK", detail: "paths and hashes match build" });
        }
      } catch { /* skip manifest comparison on error */ }
    }

    // Hook config check
    const hookConfigPath = path.join(runtimeHome, {
      codex: "hooks.json", grok: "hooks/skill-orchestrator.json",
      antigravity: "hooks.json", cursor: "hooks.json", opencode: "",
    }[name] || "hooks.json");

    const hookNeedle = {
      codex: "shell_command|apply_patch",
      grok: "grok-skill-gate",
      antigravity: "antigravity-skill-gate",
      cursor: "cursor-hook.py",
      opencode: "",
    }[name] || "";

    const hookScript = path.join(runtimeHome, {
      codex: "scripts/skill-gate.py",
      grok: "hooks/bin/grok-skill-gate.py",
      antigravity: "scripts/antigravity-skill-gate.py",
      cursor: "scripts/cursor-hook.py",
      opencode: "",
    }[name] || "");

    if (hookNeedle) {
      const configExists = await checkFile(hookConfigPath);
      const scriptExists = await checkFile(hookScript);
      let configBody = "";
      if (configExists) configBody = await fs.readFile(hookConfigPath, "utf-8");
      const noPlaceholders = !configBody.includes("__CODEX_HOME__") && !configBody.includes("__ANTIGRAVITY_HOME__");
      const hasNeedle = configBody.includes(hookNeedle);

      if (configExists && scriptExists && noPlaceholders && hasNeedle) {
        report.push({ platform: name, check: "hook-config", status: "OK", detail: "hook config and gate script present" });
      } else {
        report.push({ platform: name, check: "hook-config", status: "NOT_LIVE", detail: "hook config/script missing, placeholder, or stale matcher" });
      }
    }

    // MCP config check
    const mcpPath = mcpConfigPaths[name as PlatformName] || "";
    if (await checkFile(mcpPath)) {
      const mcpContent = await fs.readFile(mcpPath, "utf-8");
      const checks: Record<string, string> = {
        "mcp-config-codebase-memory": "codebase-memory",
        "mcp-config-context7": "context7",
        "mcp-config-playwright": "playwright",
        "mcp-config-chrome-devtools": "chrome-devtools",
      };
      for (const [check, needle] of Object.entries(checks)) {
        report.push({
          platform: name, check, status: mcpContent.includes(needle) ? "OK" : "WARN",
          detail: mcpContent.includes(needle) ? `present in config` : `missing ${needle}`,
        });
      }
    } else {
      report.push({ platform: name, check: "mcp-config", status: "WARN", detail: `no mcp config at ${mcpPath}` });
    }
  }

  // Grok inject path check
  const grokHome = homes["grok"];
  const grokInject = path.join(grokHome, ".grok", "rules");
  const grokManifestRules = path.join(grokHome, "rules");
  const legacyNames = ["00-index.md", "01-agent-workflow-sop.md", "00-universal-frontier-contract.md", "07-finish-to-completion.md", "antigravity-overlay.md", "platform-boundary.md", "08-ui-consistency-gate.md"];

  if (platformArg === "all" || platformArg === "grok") {
    if (await checkFile(grokInject)) {
      const hits = (await Promise.all(legacyNames.map((n) => checkFile(path.join(grokInject, n))))).filter(Boolean);
      if (hits.length > 0) {
        // Reconstruct names from hits
        const found: string[] = [];
        for (let i = 0; i < legacyNames.length; i++) {
          if (await checkFile(path.join(grokInject, legacyNames[i]))) found.push(legacyNames[i]);
        }
        report.push({ platform: "grok", check: "legacy-inject-rules", status: "NOT_LIVE", detail: `Legacy dual-tree still at ${grokInject}: ${found.join(", ")}` });
      } else {
        const hasBootstrap = await checkFile(path.join(grokInject, "00-bootstrap.md"));
        const hasExecution = await checkFile(path.join(grokInject, "10-execution.md"));
        if (!hasBootstrap || !hasExecution) {
          report.push({ platform: "grok", check: "inject-rules-lean", status: "MISSING", detail: `Inject path missing lean core: ${grokInject}` });
        } else {
          // Hash sample
          const injectHash = await sha256(path.join(grokInject, "00-bootstrap.md")).catch(() => "");
          const rulesHash = await sha256(path.join(grokManifestRules, "00-bootstrap.md")).catch(() => "");
          if (injectHash && rulesHash && injectHash !== rulesHash) {
            report.push({ platform: "grok", check: "inject-vs-rules-drift", status: "NOT_LIVE", detail: "Inject path drift vs installed rules" });
          } else {
            report.push({ platform: "grok", check: "inject-rules-lean", status: "OK", detail: "Lean inject path present" });
          }
        }
      }
    }
  }

  // Output
  const table = report
    .map((r) => `${r.platform}\t${r.check}\t${r.status}\t${r.detail}`)
    .join("\n");

  if (options.json) {
    // Will be handled by formatOutput
  } else {
    console.log(table);
  }

  const bad = report.filter((r) =>
    ["MISSING", "NOT_LIVE", "MODEL_POLICY_DRIFT", "MODEL_POLICY_MISSING", "NATIVE_PARTIAL"].includes(r.status)
  );
  const nativeObserved = report.filter((r) => r.status === "NATIVE_OBSERVED").length;
  const nativeUnverified = report.filter((r) => r.status === "NATIVE_UNVERIFIED").length;

  if (bad.length > 0) {
    console.error(`Doctor PARTIAL: ${bad.length} install/runtime failure(s)`);
    return {
      exitCode: ExitCode.LegacyFailed,
      message: `Doctor found ${bad.length} issue(s)`,
      data: { report, badCount: bad.length, nativeObserved, nativeUnverified },
    };
  }

  console.log(`Doctor layered summary: no blocking failures; native observed=${nativeObserved}, native unverified=${nativeUnverified}`);
  return {
    exitCode: ExitCode.Success,
    message: "Doctor health check passed",
    data: { report, nativeObserved, nativeUnverified },
  };
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkDir(fullPath)));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}
