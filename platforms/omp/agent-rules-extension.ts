// Native OMP extension. It observes the host-owned session rather than
// starting another agent or scheduler inside OMP.
// OMP auto-discovers every top-level .js/.ts file in `extensions/` as a
// factory. Keep this support module below a non-entry directory so only this
// file is loaded as the native extension factory.
import { nativeSessionEvent } from './agent-rules-runtime/native-session.js';

type OmpApi = {
  setLabel(label: string): void;
  on(event: string, handler: (event: Record<string, unknown>, ctx: { cwd: string; sessionManager?: { getSessionId?: () => string } }) => unknown): void;
  logger?: { debug?: (message: string) => void };
};

function binding(ctx: { cwd: string; sessionManager?: { getSessionId?: () => string } }, packetId = 'unbound') {
  return {
    host: 'omp',
    client: process.env.OMP_HEADLESS === '1' ? 'headless' : 'interactive',
    environment: process.platform,
    profile: process.env.OMP_PROFILE || process.env.PI_PROFILE,
    effectiveConfigPath: process.env.PI_CODING_AGENT_DIR,
    executablePath: process.execPath,
    sessionId: ctx.sessionManager?.getSessionId?.() ?? `omp:${ctx.cwd}`,
    packetId,
    contextGeneration: 0,
  };
}

/** OMP auto-loads this default factory from active-agent/extensions. */
export default function agentRulesOmpExtension(pi: OmpApi): void {
  pi.setLabel('agent-rules');
  const observed = new Set<string>();
  const note = (kind: 'input' | 'before_tool' | 'tool_result' | 'checkpoint' | 'completed' | 'cancelled', event: Record<string, unknown>, ctx: { cwd: string; sessionManager?: { getSessionId?: () => string } }) => {
    const packetId = typeof event.packet_id === 'string' ? event.packet_id : 'unbound';
    const fact = nativeSessionEvent(binding(ctx, packetId), kind);
    if (observed.has(fact.id)) return;
    observed.add(fact.id);
    // The host logger is intentionally the observation sink for unbound chats.
    // A managed WorkPacket can consume the same event schema without creating
    // durable plans or a second model loop for ordinary Q&A.
    pi.logger?.debug?.(`agent-rules ${fact.kind} ${fact.session_id}`);
  };
  pi.on('input', (event, ctx) => note('input', event, ctx));
  pi.on('tool_call', (event, ctx) => note('before_tool', event, ctx));
  pi.on('tool_result', (event, ctx) => note('tool_result', event, ctx));
  pi.on('session_before_compact', (event, ctx) => note('checkpoint', event, ctx));
  pi.on('turn_end', (event, ctx) => note('completed', event, ctx));
  pi.on('session_shutdown', (event, ctx) => note('cancelled', event, ctx));
}
