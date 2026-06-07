# Prompt Intent Router

## Trigger

Áp dụng ở đầu mỗi lượt trước khi sửa, test, review hoặc cập nhật context.

## Mục Tiêu

Hiểu ý đồ thật trong prompt của người dùng, chọn đúng context và gate nhanh, tránh đọc lan man hoặc làm thiếu bước quan trọng.

## Intent Signals

Nếu prompt có các tín hiệu sau, kích hoạt gate tương ứng:

- `verify production`, `test production`, `kiểm tra live`, `verify hết`: chạy Smart Verification Activation trong `quality-gates.md`.
- `5fedu` hoặc đang ở dự án 5fedu (có thư mục `.agents/5fedu/` hoặc `.codex/5fedu/`): đọc `AGENTS.md` và index/mapping trước.
- `UI`, `giao diện`, `chưa chuẩn`, `thiếu`, `không giống`, `module thiếu`, `tính năng thiếu`: NẾU là dự án 5fedu (có thư mục `.agents/5fedu/`), kích hoạt Template Parity Gate và tìm `/template` trước, chỉ dùng reference pool/golden reference khi template thiếu hoặc không đủ hành vi. Với dự án khác, tuyệt đối KHÔNG kích hoạt và KHÔNG tìm kiếm template 5fedu.
- `permission`, `phân quyền`, `role`, `account`, `RLS`, `auth`: kích hoạt Permission Gate và database/auth context.
- `database`, `schema`, `migration`, `Supabase`, `SQL`, `trigger`, `rollup`: kích hoạt database/schema gate và root-cause verification.
- `export`, `download`, `Excel`, `PDF`, `CSV`: kích hoạt export/download verification.
- `cleanup`, `gitignore`, `xóa file`, `trùng chức năng`, `không dùng`: kích hoạt cleanup rules và technical-debt control.
- `audit`, `review`, `nợ kỹ thuật`, `bất hợp lý`: review stance, findings first, kèm technical-debt register.
- `push`, `deploy`, `commit`: chỉ làm khi user yêu cầu rõ trong session; vẫn phải verify trạng thái trước và sau.

## Preflight Decision

Trước khi sửa, agent phải tự trả lời ngắn trong nội bộ:

1. Repo/project nào?
2. Ý đồ chính là fix, feature, verify, audit, cleanup, context update hay discussion?
3. Bề mặt liên quan: UI, DB, auth, permission, export, API, cross-module, production?
4. Context entry/index nào phải đọc trước?
5. Context chi tiết nào chỉ đọc nếu thật sự dính?
6. Gate nào là bắt buộc để được báo `PASS`?
7. Có hành động cần user cho phép không: push, deploy, migration, xóa dữ liệu, production write?

## Evidence Contract

Với task MEDIUM/HIGH, production verify, 5fedu UI, permission, database, export, cleanup lớn hoặc audit sâu, báo cáo cuối phải có đủ bằng chứng phù hợp:

- `Intent detected`: ý đồ/gate chính.
- `Context loaded`: entry/index/mapping và context chi tiết đã dùng.
- `Template checked`: bắt buộc cho UI 5fedu; với dự án khác ghi design system/template/reference nếu có.
- `Verification`: lệnh, browser flow, DB/API/export checks.
- `Technical debt check`: nợ phát sinh, nợ giảm, nợ còn lại, lý do chấp nhận nếu có.
- `Status`: `PASS`, `PARTIAL`, hoặc `BLOCKED`.

Task nhỏ có thể gộp các mục này thành 1-2 câu trong final, nhưng không được bỏ qua gate cốt lõi.

## Evidence Validator

Khi task có report/handoff/plan evidence file, dùng script này để tự kiểm checklist:

```powershell
C:\Users\DELL\.codex\scripts\validate-task-evidence.ps1 -ReportPath <path> -Mode generic,5fedu-ui,production
```

Khi cần tạo report chuẩn, dùng cấu trúc trong:

```text
C:\Users\DELL\.codex\templates\task-evidence-template.md
```

Chọn mode theo bề mặt thật:

- `5fedu-ui`: bắt buộc khi UI 5fedu cần template-first/reference-pool evidence.
- `production`: khi verify live/production.
- `permission`: khi có role/account/auth/RLS.
- `database`: khi có schema/query/mutation/trigger/rollup.
- `export`: khi có download/Excel/PDF/CSV.
- `cleanup`: khi xóa file, dọn artifact, sửa gitignore.
- `audit`: khi review/audit/nợ kỹ thuật.

Nếu validator fail ở gate cốt lõi mà agent có thể bổ sung evidence ngay, phải bổ sung và chạy lại trước khi báo `PASS`.
