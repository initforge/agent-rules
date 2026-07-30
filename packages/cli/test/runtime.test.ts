import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  RuntimeInstaller,
  fsyncDirectory,
  fsyncRegularFile,
  type RuntimeInstallerOptions,
  verifyRuntimeReceipt,
} from "../src/runtime/installer.js";

const runtimeDirectory = "agent-rules-runtime";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await fs.lstat(value);
    return true;
  } catch {
    return false;
  }
}

describe("RuntimeInstaller", () => {
  let temp: string;
  let repositoryRoot: string;
  let targetRoot: string;

  beforeEach(async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-rules-runtime-"));
    repositoryRoot = path.join(temp, "repository");
    targetRoot = path.join(temp, "target");
    await fs.mkdir(repositoryRoot, { recursive: true });
    await writeBuild({ "rules/base.md": "first\n", "skills/example/SKILL.md": "skill\n" });
    await writeEffectivePlanIdentity();
    execFileSync("git", ["init", "-q", repositoryRoot]);
    execFileSync("git", ["-C", repositoryRoot, "config", "user.email", "runtime@test.invalid"]);
    execFileSync("git", ["-C", repositoryRoot, "config", "user.name", "Runtime Test"]);
    execFileSync("git", ["-C", repositoryRoot, "add", "."]);
    execFileSync("git", ["-C", repositoryRoot, "commit", "-qm", "fixture"]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(temp, { recursive: true, force: true });
  });

  function installer(options: Pick<RuntimeInstallerOptions, "dryRun" | "failpoint"> = {}): RuntimeInstaller {
    return new RuntimeInstaller({ repositoryRoot, platformRoots: { codex: targetRoot }, ...options });
  }

  async function writeBuild(files: Record<string, string>, platform = "codex"): Promise<void> {
    const buildRoot = path.join(repositoryRoot, "generated", "runtime-build", platform);
    await fs.rm(buildRoot, { recursive: true, force: true });
    await fs.mkdir(buildRoot, { recursive: true });
    const entries = Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([relative, content]) => ({ path: relative, sha256: sha256(content) }));
    for (const [relative, content] of Object.entries(files)) {
      const filePath = path.join(buildRoot, ...relative.split("/"));
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
    }
    await fs.writeFile(path.join(buildRoot, "manifest.json"), `${JSON.stringify({ version: 1, platform, files: entries }, null, 2)}\n`);
  }

  async function writeEffectivePlanIdentity(): Promise<string> {
    const canonical = JSON.stringify({ original_plan_sha256: sha256("fixture-plan"), approved_amendments: [] });
    const identity = sha256(canonical);
    const ledgerPath = path.join(repositoryRoot, ".agent", "ledger", "fixture.json");
    await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
    await fs.writeFile(ledgerPath, `${JSON.stringify({
      effective_plan_identity: { sha256: identity, canonical_json_utf8: canonical },
    }, null, 2)}\n`);
    return identity;
  }

  async function writeLegacyRuntime(files: Record<string, string>): Promise<void> {
    await fs.mkdir(targetRoot, { recursive: true });
    const entries = Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([relative, content]) => ({ Path: relative, Sha256: sha256(content) }));
    for (const [relative, content] of Object.entries(files)) {
      const filePath = path.join(targetRoot, ...relative.split("/"));
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
    }
    await fs.writeFile(
      path.join(targetRoot, "agent-rules-manifest.json"),
      `${JSON.stringify({ version: 1, platform: "codex", files: entries }, null, 2)}\n`,
    );
  }

  it("cleanly installs a Git-bound, doctor-verifiable receipt without touching sibling files", async () => {
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, "user-settings.json"), "keep");

    const result = await installer().install("codex");
    const runtimePath = path.join(targetRoot, runtimeDirectory);
    const receipt = await verifyRuntimeReceipt(runtimePath, "codex");

    expect(result.receipt?.source.repositoryContext.gitHead).toMatch(/^[a-f0-9]{40}$/);
    expect(result.receipt?.source.repositoryContext.relation).toBe("context-only-not-artifact-attestation");
    expect(receipt.files.map((file) => file.path)).toEqual([".activation/AGENTS.md", "rules/base.md", "skills/example/SKILL.md"]);
    expect(await fs.readFile(path.join(targetRoot, "user-settings.json"), "utf8")).toBe("keep");
    expect(await fs.readFile(path.join(runtimePath, "rules", "base.md"), "utf8")).toBe("first\n");
    const hostEntrypoint = await fs.readFile(path.join(targetRoot, "AGENTS.md"), "utf8");
    expect(hostEntrypoint).toContain(`${runtimePath}/.activation/AGENTS.md`);
  });

  it("explicitly migrates only manifest-owned legacy files and can roll back exactly", async () => {
    await writeLegacyRuntime({
      "AGENTS.md": "legacy agents\n",
      "rules/legacy.md": "legacy rule\n",
      "skills/legacy/SKILL.md": "legacy skill\n",
    });
    await fs.writeFile(path.join(targetRoot, "config.toml"), "user setting\n");
    await fs.writeFile(path.join(targetRoot, "rules", "user.md"), "user rule\n");

    const migrated = await installer().migrateLegacy("codex");
    const migrationReceipt = JSON.parse(
      await fs.readFile(path.join(targetRoot, "agent-rules-legacy-migration-receipt.json"), "utf8"),
    );

    expect(migrated.migration?.fileCount).toBe(4);
    expect(migrationReceipt.schema).toBe("agent-rules/legacy-migration-receipt");
    expect(await fs.readFile(path.join(targetRoot, "config.toml"), "utf8")).toBe("user setting\n");
    expect(await fs.readFile(path.join(targetRoot, "rules", "user.md"), "utf8")).toBe("user rule\n");
    expect(await fs.readFile(path.join(migrationReceipt.archive, "AGENTS.md"), "utf8")).toBe("legacy agents\n");
    expect(await pathExists(path.join(migrationReceipt.archive, "rules", "user.md"))).toBe(false);
    await expect(verifyRuntimeReceipt(path.join(targetRoot, runtimeDirectory), "codex")).resolves.toBeDefined();

    await installer().rollback("codex");
    expect(await fs.readFile(path.join(targetRoot, "AGENTS.md"), "utf8")).toBe("legacy agents\n");
    expect(await fs.readFile(path.join(targetRoot, "rules", "legacy.md"), "utf8")).toBe("legacy rule\n");
    expect(await fs.readFile(path.join(targetRoot, "rules", "user.md"), "utf8")).toBe("user rule\n");
    expect(await fs.readFile(path.join(targetRoot, "config.toml"), "utf8")).toBe("user setting\n");
    expect(await pathExists(path.join(targetRoot, runtimeDirectory))).toBe(false);
    expect(await pathExists(migrationReceipt.archive)).toBe(false);
    expect(await pathExists(path.join(targetRoot, "agent-rules-legacy-migration-receipt.json"))).toBe(false);
  });

  it("validates legacy migration in dry-run mode without recovery or filesystem writes", async () => {
    await writeLegacyRuntime({
      "AGENTS.md": "legacy agents\n",
      "rules/legacy.md": "legacy rule\n",
    });
    await fs.writeFile(path.join(targetRoot, "unrelated.txt"), "keep\n");
    const before = (await fs.readdir(targetRoot)).sort();

    const result = await installer({ dryRun: true }).migrateLegacy("codex");

    expect(result.dryRun).toBe(true);
    expect((await fs.readdir(targetRoot)).sort()).toEqual(before);
    expect(await fs.readFile(path.join(targetRoot, "AGENTS.md"), "utf8")).toBe("legacy agents\n");
    expect(await fs.readFile(path.join(targetRoot, "unrelated.txt"), "utf8")).toBe("keep\n");
    expect(await pathExists(path.join(targetRoot, runtimeDirectory))).toBe(false);
  });

  it("rejects legacy drift before staging or overwriting anything", async () => {
    await writeLegacyRuntime({
      "AGENTS.md": "legacy agents\n",
      "rules/legacy.md": "legacy rule\n",
    });
    await fs.writeFile(path.join(targetRoot, "rules", "legacy.md"), "drifted\n");
    await fs.writeFile(path.join(targetRoot, "unrelated.txt"), "keep\n");

    await expect(installer().migrateLegacy("codex")).rejects.toThrow("Legacy runtime drift");

    expect(await fs.readFile(path.join(targetRoot, "AGENTS.md"), "utf8")).toBe("legacy agents\n");
    expect(await fs.readFile(path.join(targetRoot, "rules", "legacy.md"), "utf8")).toBe("drifted\n");
    expect(await fs.readFile(path.join(targetRoot, "unrelated.txt"), "utf8")).toBe("keep\n");
    expect(await pathExists(path.join(targetRoot, runtimeDirectory))).toBe(false);
    expect((await fs.readdir(targetRoot)).some((name) => name.startsWith(".agent-rules-legacy-archive-"))).toBe(false);
    expect(await pathExists(path.join(targetRoot, ".agent-rules-legacy-migration.json"))).toBe(false);
  });

  it("restores the complete legacy runtime when native installation validation fails", async () => {
    await writeLegacyRuntime({
      "AGENTS.md": "legacy agents\n",
      "rules/legacy.md": "legacy rule\n",
    });
    await fs.writeFile(path.join(targetRoot, "unrelated.txt"), "keep\n");
    await fs.rm(path.join(repositoryRoot, ".agent", "ledger"), { recursive: true });

    await expect(installer().migrateLegacy("codex")).rejects.toThrow("exactly one canonical");

    expect(await fs.readFile(path.join(targetRoot, "AGENTS.md"), "utf8")).toBe("legacy agents\n");
    expect(await fs.readFile(path.join(targetRoot, "rules", "legacy.md"), "utf8")).toBe("legacy rule\n");
    expect(await fs.readFile(path.join(targetRoot, "unrelated.txt"), "utf8")).toBe("keep\n");
    expect(await pathExists(path.join(targetRoot, "agent-rules-manifest.json"))).toBe(true);
    expect(await pathExists(path.join(targetRoot, runtimeDirectory))).toBe(false);
    expect((await fs.readdir(targetRoot)).some((name) => name.startsWith(".agent-rules-legacy-archive-"))).toBe(false);
    expect(await pathExists(path.join(targetRoot, ".agent-rules-legacy-migration.json"))).toBe(false);
  });

  it("recovers an interrupted legacy archive before retrying migration", async () => {
    await writeLegacyRuntime({
      "AGENTS.md": "legacy agents\n",
      "rules/legacy.md": "legacy rule\n",
    });
    await fs.writeFile(path.join(targetRoot, "unrelated.txt"), "keep\n");

    await expect(installer({ failpoint: "crash-migration-after-archive" }).migrateLegacy("codex"))
      .rejects.toThrow("Injected crash");
    expect(await pathExists(path.join(targetRoot, "AGENTS.md"))).toBe(false);
    expect(await pathExists(path.join(targetRoot, ".agent-rules-legacy-migration.json"))).toBe(true);

    const retried = await installer().migrateLegacy("codex");
    expect(retried.migration?.fileCount).toBe(3);
    expect(await fs.readFile(path.join(targetRoot, "unrelated.txt"), "utf8")).toBe("keep\n");
    expect(await pathExists(path.join(targetRoot, ".agent-rules-legacy-migration.json"))).toBe(false);
    await expect(verifyRuntimeReceipt(path.join(targetRoot, runtimeDirectory), "codex")).resolves.toBeDefined();
  });

  it("rejects a symlinked manifest-owned legacy path without mutation", async () => {
    await fs.mkdir(path.join(targetRoot, "rules"), { recursive: true });
    await fs.writeFile(path.join(targetRoot, "outside.md"), "legacy rule\n");
    try {
      await fs.symlink(path.join(targetRoot, "outside.md"), path.join(targetRoot, "rules", "legacy.md"));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    const agents = "legacy agents\n";
    await fs.writeFile(path.join(targetRoot, "AGENTS.md"), agents);
    await fs.writeFile(path.join(targetRoot, "agent-rules-manifest.json"), JSON.stringify({
      version: 1,
      platform: "codex",
      files: [
        { Path: "AGENTS.md", Sha256: sha256(agents) },
        { Path: "rules/legacy.md", Sha256: sha256("legacy rule\n") },
      ],
    }));

    await expect(installer().migrateLegacy("codex")).rejects.toThrow("symlinked source path");
    expect(await fs.readFile(path.join(targetRoot, "AGENTS.md"), "utf8")).toBe(agents);
    expect(await fs.readFile(path.join(targetRoot, "outside.md"), "utf8")).toBe("legacy rule\n");
    expect(await pathExists(path.join(targetRoot, runtimeDirectory))).toBe(false);
  });

  it("updates transactionally and rolls back to the prior owned receipt", async () => {
    await installer().install("codex");
    await writeBuild({ "rules/base.md": "second\n", "rules/new.md": "new\n" });

    const updated = await installer().install("codex", "update");
    const runtimePath = path.join(targetRoot, runtimeDirectory);
    expect(await fs.readFile(path.join(runtimePath, "rules", "base.md"), "utf8")).toBe("second\n");
    expect(updated.receipt?.files.map((file) => file.path)).toEqual([".activation/AGENTS.md", "rules/base.md", "rules/new.md"]);

    await installer().rollback("codex");
    expect(await fs.readFile(path.join(runtimePath, "rules", "base.md"), "utf8")).toBe("first\n");
    expect(await pathExists(path.join(runtimePath, "rules", "new.md"))).toBe(false);
  });

  it("restores the old runtime when a normal update fails after its backup rename", async () => {
    await installer().install("codex");
    await writeBuild({ "rules/base.md": "second\n" });

    await expect(installer({ failpoint: "after-backup" }).install("codex", "update")).rejects.toThrow("Injected failure");
    const runtimePath = path.join(targetRoot, runtimeDirectory);
    expect(await fs.readFile(path.join(runtimePath, "rules", "base.md"), "utf8")).toBe("first\n");
    expect(await pathExists(path.join(targetRoot, ".agent-rules-runtime.transaction.json"))).toBe(false);
  });

  it("recovers a durable crash journal before retrying an update", async () => {
    await installer().install("codex");
    await writeBuild({ "rules/base.md": "second\n" });

    await expect(installer({ failpoint: "crash-after-backup" }).install("codex", "update")).rejects.toThrow("Injected crash");
    expect(await pathExists(path.join(targetRoot, ".agent-rules-runtime.transaction.json"))).toBe(true);
    expect(await pathExists(path.join(targetRoot, runtimeDirectory))).toBe(false);

    await installer().install("codex", "update");
    expect(await fs.readFile(path.join(targetRoot, runtimeDirectory, "rules", "base.md"), "utf8")).toBe("second\n");
    expect(await pathExists(path.join(targetRoot, ".agent-rules-runtime.transaction.json"))).toBe(false);
  });

  it("repairs missing activation after a crash between runtime swap and activation", async () => {
    await expect(installer({ failpoint: "crash-after-swap-before-activation" }).install("codex")).rejects.toThrow("Injected crash");
    const runtimePath = path.join(targetRoot, runtimeDirectory);
    expect(await pathExists(runtimePath)).toBe(true);
    expect(await pathExists(path.join(targetRoot, "AGENTS.md"))).toBe(false);
    expect(await pathExists(path.join(targetRoot, ".agent-rules-runtime.transaction.json"))).toBe(true);

    const recovered = await installer().recover("codex");
    expect(recovered.receipt?.activation.kind).toBe("managed-file");
    expect(await fs.readFile(path.join(runtimePath, "rules", "base.md"), "utf8")).toBe("first\n");
    expect(await fs.readFile(path.join(targetRoot, "AGENTS.md"), "utf8")).toContain(`${runtimePath}/.activation/AGENTS.md`);
    expect(await pathExists(path.join(targetRoot, ".agent-rules-runtime.transaction.json"))).toBe(false);
  });

  it.each([
    ["crash-rollback-after-target-move", "second\n", "first\n"],
    ["crash-rollback-after-backed-up-journal", "first\n", "second\n"],
    ["crash-rollback-after-backup-restore", "first\n", "second\n"],
    ["crash-rollback-after-staging-backup", "first\n", "second\n"],
    ["crash-rollback-after-commit-journal", "first\n", "second\n"],
  ] as const)("recovers rollback crash boundary %s with exact trees", async (failpoint, expectedCurrent, expectedBackup) => {
    await installer().install("codex");
    await writeBuild({ "rules/base.md": "second\n" });
    await installer().install("codex", "update");

    await expect(installer({ failpoint }).rollback("codex")).rejects.toThrow("Injected crash");
    await installer().recover("codex");

    const runtimePath = path.join(targetRoot, runtimeDirectory);
    const rollbackPath = path.join(targetRoot, ".agent-rules-runtime.rollback");
    expect(await fs.readFile(path.join(runtimePath, "rules", "base.md"), "utf8")).toBe(expectedCurrent);
    expect(await fs.readFile(path.join(rollbackPath, "rules", "base.md"), "utf8")).toBe(expectedBackup);
    await expect(verifyRuntimeReceipt(runtimePath, "codex")).resolves.toBeDefined();
    expect(await pathExists(path.join(targetRoot, ".agent-rules-runtime.transaction.json"))).toBe(false);
  });

  it("rejects traversal paths before creating a target", async () => {
    const manifestPath = path.join(repositoryRoot, "generated", "runtime-build", "codex", "manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify({
      version: 1, platform: "codex", files: [{ path: "../escape", sha256: sha256("first\n") }],
    }));

    await expect(installer().install("codex")).rejects.toThrow("Unsafe manifest entry");
    expect(await pathExists(targetRoot)).toBe(false);
  });

  it("fails closed when the canonical effective-plan identity is unavailable or false", async () => {
    await fs.rm(path.join(repositoryRoot, ".agent", "ledger"), { recursive: true });
    await expect(installer().install("codex")).rejects.toThrow("exactly one canonical");
    expect(await pathExists(targetRoot)).toBe(false);

    await writeEffectivePlanIdentity();
    const ledgerPath = path.join(repositoryRoot, ".agent", "ledger", "fixture.json");
    const ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8"));
    ledger.effective_plan_identity.sha256 = "0".repeat(64);
    await fs.writeFile(ledgerPath, JSON.stringify(ledger));
    await expect(installer().install("codex")).rejects.toThrow("Unverified effective_plan_identity");
  });

  it("rejects a symlinked canonical ledger directory", async () => {
    const ledgerRoot = path.join(repositoryRoot, ".agent", "ledger");
    const realLedgerRoot = path.join(repositoryRoot, ".agent", "real-ledger");
    await fs.rename(ledgerRoot, realLedgerRoot);
    await fs.symlink(realLedgerRoot, ledgerRoot, "dir");

    await expect(installer().install("codex")).rejects.toThrow("Refusing linked");
    expect(await pathExists(targetRoot)).toBe(false);
  });

  it("binds mutable build bytes as an artifact without claiming they are Git HEAD", async () => {
    const first = await installer().install("codex");
    await writeBuild({ "rules/base.md": "dirty-after-head\n" });
    const secondRoot = path.join(temp, "artifact-second");
    const second = await new RuntimeInstaller({ repositoryRoot, platformRoots: { codex: secondRoot } }).install("codex");

    expect(second.receipt?.source.repositoryContext.gitHead).toBe(first.receipt?.source.repositoryContext.gitHead);
    expect(second.receipt?.source.artifactSha256).not.toBe(first.receipt?.source.artifactSha256);
    expect(second.receipt?.source.repositoryContext.relation).toBe("context-only-not-artifact-attestation");
  });

  it("rejects symlinked build inputs", async () => {
    const buildRoot = path.join(repositoryRoot, "generated", "runtime-build", "codex");
    await fs.rm(buildRoot, { recursive: true, force: true });
    await fs.mkdir(buildRoot, { recursive: true });
    await fs.writeFile(path.join(repositoryRoot, "outside.md"), "outside\n");
    try {
      await fs.symlink(path.join(repositoryRoot, "outside.md"), path.join(buildRoot, "linked.md"));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    await fs.writeFile(path.join(buildRoot, "manifest.json"), JSON.stringify({
      version: 1, platform: "codex", files: [{ path: "linked.md", sha256: sha256("outside\n") }],
    }));

    await expect(installer().install("codex")).rejects.toThrow("symlinked source path");
  });

  it("will not overwrite or uninstall an unowned runtime directory", async () => {
    const runtimePath = path.join(targetRoot, runtimeDirectory);
    await fs.mkdir(runtimePath, { recursive: true });
    await fs.writeFile(path.join(runtimePath, "private.txt"), "do not delete");

    await expect(installer().install("codex")).rejects.toThrow("Runtime already exists");
    await expect(installer().uninstall("codex")).rejects.toThrow("unowned runtime directory");
    expect(await fs.readFile(path.join(runtimePath, "private.txt"), "utf8")).toBe("do not delete");
  });

  it("does not delete a later unowned file from an otherwise valid runtime", async () => {
    await installer().install("codex");
    const runtimePath = path.join(targetRoot, runtimeDirectory);
    await fs.writeFile(path.join(runtimePath, "later-user-file.txt"), "preserve me");

    await expect(installer().uninstall("codex")).rejects.toThrow("unowned file");
    expect(await fs.readFile(path.join(runtimePath, "later-user-file.txt"), "utf8")).toBe("preserve me");
  });

  it("rejects structurally incomplete receipt authority fields", async () => {
    await installer().install("codex");
    const receiptPath = path.join(targetRoot, runtimeDirectory, "agent-rules-runtime-receipt.json");
    const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    receipt.source.repositoryContext.relation = "attests-head";
    receipt.activation.sha256 = "../not-a-hash";
    await fs.writeFile(receiptPath, JSON.stringify(receipt));

    await expect(verifyRuntimeReceipt(path.join(targetRoot, runtimeDirectory), "codex")).rejects.toThrow("unowned runtime directory");
  });

  it("rejects forged recovery journals without deleting roots, arbitrary subdirectories, or linked paths", async () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const cases: Array<{ name: string; mutate: (root: string, journal: Record<string, unknown>, victim: string) => Promise<void> | void }> = [
      { name: "root staging equality", mutate: (root, journal) => { journal.staging = root; } },
      { name: "arbitrary staging directory", mutate: (_root, journal, victim) => { journal.staging = victim; } },
      { name: "arbitrary backup", mutate: (_root, journal, victim) => { journal.backup = victim; } },
      { name: "invalid operation", mutate: (_root, journal) => { journal.operation = "erase"; } },
      { name: "invalid platform", mutate: (_root, journal) => { journal.platform = "opencode"; } },
      {
        name: "linked reserved staging",
        mutate: async (root, journal, victim) => {
          const linked = path.join(root, `.agent-rules-runtime.stage-${uuid}`);
          await fs.symlink(victim, linked, "dir");
          journal.staging = linked;
        },
      },
    ];

    for (const testCase of cases) {
      const root = path.join(temp, `forged-${testCase.name.replace(/\W+/g, "-")}`);
      const victim = path.join(root, "user-data");
      await fs.mkdir(victim, { recursive: true });
      await fs.writeFile(path.join(victim, "keep.txt"), "keep");
      const journal: Record<string, unknown> = {
        schema: "agent-rules/runtime-transaction",
        version: 1,
        operation: "install",
        phase: "prepared",
        platform: "codex",
        target: path.join(root, runtimeDirectory),
        staging: path.join(root, `.agent-rules-runtime.stage-${uuid}`),
        backup: path.join(root, ".agent-rules-runtime.rollback"),
        expectedPlanSha256: "a".repeat(64),
        expectedArtifactSha256: "b".repeat(64),
      };
      await testCase.mutate(root, journal, victim);
      await fs.writeFile(path.join(root, ".agent-rules-runtime.transaction.json"), JSON.stringify(journal));
      const forged = new RuntimeInstaller({ repositoryRoot, platformRoots: { codex: root } });

      await expect(forged.uninstall("codex"), testCase.name).rejects.toThrow(/unsafe transaction|linked recovery/);
      expect(await fs.readFile(path.join(victim, "keep.txt"), "utf8"), testCase.name).toBe("keep");
      expect(await pathExists(root), testCase.name).toBe(true);
    }
  });

  it("materializes the platform-specific host discovery entrypoint", async () => {
    for (const platform of ["grok", "antigravity", "cursor"] as const) {
      await writeBuild({ "rules/base.md": `${platform}\n` }, platform);
      const root = platform === "antigravity"
        ? path.join(temp, "hosts", platform, "config")
        : path.join(temp, "hosts", platform);
      const result = await new RuntimeInstaller({ repositoryRoot, platformRoots: { [platform]: root } }).install(platform);
      const runtimeRules = path.join(result.runtimePath, "rules");
      if (platform === "antigravity") {
        const entrypoint = await fs.readFile(path.join(path.dirname(root), "GEMINI.md"), "utf8");
        expect(entrypoint).toContain(`${result.runtimePath}/.activation/GEMINI.md`);
      } else {
        const entrypoint = platform === "grok" ? path.join(root, ".grok", "rules") : path.join(root, "rules");
        expect(await fs.realpath(entrypoint)).toBe(await fs.realpath(runtimeRules));
      }
    }
  });

  it("requires Windows file durability while tolerating unsupported directory flush", async () => {
    const error = Object.assign(new Error("denied"), { code: "EPERM" });
    const open = vi.spyOn(fs, "open").mockRejectedValue(error);
    await expect(fsyncRegularFile("payload", "win32")).rejects.toMatchObject({ code: "EPERM" });
    await expect(fsyncDirectory("directory")).resolves.toBeUndefined();
    expect(open).toHaveBeenNthCalledWith(1, "payload", "r+");
    expect(open).toHaveBeenNthCalledWith(2, "directory", "r");
  });

  it("is deterministic across targets and dry-run never creates a root", async () => {
    const secondRoot = path.join(temp, "second-target");
    const dryRoot = path.join(temp, "dry-target");
    const first = await installer().install("codex");
    const second = await new RuntimeInstaller({ repositoryRoot, platformRoots: { codex: secondRoot } }).install("codex");
    const dry = await new RuntimeInstaller({ repositoryRoot, platformRoots: { codex: dryRoot }, dryRun: true }).install("codex");

    expect(second.receipt?.source).toEqual(first.receipt?.source);
    expect(second.receipt?.files.filter((file) => !file.path.startsWith(".activation/")))
      .toEqual(first.receipt?.files.filter((file) => !file.path.startsWith(".activation/")));
    expect(dry.receipt?.source).toEqual(first.receipt?.source);
    expect(await pathExists(dryRoot)).toBe(false);
  });
});
