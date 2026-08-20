# Claude/OpenCode bridge 503

## Summary

Claude Code sends Anthropic Messages requests, while the configured QwenCoder endpoint accepts OpenAI Chat Completions. LiteLLM initially forwarded Claude beta requests through OpenAI Responses API, which QwenCoder rejected with 503.

## Evidence

- QwenCoder model discovery returned the four configured model IDs.
- Direct OpenAI Chat Completions to `gpt-5.6-sol` returned HTTP 200.
- LiteLLM logs showed the failing Claude request was translated through `aresponses`.
- Forcing `use_chat_completions_api: true` for each bridge model made the Claude beta route return HTTP 200 and a Claude CLI smoke test return `BRIDGE_FIXED`.

## Recommendation

Run the managed local `claude-opencode-bridge` container and keep Claude configured for `http://127.0.0.1:4000`; the bridge holds the OpenCode upstream credential and translates Anthropic requests to OpenAI Chat Completions.

## Risks and unknowns

- The bridge is a local Docker dependency; Docker must be running.
- The user's real interactive Claude session must be restarted to pick up the corrected endpoint.

## Hand to Plan Architect

- Assumption: QwenCoder continues supporting the four discovered OpenAI model IDs.
- Known unknown: complex Claude tool-calling behavior has not been exhaustively exercised against this third-party endpoint.
