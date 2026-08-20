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
import { ingestCmd } from "./commands/ingest.js";
import { goalCmd } from "./commands/goal.js";
import { repairCmd } from "./commands/repair.js";
import { closeoutCmd } from "./commands/closeout.js";
import { closeCmd } from "./commands/close.js";
import { activateCmd } from "./commands/activate.js";
import { cleanupCmd } from "./commands/cleanup.js";
import { verifyCmd } from "./commands/verify.js";
import { parityCmd } from "./commands/parity.js";
import { verifyParityCmd } from "./commands/verify-parity.js";
import { runtimeCmd } from "./commands/runtime.js";
import { modelsCmd } from "./commands/models.js";
import { skillsCmd } from "./commands/skills.js";
import { integrationCmd } from "./commands/integration.js";
import { automationCmd } from "./commands/automation.js";
import { runnerCmd } from "./commands/runner.js";
import { topologyCmd } from "./commands/topology.js";
import { adversarialCmd } from "./commands/adversarial.js";
import { certifyCmd } from "./commands/certify.js";
import { proofPlanCmd } from "./commands/proof-plan.js";
import { hostCanaryCmd } from "./commands/host-canary.js";
import { handoffCmd } from "./commands/handoff.js";
import { initNorthStar, northStarDrain, northStarReference, northStarReferenceSearch, northStarRun, northStarStatus, NORTHSTAR_AGENTS, NORTHSTAR_EVIDENCE_KINDS } from "./commands/northstar-ux.js";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { OpenCodeNativeSessionAdapter } from "@initforge/agent-rules-engine/native-session-adapter";

const program = new Command();

program.command("runner")
  .description("Durable runner: one headless agent process per task, all state on disk")
  .argument("[action]", "add, seed, start, status, journal, checkpoint, resume, amend", "status")
  .allowUnknownOption()
  .allowExcessArguments()
  .action(async (action: string, _opts: unknown, command: Command) => {
    try {
      // Pass raw argv through: the runner parses repeatable flags (--verify, --own)
      // which commander's option model does not express well.
      const raw = command.args.length > 0 ? command.args : [action];
      formatOutput(
        { exitCode: ExitCode.Success, message: `runner ${action}`, data: { result: await runnerCmd(raw, process.cwd()) } },
        program.optsWithGlobals() as CliOptions
      );
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(ExitCode.GeneralError);
    }
  });

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



// ── North-Star public UX ───────────────────────────────────────────

program
  .command("drain")
  .description("Process queued READY triggers sequentially with the same fail-closed planner/worker runtime")
  .option("--max <n>", "Maximum queued requests to process", "1")
  .option("--agent <agent>", `Headless worker: ${NORTHSTAR_AGENTS.join(", ")}`)
  .option("--planner <agent>", `Strong planner: ${NORTHSTAR_AGENTS.join(", ")}`)
  .option("--domain-pack <id>", "Explicit domain pack for queued work; never inferred")
  .option("--capability-provider <id>", "Explicit-only capability provider to enable (repeatable)", (value: string, previous: string[] = []) => [...previous, value], [])
  .action(async (cmdOpts: { max: string; agent?: string; planner?: string; domainPack?: string; capabilityProvider: string[] }) => {
    try {
      const max = Number(cmdOpts.max);
      if (cmdOpts.agent && !NORTHSTAR_AGENTS.includes(cmdOpts.agent as (typeof NORTHSTAR_AGENTS)[number])) throw new Error(`unsupported --agent ${cmdOpts.agent}`);
      if (cmdOpts.planner && !NORTHSTAR_AGENTS.includes(cmdOpts.planner as (typeof NORTHSTAR_AGENTS)[number])) throw new Error(`unsupported --planner ${cmdOpts.planner}`);
      const result = await northStarDrain(process.cwd(), {
        max,
        agent: cmdOpts.agent as (typeof NORTHSTAR_AGENTS)[number] | undefined,
        planner: cmdOpts.planner as (typeof NORTHSTAR_AGENTS)[number] | undefined,
        domainPack: cmdOpts.domainPack,
        capabilityProviders: cmdOpts.capabilityProvider,
      });
      const blocked = result.results.some((item) => item.status !== 'PASS');
      formatOutput({ exitCode: blocked ? ExitCode.GeneralError : ExitCode.Success, message: `Processed ${result.processed} queued request(s)`, data: result as unknown as Record<string, unknown> }, program.optsWithGlobals() as CliOptions);
    } catch (error) {
      formatOutput({ exitCode: ExitCode.GeneralError, message: error instanceof Error ? error.message : String(error) }, program.optsWithGlobals() as CliOptions);
    }
  });

