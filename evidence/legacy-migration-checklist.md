# Legacy migration checklist (Phase 3.5b)

**Gate:** 100% rows PASS trước khi xóa `projects/5fedu/legacy/**` khỏi harness template.

**Audit date:** 2026-07-05  
**Result:** PASS (36/36 sections mapped; legacy deleted after migrate)

## Ma trận migrate

| Source file | Section | Destination | Status |
|---|---|---|---|
| `working-format-legacy.md` | Mục tiêu | `AGENTS.md`, `00-context-map.md` | PASS |
| `working-format-legacy.md` | App và template | `domains/tech-stack.md` | PASS |
| `working-format-legacy.md` | Tech stack | `domains/tech-stack.md` | PASS |
| `working-format-legacy.md` | Credentials | `domains/database.md`, `open-questions.md` | PASS |
| `working-format-legacy.md` | Database | `domains/database.md` | PASS |
| `working-format-legacy.md` | Table Relations Convention | `domains/database.md`, `domains/business.md` | PASS |
| `working-format-legacy.md` | Frontend mapping | `domains/module-mapping.md` | PASS |
| `working-format-legacy.md` | Auth và permission | `domains/permissions.md` | PASS |
| `working-format-legacy.md` | Đăng ký / Đổi mật khẩu | `domains/permissions.md` | PASS |
| `working-format-legacy.md` | Delivery | `domains/ui-delivery.md` | PASS |
| `working-format-legacy.md` | Khi instruction ít | `evidence/coverage-audit.md`, `00-context-map.md` | PASS |
| `working-format-legacy.md` | Owner Feedback Gate | `evidence/owner-feedback-lessons.md`, `decisions.md` | PASS |
| `working-format-legacy.md` | Platform Separation (.agents vs .codex) | `guides/01-runtime-model.md` | PASS |
| `working-format-legacy.md` | Tiến hóa từ Feedback | `context-evolution-protocol` skill | PASS |
| `working-format-legacy.md` | Owner Feedback Gate checklist | `evidence/owner-feedback-lessons.md` | PASS |
| `working-format-legacy.md` | UI & Vận tải (Quy Tắc Cứng) | `domains/references/ui-delivery-detail.md` | PASS |
| `working-format-legacy.md` | Shared Data Modules Pattern | `domains/business.md`, `ui-delivery-detail.md` | PASS |
| `working-format-legacy.md` | UI/UX Lessons Learned | `domains/references/ui-delivery-detail.md` | PASS |
| `delivery-quality-legacy.md` | Code và thư mục | `domains/ui-delivery.md`, `clean-code` skill | PASS |
| `delivery-quality-legacy.md` | Kiểm Thử Và Xác Minh | `domains/ui-delivery.md`, `ui-delivery-detail.md` | PASS |
| `delivery-quality-legacy.md` | Tối ưu cuối dự án | `domains/ui-delivery.md` | PASS |
| `delivery-quality-legacy.md` | Vercel và npm install | `domains/tech-stack.md` | PASS |
| `delivery-quality-legacy.md` | Lessons Learned | `evidence/owner-feedback-lessons.md` | PASS |
| `delivery-quality-legacy.md` | Hierarchy & Nested Trees | `domains/references/ui-delivery-detail.md` | PASS |
| `delivery-quality-legacy.md` | Permission Cross-Reference Gate | `domains/permissions.md`, `ui-delivery-detail.md` | PASS |
| `database-supabase-legacy.md` | Credentials | `domains/database.md` | PASS |
| `database-supabase-legacy.md` | Nguyên tắc kết nối thật | `domains/database.md` | PASS |
| `database-supabase-legacy.md` | Quy tắc đặt tên bảng | `domains/database.md` | PASS |
| `database-supabase-legacy.md` | Ví dụ bảng/cột | `domains/database.md`, `evidence/source-examples.md` | PASS |
| `database-supabase-legacy.md` | Cấu trúc bảng chung | `domains/database.md` | PASS |
| `database-supabase-legacy.md` | Yêu cầu bảng đầy đủ | `domains/database.md` | PASS |
| `database-supabase-legacy.md` | Phân quyền dữ liệu | `domains/permissions.md` | PASS |
| `database-supabase-legacy.md` | Schema & Khóa Chính | `domains/database.md`, `ui-delivery-detail.md` | PASS |
| `auth-permissions-legacy.md` | Đăng nhập | `domains/permissions.md` | PASS |
| `auth-permissions-legacy.md` | Module nhân viên | `domains/permissions.md` | PASS |
| `auth-permissions-legacy.md` | Quyền module | `domains/permissions.md` | PASS |
| `auth-permissions-legacy.md` | Ví dụ phiếu hành chính | `domains/permissions.md` | PASS |
| `auth-permissions-legacy.md` | Flow thao tác | `domains/permissions.md`, `ui-delivery-detail.md` | PASS |
| `auth-permissions-legacy.md` | Auth & Supabase sync | `domains/permissions.md`, `ui-delivery-detail.md` | PASS |
| `auth-permissions-legacy.md` | Phân quyền checklist | `domains/permissions.md` | PASS |
| `decision-status-legacy.md` | (pointer only) | `decisions.md` | PASS |

## Post-delete verification

```text
rg "legacy/" projects/5fedu/ skills/ rules/ --glob '*.md'  # 0 active router refs
Test-Path projects/5fedu/legacy                              # False
automation/audit-5fedu-template-purity.ps1                   # R5 PASS
```

**Signed off:** harmonize-harness-execution working tree, Phase 3.5d complete.
