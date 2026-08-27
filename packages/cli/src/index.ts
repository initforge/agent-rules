#!/usr/bin/env node

import { Command } from "commander";
import { ExitCode, type CliOptions } from "./types.js";
import { installCmd } from "./commands/install.js";
import { uninstallCmd } from "./commands/uninstall.js";
import { doctor } from "./commands/doctor.js";
import { integrationCmd } from "./commands/integration.js";
import {
  initNorthStar,
  northStarReference,
  northStarReferenceSearch,
  northStarRun,
  northStarStatus,
  NORTHSTAR_AGENTS,
  NORTHSTAR_EVIDENCE_KINDS,
} from "./commands/northstar-ux.js";

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
  } else if (result.exitCode !== ExitCode.Success) {
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
  .option("--force", "Force reinstall")
  .option("--no-integrations", "Install rules, skills and runtime without registering standard MCP integrations")
  .option("--dry-run", "Show what would be done without executing")
  .action(async (platformArg: string | undefined, cmdOpts: { host: string[]; all?: boolean; force?: boolean; dryRun?: boolean; integrations?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    if (cmdOpts.dryRun) opts.dryRun = true;
    const targets = cmdOpts.all
      ? ["all"]
      : cmdOpts.host && cmdOpts.host.length > 0
      ? cmdOpts.host
      : platformArg
      ? [platformArg]
      : ["all"];
    const args = [...targets, ...(cmdOpts.force ? ["--force"] : []), ...(cmdOpts.integrations === false ? ["--no-integrations"] : [])];
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
  .option("--skip-integration-verify", "Skip MCP integration verification (no PASS claim is made for skipped checks)")
  .action(async (platformArg: string | undefined, cmdOpts: { host: string[]; skipIntegrationVerify?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const targets = cmdOpts.host && cmdOpts.host.length > 0
      ? cmdOpts.host
      : platformArg
      ? [platformArg]
      : [];
    const doctorArgs = [...targets, ...(cmdOpts.skipIntegrationVerify ? ["--skip-integration-verify"] : [])];
    const result = await doctor(doctorArgs, opts);
    formatOutput(result, opts);
  });

// 4. status
program
  .command("status")
  .description("Show host and run status")
  .option("--host <id>", "Host id filter")
  .option("--run <id>", "Run id filter")
  .option("--details", "Show full claim and omitted-proof details")
  .action(async (cmdOpts: { host?: string; run?: string; details?: boolean }) => {
    try {
      const opts = program.optsWithGlobals() as CliOptions;
      const data = northStarStatus(process.cwd(), cmdOpts.details === true) as Record<string, unknown>;
      formatOutput({ exitCode: ExitCode.Success, message: "Host and run status", data }, opts);
    } catch (error) {
      formatOutput({ exitCode: ExitCode.GeneralError, message: error instanceof Error ? error.message : String(error) }, program.optsWithGlobals() as CliOptions);
    }
  });

// 5. run
program
  .command("run")
  .description("Run one bounded North-Star task; ambiguous/S2/S3 work is compiled by the configured strong planner")
  .argument("<intent>", "Raw user intent; preserved verbatim in WorkRequest")
  .option("--agent <agent>", `Headless worker: ${NORTHSTAR_AGENTS.join(", ")}`)
  .option("--planner <agent>", `Strong planner for ambiguous/S2/S3 work: ${NORTHSTAR_AGENTS.join(", ")}`)
  .option("--own <path>", "Owned path (repeatable)", collectValue, [])
  .option("--forbid <path>", "Forbidden path (repeatable)", collectValue, [])
  .option("--verify-exec <executable>", "Exact verifier executable")
  .option("--verify-arg <arg>", "Exact verifier argv item (repeatable)", collectValue, [])
  .option("--verify-kind <kind>", "Evidence kind", "test")
  .option("--capability <name>", "Explicit capability required by this task (repeatable)", collectValue, [])
  .option("--capability-provider <id>", "Explicit-only capability provider to enable (repeatable)", collectValue, [])
  .option("--domain-pack <id>", "Explicit domain pack for this run; never inferred from intent")
  .option("--contract <path>", "Strong-planner contract JSON")
  .action(async (intent: string, cmdOpts: { agent?: string; planner?: string; own: string[]; forbid: string[]; verifyExec?: string; verifyArg: string[]; verifyKind: string; capability: string[]; capabilityProvider: string[]; domainPack?: string; contract?: string }) => {
    try {
      if (cmdOpts.agent && !NORTHSTAR_AGENTS.includes(cmdOpts.agent as (typeof NORTHSTAR_AGENTS)[number])) throw new Error(`unsupported --agent ${cmdOpts.agent}`);
      if (cmdOpts.planner && !NORTHSTAR_AGENTS.includes(cmdOpts.planner as (typeof NORTHSTAR_AGENTS)[number])) throw new Error(`unsupported --planner ${cmdOpts.planner}`);
      if (!NORTHSTAR_EVIDENCE_KINDS.includes(cmdOpts.verifyKind as (typeof NORTHSTAR_EVIDENCE_KINDS)[number])) throw new Error(`unsupported --verify-kind ${cmdOpts.verifyKind}`);
      const plannerContract = cmdOpts.contract
        ? JSON.parse((await import('node:fs')).default.readFileSync((await import('node:path')).default.resolve(process.cwd(), cmdOpts.contract), 'utf8')) as unknown
        : undefined;
      const result = await northStarRun({
        repoRoot: process.cwd(),
        intent,
        agent: cmdOpts.agent as (typeof NORTHSTAR_AGENTS)[number] | undefined,
        planner: cmdOpts.planner as (typeof NORTHSTAR_AGENTS)[number] | undefined,
        owned: cmdOpts.own,
        forbidden: cmdOpts.forbid,
        verifier: cmdOpts.verifyExec ? { executable: cmdOpts.verifyExec, args: cmdOpts.verifyArg, kind: cmdOpts.verifyKind as (typeof NORTHSTAR_EVIDENCE_KINDS)[number] } : undefined,
        capabilities: cmdOpts.capability,
        capabilityProviders: cmdOpts.capabilityProvider,
        domainPack: cmdOpts.domainPack,
        plannerContract,
      });
      const outcome = typeof result === "object" && result !== null
        ? (result as { trusted_outcome?: string; outcome?: string }).trusted_outcome ?? (result as { outcome?: string }).outcome
        : undefined;
      const passed = outcome === "PASS";
      formatOutput({
        exitCode: passed ? ExitCode.Success : ExitCode.GeneralError,
        message: passed ? "North-Star run completed" : `North-Star run not trusted PASS (outcome: ${outcome ?? "unknown"})`,
        data: result as Record<string, unknown>,
      }, program.optsWithGlobals() as CliOptions);
    } catch (error) {
      formatOutput({ exitCode: ExitCode.GeneralError, message: error instanceof Error ? error.message : String(error) }, program.optsWithGlobals() as CliOptions);
    }
  });// 6. integration
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

// 7. init
program
  .command("init")
  .description("Initialize the fail-closed North-Star runtime config")
  .option("--agent <agent>", `Default headless worker: ${NORTHSTAR_AGENTS.join(", ")}`, "claude")
  .option("--planner <agent>", `Default strong planner: ${NORTHSTAR_AGENTS.join(", ")}`, "claude")
  .option("--domain-pack <id>", "Explicit project/domain pack (never auto-routed)")
  .action(async (cmdOpts: { agent: string; planner: string; domainPack?: string }) => {
    try {
      if (!NORTHSTAR_AGENTS.includes(cmdOpts.planner as (typeof NORTHSTAR_AGENTS)[number])) throw new Error(`unsupported --planner ${cmdOpts.planner}`);
      const result = initNorthStar(process.cwd(), cmdOpts.agent as (typeof NORTHSTAR_AGENTS)[number], cmdOpts.domainPack ?? null, cmdOpts.planner as (typeof NORTHSTAR_AGENTS)[number]);
      formatOutput({ exitCode: ExitCode.Success, message: result.created ? "North-Star runtime initialized" : "North-Star runtime already initialized", data: result as Record<string, unknown> }, program.optsWithGlobals() as CliOptions);
    } catch (error) {
      formatOutput({ exitCode: ExitCode.GeneralError, message: error instanceof Error ? error.message : String(error) }, program.optsWithGlobals() as CliOptions);
    }
  });

// 8. reference
program
  .command("reference")
  .description("Read or search verified central domain-pack reference file without copying it into the project; records a consumption receipt (REQ-013)")
  .argument("<pack>", "Explicit domain pack id, for example 5fedu")
  .argument("[path]", "Manifest-bound reference path inside the bundled source")
  .option("--search <query>", "Search verified central domain-pack source and return code pointers")
  .option("--limit <n>", "Maximum search matches (1-100)", "20")
  .option("--component <value>", "Component/behavior this reference is used for (defaults to the first two path segments)")
  .option("--behavior <value>", "Alias for --component")
  .option("--anchor <value>", "Source anchor within the reference file")
  .option("--work <id>", "Work id to bind the receipt to (only that run's renderer may show the footer)")
  .option("--no-record", "Read without recording a consumption receipt (no footer will be disclosed)")
  .action(async (pack: string, relativePath: string | undefined, cmdOpts: { search?: string; limit?: string; component?: string; behavior?: string; anchor?: string; work?: string; record?: boolean }) => {
    try {
      const opts = program.optsWithGlobals() as CliOptions;
      if (cmdOpts.search) {
        const limit = Number(cmdOpts.limit ?? 20);
        const result = northStarReferenceSearch(process.cwd(), pack, cmdOpts.search, limit);
        if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        else for (const match of result) process.stdout.write(`${match.path}:${match.line} [${match.sha256.slice(0, 12)}] ${match.text}\n`);
        return;
      }
      if (!relativePath) {
        throw new Error("Missing required reference path argument");
      }
      const result = northStarReference(process.cwd(), pack, relativePath, {
        component: cmdOpts.component,
        behavior: cmdOpts.behavior,
        anchor: cmdOpts.anchor,
        record: cmdOpts.record !== false,
        workId: cmdOpts.work,
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

await program.parseAsync(process.argv);
