#!/usr/bin/env node

import { Command } from "commander";
import { ExitCode, type CliOptions } from "./types.js";
import { build } from "./commands/build.js";
import { validate } from "./commands/validate.js";
import { verifyMirrors } from "./commands/verify-mirrors.js";
import { installCmd } from "./commands/install.js";
import { doctor } from "./commands/doctor.js";
import { syncCmd } from "./commands/sync.js";
import { profileCmd } from "./commands/profile.js";
import { platformCmd } from "./commands/platform.js";
import { evalCmd } from "./commands/eval.js";
import { dashboard } from "./commands/dashboard.js";
import { contextGraphCmd } from "./commands/context-graph.js";
import { planCmd } from "./commands/plan.js";
import { verifyCmd } from "./commands/verify.js";
import { runtimeCmd } from "./commands/runtime.js";
import { modelsCmd } from "./commands/models.js";
import { skillsCmd } from "./commands/skills.js";
import {
  executeRun,
  getRunStatus,
  resumeRun,
  cancelRunById,
} from "./services/runner.js";

const program = new Command();

program
  .name("agent-rules")
  .description("Cross-platform CLI control plane for Agent Rules harness")
  .version("0.1.0")
  .option("--json", "Output in JSON format")
  .option("--dry-run", "Show what would be done without executing")
  .option("-v, --verbose", "Verbose output")
  .hook("preAction", (thisCommand, actionCommand) => {
    const options = actionCommand.optsWithGlobals();
  });

// ── build ──────────────────────────────────────────────────────────
program
  .command("build")
  .description("Build the harness runtime (migrated from 01-build-runtime.ps1)")
  .argument("[root]", "Repository root path")
  .action(async (root: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await build(root ? [root] : [], opts);
    formatOutput(result, opts);
  });

program
  .command("context-graph")
  .description("Build the canonical context graph")
  .argument("<subcommand>", "Subcommand: build")
  .argument("[output]", "Output JSON path")
  .action(async (subcommand: string, output: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    formatOutput(await contextGraphCmd(output ? [subcommand, output] : [subcommand], opts), opts);
  });

// ── validate ───────────────────────────────────────────────────────
program
  .command("validate")
  .description(
    "Run context validation and schema tests (migrated from 03-validate-context.ps1)"
  )
  .action(async () => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await validate([], opts);
    formatOutput(result, opts);
  });

// ── verify-mirrors ────────────────────────────────────────────────
program
  .command("verify-mirrors")
  .description(
    "Verify skills/rules mirror parity across platform builds (migrated from 04-verify-mirrors.ps1)"
  )
  .action(async () => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await verifyMirrors([], opts);
    formatOutput(result, opts);
  });

// ── install ────────────────────────────────────────────────────────
program
  .command("install")
  .description(
    "Install harness to platform runtimes (legacy: 02-install-runtime.ps1)"
  )
  .argument("[platform]", "Platform: codex, grok, antigravity, cursor, all", "all")
  .action(async (platform: string) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await installCmd([platform], opts);
    formatOutput(result, opts);
  });

// ── doctor ─────────────────────────────────────────────────────────
program
  .command("doctor")
  .description("Run harness health checks (migrated from 09-doctor.ps1)")
  .argument("[platform]", "Platform: codex, grok, antigravity, cursor, all", "all")
  .option("--skip-integration-verify", "Skip external MCP integration verification")
  .action(async (platform: string, cmdOpts: { skipIntegrationVerify?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const extraArgs = [platform];
    if (cmdOpts.skipIntegrationVerify) extraArgs.push("--skip-integration-verify");
    const result = await doctor(extraArgs, opts);
    formatOutput(result, opts);
  });

// ── sync ───────────────────────────────────────────────────────────
program
  .command("sync")
  .description(
    "Build, install, and verify mirrors (legacy: 01-build + 02-install + 04-verify-mirrors)"
  )
  .argument("[platform]", "Platform: codex, grok, antigravity, cursor, all", "all")
  .action(async (platform: string) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await syncCmd([platform], opts);
    formatOutput(result, opts);
  });

// ── profile ────────────────────────────────────────────────────────
program
  .command("profile")
  .description("Manage installation profiles")
  .argument("[subcommand]", "Subcommand: list, show <name>, apply <name>")
  .addHelpText(
    "after",
    `
Subcommands:
  list              List available profiles
  show <name>       Show profile details
  apply <name>      Apply a profile to a project
    `
  )
  .action(async (subcommand: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = program.args;
    const subArgs = subcommand ? [subcommand, ...args.slice(args.indexOf(subcommand) + 1)] : [];
    const result = await profileCmd(subArgs, opts);
    formatOutput(result, opts);
  });

