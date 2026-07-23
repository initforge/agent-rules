# Plan Artifact Template (PAF)

**Vai trò:** Single source format cho plan dài / multi-phase.  
**Ý đồ:** Architect/Scribe output; Executor đọc HANDOFF §8. Tier routing: [`capability-tier-routing.md`](capability-tier-routing.md).

---

## §0 Meta

PAF Markdown is the canonical intent artifact. `automation/planctl.ps1` may compile a derived JSON/state artifact for validation and resume; agents do not need to author JSON directly.

```yaml
---
plan_id: "<repo>-<slug>-<YYYYMMDD>"
schema_version: 3
revision: 0
supersedes: null
workflow_mode: plan-authoring | plan-review | execution
status: DRAFT | READY | IN_PROGRESS | REVISE | DONE
current_phase: P0 | P1 | ...
repo: tah-app | nostime | agent-rules
profile: tah-app | nostime | null
lane: normal | high-risk
risk_flags: []
context/5fedu: installed | missing
primary_skills: [plan-and-handoff]
preferred_tier: L0
plan_author_min_tier: L1
enforcement: off | shadow | strict
execution_mode: phase | continuous
verification_strategy: incremental | implementation-first
reference_contract: false | required
state_root: .agent/plans/<plan-id>/
---
```

---

## §1 Mục tiêu

**Outcome:** Sau phase cuối, user có thể [hành vi cụ thể] mà không cần bước thêm.

**Không phải (OUT):** [explicit out-of-scope]

---

## §2 Scope lock

**IN (deliverables — đếm N):**
- D1: …
- D2: …

**OUT (cấm agent tự thêm):**
- …

**File-count:** ≥2 files → lane `normal` (HB-4). Module mới: đếm registry chain (`App.tsx`, sidebar, breadcrumbs, registry).

---

## §2b Source coverage (required for admitted mega-plan)

Reference the admission hash so the plan can be audited without copying raw prompt text. Never put credentials, raw prompt, or chain-of-thought in the PAF.

```text
## Source coverage

- S001 -> D1 | @sha256:<admission sha256>
- S002 -> CONTEXT | @sha256:<admission sha256>
- S003 -> OUT(owner excluded deployment) | @sha256:<admission sha256>
```

Every admission S-ID appears exactly once and its hash must match the admission artifact. Every `D<n>` maps to at least one phase. A new deliverable is written `- D3 [DERIVED(reason)]: ...`; derived work cannot replace or absorb an S-ID.

Initialize once, then later actions inherit admission and mode from canonical state:

```powershell
./automation/planctl.ps1 -Action admit -AdmissionPath .agent/plans/_admission/<session-id>.json
./automation/planctl.ps1 -Action init -PlanPath <paf> -AdmissionPath <json> -ExecutionMode continuous
./automation/planctl.ps1 -Action start -PlanPath <paf> -Phase P1
./automation/planctl.ps1 -Action implemented -PlanPath <paf> -Phase P1
./automation/planctl.ps1 -Action verify-batch -PlanPath <paf> # continuous implementation-first
./automation/planctl.ps1 -Action complete -PlanPath <paf> -Phase P1 -LedgerPath <ledger>
./automation/planctl.ps1 -Action finalize -PlanPath <paf>                                 # PLAN_PASS
```

---

## §3 Context routing map

Chỉ subset task-relevant — full router: `context/5fedu/00-context-map.md`.

| Domain trigger | Files bắt buộc | Skill | Cấm |
|---|---|---|---|
| UI module ERP | `ui-delivery.md` + `module-mapping.md` | `5fedu-module-parity` | `frontend-architect` |
| DB/schema | `domains/database.md` + `project-local/database-and-auth.md` | — | đoán schema |
| Permission | `domains/permissions.md` | — | suy từ quyền sửa |
| Owner đã chốt | `project-local/decisions.md` | — | hỏi lại DA_CHOT |

**Reference contract (only when parity/clone/reference is required):**

```yaml
source: <local path or approved URL>
revision: <commit/hash/version>
copy_map: [reference/path -> target/path]
variable_map: [reference symbol -> domain symbol]
intentional_differences: []
```

---

## §4 Phases

Phase là dependency/ownership boundary, không mặc định là terminal session boundary.

### Atomic + density contract

- ≤8 AC is hard. File count is advisory (normally ≤5); a cohesive subsystem may exceed it when the phase declares why. Registry chain cùng module tính một nhóm.
- Dependency phải explicit. Implementation-first chỉ dùng guard nhẹ ở boundary; heavy verification chạy batch sau mọi phase khả thi.
- Ghi path + operation + symbol/anchor; context phải đọc; contract/schema/type; edge/regression; forbidden.
- Mỗi AC là checkbox observable có `verify` + `expected`; không dùng mục tiêu mơ hồ.
- `planctl validate` hard-fail contract thiếu/placeholder/dependency sai/AC không observable; warning không tước quyền executor.

Vượt ngân sách thì tách phase. Executor không biết intent ngoài PAF vẫn phải làm đúng chỉ từ block sau:

Copy block cho mỗi phase:

