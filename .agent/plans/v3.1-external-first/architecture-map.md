# V3.1 A–Z architecture map

## A. Authority and raw intent
`.agent/current.json`, `packages/kernel/src/state/current-pointer.ts`, and
`original.md` are canonical. Every switch is generation-CAS.

## B. Baseline and V3 preservation
The completed `.agent/plans/v3-decision-fabric/` and its closure evidence stay
historical and are not rewritten by V3.1.

## C. Cleanup lifecycle
`.agent/cleanup-policy.json`, `.agent/tombstones/`, `packages/cli/src/cleanup/`
and the new graph inventory implement ACTIVE/SUPERSEDED/RETIRED/PURGE_ELIGIBLE.

## D. Durable delta writes
`.agent/` projections are written only when canonical content, authority,
evidence, or lifecycle state changes; scratch stays ignored.

## E. External attestation
`.github/workflows/quality.yml`, `certification.yml`, and a signed/hash-bound
receipt under `.agent/evidence/` remain separate from local claims.

## F. Skill fabric
`skills/catalog.json`, `skills/candidate-fabric.json`, and the typed resolver
are the only candidate/activation surface. No package manager is added.

## G. Governance and provenance
External candidate records carry source URL, ref/version, content hash,
adoption mode, trust review, no-skill comparison, and activation policy.

## H. Hosted CI
Quality runs on hosted matrix runners. Native certification is an explicit
capability check and reports unavailable rather than faking PASS.

## I. Impact facts
`automation/detect-stack-facts.mjs` and `decision-fabric.ts` provide bounded,
source-hashed RepoFacts/ChangeFacts/TaskFacts.

## J. JavaScript/TypeScript proof
`npm run check`, governed Vitest, package builds, and clean-room packaged smoke
tests remain the cheap automatic layer.

## K. Kernel boundary
Workers return receipts; `evidence-ledger.ts` and acceptance audit derive PASS.

## L. Localization ladder
Localization starts with exact source anchors, then symbols, decisions,
RepoFacts and bounded search; no whole-repository context is default.

## M. MCP policy
MCP annotations and external text are untrusted input. Effect policy and
explicit activation stay local.

## N. Native/CLI preference
Existing CLI/runtime providers are preferred over MCP when they prove the
required outcome. Browser MCP is exploration-only.

## O. Operator mode
`EXPLORE` may use ignored scratch; `DELIVER` may commit only promoted artifacts.
The promotion gate checks scope, lifecycle class, tests and evidence.

## P. Platform seam
`packages/kernel/src/runner/platform.ts` is the shared portability seam;
engine re-exports it and does not fork platform behavior.

## Q. Quality and semantic diff
Review uses claim-first verification and semantic-diff signals before expensive
review; required tests cannot be weakened.

## R. Retrieval graph
Active retrieval follows current pointer, effective ledger, contract, evidence,
forward links and live consumers; superseded nodes are excluded.

## S. Supersession
Control Plane goal switching calls a canonical kernel transaction and rejects
stale task/result landing by work/generation/spec identity.

## T. Tool effects
Provider capability, permission, health, fallback and activation are typed and
effect-gated; external skills cannot grant write/destructive effects.

## U. Upstream assets
Anthropic/Vercel/Expo/Prisma/Supabase/HashiCorp/agent-device/DevTools sources
are reference or on-demand candidates, never vendored bundles.

## V. Verification matrix
Candidates are compared against no skill, current local skill, external asset,
and composition where applicable using verified outcome metrics.

## W. Workstream closure
The ledger and closure receipt bind every requirement and hard-truth gate to
evidence; missing native runners remain a clearly reported residual blocker.

## X. Exact file disposition
KEEP canonical kernel, contracts, verifier, docs-style, verification-router,
profile packs and manual Pencil manifest. MODIFY lifecycle, resolver, facts,
control-plane and tests. ARCHIVE only migration-only artifacts after parity.
DELETE nothing until graph-safe purge eligibility and parity are proven.

## Y. Rollback boundaries
Each phase has a commit and pointer generation boundary. Rollback restores the
previous pointer/ledger and leaves receipts/tombstones for audit.

## Z. Metrics
Record verified success, time-to-slice, interventions, regressions, skill/tool
precision, context size, cleanup debt, repair loops, stale acceptance and new
abstraction count in the V3.1 closure evidence.