// ── platform ───────────────────────────────────────────────────────
program
  .command("platform")
  .description("Inspect platform contracts and overlays")
  .argument("[subcommand]", "Subcommand: list, show <name>")
  .addHelpText(
    "after",
    `
Subcommands:
  list              List configured platforms
  show <name>       Show platform details
    `
  )
  .action(async (subcommand: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = program.args;
    const subArgs = subcommand ? [subcommand, ...args.slice(args.indexOf(subcommand) + 1)] : [];
    const result = await platformCmd(subArgs, opts);
    formatOutput(result, opts);
  });

// ── eval ───────────────────────────────────────────────────────────
program
  .command("eval")
  .description("Run benchmarks and evaluations (not yet migrated)")
  .argument("[subcommand]", "Subcommand: list, run [suite], results")
  .addHelpText(
    "after",
    `
Subcommands:
  list              List available benchmark suites
  run [suite]       Run a benchmark suite
  results           Show benchmark results
    `
  )
  .action(async (subcommand: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = program.args;
    const subArgs = subcommand ? [subcommand, ...args.slice(args.indexOf(subcommand) + 1)] : [];
    const result = await evalCmd(subArgs, opts);
    formatOutput(result, opts);
  });

// ── plan ────────────────────────────────────────────────────────────
program
  .command("plan")
  .description("Manage execution plans")
  .argument("[subcommand]", "Subcommand: inventory, adopt, status, checkpoint, lineage, reconcile, repair, export, finalize")
  .addHelpText(
    "after",
    `
Subcommands:
  inventory                    List all plans/runs
  adopt <planPath>             Adopt a plan artifact
  status <runId>               Show plan execution status
  checkpoint <runId>           Persist a checkpoint snapshot
  lineage <runId>              Show plan artifact lineage
  reconcile <runId>            Reconcile requirements against tasks
  repair <runId>               Reset failed tasks to PENDING
  export <runId> <outputPath>  Export plan bundle
  finalize <runId>             Finalize a completed plan
    `
  )
  .action(async (subcommand: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = program.args;
    const subArgs = subcommand ? [subcommand, ...args.slice(args.indexOf(subcommand) + 1)] : [];
    const result = await planCmd(subArgs, opts);
    formatOutput(result, opts);
  });

// ── verify ──────────────────────────────────────────────────────────
program
  .command("verify")
  .description("Run validation and mirror verification")
  .argument("[path]", "Repository root path")
  .action(async (pathArg: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await verifyCmd(pathArg ? [pathArg] : [], opts);
    formatOutput(result, opts);
  });

