/**
 * Agent Rules OpenCode Plugin (V2 context/request hook, REQ-008).
 * Routes user prompt via canonical routeNativeTurn and injects system context into messages.
 */
import {
  routeNativeTurn,
  type NativeTurnRequest,
} from '@initforge/agent-rules-kernel/northstar/native-turn-router.js';

export interface OpenCodePluginContext {
  session?: {
    hook: (event: "context/request" | "context" | "http.request" | "http.response", handler: (data: unknown) => Promise<unknown>) => void;
  };
  tool?: {
    hook: (event: "execute.before" | "execute.after", handler: (data: unknown) => Promise<unknown>) => void;
  };
}

export default function agentRulesPlugin(ctx: OpenCodePluginContext): void {
  if (ctx.session?.hook) {
    // V2 context/request hook
    ctx.session.hook("context/request", async (data: unknown) => {
      const payload = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {};
      const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
      if (!prompt.trim()) return data;

      try {
        const request: NativeTurnRequest = {
          protocol_version: '2.0',
          host: 'opencode',
          session_id: String(payload.sessionId || `opencode-${process.pid}`),
          turn_id: `turn-${Date.now()}`,
          cwd: String(payload.cwd || process.cwd()),
          prompt,
          host_facts: { client: 'interactive' },
        };
        const { capsule } = routeNativeTurn(request);

        const messages = Array.isArray(payload.messages) ? [...payload.messages] : [];
        messages.push({
          role: 'system',
          content: capsule.context.rendered,
        });
        return {
          ...payload,
          messages,
        };
      } catch {
        return data;
      }
    });

    // Compatibility context hook
    ctx.session.hook("context", async () => {
      return {
        role: "system",
        content: "# Agent Rules OpenCode Active\nInvariants and requirement ledger enforcement active.",
      };
    });
  }

  // Tool execution hook: enforce read-only boundary during PLAN mode
  if (ctx.tool?.hook) {
    ctx.tool.hook("execute.before", async (data: unknown) => {
      const toolCall = data as { name?: string; args?: unknown };
      if (process.env.AGENT_RULES_ROLE === "planner") {
        const mutatingTools = new Set(["edit", "write", "patch", "bash", "execute", "delete"]);
        const toolName = toolCall?.name?.toLowerCase() ?? "";
        if (mutatingTools.has(toolName)) {
          throw new Error(`Tool execution forbidden in PLAN mode: ${toolName}`);
        }
      }
      return data;
    });

    ctx.tool.hook("execute.after", async (data: unknown) => {
      return data;
    });
  }
}
