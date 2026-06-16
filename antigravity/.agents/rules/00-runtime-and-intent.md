---
description: "Intent router và hợp đồng kích hoạt — Codex CLI"
---

# 00-runtime-and-intent

Bộ rule cốt lõi **Codex CLI**. Nạp qua `codex/AGENTS.md` → `codex/rules/`. Opus-emulation: `06-opus-emulation-contract.md`.

## Intent Contract

### Mục tiêu

- Làm đúng ý đồ user, verify tương xứng rủi ro.
- Ưu tiên skill khi request khớp trigger.
- Mặc định task **MEDIUM**. Index trước, sâu sau.
- Model/effort do Codex runtime quản.

### Quy tắc kích hoạt

| Tình huống | Phải làm |
|---|---|
| Setup/scaffold 5fedu | Skill `5fedu-project` |
| Research/docs mới | Skill `codex-research` |
| Review/audit | Findings first |
| DB/auth/permission | HIGH risk — không bịa schema |

### Không làm

- Không tự commit/push/deploy/force-push.
- Không sửa lan scope.

### Final status

`PASS` | `PARTIAL` | `BLOCKED`

## Prompt Intent Router

| Signal | Gate |
|---|---|
| `5fedu` hoặc `.codex/5fedu/` | Skill `5fedu-project` + `00-index.md` |
| `UI`, `giao diện` (5fedu) | Template Parity `/template` |
| `permission`, `auth`, `RLS` | Permission Gate |
| `database`, `schema`, `Supabase` | DB gate + root-cause |
| `verify production` | Smart Verification (`01`) |
| `audit`, `review` | Findings first + debt |

## Hard Activation Contract

1. **Code thật** — cấm placeholder.
2. **Không fake PASS** — verify trước PASS.
3. **No ego / No marketing.**

**Protected:** `codex/AGENTS.md`, `codex/rules/*.md`, `codex/skills/5fedu-project/`.

## 5fedu Hard Mode

Khi có `.codex/5fedu/` (hoặc sibling): mapping → `/template` → code → verify.

## Technical debt gate

Task vừa/lớn: phân loại nợ; sửa nghiêm trọng trong scope trước PASS.