const collectValue = (value: string, previous: string[] = []): string[] => [...previous, value];

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

program
  .command("reference")
  .description("Read one verified central domain-pack reference file without copying it into the project; records a consumption receipt (REQ-013) so the result renderer can disclose what was actually used")
  .argument("<pack>", "Explicit domain pack id, for example 5fedu")
  .argument("<path>", "Manifest-bound reference path inside the bundled source")
  .option("--component <value>", "Component/behavior this reference is used for (defaults to the first two path segments)")
  .option("--behavior <value>", "Alias for --component")
  .option("--anchor <value>", "Source anchor within the reference file")
  .option("--work <id>", "Work id to bind the receipt to (only that run's renderer may show the footer)")
  .option("--no-record", "Read without recording a consumption receipt (no footer will be disclosed)")
  .action(async (pack: string, relativePath: string, cmdOpts: { component?: string; behavior?: string; anchor?: string; work?: string; record?: boolean }) => {
    try {
      const result = northStarReference(process.cwd(), pack, relativePath, {
        component: cmdOpts.component,
        behavior: cmdOpts.behavior,
        anchor: cmdOpts.anchor,
        record: cmdOpts.record !== false,
        workId: cmdOpts.work,
      });
      const opts = program.optsWithGlobals() as CliOptions;
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

program
  .command("reference-search")
  .description("Search verified central domain-pack source and return code pointers; nothing is copied into the project")
  .argument("<pack>", "Explicit domain pack id, for example 5fedu")
  .argument("<query>", "Literal source text to find")
  .option("--limit <n>", "Maximum matches (1-100)", "20")
  .action(async (pack: string, query: string, cmdOpts: { limit: string }) => {
    try {
      const limit = Number(cmdOpts.limit);
      const result = northStarReferenceSearch(process.cwd(), pack, query, limit);
      const opts = program.optsWithGlobals() as CliOptions;
      if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      else for (const match of result) process.stdout.write(`${match.path}:${match.line} [${match.sha256.slice(0, 12)}] ${match.text}\n`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = ExitCode.GeneralError;
    }
  });

program
  .command("run")
  .description("Run one bounded North-Star task; ambiguous/S2/S3 work is compiled by the configured strong planner")
  .argument("<intent>", "Raw user intent; preserved verbatim in WorkRequest")
  .option("--agent <agent>", `Headless worker: ${NORTHSTAR_AGENTS.join(", ")}`)
  .option("--planner <agent>", `Strong planner for ambiguous/S2/S3 work: ${NORTHSTAR_AGENTS.join(", ")}`)
  .option("--own <path>", "Owned path (repeatable)", collectValue, [])
  .option("--forbid <path>", "Forbidden path (repeatable)", collectValue, [])
  .option("--verify-exec <executable>", "Exact verifier executable")
  .option("--verify-arg <arg>", "Exact verifier argv item (repeatable; use --verify-arg=-x for dash-prefixed args)", collectValue, [])
  .option("--verify-kind <kind>", "Evidence kind", "test")
  .option("--capability <name>", "Explicit capability required by this task (repeatable)", collectValue, [])
  .option("--capability-provider <id>", "Explicit-only capability provider to enable (repeatable)", collectValue, [])
  .option("--domain-pack <id>", "Explicit domain pack for this run; never inferred from intent")
  .option("--contract <path>", "Strong-planner contract JSON for S2/S3 or explicit planned execution")
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
  });

program
  .command("status")
  .description("Show the latest schema-validated North-Star run state")
  .action(async () => {
    try {
      formatOutput({ exitCode: ExitCode.Success, message: "North-Star status", data: northStarStatus(process.cwd()) as Record<string, unknown> }, program.optsWithGlobals() as CliOptions);
    } catch (error) {
      formatOutput({ exitCode: ExitCode.GeneralError, message: error instanceof Error ? error.message : String(error) }, program.optsWithGlobals() as CliOptions);
    }
  });

program
  .command("amend")
  .description("Apply an owner amendment through a hash-bound strong-planner impact plan")
  .argument("<intent>", "Raw amendment intent; preserved verbatim")
  .requiredOption("--impact-plan <path>", "Structured strong-planner impact plan JSON")
  .action(async (intent: string, cmdOpts: { impactPlan: string }) => {
    try {
      const result = await runnerCmd(["amend", intent, "--impact-plan", cmdOpts.impactPlan], process.cwd());
      formatOutput({ exitCode: ExitCode.Success, message: "Amendment activated", data: result as Record<string, unknown> }, program.optsWithGlobals() as CliOptions);
    } catch (error) {
      formatOutput({ exitCode: ExitCode.GeneralError, message: error instanceof Error ? error.message : String(error) }, program.optsWithGlobals() as CliOptions);
    }
  });

// ── dashboard ──────────────────────────────────────────────────────
program
  .command("dashboard")
  .description("Print a read-only harness health/eval/platform snapshot")
  .action(async () => {
    const opts = program.optsWithGlobals() as CliOptions;
    formatOutput(await dashboard([], opts), opts);
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
    "Install agent-rules runtime for all platforms (native transactional installer)"
  )
  .argument("[platform]", "Platform: codex, grok, antigravity, cursor, opencode, claude, deepseek-harness, command-code, all", "all")
  .option("--force", "Force reinstall: remove old activation before installing")
  .action(async (platform: string, cmdOpts: { force?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = [platform];
    if (cmdOpts.force) args.push("--force");
    const result = await installCmd(args, opts);
    formatOutput(result, opts);
  });

// ── doctor ─────────────────────────────────────────────────────────
program
  .command("doctor")
  .description("Run harness health checks for all platforms")
  .argument("[platform]", "Platform: codex, grok, antigravity, cursor, opencode, claude, deepseek-harness, command-code, all", "all")
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
  .argument("[platform]", "Platform: codex, grok, antigravity, cursor, opencode, all", "all")
  .action(async (platform: string) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await syncCmd([platform], opts);
    formatOutput(result, opts);
  });

// ── profile ────────────────────────────────────────────────────────
program
  .command("profile")
  .description("Manage installation profiles")
  .argument("[args...]", "Subcommand and optional arguments")
  .addHelpText(
    "after",
    `
Subcommands:
  list              List available profiles
  show <name>       Show profile details
  apply <name>      Apply a profile to a project
    `
  )
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await profileCmd(args, opts);
    formatOutput(result, opts);
  });

// ── platform ───────────────────────────────────────────────────────
program
  .command("platform")
  .description("Inspect platform contracts and overlays")
  .argument("[args...]", "Subcommand and optional arguments")
  .addHelpText(
    "after",
    `
Subcommands:
  list              List configured platforms
  show <name>       Show platform details
    `
  )
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await platformCmd(args, opts);
    formatOutput(result, opts);
  });

