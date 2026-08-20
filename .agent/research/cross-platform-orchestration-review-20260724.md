# Cross-platform orchestration review

## Summary

The shared plan format and behavioral rules are portable, but end-to-end orchestration is not yet proven portable. Codex has the strongest verified path. Cursor and Antigravity expose native subagents, but this harness does not install host-specific agent/model profiles. Grok subagent/model capability remains unverified.

## Evidence

- Shared rules require an explicit execute pivot, adaptive delegation, main-agent accountability, and conditional ledger use.
- Runtime builds mirror the same rules and skills to Codex, Grok, Antigravity, and Cursor.
- No platform-specific subagent definition or model-alias files are installed.
- `workctl.py` is canonical automation in this repository, but is not present in generated runtime builds for arbitrary working repositories.
- Hooks route context and record receipts; they do not invoke workctl or mechanically force orchestration.
- Codex manual documents custom subagents, per-subagent models/effort, and default subagent settings.
- Cursor documents async/nested subagents with custom prompts, tools, and models.
- Google Antigravity codelabs document subagent-driven development and parallel agents; available models can be selected per CLI session.
- Current official xAI search did not establish the local Grok subagent/config surface assumed by this harness.

## Risks

- A pasted plan without an explicit execute instruction remains review input by design.
- Model classes are portable, but Codex-specific example names leak into shared guidance.
- Doctor PASS can be misread as proof of multi-agent execution; it currently proves installation/adapters.
- The main agent can still take large implementation slices, polluting the intent-holding context.
- Copying only the plan does not carry later conversation instructions or an existing gitignored ledger.

## Recommendation

- Keep the host-selected main model; route models only for subagents by capability class.
- Prefer economy research/test/inventory subagents, standard implementation subagents, and expert review only on triggered risk.
- Add a per-platform capability/model adapter and graceful single-agent fallback.
- Make the main agent own intent, allocation, integration decisions, final diff review, terminal verification, and Git actions; delegate most exploration and implementation.
- Test one identical portable plan end-to-end on every host before claiming cross-platform orchestration PASS.

## Unknowns

- Exact Grok native subagent and per-agent model configuration.
- Whether Antigravity supports per-subagent model overrides rather than session-level selection.
- Whether each host can call a centrally installed portable ledger command from arbitrary repositories.

## Hand to Plan Architect

- Assumption: every host loads the same plan/finish skills.
- Known unknown: host-specific subagent model configuration.
- Known unknown: portable workctl installation and automatic invocation.
- Required proof: identical-plan execution matrix across all four hosts.
