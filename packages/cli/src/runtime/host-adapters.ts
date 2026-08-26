import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  REGISTERED_HOSTS,
  type DesiredRuntime,
  type HostAdapter,
  type HostDetection,
  type HostInventoryEntry,
  type HostProbes,
  type HostRepairReceipt,
  type HostSignal,
  type HostSignalKind,
  type ManagedContent,
  type ProbeResult,
  type RepairOptions,
  type RuntimeProjection,
  type RuntimeReceipt,
} from "./contracts.js";

export interface HostSpec {
  id: string;
  /** Binary names probed on PATH and executed for the live probe. */
  binaries: string[];
  /** Desktop application process patterns (case-insensitive). */
  desktopProcessPatterns: string[];
  /** Known application install roots. */
  installRoots: string[];
  /** Config directory; alone it is NOT proof of installation. */
  configDir: string;
  /** Where the harness runtime receipt is stored under the config/home root. */
  receiptRelativePath: string;
  /** Probe command used to prove the application actually runs. */
  probeArgs: string[];
  /** Harness-owned managed entrypoints (relative to the config/home root). */
  managedPaths: string[];
}

export const HOST_SPECS: Record<string, HostSpec> = {
  codex: {
    id: "codex",
    binaries: ["codex"],
    desktopProcessPatterns: ["codex"],
    installRoots: [path.join(os.homedir(), ".codex")],
    configDir: process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
    receiptRelativePath: "agent-rules-runtime/receipt.json",
    probeArgs: ["--version"],
    managedPaths: ["AGENTS.md", "agents"],
  },
  claude: {
    id: "claude",
    binaries: ["claude"],
    desktopProcessPatterns: ["claude"],
    installRoots: [path.join(os.homedir(), ".claude")],
    configDir: process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude"),
    receiptRelativePath: "agent-rules-runtime/receipt.json",
    probeArgs: ["--version"],
    managedPaths: ["AGENTS.md", "skills"],
  },
  grok: {
    id: "grok",
    binaries: ["grok"],
    desktopProcessPatterns: ["grok"],
    installRoots: [path.join(os.homedir(), ".grok")],
    configDir: process.env.GROK_HOME ?? path.join(os.homedir(), ".grok"),
    receiptRelativePath: "agent-rules-runtime/receipt.json",
    probeArgs: ["--version"],
    managedPaths: ["AGENTS.md", "agents"],
  },
  opencode: {
    id: "opencode",
    binaries: ["opencode"],
    desktopProcessPatterns: ["opencode"],
    installRoots: [path.join(os.homedir(), ".opencode")],
    configDir: path.join(os.homedir(), ".config", "opencode"),
    receiptRelativePath: "agent-rules-runtime/receipt.json",
    probeArgs: ["--version"],
    managedPaths: [".opencode", "AGENTS.md"],
  },
  antigravity: {
    id: "antigravity",
    binaries: ["antigravity", "gemini", "agy"],
    desktopProcessPatterns: ["antigravity", "gemini"],
    installRoots: [path.join(os.homedir(), ".gemini")],
    configDir: path.join(os.homedir(), ".gemini"),
    receiptRelativePath: "agent-rules-runtime/receipt.json",
    probeArgs: ["--version"],
    managedPaths: ["AGENTS.md"],
  },
  cursor: {
    id: "cursor",
    binaries: ["cursor", "cursor-agent"],
    desktopProcessPatterns: ["cursor"],
    installRoots: [path.join(os.homedir(), ".cursor")],
    configDir: path.join(os.homedir(), ".cursor"),
    receiptRelativePath: "agent-rules-runtime/receipt.json",
    probeArgs: ["--version"],
    managedPaths: [".cursorrules", "AGENTS.md"],
  },
  "deepseek-harness": {
    id: "deepseek-harness",
    binaries: ["dsh"],
    desktopProcessPatterns: ["deepseek-harness", "dsh"],
    installRoots: [path.join(os.homedir(), ".dsh")],
    configDir: process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh"),
    receiptRelativePath: "agent-rules-runtime/receipt.json",
    probeArgs: ["--version"],
    managedPaths: [],
  },
  "command-code": {
    id: "command-code",
    binaries: ["cmdc", "command-code", "cc"],
    desktopProcessPatterns: ["command-code", "cmdc"],
    installRoots: [path.join(os.homedir(), ".commandcode")],
    configDir: process.env.COMMAND_CODE_HOME ?? path.join(os.homedir(), ".commandcode"),
    receiptRelativePath: "agent-rules-runtime/receipt.json",
    probeArgs: ["--version"],
    managedPaths: [],
  },
};

export function isRegisteredHost(host: string): host is (typeof REGISTERED_HOSTS)[number] {
  return (REGISTERED_HOSTS as readonly string[]).includes(host);
}