// ── eval ───────────────────────────────────────────────────────────
program
  .command("eval")
  .description("Run benchmark/evaluation suites with fail-closed result reporting")
  .argument("[args...]", "Subcommand and optional suite")
  .addHelpText(
    "after",
    `
Subcommands:
  list              List available benchmark suites
  run [suite]       Run a benchmark suite
  results           Show benchmark results
    `
  )
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await evalCmd(args, opts);
    formatOutput(result, opts);
  });

// ── plan ────────────────────────────────────────────────────────────
program
  .command("plan")
  .description("Manage execution plans")
  .argument("[args...]", "Subcommand and its arguments")
  .option("--finalize", "M11: emit the terminal token only when every gate passes")
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
  readiness <planId>           Compile plan-readiness & autonomy bundle (9 projections)
  m11 <planId>                 Evaluate HV3_M11_LOCAL_COMPLETE eligibility (read-only)
                               add --finalize to emit the token only when all gates pass
    `
  )
  .action(async (args: string[], cmdOpts: { finalize?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    if (cmdOpts.finalize) args = [...args, "--finalize"];
    const result = await planCmd(args, opts);
    formatOutput(result, opts);
  });

// ── ingest ──────────────────────────────────────────────────────────
program
  .command("ingest")
  .description("Compile an ordinary prompt or trigger envelope into the canonical WorkRequest with adapter identity")
  .argument("[args...]", "[adapter] <prompt text> | <trigger-envelope.json> [--plan <plan-id>]")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await ingestCmd(args, opts);
    formatOutput(result, opts);
  });

// ── goal ────────────────────────────────────────────────────────────
program
  .command("goal")
  .description("Validate a plan support bundle and compile the invocation into the canonical WorkRequest (EMULATED adapter)")
  .argument("[args...]", "[plan-id] [--intent <text>]")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await goalCmd(args, opts);
    formatOutput(result, opts);
  });

// ── repair ──────────────────────────────────────────────────────────
program
  .command("repair")
  .description("Prompt-first pair repair: bind a finding, classify, reopen only impacted claims, emit a bounded repair packet")
  .argument("[args...]", "<finding.json> [--plan <plan-id>]")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await repairCmd(args, opts);
    formatOutput(result, opts);
  });

// ── closeout ────────────────────────────────────────────────────────
program
  .command("closeout")
  .description("Prepare the exact owner-gated CloseoutReceipt (no git mutation)")
  .argument("[plan-id]", "Plan id", "portable-host-native-supervision-v1")
  .action(async (planId: string) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await closeoutCmd([planId], opts);
    formatOutput(result, opts);
  });

// ── activate ───────────────────────────────────────────────────────
program
  .command("activate")
  .description("Activate a successor plan through the generation-CAS pointer transaction (Phase 1 trust root). Only mechanism that moves the current pointer.")
  .argument("<plan-id>", "Successor plan id to activate")
  .option("--dry-run", "Verify successor artifacts without mutating the pointer")
  .option("--reason <text>", "Owner-authorized supersession reason (required)")
  .option("--activation-state <state>", "Schema-valid activation state: BOOTSTRAP_POINTER, BOOTSTRAP_UNCERTIFIED, CANONICALLY_ACTIVATED (default)")
  .action(async (planId: string, cmdOpts: { dryRun?: boolean; reason?: string; activationState?: string }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = [planId, ...(cmdOpts.dryRun ? ["--dry-run"] : []), ...(cmdOpts.reason ? ["--reason", cmdOpts.reason] : []), ...(cmdOpts.activationState ? ["--activation-state", cmdOpts.activationState] : [])];
    const result = await activateCmd(args, opts);
    formatOutput(result, opts);
  });

// ── close ───────────────────────────────────────────────────────────
program
  .command("close")
  .description("Unified closure transaction (trust root): mandatory gates (non-empty requirements/reconciliation/bound evidence, no unresolved, five-identity binding), derive-only terminal outcome (caller cannot override), stage+commit with idempotent replay, generic stale-terminal correction, and attest -> deactivate -> compact composition. Only a trusted PASS exits 0.")
  .argument("[plan-id]", "Plan id", "portable-host-native-supervision-v1")
  .option("--dry-run", "Run the mandatory gates without mutating anything")
  .action(async (planId: string, cmdOpts: { dryRun?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = [planId, ...(cmdOpts.dryRun ? ["--dry-run"] : [])];
    const result = await closeCmd(args, opts);
    formatOutput(result, opts);
  });

// ── certify ───────────────────────────────────────────────────────
program
  .command("certify")
  .description("Derive SOURCE_COMPLETE and FULLY_CERTIFIED from bound closure evidence; never accepts prose or a force flag")
  .argument("[args...]", "[planId] [repoRoot] [--evidence path]")
  .allowUnknownOption(true)
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await certifyCmd(args, opts);
    formatOutput(result, opts);
  });


// ── handoff ─────────────────────────────────────────────────────────
program
  .command("handoff")
  .description("One-copy handoff of the frozen execution contract: plan or prompt rendered from the same revision (mandatory pre-handoff audit gates the output)")
  .argument("[renderer]", "plan | prompt")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .addHelpText(
    "after",
    `
