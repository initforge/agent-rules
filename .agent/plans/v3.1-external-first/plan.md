# V3.1 External-First Hardening, Skill Resolution & Cleanup Lifecycle

This is the owner-authorized continuation phase after the completed V3
decision-fabric migration. The raw directive is preserved in `original.md`.
The phase keeps V3 artifacts immutable and makes V3.1 the only active owner
through `.agent/current.json` generation-CAS.

## Outcome contract

The harness must remain a small trusted kernel: ordinary work may route to
`skills: []`; specialist work resolves the smallest external asset only when
needed; providers are effect-gated; deterministic verifiers author evidence;
cleanup is graph-safe; and the Control Plane is an operator view of canonical
authority. No source of truth is invented when a provider, business fact, or
native runner is unavailable.

## Phases

0. Preserve V3 as historical, establish V3.1 raw intent, plan, ledger and
   current-pointer activation.
1. Add external CI attestation, lifecycle inventory, graph-safe cleanup and
   active retrieval filtering.
2. Add an external-first skill resolver around existing `gh skill` surfaces;
   never create a second skill package manager and never install implicitly.
3. Cut frontend/browser selection over to explicit composition and deterministic
   browser proof, with legacy routes retained only behind parity evidence.
4. Resolve Expo/React Native through RepoFacts and provider bindings without a
   mobile mega-skill.
5. Resolve backend/database framework assets while keeping migration trust local.
6. Resolve HashiCorp/DevOps and deterministic security scanners through the
   existing capability/effect registry.
7. Migrate legacy skills using shadow, no-skill comparison, parity, cutover and
   tombstone/retirement records; do not mass-delete.
8. Simplify rules and ROUTE only after typed resolver evidence proves parity.
9. Add clean-room, hierarchical facts, localization, Context Capsule,
   semantic-diff and portability seams.
10. Add EXPLORE/DELIVER, Promotion Gate, complexity budget, information-delta
    writes, negative-knowledge policy and bounded checkpoint repair.
11. Dogfood the Control Plane with explicit Pencil capability when available,
    validate runtime/browser proof, run lifecycle GC, and close with external
    attestation. Native-host certification remains BLOCKED if runners are absent.

## Required planning output A–Z

The architecture map is the source-linked answer to the requested planning
output. Each letter names an existing authority, its change boundary, and a
verification path; no new package is introduced by this phase.

## Acceptance and rollback

Each phase is independently revertible at its commit boundary. A failed phase
must leave the previous pointer generation valid, preserve raw intent and
evidence, and report `BLOCKED`/`NEEDS_USER` for missing authority or provider
capability. Completion requires local clean-room checks, all available hosted
quality jobs green, a hash-bound remote attestation, and a runtime installation
receipt for the machine. Native certification is never synthesized.

## Dogfood rule

After pointer activation, the implementation itself uses the V3.1 cleanup
inventory/dry-run, external-attestation receipt shape, candidate provenance,
phase mode and Control Plane authority path. Temporary exploration artifacts
stay under ignored `.agent/tmp`; only promoted evidence and canonical state are
committed.