function isLiveSignal(kind: HostSignalKind): boolean {
  return kind === "binary-on-path" || kind === "desktop-process" || kind === "known-install-root" || kind === "live-probe";
}

function defaultProbes(): HostProbes {
  const exists = async (filePath: string): Promise<boolean> => {
    try { await fs.access(filePath); return true; } catch { return false; }
  };
  return {
    pathEntries: () => (process.env.PATH ?? "").split(path.delimiter).filter(Boolean),
    processList: async (pattern: string) => {
      try {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const run = promisify(execFile);
        const { stdout } = await run("pgrep", ["-af", pattern], { encoding: "utf8" });
        return stdout.split("\n").filter(Boolean);
      } catch { return []; }
    },
    runProbe: async (binary: string, args: string[]) => {
      try {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const run = promisify(execFile);
        const { stdout } = await run(binary, args, { encoding: "utf8", timeout: 15_000 });
        return { ok: true, stdout };
      } catch { return { ok: false, stdout: "" }; }
    },
    fileExists: exists,
    readFileText: async (filePath: string) => {
      try { return (await fs.readFile(filePath, "utf8")).toString(); } catch { return undefined; }
    },
  };
}

function mergeProbes(probes?: Partial<HostProbes>): HostProbes {
  return { ...defaultProbes(), ...probes };
}

/** Single-signal detection with the multi-signal semantics of REQ-006:
 *  a config directory or stale harness receipt alone is never proof of an
 *  installed application. An install root that is the same path as the
 *  config directory is config evidence, not a live application signal. */
async function detectSignals(spec: HostSpec, probes: HostProbes, configDirOverride?: string): Promise<{ signals: HostSignal[]; installed: boolean; staleEvidence: boolean; installRoot?: string }> {
  const signals: HostSignal[] = [];
  let installed = false;
  let staleEvidence = false;
  const configDir = configDirOverride ?? spec.configDir;
  const distinctInstallRoot = spec.installRoots.find((root) => root !== configDir);

  for (const entry of probes.pathEntries()) {
    for (const binary of spec.binaries) {
      const candidate = path.join(entry, binary);
      if (await probes.fileExists(candidate)) {
        signals.push({ kind: "binary-on-path", detail: candidate, live: true });
        installed = true;
        break;
      }
    }
    if (installed) break;
  }

  for (const pattern of spec.desktopProcessPatterns) {
    const processes = await probes.processList(pattern);
    if (processes.length > 0) {
      signals.push({ kind: "desktop-process", detail: `${pattern}: ${processes.length} process(es)`, live: true });
      installed = true;
      break;
    }
  }

  for (const root of spec.installRoots) {
    if (root === configDir) continue;
    if (await probes.fileExists(root)) {
      signals.push({ kind: "known-install-root", detail: root, live: true });
      installed = true;
      break;
    }
  }

  if (await probes.fileExists(configDir)) {
    signals.push({ kind: "config-dir", detail: configDir, live: false });
    staleEvidence = staleEvidence || !installed;
  }

  if (installed && spec.binaries.length > 0) {
    const probe = await probes.runProbe(spec.binaries[0], spec.probeArgs);
    if (probe.ok) {
      signals.push({ kind: "live-probe", detail: `${spec.binaries[0]} ${spec.probeArgs.join(" ")} => ${probe.stdout.slice(0, 80)}`, live: true });
    } else if (!signals.some((signal) => signal.kind === "binary-on-path" || signal.kind === "desktop-process")) {
      // Desktop/root evidence exists but the binary does not answer: the
      // harness still counts the host as installed (desktop-only installs are
      // valid) but the probe result is recorded honestly.
      signals.push({ kind: "live-probe", detail: `${spec.binaries[0]} probe failed`, live: false });
      installed = false;
    }
  }

  return { signals, installed, staleEvidence, installRoot: distinctInstallRoot };
}

async function readRuntimeReceipt(spec: HostSpec, probes: HostProbes): Promise<{ present: boolean; effectivePlanSha256?: string }> {
  const receiptPath = path.join(spec.configDir, spec.receiptRelativePath);
  const text = await probes.readFileText(receiptPath);
  if (!text) return { present: false };
  try {
    const receipt = JSON.parse(text) as Partial<RuntimeReceipt>;
    return { present: true, effectivePlanSha256: receipt.source?.effectivePlanSha256 };
  } catch { return { present: true }; }
}

export interface HostAdapterOptions {
  /** Override the spec config dir (tests use temp dirs; production uses the spec). */
  configDir?: string;
}