Flags:
  --run <runId>                Compile from a persisted north-star run (.agent/runs/<runId>)
  --request/--spec/--packets   Explicit canonical JSON inputs (all three together)
  --output <path>|-            Default "-" = one self-contained artifact on stdout
  --persist auto|never|always  auto = persist when --run is given; always = write .agent/handoff/<contract_id>/
  --assumption <stmt>          Authorize an assumption for the pre-handoff audit (repeatable)
  --provided-reference <path>  Reference actually provisioned for the worker (repeatable)

Audit verdicts: PASS emits the artifact; NEEDS_USER exits with the receipt;
BLOCKED exits and emits nothing beyond the receipt. plan compile remains the
legacy compatibility alias; handoff is the canonical path.
    `
  )
  .action(async (renderer: string, _opts: unknown, command: Command) => {
    const opts = program.optsWithGlobals() as CliOptions;
    // commander repeats the declared renderer at command.args[0]; flags follow.
    const extra = (command.args as string[]).slice(1);
    const result = await handoffCmd(renderer ? [renderer, ...extra] : extra, opts);
    formatOutput(result, opts);
  });

// ── proof-plan ──────────────────────────────────────────────────────
program
  .command("proof-plan")
  .description("Adaptive minimal-proof-testing router (global behavior): plan the smallest sufficient proof set for a task (trigger -> profile -> selection -> receipt)")
  .argument("[args...]", "--repo <root> --task <id> [--files a,b] [--claims c1;c2] [--risks r1] [--live] [--full-suite] [--full-suite-reason <text>]")
  .allowUnknownOption(true)
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await proofPlanCmd(args, opts);
    formatOutput(result, opts);
  });


// ── host-canary ──────────────────────────────────────────────────────────
program
  .command("host-canary")
  .description("Run the per-host capability certification canary (REQ-011/REQ-018): LIVE_CERTIFIED only from a live probe; absent binaries are NOT_LIVE_VERIFIED, never fake green")
  .argument("<host>", `Host id (one of: codex, claude, grok, opencode, antigravity, cursor, deepseek-harness, command-code)`)
  .action(async (host: string) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await hostCanaryCmd([host], opts);
    formatOutput(result, opts);
  });

// ── cleanup ──────────────────────────────────────────────────────────
program
  .command("cleanup")
  .description("Cleanup, migration and garbage collection (SS-24, R-042, B05)")
  .argument("[args...]", "Subcommand and its arguments")
  .allowUnknownOption(true)
  .addHelpText(
    "after",
    `
