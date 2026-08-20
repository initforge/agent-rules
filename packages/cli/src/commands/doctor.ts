import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/repo.js";
import { execFile } from "node:child_process";
import * as crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyRuntimeReceipt, type RuntimePlatform } from "../runtime/installer.js";
import { resolveOpenCodeModel } from "../runtime/opencode.js";
import { collectHostKitDoctorReport, type HostKitDoctorReport } from "../host-kit/doctor.js";
import { loadIntegrationInventory } from "../integration/inventory.js";
import { verifyMcps } from "../integration/provisioning.js";

interface DoctorCheck {
  platform: string;
  check: string;
  status: string;
  detail: string;
}

interface ManifestFile { path: string; sha256: string }

export async function doctorOpenCode(root: string, home: string): Promise<DoctorCheck[]> {
  const repo = await (async () => {
    let current = path.resolve(root);
    while (!(await fs.access(path.join(current, "platforms", "opencode", "agents")).then(() => true).catch(() => false))) {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(root);
      current = parent;
    }
    return current;
  })();
  const sourceDir = path.join(repo, "platforms", "opencode", "agents");
  const buildDir = path.join(repo, "generated", "runtime-build", "opencode", "native", "agents");
  const transactionalRuntime = path.join(home, "agent-rules-runtime");
  const transactional = await checkFile(path.join(transactionalRuntime, "agent-rules-runtime-receipt.json"));
  const installedDir = transactional ? path.join(transactionalRuntime, "native", "agents") : path.join(home, "agents");
  const manifestPath = path.join(home, "agent-rules-manifest.json");
  const files = (await walkDir(sourceDir)).map((file) => path.relative(sourceDir, file).replace(/\\/g, "/")).filter((file) => file !== "README.md").sort();
  const openCodeModel = await resolveOpenCodeModel(repo);
  const hashes = async (dir: string, renderSource = false) => Object.fromEntries(await Promise.all(files.map(async (file) => {
    const bytes = await fs.readFile(path.join(dir, file));
    const rendered = renderSource
      ? bytes.toString("utf8").replaceAll("__OPENCODE_MODEL_CLASS__", openCodeModel)
      : bytes;
    return [file, crypto.createHash("sha256").update(rendered).digest("hex")];
  })));
  // OpenCode source is a tokenized provider-neutral template. Compare the
  // generated/installed artifact against the deterministic rendered source,
  // not against the unresolved placeholder text.
  const source = await hashes(sourceDir, true);
  const build = await hashes(buildDir).catch(() => ({}));
  const installed = await hashes(installedDir).catch(() => ({}));
  const same = (a: Record<string, string>, b: Record<string, string>) => JSON.stringify(a) === JSON.stringify(b);
  const report: DoctorCheck[] = [];
  if (transactional) {
    try {
      await verifyRuntimeReceipt(transactionalRuntime, "opencode");
      report.push({ platform: "opencode", check: "runtime-manifest", status: "OK", detail: "transactional runtime receipt and all artifact paths verified" });
    } catch (error) {
      report.push({ platform: "opencode", check: "runtime-manifest", status: "NOT_LIVE", detail: (error as Error).message });
    }
    report.push({ platform: "opencode", check: "native-activation", status: "NATIVE_UNVERIFIED", detail: "OpenCode host activation remains unverified without observed host delivery" });
    report.push({ platform: "opencode", check: "source-build-hashes", status: same(source, build) ? "OK" : "NOT_LIVE", detail: "source compared with generated build" });
    report.push({ platform: "opencode", check: "installed-agent-hashes", status: same(build, await hashes(installedDir).catch(() => ({}))) ? "OK" : "NOT_LIVE", detail: "generated build compared with transactional runtime" });
    return report;
  }
  if (!await checkFile(manifestPath)) return [{ platform: "opencode", check: "runtime-manifest", status: "MISSING", detail: manifestPath }];
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { platform?: string; files?: ManifestFile[] };
    const listed = Object.fromEntries((manifest.files ?? []).map((file) => [file.path.replace(/^native\/agents\//, ""), file.sha256]).filter(([file]) => files.includes(file)));
    const ok = manifest.platform === "opencode" && same(listed, source) && same(listed, installed);
    report.push({ platform: "opencode", check: "runtime-manifest", status: ok ? "OK" : "NOT_LIVE", detail: ok ? "identity, content, and installed hashes match" : "manifest identity/content or installed hashes drift" });
  } catch { report.push({ platform: "opencode", check: "runtime-manifest", status: "NOT_LIVE", detail: "invalid agent-rules-manifest.json" }); }
  report.push({ platform: "opencode", check: "source-build-hashes", status: same(source, build) ? "OK" : "NOT_LIVE", detail: "source compared with generated build" });
  report.push({ platform: "opencode", check: "installed-agent-hashes", status: same(source, installed) ? "OK" : "NOT_LIVE", detail: "source compared with installed agents" });
  return report;
}

export function compareRuntimeManifest(installed: ManifestFile[], expected: ManifestFile[]): {
  missing: string[]; extra: string[]; hashMismatch: string[];
} {
  const installedByPath = new Map(installed.map((file) => [file.path, file.sha256]));
  const expectedByPath = new Map(expected.map((file) => [file.path, file.sha256]));
  const missing = expected.filter((file) => !installedByPath.has(file.path)).map((file) => file.path);
  const extra = installed
    .filter((file) => !file.path.startsWith(".activation/") && !expectedByPath.has(file.path))
    .map((file) => file.path);
  const hashMismatch = expected
    .filter((file) => !file.path.startsWith("native/") && installedByPath.has(file.path) && installedByPath.get(file.path) !== file.sha256)
    .map((file) => file.path);
  return { missing, extra, hashMismatch };
}

/**
 * Resolve the host-owned hook surface independently from the transactional
 * runtime mirror.  The runtime receipt lives below <platformHome>/agent-rules-runtime,
 * while hooks are intentionally installed at the host entrypoint so the host
 * can discover them.  Doctor must inspect the latter; checking the mirror
 * would report a healthy installed hook as NOT_LIVE.
 */
export function hookProbePaths(platform: string, platformHome: string): {
  configPath: string;
  scriptPath: string;
  needle: string;
} | null {
  const configName: Record<string, string> = {
    codex: "hooks.json",
    grok: "hooks/skill-orchestrator.json",
    antigravity: "hooks.json",
    cursor: "hooks.json",
  };
  const scriptName: Record<string, string> = {
    codex: "scripts/skill-gate.py",
    grok: "hooks/bin/grok-skill-gate.py",
    antigravity: "scripts/antigravity-skill-gate.py",
    cursor: "scripts/cursor-hook.py",
  };
  const needle: Record<string, string> = {
    // The matcher is a pipe-delimited list in the installed JSON, so probe
    // for a stable member rather than a substring that can never occur.
    codex: "apply_patch",
    grok: "grok-skill-gate",
    antigravity: "antigravity-skill-gate",
    cursor: "cursor-hook.py",
  };
  if (!configName[platform] || !scriptName[platform] || !needle[platform]) return null;
  return {
    configPath: path.join(platformHome, configName[platform]),
    scriptPath: path.join(platformHome, scriptName[platform]),
    needle: needle[platform],
  };
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
    opencode: process.env.OPENCODE_HOME || path.join(userHome, ".config", "opencode"),

    claude: process.env.CLAUDE_CONFIG_DIR || path.join(userHome, ".claude"),
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
  const valid = ["codex", "grok", "antigravity", "cursor", "opencode", "claude", "all"];
  if (!valid.includes(platformArg)) {
    return { exitCode: ExitCode.InvalidArgument, message: `Invalid platform: ${platformArg}` };
  }

  if (options.dryRun) {
    console.log(`[dry-run] Would run doctor for ${platformArg}`);
    return { exitCode: ExitCode.Success, message: "Dry-run: doctor skipped" };
  }

  const allPlatforms = ["codex", "grok", "antigravity", "cursor", "opencode", "claude"] as const;
  type PlatformName = typeof allPlatforms[number];
  const platforms: PlatformName[] = platformArg === "all" ? allPlatforms.filter((platform) => platform !== "opencode") : platformArg === "opencode" ? [] : [platformArg as PlatformName];
  const homes = getPlatformHomes(root);
  const report: DoctorCheck[] = [];
  if (platformArg === "all" || platformArg === "opencode") report.push(...await doctorOpenCode(root, homes.opencode));

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

    claude: ".claude.json",
  };
  const mcpConfigPaths: { [key in PlatformName]?: string } = {};
  for (const p of platforms) {
    mcpConfigPaths[p] = path.join(homes[p], mcpConfigMap[p] || "mcp.json");
  }

  for (const name of platforms) {
    const platformHome = homes[name];
    let runtimeHome = platformHome;
    let manifestPath = path.join(platformHome, "agent-rules-manifest.json");
    const transactionalRuntime = path.join(platformHome, "agent-rules-runtime");
    if (name !== "opencode" && await checkFile(path.join(transactionalRuntime, "agent-rules-runtime-receipt.json"))) {
      try {
        await verifyRuntimeReceipt(transactionalRuntime, name as RuntimePlatform);
        runtimeHome = transactionalRuntime;
        manifestPath = path.join(transactionalRuntime, "agent-rules-runtime-receipt.json");
      } catch (error) {
        report.push({ platform: name, check: "install", status: "NOT_LIVE", detail: (error as Error).message });
        continue;
      }
    }

    if (!(await checkFile(manifestPath))) {
      report.push({ platform: name, check: "runtime-manifest", status: "MISSING", detail: manifestPath });
      continue;
    }

    report.push({ platform: name, check: "install", status: "INSTALL_PASS", detail: runtimeHome === transactionalRuntime ? "transactional runtime receipt verified" : "legacy runtime manifest is present" });

    // Check native structure
    const buildDir = path.join(root, "generated", "runtime-build", name);
    const nativeDir = path.join(buildDir, "native");

    const groups = name === "grok"
      ? [{ build: "native/agents", dest: "agents", manifest: "agent-rules-native-agents.json" },
         { build: "native/personas", dest: "personas", manifest: "agent-rules-native-personas.json" }]
      : [{ build: "native/agents", dest: "agents", manifest: "agent-rules-native-agents.json" }];

    let nativeProblems: string[] = [];
    if (!nativeContractOk) nativeProblems.push("source/build native schema contract failed");

    if (runtimeHome === transactionalRuntime) {
      nativeProblems = [];
    }

    for (const g of runtimeHome === transactionalRuntime ? [] : groups) {
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
    const nativeCliMap: { [key in PlatformName]: string } = { codex: "codex", cursor: "cursor", grok: "grok", antigravity: "gemini/agy", opencode: "opencode", claude: "claude" };
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
        const { missing, extra, hashMismatch } = compareRuntimeManifest(installed.files, expected.files);

        if (extra.length > 0) report.push({ platform: name, check: "stale-files", status: "WARN", detail: extra.join(", ") });
        if (missing.length > 0) report.push({ platform: name, check: "missing-files", status: "MISSING", detail: missing.join(", ") });

        // Check hashes for non-native files
        if (hashMismatch.length > 0) {
          report.push({ platform: name, check: "sha256-drift", status: "NOT_LIVE", detail: hashMismatch.join(", ") });
        }

        if (extra.length === 0 && missing.length === 0 && hashMismatch.length === 0) {
          report.push({ platform: name, check: "manifest-parity", status: "OK", detail: "paths and hashes match build" });
        }
      } catch { /* skip manifest comparison on error */ }
    }

    // Hook config is a host-owned entrypoint, not part of the transactional
    // runtime mirror.  Inspect platformHome even when runtimeHome points at
    // <platformHome>/agent-rules-runtime.
    const hookProbe = hookProbePaths(name, platformHome);
    if (hookProbe) {
      const configExists = await checkFile(hookProbe.configPath);
      const scriptExists = await checkFile(hookProbe.scriptPath);
      let configBody = "";
      if (configExists) configBody = await fs.readFile(hookProbe.configPath, "utf-8");
      const noPlaceholders = !configBody.includes("__CODEX_HOME__") && !configBody.includes("__ANTIGRAVITY_HOME__");
      const hasNeedle = configBody.includes(hookProbe.needle);

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

  // ── Host-kit doctor: live process / runtime diagnostics ─────────────────
  let hostKitReport: HostKitDoctorReport | null = null;
  try {
    hostKitReport = await collectHostKitDoctorReport(root);

    // Config generation / hash
    const cfg = hostKitReport.loadedConfig;
    report.push({
      platform: "host-kit", check: "loaded-config-generation",
      status: cfg.generation !== null ? "OK" : "MISSING",
      detail: cfg.configSource
        ? `gen=${cfg.generation} hash=${cfg.configHash?.slice(0, 12) ?? "?"} source=${cfg.configSource}`
        : "no loaded config detected",
    });

    // Roles / permissions
    const roleCount = hostKitReport.roles.length;
    const permCount = hostKitReport.permissions.length;
    report.push({
      platform: "host-kit", check: "roles-permissions",
      status: roleCount > 0 ? "OK" : "NONE",
      detail: `roles=${roleCount} permissions=${permCount}`,
    });

    // Child / session handles
    const childCount = hostKitReport.childHandles.length;
    report.push({
      platform: "host-kit", check: "child-handles",
      status: "REPORTED",
      detail: `count=${childCount} pids=[${hostKitReport.childHandles.slice(0, 5).map((h) => h.pid).join(",")}${childCount > 5 ? ",..." : ""}]`,
    });

    // PIDs / process groups
    const pids = hostKitReport.pids;
    report.push({
      platform: "host-kit", check: "process-ids",
      status: "REPORTED",
      detail: `pid=${pids.current} ppid=${pids.parent ?? "?"} pgrp=${pids.group ?? "?"} session=${pids.session ?? "?"}`,
    });

    // Semantic / event cursors / deadlines
    const sc = hostKitReport.semanticCursor;
    const cursorStatus = sc.deadline ? "OK" : "NONE";
    report.push({
      platform: "host-kit", check: "semantic-cursor",
      status: cursorStatus,
      detail: `position=${sc.position} deadline=${sc.deadline ?? "none"}`,
    });
    if (hostKitReport.eventCursors.length > 0) {
      report.push({
        platform: "host-kit", check: "event-cursors",
        status: "REPORTED",
        detail: `streams=${hostKitReport.eventCursors.length}: ${hostKitReport.eventCursors.map((c) => `${c.stream}:${c.index}`).join("; ")}`,
      });
    }

    // Queue age
    report.push({
      platform: "host-kit", check: "queue-age",
      status: hostKitReport.queueAgeMs !== null ? "OK" : "NONE",
      detail: hostKitReport.queueAgeMs !== null ? `${hostKitReport.queueAgeMs}ms` : "no queue activity detected",
    });

    // Open ports
    const portCount = hostKitReport.openPorts.length;
    report.push({
      platform: "host-kit", check: "open-ports",
      status: portCount > 0 ? "REPORTED" : "NONE",
      detail: portCount > 0
        ? `count=${portCount}: ${hostKitReport.openPorts.slice(0, 3).map((p) => `${p.port}/${p.protocol}`).join(", ")}${portCount > 3 ? ",..." : ""}`
        : "no open ports in process tree",
    });

    // Test / MCP / browser / Compose leases
    const leasesByKind = groupBy(hostKitReport.leases, (l) => l.kind);
    for (const [kind, entries] of Object.entries(leasesByKind)) {
      const active = entries.filter((e) => e.status === "active").length;
      report.push({
        platform: "host-kit", check: `${kind}-leases`,
        status: active > 0 ? "ACTIVE" : "NONE",
        detail: `active=${active} total=${entries.length}`,
      });
    }
    if (hostKitReport.leases.length === 0) {
      report.push({ platform: "host-kit", check: "all-leases", status: "NONE", detail: "no test/mcp/browser/compose leases detected" });
    }

    // Orphans
    const orphanCount = hostKitReport.orphans.length;
    if (orphanCount > 0) {
      report.push({
        platform: "host-kit", check: "orphans",
        status: "ORPHANS",
        detail: `count=${orphanCount}: ${hostKitReport.orphans.slice(0, 3).map((o) => `${o.kind}:${o.path}`).join("; ")}${orphanCount > 3 ? ",..." : ""}`,
      });
    } else {
      report.push({ platform: "host-kit", check: "orphans", status: "CLEAN", detail: "no orphaned resources detected" });
    }

    // Fresh-process JSON proof
    const proof = hostKitReport.freshProof;
    report.push({
      platform: "host-kit", check: "fresh-process-proof",
      status: "OK",
      detail: `proofId=${proof.proofId} pid=${proof.pid} gen=${proof.generation} mem=${proof.systemSnapshot.freeMemoryMb}/${proof.systemSnapshot.totalMemoryMb}MB cpu=${proof.systemSnapshot.cpuCount} host=${proof.hostname}`,
    });
  } catch (error) {
    report.push({ platform: "host-kit", check: "host-kit-doctor", status: "ERROR", detail: (error as Error).message });
  }

  // RTK check
  try {
    const rtkResult = await new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
      execFile("rtk", ["--version"], (error, stdout, stderr) => {
        resolve({ ok: !error, stdout: stdout ?? "", stderr: stderr ?? "" });
      });
    });
    if (rtkResult.ok) {
      report.push({ platform: "rtk", check: "rtk-install", status: "OK", detail: rtkResult.stdout.trim() });
    } else {
      report.push({ platform: "rtk", check: "rtk-install", status: "WARN", detail: "RTK not installed — run: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh" });
    }
  } catch {
    report.push({ platform: "rtk", check: "rtk-install", status: "WARN", detail: "RTK not available on PATH" });
  }

  // ── Canonical MCP provisioning health ────────────────────────────────
  // Installation health is checked independently of activation. An MCP that is
  // not fully installed/verified is reported as a blocking failure, never
  // downgraded to WARN. `--skip-integration-verify` explicitly skips the
  // verification (never a PASS claim) as a documented escape hatch.
  try {
    const inventory = await loadIntegrationInventory(root);
    if (skipIntegrationVerify) {
      for (const entry of inventory.mcps) {
        report.push({ platform: "mcp", check: `mcp-install-${entry.id}`, status: "MCP_SKIPPED", detail: "verification skipped via --skip-integration-verify; no PASS claim" });
      }
    } else {
      const provisioning = await verifyMcps(root);
      for (const result of provisioning.results) {
        const status = result.installation.status;
        report.push({
          platform: "mcp",
          check: `mcp-install-${result.id}`,
          status: status === "PRE-EXISTING" || status === "PASS" ? "MCP_OK" : `MCP_${status}`,
          detail: result.installation.status === "PRE-EXISTING" || result.installation.status === "PASS"
            ? `installed=${result.installation.status} version=${result.installation.version ?? "?"} location=${result.installation.location ?? "?"} activation=${result.activation.policy}`
            : `installation ${result.installation.status}: ${result.installation.reason ?? "no evidence"}`,
        });
      }
    }
  } catch (error) {
    report.push({ platform: "mcp", check: "mcp-registry", status: "MCP_BLOCKED", detail: (error as Error).message });
  }

  // ── Host MCP config convergence health (read-only classification) ─────
  // REQ-008/REQ-009: host configs must not contain enabled agent-rules MCP
  // entries under the default global MCP profile (none). Classification is
  // strictly read-only here; convergence (backup + remove/disable) happens
  // in install/sync/reconcile.
  try {
    const { classifyHostMcpConfig, ALL_MCP_HOSTS, HOST_CONFIG_FILES } = await import("../runtime/mcp-convergence.js");
    const { hostHome } = await import("../runtime/mcp-convergence.js");
    for (const host of ALL_MCP_HOSTS) {
      const classified = await classifyHostMcpConfig(root, host);
      if (!classified.exists) continue;
      const touched = classified.entries.filter((entry) => entry.disposition !== "user-owned");
      if (touched.length === 0) continue;
      for (const entry of touched) {
        report.push({
          platform: "mcp",
          check: `mcp-convergence-${host}-${entry.id}`,
          status: entry.disposition === "user-modified" ? "MCP_NEEDS_USER" : "MCP_CONVERGED",
          detail: `${entry.reason} (${path.join(hostHome(host), HOST_CONFIG_FILES[host])})`,
        });
      }
    }
  } catch {
    // Classification is advisory; a failure here must not fake a pass, so it
    // is surfaced as a warning-level MCP_PARTIAL.
    report.push({ platform: "mcp", check: "mcp-convergence", status: "MCP_PARTIAL", detail: "host MCP convergence classification unavailable" });
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
    ["MISSING", "NOT_LIVE", "MODEL_POLICY_DRIFT", "MODEL_POLICY_MISSING", "NATIVE_PARTIAL", "ORPHANS", "ERROR",
      "MCP_BLOCKED", "MCP_UNSUPPORTED", "MCP_NEEDS_USER", "MCP_PARTIAL"].includes(r.status)
  );
  const nativeObserved = report.filter((r) => r.status === "NATIVE_OBSERVED").length;
  const nativeUnverified = report.filter((r) => r.status === "NATIVE_UNVERIFIED").length;

  if (bad.length > 0) {
    console.error(`Doctor PARTIAL: ${bad.length} install/runtime failure(s)`);
    return {
      exitCode: ExitCode.LegacyFailed,
      message: `Doctor found ${bad.length} issue(s)`,
      data: { report, badCount: bad.length, nativeObserved, nativeUnverified, hostKit: hostKitReport ?? null },
    };
  }

  console.log(`Doctor layered summary: no blocking failures; native observed=${nativeObserved}, native unverified=${nativeUnverified}`);
  return {
    exitCode: ExitCode.Success,
    message: "Doctor health check passed",
    data: { report, nativeObserved, nativeUnverified, hostKit: hostKitReport ?? null },
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
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