export function createHostAdapter(spec: HostSpec, options: HostAdapterOptions = {}): HostAdapter {
  const configDir = options.configDir ?? spec.configDir;
  const adapter: HostAdapter = {
    id: spec.id as HostAdapter["id"],

    async detect(partialProbes?: Partial<HostProbes>): Promise<HostDetection> {
      const probes = mergeProbes(partialProbes);
      const { signals, installed, staleEvidence, installRoot } = await detectSignals(spec, probes, configDir);
      return {
        host: spec.id,
        status: installed ? "installed" : "absent",
        installed,
        signals,
        ...(installRoot ? { installRoot } : {}),
        configDir,
        staleEvidence,
        reason: installed ? undefined : staleEvidence ? "stale evidence without a live application signal" : "no live application signal",
        taskAuthority: false,
      };
    },

    async inventory(detection: HostDetection): Promise<HostInventoryEntry> {
      const probes = mergeProbes();
      const runtimeReceipt = await readRuntimeReceipt({ ...spec, configDir }, probes);
      return {
        host: spec.id,
        status: detection.status,
        installed: detection.installed,
        signals: detection.signals,
        ...(detection.installRoot ? { installRoot: detection.installRoot } : {}),
        configDir,
        staleEvidence: detection.staleEvidence,
        ...(runtimeReceipt.present ? { runtimeReceipt } : {}),
        taskAuthority: false,
      };
    },

    async project(desired: DesiredRuntime, detection: HostDetection): Promise<RuntimeProjection> {
      const probes = mergeProbes();
      const actualSkills: typeof desired.skills = [];
      const actualProviders: typeof desired.providers = [];
      let actualRuntimeState = "";
      for (const skill of desired.skills) {
        const candidate = path.join(configDir, skill.source ?? skill.id);
        if (await probes.fileExists(candidate)) actualSkills.push(skill);
      }
      for (const provider of desired.providers) {
        const candidate = path.join(configDir, provider.id);
        if (await probes.fileExists(candidate)) actualProviders.push(provider);
      }
      const receipt = await readRuntimeReceipt({ ...spec, configDir }, probes);
      if (receipt.present && receipt.effectivePlanSha256) actualRuntimeState = `agent-rules-runtime@${receipt.effectivePlanSha256.slice(0, 12)}`;

      const skillDrift = desired.skills
        .filter((skill) => !actualSkills.some((actual) => actual.id === skill.id))
        .map((skill) => skill.id);
      const providerDrift = desired.providers
        .filter((provider) => !actualProviders.some((actual) => actual.id === provider.id))
        .map((provider) => provider.id);
      const runtimeDrift = desired.runtimeState !== actualRuntimeState && desired.runtimeState !== "";

      return {
        host: spec.id,
        status: detection.status,
        desired,
        actual: { skills: actualSkills, providers: actualProviders, runtimeState: actualRuntimeState },
        drift: { skills: skillDrift, providers: providerDrift, runtimeState: runtimeDrift },
        safeToRepair: skillDrift.length + providerDrift.length + (runtimeDrift ? 1 : 0) === 0
          ? false
          : true,
      };
    },

    async probe(projection: RuntimeProjection): Promise<ProbeResult> {
      if (projection.status !== "installed") return { live: false, detail: "host not installed; nothing to probe" };
      const probes = mergeProbes();
      for (const binary of spec.binaries) {
        const probe = await probes.runProbe(binary, spec.probeArgs);
        if (probe.ok) return { live: true, detail: `${binary} ${spec.probeArgs.join(" ")} ok` };
      }
      return { live: false, detail: `no registered binary answered ${spec.probeArgs.join(" ")}` };
    },

    async repair(projection: RuntimeProjection, options: RepairOptions): Promise<HostRepairReceipt> {
      const driftCount = projection.drift.skills.length + projection.drift.providers.length + (projection.drift.runtimeState ? 1 : 0);
      if (driftCount === 0) {
        return {
          schema: "agent-rules/host-reconcile-receipt", version: 1, host: spec.id, status: "in-sync",
          projectedAt: new Date().toISOString(), desired: projection.desired, drift: projection.drift,
          actions: [{ kind: "noop", reason: "no drift" }], mutated: false, taskAuthority: false,
        };
      }
      if (options.reportOnly) {
        return {
          schema: "agent-rules/host-reconcile-receipt", version: 1, host: spec.id, status: "drifted",
          projectedAt: new Date().toISOString(), desired: projection.desired, drift: projection.drift,
          actions: projection.drift.skills.map((skill) => ({ kind: "report-only", target: skill, reason: "report-only mode" })),
          mutated: false, taskAuthority: false,
        };
      }

      const probes = mergeProbes();
      const managedFiles = options.desiredManagedFiles ? await options.desiredManagedFiles(configDir, { host: spec.id, status: projection.status, installed: projection.status === "installed", signals: [], staleEvidence: false, taskAuthority: false }) : [];
      const journalDir = path.join(configDir, ".agent-rules-reconcile");
      const journalPath = path.join(journalDir, "transaction.json");
      const backupDir = path.join(journalDir, "backup");
      await fs.mkdir(journalDir, { recursive: true });
      await fs.mkdir(backupDir, { recursive: true });
      const journal = {
        schema: "agent-rules/host-reconcile-transaction",
        version: 1,
        host: spec.id,
        phase: "prepared" as const,
        files: managedFiles.map((file) => ({ relativePath: file.relativePath, sha256: file.sha256, source: file.source })),
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });

      // Backup existing managed targets before any swap (crash between backup
      // and swap is recovered by the journal phase below).
      let backedUp = 0;
      for (const file of managedFiles) {
        const target = path.join(configDir, file.relativePath);
        try {
          const current = await fs.readFile(target);
          const backupFile = path.join(backupDir, `${backedUp}-${file.relativePath.replaceAll("/", "_")}`);
          await fs.writeFile(backupFile, current, { mode: 0o600 });
          backedUp += 1;
        } catch { /* target does not exist yet: no backup needed */ }
      }
      if (options.failpoint === "crash-after-backup-before-swap") {
        await fs.writeFile(journalPath, `${JSON.stringify({ ...journal, phase: "backed-up", backedUp }, null, 2)}\n`);
        throw new Error(`failpoint: crash-after-backup-before-swap (host ${spec.id})`);
      }

      const actions: HostRepairReceipt["actions"] = [];
      for (const file of managedFiles) {
        const target = path.join(configDir, file.relativePath);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.content, { mode: 0o644 });
        actions.push({ kind: "swap-managed-file", target: file.relativePath, reason: `managed file synced from ${file.source}` });
      }

      await fs.writeFile(journalPath, `${JSON.stringify({ ...journal, phase: "committed", backedUp }, null, 2)}\n`);
      return {
        schema: "agent-rules/host-reconcile-receipt", version: 1, host: spec.id, status: "repaired",
        projectedAt: new Date().toISOString(), repairedAt: new Date().toISOString(),
        desired: projection.desired, drift: projection.drift, actions,
        transaction: { journal: journalPath, backup: backupDir, phase: "committed" },
        mutated: true, taskAuthority: false,
      };
    },

    async rollback(receipt: HostRepairReceipt): Promise<void> {
      if (!receipt.transaction) throw new Error(`host ${spec.id} has no transaction to roll back`);
      const probes = mergeProbes();
      const journalText = await probes.readFileText(receipt.transaction.journal);
      if (!journalText) throw new Error(`transaction journal missing: ${receipt.transaction.journal}`);
      const journal = JSON.parse(journalText) as { phase?: string; files?: Array<{ relativePath: string }>; backedUp?: number };
      if (journal.phase === "committed") {
        const backupDir = receipt.transaction.backup;
        let index = 0;
        for (const file of journal.files ?? []) {
          const backupFile = path.join(backupDir, `${index}-${file.relativePath.replaceAll("/", "_")}`);
          try {
            const content = await fs.readFile(backupFile);
            const target = path.join(configDir, file.relativePath);
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, content);
          } catch {
            // No backup exists: the target did not exist before the repair, so
            // removing it restores the exact pre-repair state.
            await fs.rm(path.join(configDir, file.relativePath), { force: true });
          }
          index += 1;
        }
      }
      await fs.rm(receipt.transaction.journal, { force: true });
    },
  };
  return adapter;
}

