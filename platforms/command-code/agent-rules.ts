// agent-rules:managed:command-code BEGIN
// This file is installed as a user-scope Command Code mod and loaded with the
// session-scoped --mod flag by the native adapter.

const AGENT_RULES_PROMPT = [
  "Agent Rules is active for this session.",
  "Preserve raw user intent and requirement/claim/task traceability.",
  "Workers report observations; verifier evidence derives PASS.",
  "Do not weaken, skip, or disable verification.",
  "Stay within the owned scope and report missing truth as BLOCKED or NEEDS_USER.",
].join("\n");

export default function agentRules(cmd: { hooks: (hooks: { appendSystemPrompt: () => string }) => void }): void {
  cmd.hooks({
    appendSystemPrompt: () => AGENT_RULES_PROMPT,
  });
}

// agent-rules:managed:command-code END
