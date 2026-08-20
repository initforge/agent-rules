import fs from "node:fs";
import path from "node:path";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import {
  auditPreHandoff,
  compileFrozenContract,
  renderPlan,
  renderPrompt,
  type FrozenPortableContract,
  type HandoffAuditReceipt,
} from "@initforge/agent-rules-engine/northstar/index";
import { assertWorkRequest, assertWorkSpec, assertTaskPacket, type WorkRequest, type WorkSpec, type TaskPacket } from "@initforge/agent-rules-engine/northstar/index";

/**
 * REQ-004 — one-copy handoff of the frozen execution contract.
 *
 * `agent-rules handoff plan|prompt` compiles the frozen contract from a
 * persisted north-star run (or explicit request/spec/packets files), runs the
 * mandatory pre-handoff audit (REQ-005), and emits ONE self-contained artifact
 * to stdout by default. Receivers with a full runtime verify the semantic hash
 * and execute the contract; receivers without one still get scope, tasks,
 * proof, failure rules and closure criteria in a single copy.
 *
 * `plan compile` remains as a compatibility alias for the legacy compiler;
 * `handoff` is the canonical path.
 */

export interface HandoffOptions {
  run?: string;
  request?: string;
  spec?: string;
  packets?: string;
  output?: string;
  persist?: "auto" | "never" | "always";
  assumption: string[];
  providedReference: string[];
  repoRoot?: string;
}

export function resolveHandoffInputs(opts: HandoffOptions, cwd: string): { request: WorkRequest; spec: WorkSpec; packets: TaskPacket[]; runId: string | null } {
  const root = opts.repoRoot ?? cwd;
  if (opts.run) {
    const runRoot = path.join(root, ".agent", "runs", opts.run);
    const requestPath = path.join(runRoot, "work-request.json");
    const specPath = path.join(runRoot, "work-spec.json");
    const packetsPath = path.join(runRoot, "task-packets.json");
    for (const [label, file] of [["work-request.json", requestPath], ["work-spec.json", specPath], ["task-packets.json", packetsPath]] as const) {
      if (!fs.existsSync(file)) throw new Error(`handoff --run ${opts.run}: ${label} missing at ${file}`);
    }
    const request = JSON.parse(fs.readFileSync(requestPath, "utf8")) as unknown;
    const spec = JSON.parse(fs.readFileSync(specPath, "utf8")) as unknown;
    const packets = JSON.parse(fs.readFileSync(packetsPath, "utf8")) as unknown;
    assertWorkRequest(request);
    assertWorkSpec(spec);
    if (!Array.isArray(packets)) throw new Error(`handoff --run ${opts.run}: task-packets.json must be an array`);
    packets.forEach(assertTaskPacket);
    return { request, spec, packets, runId: opts.run };
  }
  if (opts.request || opts.spec || opts.packets) {
    if (!opts.request || !opts.spec || !opts.packets) {
      throw new Error("handoff with explicit inputs requires --request, --spec and --packets together");
    }
    const read = (file: string, label: string): unknown => {
      const abs = path.resolve(root, file);
      if (!fs.existsSync(abs)) throw new Error(`handoff ${label} not found: ${abs}`);
      return JSON.parse(fs.readFileSync(abs, "utf8"));
    };
    const request = read(opts.request, "--request") as unknown;
    const spec = read(opts.spec, "--spec") as unknown;
    const packets = read(opts.packets, "--packets") as unknown;
    assertWorkRequest(request);
    assertWorkSpec(spec);
    if (!Array.isArray(packets)) throw new Error("handoff --packets must be an array");
    packets.forEach(assertTaskPacket);
    return { request, spec, packets, runId: null };
  }
  throw new Error("handoff requires --run <runId> or --request/--spec/--packets file paths");
}

export function persistHandoff(contract: FrozenPortableContract, renderer: "plan" | "prompt", content: string, root: string): string {
  const safeId = contract.contract_id.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dir = path.join(root, ".agent", "handoff", safeId);
  fs.mkdirSync(dir, { recursive: true });
  const contractFile = path.join(dir, "contract.json");
  const artifactFile = path.join(dir, `${renderer}.md`);
  fs.writeFileSync(contractFile, JSON.stringify(contract, null, 2) + "\n", "utf8");
  fs.writeFileSync(artifactFile, content, "utf8");
  return dir;
}