Subcommands:
  lifecycle|gc         Graph-safe lifecycle inventory (default; dry-run)
  inventory <path...>   Classify exact paths (delete/rescue/keep)
  rescue <path...>      Move exact paths into quarantine; receipt = rollback
                        (flags: --root <repo> --quarantine <dir> --dry-run)
  delete <path...>      Guarded removal of exact-named non-production junk
                        (flags: --root <repo> --receipts <dir> --dry-run)
                        Guard: exact names only, no globs; protected segments
                        (.git, src, packages, generated, .agent, dist, ...)
                        fail closed; irreversibility + rollback receipt emitted
  --apply                Apply only unreferenced ignored scratch purge
    `
  )
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await cleanupCmd(args, opts);
    formatOutput(result, opts);
  });


// ── verify ──────────────────────────────────────────────────────────
program
  .command("verify")
  .description("Run validation and mirror verification; `verify epoch [root]` snapshots the immutable candidate epoch (M11-R32)")
  .argument("[args...]", "Repository root path, or `epoch [root] [--allow-dirty]`")
  .option("--allow-dirty", "epoch: snapshot a dirty worktree (informational, never terminal-eligible)")
  .action(async (args: string[], cmdOpts: { allowDirty?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    if (cmdOpts.allowDirty) args = [...args, "--allow-dirty"];
    const result = await verifyCmd(args, opts);
    formatOutput(result, opts);
  });

// ── topology ─────────────────────────────────────────────────────────
program
  .command("topology")
  .description("Whole-system topology compiler + layered verification (AM-0019 §8)")
  .argument("[args...]", "Subcommand and its arguments")
  .allowUnknownOption(true)
  .addHelpText(
    "after",
    `
Subcommands:
  compile [path]                 Parse + validate system-topology.yaml, print topology hash
  verify [path] [--evidence e]   Run layered verification; required gates never PASS via SKIPPED
    `
  )
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await topologyCmd(args, opts);
    formatOutput(result, opts);
  });

// ── adversarial ─────────────────────────────────────────────────────────────
program
  .command("adversarial")
  .description("Adversarial counterexample compiler (AM-0020 §7, M11-R30)")
  .argument("[args...]", "Subcommand and its arguments")
  .allowUnknownOption(true)
  .addHelpText(
    "after",
    `
