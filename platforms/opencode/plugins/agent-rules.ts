/**
 * Agent Rules OpenCode Plugin
 * Implements documented OpenCode runtime lifecycle hooks:
 * - ctx.session.hook("context" | "http.request" | "http.response")
 * - ctx.tool.hook("execute.before" | "execute.after")
 */

export interface OpenCodePluginContext {
  session?: {
    hook: (event: "context" | "http.request" | "http.response", handler: (data: unknown) => Promise<unknown>) => void;
  };
  tool?: {
    hook: (event: "execute.before" | "execute.after", handler: (data: unknown) => Promise<unknown>) => void;
  };
}

export default function agentRulesPlugin(ctx: OpenCodePluginContext): void {
  // Context hook: inject Agent Rules context into the active session
  if (ctx.session?.hook) {
    ctx.session.hook("context", async () => {
      return {
        role: "system",
        content: "# Agent Rules OpenCode Supervision Active\nInvariants and requirement ledger enforcement active.",
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