// ── runtime ─────────────────────────────────────────────────────────
program
  .command("runtime")
  .description("Manage harness runtime installations")
  .argument("[subcommand]", "Subcommand: install, update, rollback, uninstall")
  .argument("[platform]", "Platform: codex, grok, antigravity, cursor, all", "all")
  .option("--root <absolute>", "Override the selected platform root (single platform only)")
  .option("--migrate-legacy", "Explicitly migrate a manifest-owned legacy runtime (single platform only)")
  .addHelpText(
    "after",
    `
Subcommands:
  install [platform]     Install runtime to platform (default: all)
  update [platform]      Update runtime on platform
  rollback [platform]    Rollback runtime on platform
  uninstall [platform]   Uninstall runtime from platform
    `
  )
  .action(async (subcommand: string | undefined, platform: string, cmdOpts: { root?: string; migrateLegacy?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const subArgs = subcommand ? [subcommand, platform] : [];
    if (cmdOpts.root) subArgs.push("--root", cmdOpts.root);
    if (cmdOpts.migrateLegacy) subArgs.push("--migrate-legacy");
    const result = await runtimeCmd(subArgs, opts);
    formatOutput(result, opts);
  });

// ── models ───────────────────────────────────────────────────────────
program
  .command("models")
  .description("Manage model catalog")
  .argument("[subcommand]", "Subcommand: refresh")
  .addHelpText(
    "after",
    `
Subcommands:
  refresh         Refresh the model catalog
    `
  )
  .action(async (subcommand: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = program.args;
    const subArgs = subcommand ? [subcommand, ...args.slice(args.indexOf(subcommand) + 1)] : [];
    const result = await modelsCmd(subArgs, opts);
    formatOutput(result, opts);
  });

// ── skills ──────────────────────────────────────────────────────────
program
  .command("skills")
  .description("Manage skill capabilities")
  .argument("[subcommand]", "Subcommand: doctor")
  .addHelpText(
    "after",
    `
Subcommands:
  doctor          Audit skill manifests and references
    `
  )
  .action(async (subcommand: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = program.args;
    const subArgs = subcommand ? [subcommand, ...args.slice(args.indexOf(subcommand) + 1)] : [];
    const result = await skillsCmd(subArgs, opts);
    formatOutput(result, opts);
  });

// ── run ────────────────────────────────────────────────────────────
program
  .command("run")
  .description("Execute a natural-language request through the harness")
  .argument("<request>", "Natural language request to execute")
  .option("--project <path>", "Project root directory")
  .option("--profile <name>", "Profile name")
  .option("--platform <name>", "Target platform")
  .option("--dry-run", "Compile and validate without executing")
  .option("--autonomy <level>", "Autonomy level (0-10)", "5")
  .action(async (request: string, cmdOpts: Record<string, string | undefined>) => {
    const opts = program.optsWithGlobals() as CliOptions;
    try {
      const result = await executeRun(request, {
        project: cmdOpts.project,
        profile: cmdOpts.profile,
        platform: cmdOpts.platform,
        dryRun: cmdOpts.dryRun === "true" || cmdOpts.dryRun === "" || opts.dryRun,
        autonomy: cmdOpts.autonomy ? parseInt(cmdOpts.autonomy, 10) : undefined,
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        console.log(`Run ${result.runId} [${result.state}]`);
        console.log(`  Tasks: ${(result.tasks as { taskId: string; state: string }[]).length}`);
        console.log(`  Receipts: ${result.receipts.length}`);
      }
      process.exit(ExitCode.Success);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (opts.json) {
        process.stdout.write(JSON.stringify({ exitCode: ExitCode.GeneralError, message }) + "\n");
      } else {
        console.error(`Error: ${message}`);
      }
      process.exit(ExitCode.GeneralError);
    }
  });

// ── status ──────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show run status")
  .argument("<runId>", "Run ID to inspect")
  .action(async (runId: string) => {
    const opts = program.optsWithGlobals() as CliOptions;
    try {
      const result = await getRunStatus(runId);
      if (!result) {
        const msg = `Run not found: ${runId}`;
        if (opts.json) {
          process.stdout.write(JSON.stringify({ exitCode: ExitCode.GeneralError, message: msg }) + "\n");
        } else {
          console.error(msg);
        }
        process.exit(ExitCode.GeneralError);
      }
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        console.log(`Run:      ${result.runId}`);
        console.log(`State:    ${result.state}`);
        console.log(`Created:  ${result.createdAt}`);
        console.log(`Updated:  ${result.updatedAt}`);
        console.log(`Receipts: ${result.receipts.length}`);
        const tasks = result.tasks as { taskId: string; state: string }[];
        console.log(`Tasks:`);
        for (const t of tasks) {
          console.log(`  ${t.taskId}: ${t.state}`);
        }
      }
      process.exit(ExitCode.Success);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(ExitCode.GeneralError);
    }
  });

// ── resume ──────────────────────────────────────────────────────────
program
  .command("resume")
  .description("Resume a previously interrupted run")
  .argument("<runId>", "Run ID to resume")
  .option("--project <path>", "Project root directory")
  .action(async (runId: string, cmdOpts: Record<string, string | undefined>) => {
    const opts = program.optsWithGlobals() as CliOptions;
    try {
      const result = await resumeRun(runId, { project: cmdOpts.project });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        console.log(`Run ${result.runId} resumed — state: ${result.state}`);
        console.log(`  Receipts: ${result.receipts.length}`);
      }
      process.exit(ExitCode.Success);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(ExitCode.GeneralError);
    }
  });

// ── cancel ──────────────────────────────────────────────────────────
program
  .command("cancel")
  .description("Cancel a run and mark pending tasks as cancelled")
  .argument("<runId>", "Run ID to cancel")
  .action(async (runId: string) => {
    const opts = program.optsWithGlobals() as CliOptions;
    try {
      const result = await cancelRunById(runId);
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        console.log(`Run ${result.runId} cancelled`);
        const tasks = result.tasks as { taskId: string; state: string }[];
        for (const t of tasks) {
          console.log(`  ${t.taskId}: ${t.state}`);
        }
      }
      process.exit(ExitCode.Success);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(ExitCode.GeneralError);
    }
  });

function formatOutput(
  result: { exitCode: ExitCode; message: string; data?: Record<string, unknown> },
  options: CliOptions
): void {
  if (options.json) {
    // Only output the structured result; handlers must not emit prior JSON
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (result.exitCode !== ExitCode.Success) {
    console.error(`Error: ${result.message}`);
  }
  process.exit(result.exitCode);
}

await program.parseAsync(process.argv);
