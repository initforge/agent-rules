# /goal Autopilot — plan tự sinh + execute tự lái (unattended)

**Single entry map:** `/goal` + unattended + Antigravity artifact → **file này** (Phần 1–5). PAF template → `plan-artifact-template.md`. AC ledger format → `finish-to-completion/references/completion-ledger.md`. Execute loop hard gates → `finish-to-completion/SKILL.md`. Skill routing → `plan-and-handoff/SKILL.md` (paths only, không lặp prose).

**Ý đồ:** Owner gõ **`/goal <yêu cầu>`** một lần → agent tự: khảo sát repo → đẻ PAF hoàn chỉnh (self-QA loop tới khi §7 pass) → execute từng phase nguyên tử theo vòng lặp verify → chỉ dừng khi DONE hoặc BLOCKED thật. Tối ưu cho **antigravity/Flash chạy treo máy**.

Nguồn liên quan: `plan-artifact-template.md` (PAF + ngân sách nguyên tử §4), `capability-tier-routing.md` (tier), `finish-to-completion` (execute loop + completion-ledger).

---

## Phần 1 — `/goal`: sinh siêu-plan (dù model L0)

Trần chất lượng plan của L0 phụ thuộc **scaffold + self-QA loop**, không phải câu chữ. `/goal` ép quy trình:

```text
STEP 0  Detect: repo, context/5fedu?, lane, risk_flags. Mode = plan-authoring (HB-1: KHÔNG sửa code).
STEP 1  Discovery read-only (implementation-discovery): entrypoint, interfaces gần task, DB/schema,
        template 5fedu nếu ERP. Ghi Known-unknowns.
STEP 2  Draft PAF đầy đủ §0–§9 theo plan-artifact-template.md.
        - Cắt phase theo NGÂN SÁCH NGUYÊN TỬ §4 (≤5 file, ≤8 AC, 1 subsystem, build-green).
        - Tag min_tier mỗi phase; phase khó (AI/migration/auth/RBAC) → L2.
        - Mỗi phase có verify_gate command chạy được + exit_criteria checkbox.
STEP 3  SELF-QA LOOP (bắt buộc, tối đa 3 vòng):
        FOR each item trong §7 Plan QA:
          nếu FAIL → sửa PAF → lặp lại STEP 3
        UNTIL §7 all PASS hoặc đã 3 vòng (nếu vẫn fail → status DRAFT + ghi gap).
STEP 4  Emit PAF (status READY) + HANDOFF §8 cho P1. KHÔNG execute (chờ pivot HB-2)
        TRỪ KHI owner bật autopilot (Phần 3).
```

**Owner prompt copy-paste:**

```text
/goal <mô tả outcome mong muốn>

Mode: plan-authoring (HB-1 read-only). Skill: plan-and-handoff Path A + implementation-discovery.
Bắt buộc: chạy SELF-QA LOOP tới khi §7 Plan QA all PASS. Cắt phase theo ngân sách nguyên tử §4.
Output: PAF READY + HANDOFF §8 cho P1. Chưa execute.
```

---

## Phần 2 — Self-verify iterate loop (execute tới khi đúng)

Áp dụng khi execute (mode=execution). Mở rộng `finish-to-completion` execution loop bằng vòng tự-kiểm đối kháng.

**Master progress ledger (chống miss ở cấp PLAN):** trước phase đầu, sinh `.agent/ledger/_progress.md` liệt kê **MỌI** phase từ PAF §4 + mọi deliverable PAF §2 (đếm N):

```md
# Progress: <plan_id>  —  0/<N> phases
- [ ] P0 <tên> | AC: 0/<a> | build-green: ? | status: pending
- [ ] P1 <tên> | AC: 0/<b> | build-green: ? | status: pending
...
Deliverables §2: [ ] D1 [ ] D2 ...   (map D→phase để không rơi deliverable nào)
```

```text
FOR each phase P (theo thứ tự PAF):
  1. Load HANDOFF §8 của P (fresh context — KHÔNG kéo cả plan cũ).
  2. Tạo completion-ledger .agent/ledger/P.md (mỗi AC + verify cmd).
  3. IMPLEMENT scope P.
  4. RUN verify_gate commands (build/typecheck/test) — output thật.
  5. SELF-REVIEW (đối kháng): tự đọc diff, hỏi "AC nào CHƯA thật sự đạt? có build-green không?
     có regression không? có TODO mới không?". Đánh dấu ledger.
  6. IF ledger còn [ ] hoặc verify fail:
        - classify nguyên nhân
        - fix → quay lại STEP 4
        - fail ≥2 lần cùng cách → ESCALATE tier (capability-tier-routing #5), KHÔNG lặp y hệt.
  7. IF build không xanh độc lập → chưa được sang phase sau (build-green invariant §4).
  8. PROGRESS CHECKPOINT: cập nhật _progress.md (P → done, k/N); emit 1 dòng
        `[PROGRESS k/N · P<done> · AC x/y · build-green]`; ghi trace .agent/trace.jsonl.
UNTIL mọi phase DONE OR hard BLOCKED (must-not-self-decide).

FINAL MISS-SWEEP (bắt buộc trước khi báo xong):
  - grep _progress.md còn `- [ ]` → CHƯA xong, quay lại phase đó.
  - đối chiếu deliverable §2: mỗi D đã map vào ≥1 phase done? D nào chưa → phase bị rơi.
  - grep `- [ ]` trong mọi .agent/ledger/*.md → phải rỗng.
```

