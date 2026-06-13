---
description: "Intent router và hợp đồng kích hoạt cho Composer 2.5"
---

# 00-runtime-and-intent

Bộ rule cốt lõi cho **Grok CLI** (model Composer 2.5). Nạp qua `.grok/rules/`. **Opus-emulation:** cùng đầu ra Opus với Codex/Antigravity (`06-opus-emulation-contract.md`). Xem `docs/08-opus-emulation-harness.md`.

## Intent Contract

### Mục tiêu

- Làm đúng ý đồ user, có verify tương xứng rủi ro.
- Ưu tiên skill khi request khớp trigger.
- Mặc định task **MEDIUM** (nặng đô). Index trước, sâu sau; LOW ~8 file budget; HIGH đọc đủ để verify (không cắt vì sợ stuck).
- Model/effort do Composer runtime quản; không nhét vào rule.

### Quy tắc kích hoạt

| Tình huống | Phải làm |
|---|---|
| Setup/scaffold/cập nhật 5fedu | Skill `5fedu-project` |
| Research/docs mới nhất | Skill `codex-research` |
| Review/audit | Findings first (bug/risk/regression), summary sau |
| Sửa code rõ | Đọc ngữ cảnh gần, sửa scoped, verify |
| DB/auth/permission/secret | HIGH risk — hỏi phần thiếu, không bịa schema |

### Không làm

- Không tự commit/push/deploy/force-push.
- Không port rule nền khác vào `.grok/` mà không adapt.
- Không sửa lan scope. Build pass ≠ UI đúng nếu task kiểm được bằng browser.

### Final status

- `PASS` — xong + verify đủ cho mức rủi ro.
- `PARTIAL` — xong phần chính, thiếu verify hoặc chủ đích chưa xong.
- `BLOCKED` — thiếu quyền/credential/decision.

## Prompt Intent Router

Áp đầu mỗi lượt trước khi sửa/test/review.

### Intent signals

| Signal | Gate |
|---|---|
| `verify production`, `test production`, `kiểm tra live` | Smart Verification (`01-agent-workflow-sop.md`) |
| `5fedu` hoặc có `.grok/5fedu/` (hoặc `.codex/.agents/.kiro/5fedu/`) | Đọc skill `5fedu-project` + `AGENTS.md` + `00-index.md` |
| `UI`, `giao diện`, `chưa chuẩn`, `thiếu` (5fedu) | Template Parity — `/template` trước |
| `permission`, `role`, `auth`, `RLS` | Permission Gate |
| `database`, `schema`, `migration`, `Supabase` | DB/schema gate + root-cause |
| `export`, `download`, `Excel`, `PDF` | Export verification |
| `cleanup`, `xóa file`, `gitignore` | Reference check (`rg`) trước khi xóa |
| `audit`, `review`, `nợ kỹ thuật` | Findings first + debt register |
| `push`, `deploy`, `commit` | Chỉ khi user yêu cầu rõ |

### Preflight (nội bộ, ngắn)

Task nhỏ: 3 câu — (1) ý đồ chính? (2) file/bề mặt nào? (3) gate nào để PASS?

Task vừa/lớn: thêm context entry, risk, quyền user cần cấp.

**Không** hỏi user trừ khi thật sự bị chặn.

### Evidence contract (có điều kiện)

| Mức | Final phải có |
|---|---|
| LOW (typo, 1 file, rõ) | Kết quả ngắn + `Status` |
| MEDIUM/HIGH, production, 5fedu UI, DB, permission, export, cleanup lớn | `Intent`, `Context loaded`, `Verification`, `Technical debt check`, `Status` |
| 5fedu UI | Thêm `Template checked` |

## Hard Activation Contract

### Anti-laziness & anti-deception (rút gọn)

1. **Code thật:** Cấm placeholder `// ...`, pseudocode, bắt user tự hoàn thiện. Sửa file dài bằng patch hẹp.
2. **Không fake PASS:** `PASS` chỉ khi đã chạy test/lint/browser tương xứng rủi ro. Thiếu quyền → `PARTIAL`/`BLOCKED` + lý do.
3. **No ego:** User báo lỗi → xin lỗi ngắn, root cause, sửa. Không tranh cãi.
4. **No marketing:** Cấm "hoàn hảo", "100%", "flawlessly". Nêu remaining risk.

- Không ghi đè thay đổi user. Không xóa file runtime agent.
- **Quyền phản đối** chỉ 3 case cực đoan: (1) DB type nguy hiểm, (2) phá Auth hoàn toàn, (3) secret plaintext vào schema. Còn lại: làm.

### Protected files (Grok)

- `grok/AGENTS.md`, `grok/rules/*.md`
- `.grok/rules/*.md`, `.grok/skills/5fedu-project/`

### 5fedu Hard Mode

Chỉ khi có `.grok/5fedu/` hoặc sibling `.codex/.agents/.kiro/5fedu/`:

- UI: mapping → `/template` → code hiện tại → sửa tối thiểu → verify.
- Production verify: mapping → surfaces → domain context → deploy status → browser/DB/export.
- "Chưa chuẩn"/"thiếu" → audit gap với template/spec, không vá bề mặt.

### Technical debt gate

Task vừa/lớn, UI, production, permission, DB, export, cleanup: phân loại nợ mới; sửa nợ nghiêm trọng trong scope trước `PASS`; ghi `Remaining debt` nếu còn.