```yaml
### Phase P1 — [tên ngắn]
goal: ...
depends_on: [P0]
preferred_tier: L0
min_tier: L0
allowed_tiers: [L0, L1, L2]
escalate_if: [verify_fail_2x, parity_fail, BLOCKED]
force_tier: null
tier_used: null
escalation_reason: null
scope_lock: [deliverables phase này]
context_files:
  - path (đọc để hiểu X)
files_touched:
  - path (create|modify|delete) — <symbol/anchor>; ý đồ: <...>
contracts_refs:
  - packages/contracts/... (field/type)
reference_contract: <optional source/revision/copy map>
skills_active: [finish-to-completion, 5fedu-module-parity]
edge_cases: [input biên cần xử lý]
regression_map: [cái PHẢI KHÔNG vỡ]
forbidden: [ngoài scope — cấm động]
verify_gate:
  assumptions_check: ...
  commands: npm run lint && npm run typecheck
proof_profiles: [api-contract]
proof_map:
  - AC1 -> api-contract.positive | kind=integration-test | env=local | artifacts=junit:test-results/api-positive.xml
  - AC2 -> api-contract.invalid-error | kind=integration-test | env=local | artifacts=junit:test-results/api-negative.xml
  - AC3 -> api-contract.regression | kind=integration-test | env=local | artifacts=junit:test-results/api-regression.xml
exit_criteria:
  - [ ] AC1 <mô tả> | verify: npm test -- api-positive | expected: exit=0
  - [ ] AC2 <mô tả> | verify: npm test -- api-negative | expected: exit=0
  - [ ] AC3 build-green độc lập | verify: npm run build | expected: exit=0
handoff_out:
  done: ...
  remaining: P2, P3
  next: Execute P2 only
```

---

## §5 Assumptions locked / Known-unknowns

### Assumptions locked (lock-at-plan)
- …

### Known-unknowns (discover-at-implement)

| ID | Unknown | Verify how | Phase |
|---|---|---|---|
| KU1 | … | … | P2 |

---

---

## §6 Gates

- **HB-1:** plan-only → no repo edits
- **HB-2:** execute only on pivot (`làm đi phase N`, `/goal` + pivot)
- **HB-4:** ≥2 files → no `tiny` lane
- **5fedu UI:** mở template route trước first edit
- **finish-to-completion:** PASS only when N/N deliverables + verify
- **slice-gate-protocol:** execute pivot → SGP Gates A–D PASS trước khi HANDOFF báo done
- **Report (5fedu UI):** Template reference | Pattern fidelity | Verification | Status

---

## §7 Plan QA checklist

Plan **READY** chỉ khi tất cả PASS:

- [ ] Meta đủ (plan_id, tier, repo, skills, lane)
- [ ] Scope IN/OUT rõ; deliverables đếm được (N)
- [ ] Nếu có admission: mọi S-ID coverage đúng hash/đúng một lần; mọi D map phase hoặc `DERIVED(reason)`
- [ ] Mỗi phase có: goal, tier fields, files, verify cmd, exit criteria
- [ ] PAF v2: mỗi phase có `proof_profiles`; mỗi AC-ID map đúng một `proof_map` row và đủ dimensions
- [ ] Deep/runtime proof dùng verifier-backed machine artifact/query; `manifest=true` tự phát không thay outcome proof
- [ ] Context routing khớp task (5fedu khi module ERP)
- [ ] Nếu có parity/clone: reference contract có source, revision, copy_map và variable_map
- [ ] Known-unknowns tách khỏi assumptions locked
- [ ] Phase P1 đủ nhỏ cho 1 session L0 (hoặc min_tier ghi rõ)
- [ ] **MỌI phase trong ngân sách nguyên tử §4** (≤8 AC, 1 subsystem, verify tự chứa, build-green; file-count vượt ngưỡng phải có cohesion justification)
- [ ] **MỌI AC có proof profile/dimension, evidence kind, environment, typed matcher và artifact contract**; profile sâu không được dùng `contains`/`exit_code` nông làm bằng chứng duy nhất
- [ ] **MỌI phase đạt Task Density Contract §4** (files+anchor, context_files, mỗi AC có verify+expected, edge_cases, regression_map, forbidden, depends_on)
- [ ] **Không AC mơ hồ** (mỗi AC verify được bằng command/kiểm tra cụ thể; không "cải thiện UX" chung chung)
- [ ] **MỌI phase để build/typecheck xanh độc lập** (không cross-phase hidden dep)
- [ ] `automation/planctl.ps1 -Action validate -PlanPath <plan> [-AdmissionPath <json>]` passes; compiled JSON/report là derived view, `state.json` là canonical progress
- [ ] Phase khó (AI-engine/migration/auth/RBAC) tag `min_tier L2` — không để L0
- [ ] Risk flags → high-risk nếu auth/migration/permission

---

## §8 HANDOFF block (single source — skill trỏ đây)

```text
---
HANDOFF — paste vào session execute
Plan ID: ...
Slice ID: <slice-id>
Ledger path: .agent/plans/<plan-id>/ledger/<slice-id>.md
Execute: Phase P_N ONLY (or Slice <id> ONLY)
Pivot: "làm đi phase P_N"
preferred_tier: L0
min_tier: ...
allowed_tiers: [...]
Scope lock: [D1, D2]
Context files: [...]
Template reference: Nhân viên @ [paths]
Verify: npm run lint && npm run typecheck
Forbidden: scope creep, next phase without pivot
Report: Template reference | Pattern fidelity | Verification | Status | tier_used | Ledger: <path> | Slice: <id> | Open AC: 0 | no raw HTML marker tags
---
```

---

## §9 Revision protocol

1. Execute gặp mismatch plan vs repo → status `REVISE`
2. **Architect** (min L1) patch PAF — `revision++`
3. Owner re-approve → execute lại phase
4. Executor **không** tự sửa plan ngầm
5. L0 fail ≥2x → escalate tier per [`capability-tier-routing.md`](capability-tier-routing.md)

---

Owner prompt snippets live in `owner-prompts.md` and are not part of the default PAF load.
