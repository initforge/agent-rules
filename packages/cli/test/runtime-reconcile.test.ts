import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { REGISTERED_HOSTS, type DesiredRuntime } from "../src/runtime/contracts.js";
import { createHostAdapter, HOST_SPECS, isRegisteredHost, unsupportedHostDetection } from "../src/runtime/host-adapters.js";
import { reconcileHosts } from "../src/runtime/reconcile.js";

const HASH = "a".repeat(64);

function makeDesired(): DesiredRuntime {
  return {
    skills: [{ id: "skill-a", source: "skills/skill-a" }],
    providers: [{ id: "playwright", mode: "required" }],
    runtimeState: "agent-rules-runtime@1234567890ab",
    source: "test",
  };
}

function probesWith(opts: {
  binaryOnPath?: boolean;
  desktopProcess?: boolean;
  configDir?: boolean;
  receiptSha?: string;
  probeOk?: boolean;
}) {
  return {
    pathEntries: () => ["/usr/local/bin", "/usr/bin"],
    processList: async (pattern: string) => (opts.desktopProcess ? [`/proc/1/ ${pattern}`] : []),
    runProbe: async () => ({ ok: opts.probeOk ?? true, stdout: "test v1.0.0" }),
    fileExists: async (filePath: string) => {
      // Normalize separators: on Windows path.join produces backslash paths
      // (e.g. \usr\local\bin\codex) that must match the same binary set.
      const norm = filePath.replace(/\\/g, '/');
      if (opts.binaryOnPath && /(?:\/usr\/local\/bin\/|\/usr\/bin\/|C:\/Program Files\/|C:\/Users\/)(codex|claude|grok|opencode|antigravity|gemini|cursor|cursor-agent)(?:\.exe)?$/.test(norm)) return true;
      if (opts.configDir && filePath === opts.configDir) return true;
      if (opts.receiptSha && /agent-rules-runtime\/receipt\.json$/.test(filePath)) return true;
      return false;
    },
    readFileText: async (filePath: string) => {
      if (opts.receiptSha && /agent-rules-runtime\/receipt\.json$/.test(filePath)) {
        return JSON.stringify({ schema: "agent-rules/runtime-receipt", version: 1, platform: "codex", installedAt: new Date().toISOString(), source: { manifestSha256: HASH, artifactSha256: HASH, effectivePlanSha256: opts.receiptSha, effectivePlanLedger: ".agent/ledger/x.json", effectivePlanLedgerSha256: HASH, repositoryContext: { gitHead: HASH, gitTree: HASH, relation: "context-only-not-artifact-attestation" } }, activation: { kind: "managed-file", id: "global-instructions" }, files: [] });
      }
      return undefined;
    },
  };
}

let tempRoot: string;

async function tempConfigDir(): Promise<string> {
  tempRoot = tempRoot ?? await fs.mkdtemp(path.join(os.tmpdir(), "s4-config-"));
  return path.join(tempRoot, "codex");
}

