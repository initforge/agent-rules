// agent-rules:managed:command-code BEGIN
// This file is installed as a user-scope Command Code mod and loaded with the
// session-scoped --mod flag by the native adapter (REQ-008).
import {
  routeNativeTurn,
  type NativeTurnRequest,
  type RouteCapsule,
} from '@initforge/agent-rules-kernel/northstar/native-turn-router.js';

const AGENT_RULES_BASE_PROMPT = `__AGENT_RULES_RULES__`;

interface CommandCodeHooks {
  transformInput?: (input: { prompt?: string }, ctx: { cwd?: string; sessionId?: string }) => void;
  transformContext?: (ctxData: unknown, ctx: { cwd?: string; sessionId?: string }) => { systemPrompt?: string } | void;
  appendSystemPrompt?: () => string;
}

export default function agentRules(cmd: { hooks: (hooks: CommandCodeHooks) => void }): void {
  let activeCapsule: RouteCapsule | null = null;

  cmd.hooks({
    transformInput: (input, ctx) => {
      const prompt = input?.prompt ?? '';
      if (!prompt.trim()) return;

      try {
        const request: NativeTurnRequest = {
          protocol_version: '2.0',
          host: 'command-code',
          session_id: ctx?.sessionId ?? `cmdc-${process.pid}`,
          turn_id: `turn-${Date.now()}`,
          cwd: ctx?.cwd ?? process.cwd(),
          prompt,
          host_facts: { client: 'interactive' },
        };
        const { capsule } = routeNativeTurn(request);
        activeCapsule = capsule;
      } catch {
        activeCapsule = null;
      }
    },
    transformContext: (_ctxData, _ctx) => {
      if (activeCapsule?.context?.rendered) {
        return { systemPrompt: `${AGENT_RULES_BASE_PROMPT}\n\n${activeCapsule.context.rendered}` };
      }
      return { systemPrompt: AGENT_RULES_BASE_PROMPT };
    },
    appendSystemPrompt: () => {
      if (activeCapsule?.context?.rendered) {
        return `${AGENT_RULES_BASE_PROMPT}\n\n${activeCapsule.context.rendered}`;
      }
      return AGENT_RULES_BASE_PROMPT;
    },
  });
}
// agent-rules:managed:command-code END
