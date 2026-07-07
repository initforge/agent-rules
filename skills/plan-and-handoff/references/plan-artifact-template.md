# Plan Artifact Template (PAF)

**Vai trò:** Single source format cho plan dài / multi-phase.  
**Ý đồ:** Architect/Scribe output; Executor đọc HANDOFF §8. Tier routing: [`capability-tier-routing.md`](capability-tier-routing.md).

---

## §0 Meta

```yaml
---
plan_id: "<repo>-<slug>-<YYYYMMDD>"
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

## §3 Context routing map

Chỉ subset task-relevant — full router: `context/5fedu/00-context-map.md`.

| Domain trigger | Files bắt buộc | Skill | Cấm |
|---|---|---|---|
| UI module ERP | `ui-delivery.md` + `module-mapping.md` | `5fedu-module-parity` | `frontend-architect` |
| DB/schema | `domains/database.md` + `project-local/database-and-auth.md` | — | đoán schema |
| Permission | `domains/permissions.md` | — | suy từ quyền sửa |
| Owner đã chốt | `project-local/decisions.md` | — | hỏi lại DA_CHOT |

**Template reference (5fedu UI):**

| Surface | Reference module | Files mẫu (paths) |
|---|---|---|
| CRUD listview | Nhân viên | … |
| Form drawer | Nhân viên | … |
| Route chain | — | App.tsx, sidebar-menu, admin-module-registry, Breadcrumbs |

---

## §4 Phases

Mỗi phase = **1 session**.

### Ngân sách nguyên tử phase (HARD — quyết định trần yield phát-đầu)

Trần "một phát đạt ~90-95%" của model **không** phụ thuộc câu chữ plan mà phụ thuộc **kích thước unit**. Mỗi phase PHẢI thoả:

- **≤ 5 file** create/modify (registry chain đếm là 1 nhóm nếu cùng 1 module).
- **≤ 8 exit-criteria (AC)**.
- **1 subsystem / 1 layer** (không trộn DB + API + UI trong 1 phase trừ vertical-slice nhỏ có chủ đích).
- **verify tự chứa**: chạy được độc lập, không chờ phase sau.
- **Build-green invariant**: sau phase, `build`/`typecheck` phải XANH độc lập. Cấm phase để lại code hỏng cho phase sau "dọn".
- **Không cross-phase hidden dep**: phase N không phụ thuộc phần *chưa xong* của N-1.

Phase vượt ngân sách → Architect **bắt buộc tách nhỏ**. Phase to = nguyên nhân #1 khiến L0 làm 45% rồi tự kết.

### Task Density Contract (chống-miss — mỗi phase phải ĐẶC đặc tả)

Scope nhỏ (ngân sách trên) **nhưng đặc tả dày**. Khi plan do Cursor plan-mode viết rồi ném cho antigravity/Flash, Flash **không suy luận ngầm** — thiếu chi tiết = miss. Mỗi phase PHẢI có đủ:

- **Files chính xác:** đường dẫn đầy đủ + `(create|modify|delete)` + *sửa đúng chỗ nào* (tên hàm/symbol/anchor, line ref nếu có).
- **Context files phải đọc trước:** liệt kê path cụ thể (Flash load đúng context, không đoán).
- **Mỗi AC là 1 checkbox độc lập-verify:** mô tả + `verify:` command chạy được + **expected output** (vd `→ 0`, `→ build pass`). Không AC mơ hồ kiểu "cải thiện UX".
- **Contract/DB/type reference:** schema field, Zod schema, endpoint, type name cần dùng/đổi (path cụ thể).
- **Edge cases + Regression map:** cái gì PHẢI KHÔNG vỡ; input biên cần xử lý.
- **Code anchor / snippet** khi thao tác không hiển nhiên (không paste cả function — chỉ anchor + ý đồ).
- **Forbidden / OUT:** điều cấm làm trong phase (chống scope creep).
- **Depends-on:** phase tiền đề (thứ tự bắt buộc).
- **Definition of done:** build-green command + trạng thái cuối.

Quy tắc vàng: *"Một executor L0 KHÔNG biết gì về intent của bạn phải làm đúng chỉ bằng nội dung phase này."* Đọc lại phase, chỗ nào cần suy luận → thêm chi tiết cho tới khi hết suy luận.

Copy block cho mỗi phase:

```yaml
### Phase P1 — [tên ngắn]
goal: ...
depends_on: [P0]                 # phase tiền đề (thứ tự bắt buộc)
preferred_tier: L0
min_tier: L0
allowed_tiers: [L0, L1, L2]
escalate_if: [verify_fail_2x, parity_fail, BLOCKED]
force_tier: null
tier_used: null
escalation_reason: null
scope_lock: [deliverables phase này]   # ≤8 AC
context_files:                    # Flash đọc TRƯỚC khi sửa (không đoán)
  - path (đọc để hiểu X)