Luật cứng: cấm sang phase mới khi phase hiện tại còn `[ ]`; cấm `PASS` không evidence; cấm lặp cùng cách sau 2 fail (đổi cách/đổi tier); cấm báo xong khi `_progress.md` hoặc bất kỳ ledger còn `[ ]` (đây là chốt chống-miss cấp plan).

---

## Phần 3 — Antigravity unattended (treo máy đi chơi)

Mục tiêu: owner bấm 1 lần, máy chạy hết chuỗi phase. Ba mức tự động:

| Mức | Cơ chế | Khi dùng |
|---|---|---|
| **A. Bán tự động** | owner paste HANDOFF từng phase | phase L2 / high-risk cần mắt người |
| **B. Auto-continue trong 1 session** | autopilot prompt (dưới) — agent tự chạy hết phase L0/L1 liên tiếp | đa số đại trùng tu |
| **C. Orchestrated đa-session** | Cursor SDK / skill `loop` feed từng phase fresh-context | task rất dài, cần reset context mỗi phase |

**Autopilot prompt (mức B) — paste sau khi có PAF READY:**

```text
AUTOPILOT execute PAF <plan_id>.
Chạy TUẦN TỰ mọi phase theo Self-verify iterate loop (goal-autopilot Phần 2).
Mỗi phase: implement → verify command thật → completion-ledger → build-green → sang phase kế.
KHÔNG hỏi lại giữa các phase. KHÔNG dừng ở "phần chính".
Chỉ dừng khi: (a) mọi phase DONE + verify pass, hoặc (b) BLOCKED must-not-self-decide (credential/
schema/permission/destructive) — ghi blocker 1 dòng vào open-questions.md rồi tiếp phase độc lập khác.
Phase tag min_tier L2 mà model hiện là L0 → dừng phase đó, ghi cần-escalate, tiếp phase L0 khác.
Cuối: báo N/N phase, evidence mỗi verify, danh sách BLOCKED (nếu có).
```

**Điều kiện để mức B/C chạy ngon:** PAF phải qua ngân sách nguyên tử §4 (phase nhỏ, build-green, không hidden dep). Plan to/cục = autopilot sẽ hụt như chạy tay.

---

## Phần 4 — Task card format (executor consume)

Mỗi phase khi giao = 1 task card gọn (đồng bộ HANDOFF §8, không định dạng song song):

```text
[TASK] <plan_id>/P_N — <tên phase>
tier: min_tier=<L?>  (model hiện: <L?> → OK/ESCALATE)
scope: [D1, D2]            # ≤8 AC
files: [path(create|modify)]   # ≤5
context: [file bắt buộc đọc]
template_ref: <path> (nếu 5fedu ERP)
verify: <command chạy thật>
exit:
  - [ ] AC1  | verify: <cmd> | evidence: <chưa chạy>
  - [ ] build-green độc lập
forbidden: scope creep, sang phase khác, PASS không evidence
report: tier_used | verify evidence | Status(PASS/PARTIAL/BLOCKED)
```

> Format task chi tiết theo layout owner (ảnh 1) sẽ map vào card này — bổ sung khi có ảnh.

---

## Phần 5 — Artifact ingestion (Antigravity native)

Implementation + Task artifact = **VIEW PAF**, không plan song song:

- **Implementation** ⇔ PAF §4 phases (cấm tự đẻ phase khác PAF).
- **Task** ⇔ AC/`completion-ledger` (`finish-to-completion/references/completion-ledger.md`).
- **Walkthrough** ⇔ trace + FINAL MISS-SWEEP (Phần 2).

**Input (nhận diện trước khi tạo artifact):**

| Ca | Hành động |
|---|---|
| **A** Prompt thô | `/goal` Phần 1 → map PAF → execute Phần 2–3 |
| **B** PAF Cursor đã khóa | **Cấm re-plan**; map + execute Phần 2 |
| **C** PAF + yêu cầu thêm | §9 revision: thêm phase/AC cuối, giữ phase cũ |

Anti-drift: sửa PAF trước → mirror artifact sau. Native task-list ≠ thay ledger.
