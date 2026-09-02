#!/usr/bin/env node

import { Command } from "commander";
import { ExitCode, type CliOptions } from "./types.js";
import { installCmd } from "./commands/install.js";
import { updateCmd } from "./commands/update.js";
import { rollbackCmd } from "./commands/rollback.js";
import { collectLiveHealth } from "./runtime/health-coordinator.js";
import { uninstallCmd } from "./commands/uninstall.js";
import { integrationCmd } from "./commands/integration.js";
import { handleRouteNativeCommand } from "./commands/route-native.js";
import { readReference, searchReferences } from "./commands/reference.js";
import { taskCommand } from "./commands/task.js";
import { configureHostRegistryRoot } from "@initforge/agent-rules-kernel/northstar/host-registry.js";
import { resolveRuntimeAssetsRoot } from "./runtime/locator.js";

configureHostRegistryRoot(resolveRuntimeAssetsRoot());

const program = new Command();

program
  .name("agent-rules")
  .description("Agent Rules — cross-platform harness for AI coding assistants")
  .version("2.0.0")
  .option("--json", "Output in JSON format")
  .option("--dry-run", "Show what would be done without executing")
  .option("-v, --verbose", "Verbose output");

const collectValue = (value: string, previous: string[] = []): string[] => [...previous, value];

function formatOutput(
  result: { exitCode: ExitCode; message: string; data?: Record<string, unknown> },
  options: CliOptions
): void {
  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (result.exitCode === ExitCode.Success) {
    console.log(result.message);
  } else {
    console.error(`Error: ${result.message}`);
  }
  process.exit(result.exitCode);
}

// 1. install
program
  .command("install")
  .description("Install static agent-rules capability for one or all hosts")
  .argument("[platform]", "Platform name (e.g. codex, claude, grok, opencode, antigravity, cursor, deepseek-harness, command-code, omp, all)")
  .option("--host <id>", "Target host (repeatable)", collectValue, [])
  .option("--all", "Install all 9 supported native hosts")
  .option("--no-integrations", "Install rules and skills without registering standard MCP integrations")
  .option("--profile <id>", "Materialize an explicit profile (repeatable)", collectValue, [])
  .option("--dry-run", "Show what would be done without executing")
  .action(async (platformArg: string | undefined, cmdOpts: { host: string[]; all?: boolean; dryRun?: boolean; integrations?: boolean; profile?: string[] }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    if (cmdOpts.dryRun) opts.dryRun = true;
    const targets = cmdOpts.all
      ? ["all"]
      : cmdOpts.host && cmdOpts.host.length > 0
      ? cmdOpts.host
      : platformArg
      ? [platformArg]
      : ["all"];
    const args = [...targets, ...(cmdOpts.integrations === false ? ["--no-integrations"] : [])];
    const result = await installCmd(args, opts, { profiles: cmdOpts.profile ?? [] });
    formatOutput(result, opts);
  });

