# Skill / MCP / Capability / Provider Fabric Reconciliation — Phase Plan

Plan ID: `skill-mcp-fabric-v1`
Relation to previous pointer: **supersession** — the previous plan
(`harness-universal-reconciliation-v1`, generation 14, tip AM-0006) remains
durable history in its own ledger; this owner-authorized phase becomes the only
active plan source per AGENTS.md next-phase steering. Its PARTIAL/unclosed work
is not deleted and is not claimed terminal here.

## Outcome contract

The harness remains a small trusted kernel. Capability is a logical contract;
provider is an implementation; transport is MCP/CLI/native/hook/plugin;
middleware transforms shell output; skill adds scarce expertise only; policy/
kernel owns scope, planning, verification, evidence, completion, repair,
recovery, acceptance. External expertise is versioned and gated; verification
is deterministic; global MCP stays `none`; Pencil stays explicit-only; no
second registry; no mass deletion; no self-authored PASS.

## Phases

### Phase 0 — Gate, plan, pointer CAS (this run)
- Read pointer; classify relation; create plan artifacts; create ledger;
  CAS pointer generation 14 → 15; no runtime changes until state is valid.

### Phase 1 — Taxonomy and compatibility projection
- Capability/provider/transport/middleware separation; additive capability
  alias map in the kernel broker (`docs.library`, `shell.output.reduce`,
  `code.graph`, `code.symbol`, `design.pen` → legacy canonical names); registry
  reclassification metadata (RTK middleware + per-host enforcement; Context7
  docs provider on-demand; codebase-memory advisory coverage contract);
  validator fixtures; unit tests.

### Phase 2 — Routing and activation
- Fix `requires` semantics (remove `browser-qa -> qa-skills`); remove
  keyword-only triggers that can activate correctness-critical providers
  (`playwright` from Playwright MCP, `research` from Context7); rebuild the
  generated context graph through the canonical builder; update route fixtures
  and engine tests to the new expected behavior.

### Phase 3 — External candidate reconciliation
- Add the five missing candidate-fabric records (impeccable,
  vercel-react-best-practices, vercel-web-design-guidelines,
  callstack-react-native-best-practices, trail-of-bits-security) with real
  pinned revisions, tree hashes, license status, security review state
  (pending), benchmark (pending), rollback plans; keep the selected set empty;
  reclassify providers (agent-device, chrome-devtools-mcp, RTK, Context7,
  Playwright, Pencil); document plugin governance (plugin is a bundle, never a
  capability; route underlying skill/provider).

### Phase 4 — Bounded migration and docs
- Keep all legacy skills and dispositions; update docs (integrations README,
  skills README, integration READMEs) to reflect reclassification; no mass
  deletion; no destructive capability renames.

### Phase 5 — Evals, verification, acceptance
- Run full verification baseline and all validators; map command output to
  REQ/CLM; finalize ledger findings/checkpoint/readiness; refresh pointer
  ledger binding via second CAS; produce the final handoff report; report any
  BLOCKED/NEEDS_USER with exact blockers.

## Requirements (requirements.yaml is the flat ledger)

REQ-001 taxonomy; REQ-002 capability aliases (additive); REQ-003 inventory
completeness; REQ-004 candidate-fabric reconciliation; REQ-005 routing/requires
fix + graph rebuild; REQ-006 browser provider lifecycle; REQ-007 code
intelligence lifecycle; REQ-008 Context7 docs routing; REQ-009 RTK middleware;
REQ-010 Pencil explicit-only; REQ-011 security/source trust; REQ-012 schema/
registry compatibility; REQ-013 migration/parity; REQ-014 evaluation/rollback/
acceptance.

## Acceptance posture

No claim in this plan passes on prose. Every acceptance maps to verifier
evidence (validators, unit tests, schema validation, fixture parity, ledger
records). Unavailable commands/providers are reported UNAVAILABLE/BLOCKED and
are never fabricated.
