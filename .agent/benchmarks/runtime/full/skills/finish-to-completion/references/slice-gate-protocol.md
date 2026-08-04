# Slice Gate Protocol (SGP)

**Ý đồ:** Hợp đồng thực thi duy nhất khi pivot execute — gom scope lock, ledger AC, verify, Path E gap-closure thành **4 gate tuần tự**. Session mới không có chat history vẫn biết đọc gì và khi nào được `PASS`.

**Format AC:** [`completion-ledger.md`](completion-ledger.md) (single source — không nhân bản ở đây).

---

## §0 CONTEXT FOR NEW SESSION

Phiên mới **không có transcript** → đọc theo thứ tự, không đoán từ chat cũ.

### Định nghĩa "done"

Mọi AC trong **slice hiện tại** đã `- [x]` + `evidence:` output thật — **không** phải:

- % repo hay "build xanh"
- Win UI dễ thấy trong khi ledger còn `[ ]`
- Chat prose "đã xong" không tick ledger

### Bẫy "~50%" (partial completion)

Xảy ra khi: mega-plan nhiều phase → agent ưu tiên subset dễ → báo `PASS` → session sau không biết còn gì.

| Triệu chứng | Nguồn sự thật phải đọc |
|-------------|------------------------|
| Owner nói "mới một nửa" | scoped ledger `.agent/plans/<plan-id>/ledger/*.md` — đếm `- [ ]` |
| Không biết slice kế | Plan artifact `.cursor/plans/*.plan.md` hoặc HANDOFF |
| Không biết quyết định owner | Block `## CONTEXT` trong ledger hoặc plan § locked decisions |
| Agent muốn re-plan | **Cấm** nếu ledger Path E đã có — chỉ đóng gap |

### Thứ tự đọc (Path E / session execute)

```text
1. HANDOFF hoặc user slice lock (Slice ID verbatim)
2. `.agent/plans/<plan-id>/ledger/<slice-id>.md` → ## CONTEXT (nếu có) → đếm - [ ]
3. Plan artifact → chỉ AC/slice còn mở; không đọc lại toàn bộ như plan mới
4. git status + git diff --stat
5. Gates A → B → C → D → mới PASS
```

### Glossary

| Thuật ngữ | Nghĩa |
|-----------|--------|
| PAF | Plan Artifact Format — `plan-and-handoff/references/plan-artifact-template.md` |
| Path E | Gap-closure: đóng AC `[ ]`, không viết lại full plan |
| Ledger | `.agent/plans/<plan-id>/ledger/<id>.md` — AC + verify + evidence; nguồn PASS duy nhất |
| Slice | 1 session, ≤8 AC, 1 subsystem |
| min_tier | L0=weak execute; L2=engine/auth — `capability-tier-routing.md` |
| MISS-SWEEP | Sau slice: `rg` dead code/TODO trong Scope IN |

### Project overlay (ledger header)

Mỗi ledger đa-slice **nên** có block này — session mới không cần chat history:

```markdown
## CONTEXT (session mới đọc trước)
- Plan artifact: <path tới .cursor/plans/*.plan.md>
- Completion: <AC ticked> / <tổng AC> (ví dụ 12/20)
- Owner decisions: <Q1..Qn one-liners — không re-debate>
- Baseline done: <bullet ngắn — KHÔNG làm lại>
- Next slice: <Slice ID + lý do ưu tiên>
- Verify gate: <cmd mặc định repo, ví dụ npm run build>
```

---

## §1 Khi nào bắt buộc đọc

- Pivot execute (`làm đi`, `execute phase N`, HANDOFF present)
- Path E gap-closure (plan đã execute một phần)
- `/goal` unattended execute
- Task **>3 file** hoặc **≥3 AC**
- Bất kỳ claim `Status: PASS` trên multi-deliverable scope

Bỏ qua: `tiny` lane (1 file, <3 AC), pure Q&A, plan-authoring/review (HB-1).

---

## §2 Ba lớp state (không trộn)

| Lớp | Vai trò | Ghi chú |
|-----|---------|---------|
| **Plan artifact (PAF)** | Read-only sau pivot | `.cursor/plans/*.plan.md` hoặc in-chat PAF |
| **Progress** | Session heartbeat | `.agent/plans/<plan-id>/progress.md` — phase/slice map |
| **Ledger** | Nguồn PASS duy nhất | `.agent/plans/<plan-id>/ledger/<slice-id>.md` — AC + evidence; `.agent/ledger/` chỉ là legacy |

Cấm dùng chat prose hoặc plan artifact thay ledger để claim done.

---

## §3 Session contract

- **1 session = 1 slice** — ≤8 AC, 1 subsystem/layer.
- Slice ID verbatim từ HANDOFF hoặc user — không đổi giữa session.
- Mỗi AC: format + verify rules → [`completion-ledger.md`](completion-ledger.md).
- Scope creep (edit file ngoài Scope IN) → `BLOCKED` trừ user pivot rõ.