export async function handoffCmd(args: string[], opts: CliOptions): Promise<CommandResult> {
  const renderer = args[0]?.toLowerCase();
  if (renderer !== "plan" && renderer !== "prompt") {
    return { exitCode: ExitCode.InvalidArgument, message: "Usage: agent-rules handoff plan|prompt [--run <runId>] [--request <path> --spec <path> --packets <path>] [--output <path>|-] [--persist auto|never|always] [--assumption <stmt>]... [--provided-reference <path>]..." };
  }
  const commandOpts = parseFlags(args.slice(1));
  const cwd = process.cwd();
  try {
    const inputs = resolveHandoffInputs(commandOpts, cwd);
    const contract = compileFrozenContract({
      request: inputs.request,
      spec: inputs.spec,
      packets: inputs.packets,
    });
    const authorizedAssumptions = [...(inputs.spec.assumed ?? []), ...commandOpts.assumption];
    const providedReferences = [...(inputs.spec.references ?? []).map((reference) => reference.path), ...commandOpts.providedReference];
    const audit: HandoffAuditReceipt = auditPreHandoff({
      contract,
      spec: inputs.spec,
      candidate: inputs.packets,
      authorized_assumptions: [...new Set(authorizedAssumptions)],
      provided_references: [...new Set(providedReferences)],
    });

    const content = renderer === "plan" ? renderPlan(contract) : renderPrompt(contract);
    const persist = commandOpts.persist ?? (inputs.runId ? "auto" : "never");
    let persistedDir: string | null = null;
    if (persist === "always" || (persist === "auto" && inputs.runId !== null)) {
      persistedDir = persistHandoff(contract, renderer, content, cwd);
    }

    const output = commandOpts.output ?? "-";
    if (output === "-" && !opts.json) {
      process.stdout.write(content);
      if (!content.endsWith("\n")) process.stdout.write("\n");
    } else if (output !== "-") {
      const abs = path.resolve(cwd, output);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf8");
    }

    const data: Record<string, unknown> = {
      contract_id: contract.contract_id,
      revision: contract.revision,
      semantic_hash: contract.semantic_hash,
      work_id: contract.work_id,
      spec: `${contract.spec_id}@${contract.spec_revision}`,
      audit_verdict: audit.verdict,
      gates: audit.gates,
      renderer,
      output,
      ...(opts.json ? { artifact: content } : {}),
      ...(persistedDir ? { persisted_at: persistedDir } : {}),
    };

    if (audit.verdict === "BLOCKED") {
      return {
        exitCode: ExitCode.GeneralError,
        message: `Handoff blocked by pre-handoff audit: ${audit.findings.filter((finding) => finding.severity === "error").map((finding) => finding.code).join(", ")}`,
        data: { ...data, audit },
      };
    }
    if (audit.verdict === "NEEDS_USER") {
      return {
        exitCode: ExitCode.ValidationFailed,
        message: `Handoff needs owner decision: ${audit.findings.filter((finding) => finding.severity === "needs_user").map((finding) => finding.code).join(", ")}`,
        data: { ...data, audit },
      };
    }
    return {
      exitCode: ExitCode.Success,
      message: `Handoff ${renderer} emitted for ${contract.contract_id} (audit PASS)`,
      data,
    };
  } catch (error) {
    return { exitCode: ExitCode.GeneralError, message: `Handoff failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function parseFlags(args: string[]): HandoffOptions {
  const opts: HandoffOptions = { assumption: [], providedReference: [] };
  const value = (index: number): string => {
    if (index >= args.length) throw new Error(`missing value for ${args[index - 1]}`);
    return args[index]!;
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    switch (flag) {
      case "--run": opts.run = value(++index); break;
      case "--request": opts.request = value(++index); break;
      case "--spec": opts.spec = value(++index); break;
      case "--packets": opts.packets = value(++index); break;
      case "--output": opts.output = value(++index); break;
      case "--persist": {
        const mode = value(++index);
        if (mode !== "auto" && mode !== "never" && mode !== "always") throw new Error(`--persist must be auto|never|always, got ${mode}`);
        opts.persist = mode;
        break;
      }
      case "--assumption": opts.assumption.push(value(++index)); break;
      case "--provided-reference": opts.providedReference.push(value(++index)); break;
      case "--repo-root": opts.repoRoot = value(++index); break;
      default:
        throw new Error(`unknown handoff flag: ${flag}`);
    }
  }
  return opts;
}