describe("host inventory, projection, and transactional repair (S4)", () => {
  it("detects a live install from a PATH binary and live probe", async () => {
    const configDir = await tempConfigDir();
    const adapter = createHostAdapter(HOST_SPECS.codex, { configDir });
    const detection = await adapter.detect(probesWith({ binaryOnPath: true, configDir }));
    expect(detection.installed).toBe(true);
    expect(detection.status).toBe("installed");
    expect(detection.signals.some((signal) => signal.kind === "binary-on-path" && signal.live)).toBe(true);
    expect(detection.signals.some((signal) => signal.kind === "live-probe")).toBe(true);
    expect(detection.taskAuthority).toBe(false);
  });

  it("treats a config directory alone as stale evidence, not an install", async () => {
    const configDir = await tempConfigDir();
    const adapter = createHostAdapter(HOST_SPECS.codex, { configDir });
    const detection = await adapter.detect(probesWith({ configDir }));
    expect(detection.installed).toBe(false);
    expect(detection.status).toBe("absent");
    expect(detection.staleEvidence).toBe(true);
    expect(detection.signals.some((signal) => signal.kind === "config-dir" && !signal.live)).toBe(true);
  });

  it("accepts a desktop process without a CLI binary as installed", async () => {
    const configDir = await tempConfigDir();
    const adapter = createHostAdapter(HOST_SPECS.claude, { configDir });
    const detection = await adapter.detect(probesWith({ desktopProcess: true, probeOk: false }));
    expect(detection.installed).toBe(true);
    expect(detection.status).toBe("installed");
    expect(detection.signals.some((signal) => signal.kind === "desktop-process" && signal.live)).toBe(true);
  });

  it("treats stale harness receipts without an application as absent", async () => {
    const configDir = await tempConfigDir();
    const adapter = createHostAdapter(HOST_SPECS.codex, { configDir });
    const detection = await adapter.detect(probesWith({ configDir, receiptSha: "f".repeat(64) }));
    expect(detection.installed).toBe(false);
    expect(detection.staleEvidence).toBe(true);
  });

  it("returns UNSUPPORTED for unknown hosts and never grants task authority", () => {
    const detection = unsupportedHostDetection("not-a-host");
    expect(detection.status).toBe("unsupported");
    expect(detection.installed).toBe(false);
    expect(detection.reason).toContain("UNSUPPORTED");
    expect(detection.taskAuthority).toBe(false);
    expect(isRegisteredHost("not-a-host")).toBe(false);
  });

  it("covers exactly the eight registered hosts with specs", () => {
    expect(REGISTERED_HOSTS).toEqual(["opencode", "codex", "claude", "grok", "antigravity", "cursor", "deepseek-harness", "command-code"]);
    for (const host of REGISTERED_HOSTS) {
      expect(HOST_SPECS[host]).toBeDefined();
      expect(HOST_SPECS[host].binaries.length).toBeGreaterThan(0);
    }
  });

  it("projects desired-vs-actual drift and reports it in report-only mode", async () => {
    const configDir = await tempConfigDir();
    const adapter = createHostAdapter(HOST_SPECS.codex, { configDir });
    const detection = await adapter.detect(probesWith({ binaryOnPath: true, configDir, receiptSha: "1234567890ab".padEnd(64, "f") }));
    const projection = await adapter.project(makeDesired(), detection);
    expect(projection.drift.skills).toContain("skill-a");
    expect(projection.drift.providers).toContain("playwright");
    const receipt = await adapter.repair(projection, { reportOnly: true });
    expect(receipt.status).toBe("drifted");
    expect(receipt.mutated).toBe(false);
    expect(receipt.actions.every((action) => action.kind === "report-only")).toBe(true);
  });

  it("repairs managed drift transactionally in the temp config dir and never writes unmanaged content", async () => {
    const configDir = await tempConfigDir();
    const desired = makeDesired();
    const adapter = createHostAdapter(HOST_SPECS.codex, { configDir });
    const detection = await adapter.detect(probesWith({ binaryOnPath: true, configDir }));
    const projection = await adapter.project(desired, detection);
    const receipt = await adapter.repair(projection, {
      reportOnly: false,
      desiredManagedFiles: async () => [{
        relativePath: "skills/skill-a",
        sha256: "b".repeat(64),
        content: Buffer.from("managed content"),
        source: "selected-external-skill",
      }],
    });
    expect(receipt.status).toBe("repaired");
    expect(receipt.mutated).toBe(true);
    expect(receipt.transaction?.phase).toBe("committed");
    expect(receipt.actions.some((action) => action.kind === "swap-managed-file" && action.target === "skills/skill-a")).toBe(true);
    expect(receipt.taskAuthority).toBe(false);
    const written = await fs.readFile(path.join(configDir, "skills", "skill-a"), "utf8");
    expect(written).toBe("managed content");
    await adapter.rollback(receipt);
    await expect(fs.access(path.join(configDir, "skills", "skill-a"))).rejects.toThrow();
  });

  it("recovers a repair that crashed after backup but before swap", async () => {
    const configDir = await tempConfigDir();
    const adapter = createHostAdapter(HOST_SPECS.codex, { configDir });
    const detection = await adapter.detect(probesWith({ binaryOnPath: true, configDir }));
    const projection = await adapter.project(makeDesired(), detection);
    await expect(
      adapter.repair(projection, {
        reportOnly: false,
        failpoint: "crash-after-backup-before-swap",
        desiredManagedFiles: async () => [{
          relativePath: "skills/skill-a",
          sha256: "b".repeat(64),
          content: Buffer.from("managed content"),
          source: "selected-external-skill",
        }],
      }),
    ).rejects.toThrow(/failpoint/);
    const journalPath = path.join(configDir, ".agent-rules-reconcile", "transaction.json");
    const journal = JSON.parse(await fs.readFile(journalPath, "utf8"));
    expect(journal.phase).toBe("backed-up");
  });

  it("reconciles all hosts with installed-only semantics without mutating absent hosts", async () => {
    const result = await reconcileHosts([...REGISTERED_HOSTS], { installedOnly: true, reportOnly: true });
    expect(result.reconciled).toHaveLength(8);
    for (const item of result.reconciled) {
      expect(item.taskAuthority).toBe(false);
      if (item.installed) expect(item.receipt?.mutated ?? false).toBe(false);
      else expect(item.skipped).toBe(true);
    }
  });

  it("reports UNSUPPORTED during reconciliation for unknown hosts", async () => {
    const result = await reconcileHosts(["mystery-host"], { installedOnly: false, reportOnly: true });
    expect(result.reconciled[0].status).toBe("unsupported");
    expect(result.unknownCount).toBe(1);
    expect(result.reconciled[0].reason).toContain("UNSUPPORTED");
  });
});