Subcommands:
  compile <plan.json> [--claims c.json] [--topology t.yaml]
                       Compile negative probes from plan invariants + topology +
                       claim scope; fails on empty plan-required domain generator
  run <plan.json> [--claims c.json] [--subject s.json]
                       Compile + gate T2/T3 claims (negative probe or recorded
                       deterministic proof) + optionally execute probes against a
                       subject; any FAIL/rejected claim fails the run
    `
  )
  .action(async (args: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const result = await adversarialCmd(args, opts);
    formatOutput(result, opts);
  });

// ── parity ──────────────────────────────────────────────────────────────────
program
  .command("parity")
  .description("Paired reference/target browser parity (AM-0019 §9)")
  .argument("[args...]", "run <manifest>")
  .option("--reference-url <url>", "Override reference URL for all pairs")
  .option("--target-url <url>", "Override target ingress URL for all pairs")
  .option("--candidate-hash <hash>", "Override candidate hash binding")
  .option("--headless", "Run headless chromium (default)")
  .action(async (args: string[], cmdOpts: { referenceUrl?: string; targetUrl?: string; candidateHash?: string; headless?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const extraArgs = [...args];
    if (cmdOpts.referenceUrl) extraArgs.push("--reference-url", cmdOpts.referenceUrl);
    if (cmdOpts.targetUrl) extraArgs.push("--target-url", cmdOpts.targetUrl);
    if (cmdOpts.candidateHash) extraArgs.push("--candidate-hash", cmdOpts.candidateHash);
    if (cmdOpts.headless) extraArgs.push("--headless");
    const result = await parityCmd(extraArgs, opts);
    formatOutput(result, opts);
  });

// ── verify-parity ──────────────────────────────────────────────────────────
program
  .command("verify-parity")
  .description("Verify 5fedu module parity packet (typecheck, lint, build, interaction)")
  .argument("<packet-dir>", "Path to parity packet directory")
  .option("--target-url <url>", "URL of running app for browser interaction tests")
  .option("--json", "Output JSON report")
  .action(async (packetDir: string, cmdOpts: { targetUrl?: string; json?: boolean }) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = [packetDir];
    if (cmdOpts.targetUrl) args.push("--target-url", cmdOpts.targetUrl);
    if (cmdOpts.json) args.push("--json");
    const result = await verifyParityCmd(args, opts);
    formatOutput(result, opts);
  });

// ── runtime ─────────────────────────────────────────────────────────
program
  .command("runtime")
  .description("Manage harness runtime installations")
  .argument("[subcommand]", "Subcommand: install, update, rollback, reinstall, uninstall, recover, reconcile")
  .argument("[platform]", "Platform: codex, grok, antigravity, cursor, all", "all")
  .option("--root <absolute>", "Override the selected platform root (single platform only)")
  .option("--migrate-legacy", "Explicitly migrate a manifest-owned legacy runtime (single platform only)")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .addHelpText(
    "after",
    `
Subcommands:
  install [platform]     Install runtime to platform (default: all)
  update [platform]      Update runtime on platform
  rollback [platform]    Rollback runtime on platform
  reinstall [platform]   Reinstall runtime transactionally
  uninstall [platform]   Uninstall runtime from platform
  recover [platform]     Recover an interrupted transaction
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
  .argument("[subcommand]", "Subcommand: doctor, resolve, search, preview, install, update")
  .addHelpText(
    "after",
    `
Subcommands:
  doctor          Audit skill manifests and references
  resolve         Show external candidates without installing them
  search <query>  Thin binding to gh skill search
  preview <spec>  Thin binding to gh skill preview
  install <spec>  Explicit thin binding to gh skill install
  update [spec]   Thin binding to gh skill update
    `
  )
  .action(async (subcommand: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = program.args;
    const subArgs = subcommand ? [subcommand, ...args.slice(args.indexOf(subcommand) + 1)] : [];
    const result = await skillsCmd(subArgs, opts);
    formatOutput(result, opts);
  });

// ── integration ──────────────────────────────────────────────────────
program
  .command("integration")
  .description("Install, verify, or uninstall MCP integrations (native Node.js, no pwsh)")
  .argument("<action>", "Action: install, verify, uninstall")
  .argument("[integration]", "Integration ID or 'all' (default: all)")
  .action(async (action: string, integration: string | undefined) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = [action, integration ?? "all"];
    const result = await integrationCmd(args, opts);
    formatOutput(result, opts);
  });

// ── automation ──────────────────────────────────────────────────────
program
  .command("automation")
  .description("Run automation scripts (native Node.js, no pwsh)")
  .argument("<action>", "Action: verify-runtime-state, export-runtime-state, validate-leakage, regression-guards, cutover-routing, sync-project-agents, compose-policy, materialize-template, validate-registry, build-benchmark, install-claude-adapter, install-opencode-adapter, profile-install, profile-doctor, profile-discover, profile-remove, profile-update")
  .argument("[args...]", "Additional arguments for the action")
  .action(async (action: string, extraArgs: string[]) => {
    const opts = program.optsWithGlobals() as CliOptions;
    const args = [action, ...extraArgs];
    const result = await automationCmd(args, opts);
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
