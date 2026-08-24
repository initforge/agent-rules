import fs from "node:fs";
import path from "node:path";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import {
  getHandoffHostAdapter,
  listHandoffDialectHosts,
  createHandoffEnvelope,
  acknowledgeEnvelope,
  resolveExecutionContract,
  assertSafeToEdit,
  HandoffGuardError,
} from "@initforge/agent-rules-kernel/cross-host-handoff.js";

/**
 * Canonical cross-host handoff envelope CLI (owner contract REQ-C11..C16).
 *
 *   agent-rules cross-host-handoff encode --artifact <path> --out <packet> \
 *     --primary-outcome-id PO-1 --primary-outcome "<text>" \
 *     --requirements R1,R2 --source-host opencode --target-host claude \
 *     --execution-mode AUTO_EXECUTE
 *
 *   agent-rules cross-host-handoff verify --packet <path> [--graph-available=false]
 *
 * verify runs the fail-closed pre-edit gate: truncation markers, byte length,
 * hash, requirement count, acknowledgement and context-graph availability all
 * block BEFORE the receiving session's first file edit.
 */
export async function crossHostHandoffCmd(args: string[], options: CliOptions): Promise<CommandResult> {
  const sub = args[0];
  const flags = parseFlags(args.slice(1));
  const cwd = process.cwd();
  try {
    if (sub === "encode") {
      const artifactPath = flags.artifact;
      if (!artifactPath) return { exitCode: ExitCode.InvalidArgument, message: "encode requires --artifact <path>" };
      const bytes = fs.readFileSync(path.resolve(cwd, artifactPath));
      const requirements = (flags.requirements ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (requirements.length === 0) return { exitCode: ExitCode.InvalidArgument, message: "encode requires --requirements id1,id2,..." };
      const envelope = createHandoffEnvelope({
        artifactUri: path.resolve(cwd, artifactPath),
        artifactBytes: bytes,
        primaryOutcomeId: flags["primary-outcome-id"] ?? "PO-1",
        primaryOutcome: flags["primary-outcome"] ?? requirements.join("; "),
        requirementIds: requirements,
        sourceHost: flags["source-host"] ?? "opencode",
        targetHost: flags["target-host"] ?? "opencode",
        executionMode: (flags["execution-mode"] as "AUTO_EXECUTE" | "PLAN_REVIEW") ?? "AUTO_EXECUTE",
      });
      const adapter = getHandoffHostAdapter(envelope.target_host);
      const packet = adapter.frame(envelope);
      const out = flags.out ?? `.agent/handoff/packets/${envelope.target_host}-${Date.now()}.txt`;
      const outAbs = path.resolve(cwd, out);
      fs.mkdirSync(path.dirname(outAbs), { recursive: true });
      fs.writeFileSync(outAbs, packet);
      return { exitCode: ExitCode.Success, message: `envelope framed for ${envelope.target_host} -> ${out}`, data: { sha256: envelope.artifact_sha256, byte_length: envelope.byte_length, requirement_count: envelope.requirement_count } as unknown as Record<string, unknown> };
    }
    if (sub === "acknowledge") {
      const packetPath = flags.packet;
      if (!packetPath) return { exitCode: ExitCode.InvalidArgument, message: "acknowledge requires --packet <path>" };
      const raw = new Uint8Array(fs.readFileSync(path.resolve(cwd, packetPath)));
      const detected = detectHostFromPacket(raw);
      const env = getHandoffHostAdapter(detected).unframe(raw);
      // Receiver-supplied acknowledgement lists; echoing envelope ids proves
      // nothing, so flags take precedence when provided.
      const requirementIds = (flags.requirements ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const proofIds = (flags["proof-obligation-ids"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const acked = acknowledgeEnvelope(env, {
        requirement_ids: requirementIds.length > 0 ? requirementIds : env.requirement_ids,
        proof_obligation_ids: proofIds.length > 0 ? proofIds : undefined,
      });
      return { exitCode: ExitCode.Success, message: `acknowledged ${acked.acknowledged_requirement_count} requirements and ${acked.acknowledged_proof_obligation_count} proof obligations bound to ${acked.acknowledged_sha256}`, data: acked as unknown as Record<string, unknown> };
    }
    if (sub === "verify") {
      const packetPath = flags.packet;
      if (!packetPath) return { exitCode: ExitCode.InvalidArgument, message: "verify requires --packet <path>" };
      const raw = new Uint8Array(fs.readFileSync(path.resolve(cwd, packetPath)));
      // Truncation scan runs BEFORE parsing so a cut payload reports the true
      // failure mode instead of a JSON syntax error.
      const packetText = new TextDecoder().decode(raw);
      const marker = ['<truncated>', '[truncated]'].find((m) => packetText.includes(m));
      if (marker) return { exitCode: ExitCode.GeneralError, message: `BLOCKED BEFORE EDIT: [TRUNCATION_DETECTED] truncation marker "${marker}" present in packet`, data: { code: 'TRUNCATION_DETECTED' } as unknown as Record<string, unknown> };
      const detected = detectHostFromPacket(raw);
      const env = getHandoffHostAdapter(detected).unframe(raw);
      // The envelope binds the materialized artifact at artifact_uri: verify
      // byte_length + sha256 against the real artifact bytes (REQ-C12/C13).
      const artifactPath = flags.artifact ?? env.artifact_uri;
      const artifactAbs = path.isAbsolute(artifactPath) ? artifactPath : path.resolve(cwd, artifactPath);
      if (!fs.existsSync(artifactAbs)) {
        return { exitCode: ExitCode.GeneralError, message: `BLOCKED BEFORE EDIT: [ARTIFACT_UNAVAILABLE] artifact not found at ${artifactAbs}`, data: { code: 'ARTIFACT_UNAVAILABLE' } as unknown as Record<string, unknown> };
      }
      const artifactBytes = new Uint8Array(fs.readFileSync(artifactAbs));
      assertSafeToEdit(env, { artifactBytes, graphAvailable: flags["graph-available"] !== "false" && flags["graph-available"] !== "0" });
      const contract = resolveExecutionContract(env, flags["plan-review-mode"] === "true");
      return {
        exitCode: ExitCode.Success,
        message: `SAFE_TO_EDIT (${contract.action}: ${contract.reason})`,
        data: { primary_outcome_id: env.primary_outcome_id, requirement_ids: env.requirement_ids, requirement_count: env.requirement_count, execution_contract: contract } as unknown as Record<string, unknown>,
      };
    }
    return { exitCode: ExitCode.InvalidArgument, message: `Usage: cross-host-handoff encode|acknowledge|verify (hosts: ${listHandoffDialectHosts().join(", ")})` };
  } catch (error) {
    if (error instanceof HandoffGuardError) {
      return { exitCode: ExitCode.GeneralError, message: `BLOCKED BEFORE EDIT: ${error.message}`, data: { code: error.code } as unknown as Record<string, unknown> };
    }
    throw error;
  }
}
function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i]?.startsWith("--")) {
      flags[args[i].slice(2)] = args[i + 1] ?? "";
      i += 1;
    }
  }
  return flags;
}

function detectHostFromPacket(raw: Uint8Array): string {
  const text = new TextDecoder().decode(raw);
  for (const host of listHandoffDialectHosts()) {
    if (text.includes(`agent-rules:handoff:${host}`)) return host;
    if (text.includes(`AGENT-RULES HANDOFF [${host}]`)) return host;
    if (text.includes(`{host=${host}}`)) return host;
    if (text.includes(`handoff (${host})`)) return host;
    if (text.includes(`handoff <${host}>`)) return host;
    if (text.includes(`[/agent-rules][${host}]`)) return host;
    if (text.includes(`"host":"${host}"`)) return host;
    if (text.includes(`handoff ${host}`)) return host;
  }
  throw new HandoffGuardError("ENVELOPE_INVALID", "packet does not match any registered host dialect");
}
