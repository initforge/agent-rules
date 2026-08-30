// agent-rules:managed:command-code BEGIN
// Self-contained static Command Code mod. It embeds compiled canonical rules
// and never calls back into agent-rules or an interpreter/runtime launcher.

const AGENT_RULES_STATIC_PROMPT = `__AGENT_RULES_RULES__`;

interface CommandCodeHooks {
  transformContext?: (ctxData: unknown, ctx: unknown) => { systemPrompt?: string } | void;
  appendSystemPrompt?: () => string;
}

export default function agentRules(cmd: { hooks: (hooks: CommandCodeHooks) => void }): void {
  cmd.hooks({
    transformContext: () => ({ systemPrompt: AGENT_RULES_STATIC_PROMPT }),
    appendSystemPrompt: () => AGENT_RULES_STATIC_PROMPT,
  });
}
// agent-rules:managed:command-code END
