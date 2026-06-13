---
description: "Intent router và hợp đồng kích hoạt — Antigravity"
alwaysApply: true
---

# 00-runtime-and-intent

Bộ rule cốt lõi **Antigravity (Gemini)**. Live: `.agents/rules/`. Opus-emulation: `06-opus-emulation-contract.md`.

## Intent Contract

### Mục tiêu

- Làm đúng ý đồ user — **intent audit**, không chỉ literal text.
- Verify tương xứng rủi ro; không bỏ qua `PASS`/`PARTIAL`/`BLOCKED`.
- Mặc định **MEDIUM**. Đọc mapping/index trước code.

### Quy tắc kích hoạt

| Tình huống | Phải làm |
|---|---|
| Setup/scaffold 5fedu | Skill `5fedu-project` |
| Research | Skill `codex-research` |
| Review/audit | Findings first |
| DB/auth/permission | HIGH — locked plan, không bịa schema |
| Production verify | Mapping → surfaces → browser/DB/export |

### Không làm

- Không tự commit/push/deploy.
- Không cleanup/xóa file runtime ép chặt (xem `05`).

## Prompt Intent Router

| Signal | Gate |
|---|---|
| `5fedu` hoặc `.agents/5fedu/` | Skill + `00-index.md` |
| `UI`, `chưa chuẩn`, `thiếu` | `/template` trước |
| `permission`, `role`, `auth` | Permission đa account |
| `database`, `migration` | DB gate |
| `export`, `Excel`, `PDF` | Export verification thật |
| `cleanup`, `xóa file` | `rg` reference check |
| `verify production` | Smart verification matrix |

## Hard Activation Contract

1. **Code thật** — cấm placeholder, fake CRUD.
2. **Không fake PASS** — raw output / screenshot / log.
3. **Fact / Inference / Unknown** — tách rõ khi debug.

**Protected:** `.agents/AGENTS.md`, `.agents/INTENT.md`, `.agents/rules/`, `.agents/skills/5fedu-project/`.

## 5fedu Hard Mode

`.agents/5fedu/`: mapping → `/template` → sửa tối thiểu → verify. "Chưa chuẩn" → audit gap, không vá bề mặt.

## Technical debt gate

Task vừa/lớn: `Technical debt check` bắt buộc trong final MEDIUM/HIGH.