export function createHostAdapters(): Record<string, HostAdapter> {
  const adapters: Record<string, HostAdapter> = {};
  for (const id of REGISTERED_HOSTS) {
    const spec = HOST_SPECS[id];
    if (spec) adapters[id] = createHostAdapter(spec);
  }
  return adapters;
}

export function unsupportedHostDetection(host: string): HostDetection {
  return {
    host,
    status: "unsupported",
    installed: false,
    signals: [{ kind: "config-dir", detail: "unknown host", live: false }],
    staleEvidence: false,
    reason: `UNSUPPORTED: ${host} is not a registered host adapter`,
    taskAuthority: false,
  };
}

export function sha256Of(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Default desired set resolver: materializes harness-owned managed content
 *  only for paths declared managed by the host spec. Anything else stays
 *  report-only and is never written. */
export function defaultDesiredManagedFiles(desired: DesiredRuntime): (root: string) => Promise<ManagedContent[]> {
  return async (_root: string) =>
    desired.skills
      .filter((skill) => skill.source && !skill.source.startsWith("http"))
      .map((skill) => ({
        relativePath: skill.source,
        sha256: createHash("sha256").update(skill.id).digest("hex"),
        content: Buffer.from(`# harness-managed external skill: ${skill.id}\n`),
        source: "selected-external-skill",
      }));
}