---

## §4 Gate A — Scope Lock (trước edit đầu tiên)

Ghi vào ledger (hoặc xác nhận đã có):

```text
Slice ID: <id>
Scope IN: [file paths / subsystem]
Scope OUT: [explicit exclusions]
```

Cấm edit working-repo source trước khi Gate A xong.

---

## §5 Gate B — Execute

- Mỗi AC: implement trong Scope IN only.
- Evidence interim: `file:line` hoặc command output — ghi vào ledger khi tick.
- **Cấm chuyển slice** khi còn `- [ ]` trong slice hiện tại.
- AC blocked must-not-self-decide → `- [!]` + blocker; không tick `[x]` giả.

---

## §6 Gate C — Verify (trước claim done)

1. Copy `verify:` cmd từ từng AC trong slice.
2. Chạy fresh trong session — không reuse output cũ.
3. Điền `evidence:` output thật + tick `- [x]`.
4. Phân biệt infra fail vs code fail — infra → `PARTIAL` + lý do, không `PASS`.

Verify mặc định theo risk: build/typecheck (mọi slice code); E2E khi đụng UI flow.

---

## §7 Gate D — Completion Proof (trước `Status: PASS`)

**Machine checks** (chạy trước final message):

```powershell
automation/audit-slice-ledger.ps1 -LedgerPath <scoped-ledger-path> -Strict
```

Có match → **continue working**, không respond final.

**Banned terminal patterns** (chi tiết prose → `finish-to-completion/SKILL.md` §Banned Patterns):

- GAP/backlog list như kết quả hợp lệ
- `Status: PASS` khi verify chưa chạy
- Re-run full plan khi đã có ledger Path E
- Dump 20+ việc rồi dừng — phải chọn 1 slice kế tiếp cụ thể

**Report footer bắt buộc:**

```text
Ledger: <path> | Slice: <id> | Open AC: 0
```

---

## §8 Path E — Gap-closure procedure

Khi plan đã execute một phần, kẹt <100%:

1. `git diff` + đọc ledger → **chỉ** liệt kê AC `- [ ]`
2. Gom thành slice R0, R1… (≤8 AC mỗi slice)
3. Execute **R_n ONLY** qua Gates A–D
4. **MISS-SWEEP** trong scope slice: `rg` dead code / TODO / symbol còn sót
5. Cập nhật `progress.md` nếu có

**Cấm:** re-run full P1–Pn; dump GAP rồi dừng.

Full multi-phase `/goal` loop → `plan-and-handoff/references/goal-autopilot.md` Phần 2 (SGP operationalizes Path E subset).

---

## §9 Tier routing

Pointer: [`capability-tier-routing.md`](../../plan-and-handoff/references/capability-tier-routing.md).

- L0 default execute; L2+ cho engine/auth/migration.
- Ghi `tier_used` trong ledger khớp phase HANDOFF.
- Cấm giao Flash task `min_tier L2`.

---

## §10 HANDOFF template

```text
---
HANDOFF — paste vào session execute
Plan ID: <plan-id>
Slice ID: <slice-id>
Ledger path: .agent/plans/<plan-id>/ledger/<slice-id>.md
Execute: Slice <id> ONLY
Pivot: "làm đi slice <id>"
preferred_tier: L0
min_tier: L0 | L1 | L2
Scope lock: [D1, D2]
Scope OUT: [exclusions]
Context files: [...]
Verify: <cmd>
Forbidden: scope creep, next slice without pivot
Report: Verification | Status | tier_used | Ledger: <path> | Slice: <id> | Open AC: 0
---
```

Single source mở rộng: `plan-and-handoff/references/plan-artifact-template.md` §8.

---

## §11 Project wiring

| Biến / artifact | Path mặc định | Ai tạo |
|-----------------|---------------|--------|
| `LEDGER_PATH` | `.agent/plans/<plan-id>/ledger/<slice-id>.md` | Path E hoặc Plan Architect HANDOFF |
| `PROGRESS_PATH` | `.agent/plans/<plan-id>/progress.md` | Trước phase đầu (`goal-autopilot` Phần 2) |
| CONTEXT block | Header trong ledger | Owner/Architect |
| AGENTS.md pointer | ~10 dòng Execution Contract | Project maintainer — trỏ SGP + default ledger |

`.agent/` gitignored, advisory — không canonical harness.

`automation/audit-slice-ledger.ps1` là machine gate hiện hành; nhận đúng một ledger path để tránh dead/closed ledger ở task khác làm nhiễu Stop gate.

## Liên kết

- Hard gates always-load: `rules/26-slice-completion-gate.md`
- Skill activation: `finish-to-completion/SKILL.md` Step 0
- Path E routing: `plan-and-handoff/SKILL.md`