files_touched:
  - path (create|modify|delete) — sửa ở: <hàm/symbol/anchor + line nếu có>; ý đồ: <...>
contracts_refs:                   # schema/type/endpoint cần dùng/đổi
  - packages/contracts/... (field/type)
template_reference: Nhân viên — [paths]
skills_active: [finish-to-completion, 5fedu-module-parity]
edge_cases: [input biên cần xử lý]
regression_map: [cái PHẢI KHÔNG vỡ]
forbidden: [ngoài scope — cấm động]
verify_gate:
  assumptions_check: ...
  commands: npm run lint && npm run typecheck
exit_criteria:                    # mỗi item: mô tả | verify cmd | expected output
  - [ ] AC1 <mô tả> | verify: <cmd> | expected: <vd → 0 / build pass>
  - [ ] build-green độc lập | verify: <build cmd> | expected: pass
  - [ ] Template reference cited in report
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

## §5b External research (optional)

| Research note | Path | Findings → §5 |
|---|---|---|
| … | `.agent/research/<topic>.md` | Assumption / KU |

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
- [ ] Mỗi phase có: goal, tier fields, files, verify cmd, exit criteria
- [ ] Context routing khớp task (5fedu khi module ERP)
- [ ] Template reference có path cụ thể
- [ ] Known-unknowns tách khỏi assumptions locked
- [ ] Phase P1 đủ nhỏ cho 1 session L0 (hoặc min_tier ghi rõ)
- [ ] **MỌI phase trong ngân sách nguyên tử §4** (≤5 file, ≤8 AC, 1 subsystem, verify tự chứa, build-green)
- [ ] **MỌI phase đạt Task Density Contract §4** (files+anchor, context_files, mỗi AC có verify+expected, edge_cases, regression_map, forbidden, depends_on)
- [ ] **Không AC mơ hồ** (mỗi AC verify được bằng command/kiểm tra cụ thể; không "cải thiện UX" chung chung)
- [ ] **MỌI phase để build/typecheck xanh độc lập** (không cross-phase hidden dep)
- [ ] Phase khó (AI-engine/migration/auth/RBAC) tag `min_tier L2` — không để L0
- [ ] Risk flags → high-risk nếu auth/migration/permission

---

## §8 HANDOFF block (single source — skill trỏ đây)

```text
---
HANDOFF — paste vào session execute
Plan ID: ...
Slice ID: <slice-id>
Ledger path: .agent/ledger/<slice-id>.md
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
Report: Template reference | Pattern fidelity | Verification | Status | tier_used | Ledger: <path> | Slice: <id> | Open AC: 0
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

## Owner prompts (copy-paste)

### 1. Research Analyst (Antigravity Gemini)

```text
Mode: advisory read-only (HB-1)
Skill: researcher
Task: [research question]

Output: .agent/research/<topic>.md — Summary, Evidence, Risks, Recommendation, Unknowns
Do NOT implement. Do NOT load 5fedu-module-parity unless ERP module UI research.
End: Hand to Plan Architect — items for PAF §5
```

### 2. Plan Architect (L1/L2)

```text
Mode: plan-authoring (HB-1 — read-only)
Skills: plan-and-handoff path A + implementation-discovery read-only
Task: [dump requirements]

Deliver: PAF đầy đủ per plan-artifact-template.md
Tier: plan_author_min_tier L1; phases prefer L0 execute where safe
Do NOT execute. End READY + HANDOFF §8 for P1 only.
```

### 3. Plan Scribe (L0)

```text
Mode: plan-authoring (HB-1)
Role: Scribe ONLY — normalize owner spec, do NOT invent

Locked input:
[paste spec]

Output: PAF per template. DRAFT if gaps; READY if Plan QA §7 pass.
Do NOT survey repo beyond path existence check.
```

### 4. Execute phase N (weak-first)

```text
Mode: execution (HB-2 pivot confirmed)
Skills: finish-to-completion + domain skills
Execute: Phase P_N ONLY — HANDOFF below:
[paste §8]

Start preferred_tier L0; respect min_tier and allowed_tiers; escalate per capability-tier-routing.md
Report: tier_used | escalation_reason if any
```

### 5. Tier override (owner explicit)

```text
Execute Phase P_N with force_tier: L2
[paste HANDOFF or plan_id]
```
