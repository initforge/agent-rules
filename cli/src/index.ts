#!/usr/bin/env node

import { Command } from "commander";
import { ExitCode, type CliOptions } from "./types.js";
import { build } from "./commands/build.js";
import { validate } from "./commands/validate.js";
import { installCmd } from "./commands/install.js";
import { doctor } from "./commands/doctor.js";
import { syncCmd } from "./commands/sync.js";
import { profileCmd } from "./commands/profile.js";
import { platformCmd } from "./commands/platform.js";
import { evalCmd } from "./commands/eval.js";
import { dashboard } from "./commands/dashboard.js";

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
  .description("Build the harness runtime (legacy: 01-build-runtime.ps1)")
  .argument("[root]", "Repository root path")
  .action(async (root: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await build(root ? [root] : [], opts);
    formatOutput(result, opts);
  });

// ── validate ───────────────────────────────────────────────────────
program
  .command("validate")
  .description(
    "Run context validation and schema tests (legacy: 03-validate-context.ps1 + test-artifact-schemas.py)"
  )
  .action(async () => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await validate([], opts);
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
  .description("Run harness health checks (legacy: 09-doctor.ps1)")
  .argument("[platform]", "Platform: codex, grok, antigravity, cursor, all", "all")
  .action(async (platform: string) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await doctor([platform], opts);
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

// ── dashboard ──────────────────────────────────────────────────────
program
  .command("dashboard")
  .description("Start web dashboard (not yet implemented)")
  .action(async () => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await dashboard([], opts);
    formatOutput(result, opts);
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
