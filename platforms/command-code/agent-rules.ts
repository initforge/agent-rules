// agent-rules:managed:command-code BEGIN
// This file is installed as a user-scope Command Code mod and loaded with the
// session-scoped --mod flag by the native adapter.

const AGENT_RULES_PROMPT = [
  "Agent Rules is active for this session. The complete installed rules follow.",
  "__AGENT_RULES_RULES__",
].join("\n");

export default function agentRules(cmd: { hooks: (hooks: { appendSystemPrompt: () => string }) => void }): void {
  cmd.hooks({
    appendSystemPrompt: () => AGENT_RULES_PROMPT,
  });
}

// agent-rules:managed:command-code END
