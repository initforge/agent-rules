# Executable plan template

Scale detail to risk, but never omit implementation truth or proof. A plan is an execution contract, not an A-B-C topic list.

```md
# <observable outcome>

## 1. Intent and boundaries
- Outcome: <what the user can observe>
- Risk classification: <risk first; why the classification fits>
- In scope: <deliverables>
- Non-goals: <explicit exclusions>
- Scope lock: <allowed systems, repositories and external actions>
- Owner decisions: <settled choices the executor must preserve>
- Meaningful open questions: <only scope/behavior/safety/authority/proof gaps>
- Assumptions to verify: <known-unknown -> cheapest decisive check>

## 2. Repository truth
- Baseline: <branch/commit/dirty state>
- Architecture/runtime: <relevant services, packages, data stores, deploy target>
- Reference/template map: <source -> destination -> exact reuse -> justified deviation>
- Existing tests, logs, monitoring and constraints: <paths/commands>

## 3. Change map
| Area | Current truth | Exact change | Files/entities/API/schema | Compatibility |
|---|---|---|---|---|
| <module> | <observed> | <implementation> | <concrete paths/contracts> | <impact> |

Include repository creation, entities, migrations, APIs, UI states, tests, cleanup or documentation when the outcome needs them. Do not leave these as executor guesses.

## 4. Acceptance and proof contract
| AC | Precondition/data | Action | Observable result | Negative invariant | Proof profile and fresh evidence |
|---|---|---|---|---|---|
| AC1 | <state> | <operation> | <expected result> | <must not regress> | <unit/API/browser/diff/query/perf evidence> |

`build` proves compilation only. UI parity requires source-copy mapping, justified diff, desktop/mobile visual comparison, interaction and state coverage, plus live console/network/API evidence. Choose equivalent domain-specific proof for business rules, concurrency, data, security and performance.

## 5. Task graph and ownership
| Slice | Exact work | Depends on | Owner/model class | Write paths | Context capsule | Acknowledgment | ACs | Rollback point |
|---|---|---|---|---|---|---|---|
| S1 | <bounded implementation> | none | <assigned/economy/standard/expert> | <exclusive paths> | <only facts needed to act and prove> | <pending -> acknowledged; recovery signal if unable> | AC1 | <safe restore point> |

- Parallel groups: <independent slices only>
- Integration owner: main agent
- Reviewer triggers: <mandatory: UI parity/public API/auth/migration/concurrency/performance/material unknown/weakened proof/...>
- Refactor/cleanup review: <smells and nearby improvements worth acting on>

## 6. Automatic execution contract
- Mode: automatic after the user pivots from plan to execution
- Work shape: small | medium | large | resumable
- Ledger: off | auto | required
- Strategy: small direct | delegated | parallel | sequential recovery after orchestration `UNAVAILABLE`
- Medium+ default: zero main-agent domain work; any control-plane exception is <bounded routing/integration/proof action only>
- Max active agents including main: <n>
- Max delegation depth: <0..2>
- Model route: <economy for retrieval/mechanical; standard for bounded implementation/review; expert only for unresolved high-risk reasoning>
- Effort cap: low | medium | high
- Proof profiles: <AC -> profile>
- Authorized final actions: <edit/commit/push/deploy/external-write exactly as authorized>
- Stop conditions: <real blocker, failed proof, unsafe divergence or exhausted recovery>

## 7. Risks, regression and recovery
| Risk | Early signal | Prevention | Regression surface | Recovery ladder / rollback trigger |
|---|---|---|---|---|
| <risk> | <observable> | <guard> | <affected behavior> | <trigger/action> |

## 8. Long/resumable ledger (only when useful)
- Original requirements: REQ-... -> responsible slices
- Owner decisions: DEC-... -> affected slices
- Later injections: INJ-... -> responsible slices and changed acceptance
- Discoveries: DISC-... -> decision/re-plan impact
- Assignment packets: semantic capsule (only facts needed for scope/proof) + paths + ACs + forbidden paths
- Current active slices: <parallel-safe list>
- Proof receipts: <semantic receipt: changed scope, fresh proof, unresolved risk, next recovery action>
- Review findings: <open/resolved/accepted>
- Usage: <main vs each assignment; input/cached/output/reasoning/tool calls>
- Resume point: <fresh checkpoint + next safe actions>
- Status separation: task outcome <PASS/PARTIAL/BLOCKED>; control status <acknowledgment/host observation/orchestration availability>
```

For a clear small task, sections 1-4 and a short execution contract may fit in a few lines. For long work, fill every relevant field before delegating. The main agent remains responsible for source coverage, integration, final proof and the user’s original intent.
