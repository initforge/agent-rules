---
description: "Clean code, regression, permission discipline, technical debt"
---

# 02-code-quality-and-debt

Gốc: `codex/rules/02-code-quality-and-debt.md`.

## Clean code

**Trigger:** viết/sửa/review/test code.

**Triết lý:** Code cho người đọc; YAGNI; blast radius nhỏ; clean code = risk control, không phô trang.

**Size guide (soft):** file ~300 lines, function ~30, nesting max ~3.

**Refactor:** Tách behavior change và refactor. Guarded refactor cần plan + blast-radius check.

**Cleanup classes:**

| Loại | Điều kiện |
|---|---|
| Opportunistic | tiny, same file, no behavior change |
| Guarded | plan + verify + scope lock |
| Dead code | `rg`/GitNexus caller check trước xóa |
| Cosmetic | tránh mặc định |

**Protected runtime (không cleanup):**

- `cursor/rules/*.md`, `.cursor/rules/*.md`
- `AGENTS.md`, `cursor/AGENTS.md`
- `.cursor/5fedu/00-index.md`

## Anti-regression & pattern parity

**Trước sửa shared logic:**

1. `rg` call-sites / imports.
2. Chứng minh không gãy downstream.

**UI component mới/sửa:**

- Đối chiếu ≥1 component tương tự (pattern, loading, error, empty).
- Button async: disabled + spinner, onClick thật, chống double-click.

**Verify tương tác:** Browser/Playwright/screenshot khi có server; không có → dry-run trace logic trong thought.

## Business logic & multi-level permission

- Cấm chỉ test Admin rồi PASS.
- Permission matrix: UI ẩn/hiện + API/RLS.
- Cross-module: sửa bảng A → kiểm B/C (rollup, trigger, cache).
- Zero assumption: đọc spec/test/constraint, không đoán nghiệp vụ.

## Path-specific

| Path | Ưu tiên |
|---|---|
| Fix | correctness; cleanup opportunistic only |
| Feature | scope tight |
| Bug | research nếu stall; cleanup sau root cause |
| Cleanup | mục tiêu cụ thể + evidence |
| Shared module | GitNexus/`rg` bắt buộc |

---

## Technical debt control

**Trigger:** code, fix, review, refactor, cleanup, push/commit.

**Taxonomy:** correctness, data, permission, UX, architecture, test, operational, knowledge.

**Debt budget:** Chỉ để lại nợ khi không phá acceptance, không che lỗi nghiêm trọng, có lý do + ghi `Remaining debt`.

**Không để lại nếu sửa được trong scope:**

- build/lint do task tạo;
- dead button, fake CRUD;
- permission chỉ admin;
- export không tải thật;
- 5fedu UI không check `/template`;
- rule mới chỉ trong chat.

**Pre-done gate:**

1. Task tạo nợ mới?
2. Nợ nào sửa ngay được?
3. Artifact tạm cần dọn/gitignore?
4. Context/decision cần cập nhật?

**Push/commit gate (khi user yêu cầu):** `git status`, scope stage, không stage ngoài task, debt nghiêm trọng → không push như PASS.

**Evidence format (task vừa/lớn):**

```text
Technical debt check:
- New debt: none | ...
- Remaining debt: none | ...
```

**5fedu debt:** production chưa verify sau deploy; UI lệch template; permission chưa đa account; schema rule chưa sync.