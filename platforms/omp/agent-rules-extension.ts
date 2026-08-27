// Native OMP extension — thin lifecycle adapter for canonical turn router (REQ-006, AC-02).
// Subscribes to OMP lifecycle hooks (before_agent_start, context, turn_end, session_shutdown)
// and invokes routeNativeTurn before each model turn.
import path from 'node:path';
import {
  routeNativeTurn,
  type NativeTurnRequest,
  type RouteCapsule,
} from '../agent-rules-runtime/northstar/native-turn-router.js';

type OmpApi = {
  setLabel(label: string): void;
  on(event: string, handler: (event: Record<string, unknown>, ctx: OmpContext) => unknown): void;
  logger?: { debug?: (message: string) => void; info?: (message: string) => void; warn?: (message: string) => void };
};

type OmpContext = {
  cwd: string;
  sessionManager?: {
    getSessionId?: () => string;
    getEntries?: () => Array<{ id?: string; type?: string }>;
  };
  model?: {
    id?: string;
    provider?: string;
  };
};

interface ActiveTurnCache {
  routeId: string;
  capsule: RouteCapsule;
  timestamp: number;
}

const activeSessions = new Map<string, ActiveTurnCache>();
let turnCounter = 0;

/** OMP auto-loads this default factory from active-agent/extensions. */
export default function agentRulesOmpExtension(pi: OmpApi): void {
  pi.setLabel('agent-rules');

  // 1. before_agent_start: The primary pre-model seam in OMP.
  // Fired after prompt expansion, before the LLM loop begins.
  pi.on('before_agent_start', (event, ctx) => {
    const prompt = typeof event.prompt === 'string' ? event.prompt : '';
    if (!prompt.trim()) return;

    const sessionId = ctx.sessionManager?.getSessionId?.() ?? `omp:${ctx.cwd}`;
    const turnId = `turn-${++turnCounter}-${Date.now()}`;
    const hostFacts = {
      client: process.env.OMP_HEADLESS === '1' ? 'headless' : 'interactive',
      environment: process.platform,
      profile: process.env.OMP_PROFILE || process.env.PI_PROFILE || null,
      provider: ctx.model?.provider ?? null,
      model: ctx.model?.id ?? null,
    };

    const request: NativeTurnRequest = {
      protocol_version: '2.0',
      host: 'omp',
      session_id: sessionId,
      turn_id: turnId,
      cwd: ctx.cwd,
      prompt,
      host_facts: hostFacts,
    };

    try {
      const runsRoot = path.join(ctx.cwd, '.agent', 'runs');
      const { capsule } = routeNativeTurn(request, { runsRoot });
      activeSessions.set(sessionId, {
        routeId: capsule.route_id,
        capsule,
        timestamp: Date.now(),
      });

      const skillList = capsule.skills.map((s) => s.id).join(',');
      pi.logger?.debug?.(
        `agent-rules routed turn [${capsule.route_id}] status=${capsule.status} skills=${skillList || 'none'}`
      );

      // Inject rendered pre-model context into systemPrompt for this turn
      const currentSystemPrompt = typeof event.systemPrompt === 'string' ? event.systemPrompt : '';
      const injectedSystemPrompt = currentSystemPrompt
        ? `${currentSystemPrompt}\n\n${capsule.context.rendered}`
        : capsule.context.rendered;

      return {
        systemPrompt: injectedSystemPrompt,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      pi.logger?.warn?.(`agent-rules routing error: ${msg}`);
    }
  });

  // 2. context: Reuse the turn's capsule during context preparation
  pi.on('context', (_event, ctx) => {
    const sessionId = ctx.sessionManager?.getSessionId?.() ?? `omp:${ctx.cwd}`;
    const cached = activeSessions.get(sessionId);
    if (!cached) return;
    pi.logger?.debug?.(`agent-rules active context capsule [${cached.routeId}]`);
  });

  // 3. turn_end & session_shutdown: Lifecycle cleanup
  pi.on('turn_end', (_event, ctx) => {
    const sessionId = ctx.sessionManager?.getSessionId?.() ?? `omp:${ctx.cwd}`;
    pi.logger?.debug?.(`agent-rules turn completed for session ${sessionId}`);
  });

  pi.on('session_shutdown', (_event, ctx) => {
    const sessionId = ctx.sessionManager?.getSessionId?.() ?? `omp:${ctx.cwd}`;
    activeSessions.delete(sessionId);
  });
}