// 2. update
program
  .command("update")
  .description("Update already-installed hosts to the current static candidate")
  .argument("[platform]", "Host name or all")
  .option("--host <id>", "Target host (repeatable)", collectValue, [])
  .option("--all", "Update all installed hosts")
  .option("--profile <id>", "Replace the selected profile set (repeatable); omit to preserve it", collectValue)
  .option("--clear-profiles", "Remove all previously selected profiles")
  .option("--no-integrations", "Update static rules and skills without changing MCP registrations")
  .option("--dry-run", "Preview without writing")
  .action(async (platformArg: string | undefined, cmdOpts: { host: string[]; all?: boolean; dryRun?: boolean; integrations?: boolean; profile?: string[]; clearProfiles?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    if (cmdOpts.dryRun) opts.dryRun = true;
    if (cmdOpts.clearProfiles && cmdOpts.profile?.length) {
      formatOutput({ exitCode: ExitCode.InvalidArgument, message: "Use either --profile or --clear-profiles, not both." }, opts);
      return;
    }
    const targets = cmdOpts.all ? ["all"] : cmdOpts.host?.length ? cmdOpts.host : platformArg ? [platformArg] : ["all"];
    const args = [...targets, ...(cmdOpts.integrations === false ? ["--no-integrations"] : [])];
    const result = await updateCmd(args, opts, cmdOpts.clearProfiles ? [] : cmdOpts.profile);
    formatOutput(result, opts);
  });

// 3. rollback
program
  .command("rollback")
  .description("Restore the previous agent-rules-owned generation")
  .argument("[platform]", "Host name or all")
  .option("--host <id>", "Target host (repeatable)", collectValue, [])
  .option("--all", "Rollback all hosts with an available generation")
  .option("--dry-run", "Preview without writing")
  .action(async (platformArg: string | undefined, cmdOpts: { host: string[]; all?: boolean; dryRun?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    if (cmdOpts.dryRun) opts.dryRun = true;
    const targets = cmdOpts.all ? ["all"] : cmdOpts.host?.length ? cmdOpts.host : platformArg ? [platformArg] : [];
    formatOutput(await rollbackCmd(targets, opts), opts);
  });

// 4. uninstall
program
  .command("uninstall")
  .description("Remove agent-rules-owned static capability from one or all hosts")
  .argument("[platform]", "Platform name (e.g. codex, claude, grok, opencode, antigravity, cursor, deepseek-harness, command-code, omp, all)")
  .option("--host <id>", "Target host (repeatable)", collectValue, [])
  .option("--all", "Uninstall all 9 supported native hosts")
  .option("--dry-run", "Show what would be done without executing")
  .action(async (platformArg: string | undefined, cmdOpts: { host: string[]; all?: boolean; dryRun?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    if (cmdOpts.dryRun) opts.dryRun = true;
    const targets = cmdOpts.all
      ? ["all"]
      : cmdOpts.host && cmdOpts.host.length > 0
      ? cmdOpts.host
      : platformArg
      ? [platformArg]
      : ["all"];
    const result = await uninstallCmd(targets, opts);
    formatOutput(result, opts);
  });

// 5. doctor
program
  .command("doctor")
  .description("Run platform diagnostics and doctor checks")
  .argument("[platform]", "Platform name (e.g. codex, claude, grok, opencode, antigravity, cursor, deepseek-harness, command-code, omp, all)")
  .option("--host <id>", "Target host (repeatable)", collectValue, [])
  .option("--all", "Run every live health probe")
  .action(async (platformArg: string | undefined, cmdOpts: { host: string[]; all?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const target = cmdOpts.all ? "all" : cmdOpts.host?.[0] ?? platformArg ?? "all";
    const health = await collectLiveHealth(process.cwd(), target);
    formatOutput({ exitCode: health.status === "HEALTHY" ? ExitCode.Success : ExitCode.LegacyFailed, message: `Live health: ${health.status}`, data: health as unknown as Record<string, unknown> }, opts);
  });

// 6. status
program
  .command("status")
  .description("Show current host health")
  .option("--host <id>", "Host id filter")
  .action(async (cmdOpts: { host?: string }) => {
    try {
      const opts = program.optsWithGlobals() as CliOptions;
      const health = await collectLiveHealth(process.cwd(), cmdOpts.host ?? "all");
      formatOutput({ exitCode: health.status === "HEALTHY" ? ExitCode.Success : ExitCode.LegacyFailed, message: `Host health: ${health.status}`, data: health as unknown as Record<string, unknown> }, opts);
    } catch (error) {
      formatOutput({ exitCode: ExitCode.GeneralError, message: error instanceof Error ? error.message : String(error) }, program.optsWithGlobals() as CliOptions);
    }
  });

// 7. integration
program
  .command("integration")
  .description("Integration commands (list, enable, disable, doctor)")
  .argument("<action>", "Action: list | enable | disable | doctor")
  .argument("[integration]", "Integration ID or 'all' (default: all)")
  .action(async (action: string, integration: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = [action, integration ?? "all"];
    const result = await integrationCmd(args, opts);
    formatOutput(result, opts);
  });

// 8. reference
program
  .command("reference")
  .description("Read or search a verified domain-pack reference without copying it into the project")
  .argument("<pack>", "Explicit domain pack id, for example 5fedu")
  .argument("[path]", "Manifest-bound reference path inside the bundled source")
  .option("--search <query>", "Search verified central domain-pack source and return code pointers")
  .option("--limit <n>", "Maximum search matches (1-100)", "20")
  .option("--component <value>", "Component/behavior this reference is used for (defaults to the first two path segments)")
  .option("--behavior <value>", "Alias for --component")
  .option("--anchor <value>", "Source anchor within the reference file")
  .action(async (pack: string, relativePath: string | undefined, cmdOpts: { search?: string; limit?: string; component?: string; behavior?: string; anchor?: string }) => {
    try {
      const opts = program.optsWithGlobals() as CliOptions;
      if (cmdOpts.search) {
        const limit = Number(cmdOpts.limit ?? 20);
        const result = searchReferences(process.cwd(), pack, cmdOpts.search, limit);
        if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        else for (const match of result) process.stdout.write(`${match.path}:${match.line} [${match.sha256.slice(0, 12)}] ${match.text}\n`);
        return;
      }
      if (!relativePath) {
        throw new Error("Missing required reference path argument");
      }
      const result = readReference(process.cwd(), pack, relativePath, {
        component: cmdOpts.component,
        behavior: cmdOpts.behavior,
        anchor: cmdOpts.anchor,
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(result.content);
        if (!result.content.endsWith("\n")) process.stdout.write("\n");
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = ExitCode.GeneralError;
    }
  });

// 9. task
program
  .command("task")
  .description("Manage the current project-local Agent Rules task state")
  .argument("<action>", "Action: start | status | update | rehydrate | export | close")
  .option("--stdin", "Read start/update JSON from stdin")
  .option("--task-id <id>", "Exact current task id required for close")
  .option("--host <id>", "Host contract used for repository-local task skill projection")
  .action(async (action: string, cmdOpts: { stdin?: boolean; taskId?: string; host?: string }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    formatOutput(taskCommand(action, cmdOpts), opts);
  });

// 10. route-native
program
  .command("route-native")
  .description("Route one native model turn via canonical SkillResolver / CapabilityBroker (REQ-005)")
  .option("--stdin", "Read NativeTurnRequest JSON from stdin")
  .action(async (cmdOpts: { stdin?: boolean }) => {
    await handleRouteNativeCommand(cmdOpts);
  });

await program.parseAsync(process.argv);
