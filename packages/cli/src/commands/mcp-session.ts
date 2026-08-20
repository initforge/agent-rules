/**
 * commands/mcp-session.ts — user-facing persistent MCP session command (owner §6).
 *
 *   agent-rules mcp-session list                list persistent broker sessions/leases
 *   agent-rules mcp-session inspect <lease-id>  inspect session/provider/window/workspace
 *   agent-rules mcp-session reconnect <lease>   reconnect (provider died, resource survives)
 *   agent-rules mcp-session stop <lease>        explicit owner stop (release, closes provider)
 *   agent-rules mcp-session close-stale         close stale physical resources, keep logical history
 *
 * State dir: AGENT_RULES_MCP_STATE_DIR or ~/.local/state/agent-rules/mcp-broker.
 * Explicit owner actions only; never auto-expires, never auto-stops, never
 * deletes logical history.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";

const REPO_ROOT = path.resolve(__dirnameSafe(), "..", "..", "..", "..");

function __dirnameSafe(): string {
  return path.dirname(new URL(import.meta.url).pathname);
}

function stateDir(): string {
  return process.env.AGENT_RULES_MCP_STATE_DIR ?? path.join(os.homedir(), ".local", "state", "agent-rules", "mcp-broker");
}

async function loadBroker() {
  const guardianPkg = path.join(REPO_ROOT, "packages", "mcp-guardian");
  const { StateStore } = await import(path.join(guardianPkg, "dist", "state", "store.js"));
  const { Broker } = await import(path.join(guardianPkg, "dist", "broker", "broker.js"));
  const dir = stateDir();
  if (!fs.existsSync(path.join(dir, "broker.sqlite3"))) {
    throw new Error(`no broker state at ${dir} — nothing to manage yet`);
  }
  const broker = new Broker({ stateStore: new StateStore({ stateDir: dir }) });
  return { broker, dir };
}

export async function mcpSessionCmd(args: string[], options: CliOptions): Promise<CommandResult> {
  const [sub, ...rest] = args;
  try {
    const { broker, dir } = await loadBroker();
    switch (sub) {
      case "list": {
        const leases = broker.listLeases({});
        return {
          exitCode: ExitCode.Success,
          message: JSON.stringify({
            state_dir: dir,
            count: leases.length,
            leases: leases.map((l: { lease_id: string; logical_session_id: string; provider_id: string; status: string; sharing_mode: string; current_workspace: number | null; provider_pid: number | null; resource_id: string | null; reconnect_attempts: number; created_at: string; updated_at: string }) => ({
              lease_id: l.lease_id,
              logical_session_id: l.logical_session_id,
              provider_id: l.provider_id,
              status: l.status,
              sharing_mode: l.sharing_mode,
              workspace: l.current_workspace,
              provider_pid: l.provider_pid,
              resource_id: l.resource_id,
              reconnect_attempts: l.reconnect_attempts,
              created_at: l.created_at,
              updated_at: l.updated_at,
            })),
          }, null, 2),
        };
      }
      case "inspect": {
        const leaseId = rest[0];
        if (!leaseId) return { exitCode: ExitCode.InvalidArgument, message: "usage: agent-rules mcp-session inspect <lease-id>" };
        const lease = broker.getLease(leaseId);
        if (!lease) return { exitCode: ExitCode.GeneralError, message: `lease ${leaseId} not found` };
        const transitions = broker.transitionsFor(leaseId);
        return {
          exitCode: ExitCode.Success,
          message: JSON.stringify({
            lease: {
              lease_id: lease.lease_id,
              logical_session_id: lease.logical_session_id,
              provider_id: lease.provider_id,
              status: lease.status,
              sharing_mode: lease.sharing_mode,
              initial_workspace: lease.initial_workspace,
              current_workspace: lease.current_workspace,
              provider_instance_id: lease.provider_instance_id,
              mcp_connection_id: lease.mcp_connection_id,
              resource_id: lease.resource_id,
              provider_pid: lease.provider_pid,
              provider_start_time: lease.provider_start_time,
              provider_window_fingerprints: lease.provider_window_fingerprints,
              reconnect_attempts: lease.reconnect_attempts,
              visibility_mode: lease.visibility_mode,
              created_at: lease.created_at,
              updated_at: lease.updated_at,
            },
            transitions: transitions.map((t: { transition_id: number; from_status: string; to_status: string; reason: string; ts: string }) => ({
              transition_id: t.transition_id,
              from_status: t.from_status,
              to_status: t.to_status,
              reason: t.reason,
              ts: t.ts,
            })),
          }, null, 2),
        };
      }
      case "reconnect": {
        const leaseId = rest[0];
        if (!leaseId) return { exitCode: ExitCode.InvalidArgument, message: "usage: agent-rules mcp-session reconnect <lease-id>" };
        // Reconnect is driven by the host adapter (guardian connect); the
        // broker-side operation records the reattach outcome. The CLI surfaces
        // the current durable state and the reconnect path available.
        const lease = broker.getLease(leaseId);
        if (!lease) return { exitCode: ExitCode.GeneralError, message: `lease ${leaseId} not found` };
        const host = broker.getHostSession(lease.logical_session_id);
        return {
          exitCode: ExitCode.Success,
          message: JSON.stringify({
            note: "reconnect is host-driven: the next guardian connect on this lease reattaches the surviving resource or records RESOURCE_RECREATED",
            lease_id: lease.lease_id,
            logical_session_id: lease.logical_session_id,
            status: lease.status,
            provider_pid: lease.provider_pid,
            resource_id: lease.resource_id,
            host_session: host ? { host_kind: host.host_kind, host_session_id: host.host_session_id, granularity: host.granularity } : null,
            reconnect_attempts: lease.reconnect_attempts,
          }, null, 2),
        };
      }
      case "stop": {
        const leaseId = rest[0];
        if (!leaseId) return { exitCode: ExitCode.InvalidArgument, message: "usage: agent-rules mcp-session stop <lease-id>" };
        const lease = broker.getLease(leaseId);
        if (!lease) return { exitCode: ExitCode.GeneralError, message: `lease ${leaseId} not found` };
        // Explicit owner stop: require the lease token to prove ownership.
        const token = process.env.AGENT_RULES_LEASE_TOKEN;
        if (!token) {
          return { exitCode: ExitCode.InvalidArgument, message: "stop requires AGENT_RULES_LEASE_TOKEN (ownership proof); the token is never stored on disk" };
        }
        const rec = broker.releaseLease(leaseId, token, `explicit owner stop via agent-rules mcp-session stop (${new Date().toISOString()})`);
        return { exitCode: ExitCode.Success, message: JSON.stringify({ stopped: true, lease_id: leaseId, to_status: rec.to_status, reason: rec.reason }, null, 2) };
      }
      case "close-stale": {
        const { closed, considered } = broker.closeStaleLeases();
        return {
          exitCode: ExitCode.Success,
          message: JSON.stringify({
            considered,
            closed: closed.map((r: { lease_id: string; from_status: string; to_status: string; reason: string }) => ({ lease_id: r.lease_id, from_status: r.from_status, to_status: r.to_status, reason: r.reason })),
            note: "logical history and leases are preserved; only stale physical resources are closed",
          }, null, 2),
        };
      }
      default:
        return {
          exitCode: ExitCode.InvalidArgument,
          message: `unknown subcommand '${sub ?? ""}'. Usage: agent-rules mcp-session (list|inspect|reconnect|stop|close-stale)`,
        };
    }
  } catch (e) {
    return { exitCode: ExitCode.GeneralError, message: `mcp-session: ${(e as Error).message}` };
  }
}
