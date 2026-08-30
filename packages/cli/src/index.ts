#!/usr/bin/env node

import { Command } from "commander";
import { ExitCode, type CliOptions } from "./types.js";
import { installCmd } from "./commands/install.js";
import { collectLiveHealth } from "./runtime/health-coordinator.js";
import { uninstallCmd } from "./commands/uninstall.js";
import { integrationCmd } from "./commands/integration.js";
import { handleRouteNativeCommand } from "./commands/route-native.js";
import { readReference, searchReferences } from "./commands/reference.js";
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
  .description("Install agent-rules native runtime for one or all platforms")
  .argument("[platform]", "Platform name (e.g. codex, claude, grok, opencode, antigravity, cursor, deepseek-harness, command-code, omp, all)")
  .option("--host <id>", "Target host (repeatable)", collectValue, [])
  .option("--all", "Install all 9 supported native hosts")
  .option("--no-integrations", "Install rules, skills and runtime without registering standard MCP integrations")
  .option("--dry-run", "Show what would be done without executing")
  .action(async (platformArg: string | undefined, cmdOpts: { host: string[]; all?: boolean; dryRun?: boolean; integrations?: boolean }) => {
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
    const result = await installCmd(args, opts);
    formatOutput(result, opts);
  });

// 2. uninstall
program
  .command("uninstall")
  .description("Uninstall agent-rules native runtime for one or all platforms")
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

// 3. doctor
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

// 4. status
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

// 5. integration
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

// 6. reference
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

// 9. route-native
program
  .command("route-native")
  .description("Route one native model turn via canonical SkillResolver / CapabilityBroker (REQ-005)")
  .option("--stdin", "Read NativeTurnRequest JSON from stdin")
  .action(async (cmdOpts: { stdin?: boolean }) => {
    await handleRouteNativeCommand(cmdOpts);
  });

await program.parseAsync(process.argv);
