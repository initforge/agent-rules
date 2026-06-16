---
description: "Fast context, 5fedu loading, tools, research, inventory"
---

# 03-context-and-tools

Gốc: `codex/rules/03-context-and-tools.md`.

## Fast context

**Mục tiêu:** Nạp ít, đọc đúng, dùng skill khi khớp.

**Budget:**

- Không đọc toàn repo.
- Đầu: `AGENTS.md`, README, config chính, file gần task.
- Runtime/agent-rules: chỉ file cụ thể khi task liên quan harness.
- **Composer anti-stuck:** Câu hỏi chiến lược → 1-3 file philosophy rồi trả lời; không explore 15+ file.

## Trigger map

| Signal | Skill/hành động |
|---|---|
| setup/scaffold 5fedu | `5fedu-project` |
| research, xác minh mới | `codex-research` |
| review, audit | findings first |
| docs, readme, spec | `docs-style` |
| screenshot, playwright | `screenshot`, `playwright` |
| security, threat model | `security-best-practices`, `security-threat-model` |
| PDF | `pdf` |
| UI quality | `frontend-ui-quality` |

## Stop conditions

- `BLOCKED`: thiếu credential/schema/quyền sau khi đã thử fallback.
- `PARTIAL`: làm được phần chính, verify chưa đủ.

---

## Context tools — thứ tự đọc

1. Entry/index nhẹ.
2. File gần task.
3. Rule domain (DB/auth/UI/export) khi dính.
4. Impact graph nếu shared/API/schema change.
5. External docs khi library/platform đổi.

## 5fedu loading

**Detection:** `.grok/5fedu/` hoặc `.codex/.agents/.kiro/5fedu/`. Phải đọc skill `5fedu-project` trước khi scaffold/sửa context.

**Luôn đọc trước:** `AGENTS.md`, `*/5fedu/00-index.md`, decision/status, questions nếu blocker.

**Đọc có điều kiện:**

| Domain | File pattern |
|---|---|
| DB/auth/schema | `02-*` |
| UI/UX/export | `03-*` |
| Feedback/lessons | `10-*`, `12-*` |

## 5fedu smart triggers

**Production verify:** mapping → surfaces → domain → gates → report context loaded.

**UI parity:** `/template` trước → golden reference chỉ khi template thiếu → `Template checked` trong final.

## GitNexus

Dùng khi: unfamiliar path, refactor/rename/delete shared, API/type change, MEDIUM/HIGH impl.

Không chạy mù mỗi lượt. Stale → fallback `rg`, ghi trong report.

## Research

`codex-research` cho internet/docs/changelog/explore trước impl. Note vào `plan/.../research/` khi task lớn.

## Tool inventory

Khi thêm CLI/MCP/skill: cập nhật registry (`codex/docs/`, `codex/inventory/`). Không lưu secret trong docs.