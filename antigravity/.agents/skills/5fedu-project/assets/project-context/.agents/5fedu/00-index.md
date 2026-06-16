# 5fedu Context Index

Đây là index project-local cho 5fedu. Agent đọc file này trước để biết phải đọc gì tiếp theo, không đọc toàn bộ context folder theo thói quen.

## Loading Policy

Luôn đọc trước:

- `AGENTS.md`
- `00-index.md`
- `04-decision-status-and-backlog.md` hoặc legacy `06-decision-status.md`
- `questions.md`
- `05-source-specs-and-coverage.md` hoặc legacy `11-current-sheets-source-map.md` khi task cần đối chiếu spec/source

Đọc sâu theo domain:

- `02-database-and-auth-rules.md`: database, auth, permission, RLS, trigger, rollup, schema.
- `03-ui-ux-and-delivery-standards.md`: UI, UX, list/detail/form, toolbar, filter, export, responsive, production UI rules.
- Legacy files `03-database-supabase.md`, `04-auth-permissions-and-flows.md`, `05-delivery-quality.md`, `07-working-format.md`, `08-source-examples.md`, `09-coverage-audit.md` chỉ đọc khi repo còn dùng layout cũ hoặc task cần bằng chứng cụ thể.
- `10-owner-feedback-lessons.md` và `12-owner-feedback-transport-ui.md` là log/lesson evidence. Nếu thấy rule dùng lại được, promote vào file rule sống phù hợp.
- `13-trip-execution-vs-approval-spec.md`: checklist triển khai Chuyến xe — tách TT thực hiện vs duyệt (owner 2026-06-15).
- `14-production-e2e-harness.md`: harness Playwright production — fixtures, backup/restore, blast radius, lệnh chạy, gate deploy bundle.

## Execution Contract

- Không blind-code. Trước khi sửa, xác định file sửa trực tiếp, file liên quan, data/API/UI/caller bị ảnh hưởng.
- Không isolated fix. Sửa schema/API/type/service/UI phải rà các nơi dùng liên quan.
- Không placeholder code cho feature đã được yêu cầu thật.
- Không báo xong nếu chưa verify gate cốt lõi.
- Không tự push, trừ khi user yêu cầu rõ trong session.
- Không để nợ kỹ thuật mới thành mặc định. Nếu task tạo nợ mới, phải phân loại, sửa ngay nếu nghiêm trọng, hoặc ghi rõ `Remaining debt`.

## Smart Intent Contract

Khi prompt có tín hiệu rộng, agent phải tự kích hoạt nhanh gate tương ứng:

- `verify production hết`, `test production`, `kiểm tra live`: đọc index/mapping trước, suy ra module/role/database/UI/export/cross-flow, rồi mới verify production.
- `UI`, `chưa chuẩn`, `thiếu`, `không giống`, `module thiếu`, `tính năng thiếu`: đọc mapping, tìm `/template` trước. Nếu template có mẫu đủ đáp ứng prompt/app thì bám sát template và đổi tối thiểu; chỉ dùng fallback/golden reference khi template thiếu, không đủ hành vi, hoặc có bằng chứng đang ngõ cụt.
- Mọi thay đổi UI 5fedu, gồm làm mới, làm lại, chỉnh sửa, loại bỏ, bổ sung module, bổ sung nút, bổ sung tính năng, đổi layout, đổi flow hoặc đổi responsive behavior, bắt buộc bám pattern UI của template theo đúng surface/hành vi tương ứng.
- `permission`, `phân quyền`, `role`, `RLS`, `auth`: đọc database/auth rules và test đa account/đa cấp.
- `export`, `download`, `Excel`, `PDF`, `CSV`: tải file thật và kiểm format/nội dung.
- `cleanup`, `gitignore`, `xóa file`, `trùng chức năng`: kiểm reference bằng `rg`/GitNexus/package scripts/CI/docs trước khi xóa.

Với task lớn hoặc production/UI/permission/database/export, report cuối phải có `Context loaded`, `Verification`, `Technical debt check`, `Status`; riêng UI phải có `Template checked`.

## Verification Policy

Mặc định của 5fedu:

- Test production sau khi code đã được push và CI/CD deploy xong.
- Nếu user yêu cầu test local, test local trước hoặc thay production theo yêu cầu.
- Không tự tạo Vercel site/project mới.
- Không manual deploy bằng terminal nếu user không yêu cầu rõ.

Test không chỉ là bấm nút:

- CRUD: create/read/update/delete với dữ liệu thật hoặc test data được phép.
- Database: query đối chiếu record, trigger, rollup, cascade, RLS/policy nếu có.
- Permission: tạo/dùng đủ account đại diện các cấp quyền; mỗi account phải test quyền xem/thêm/sửa/xóa và hành động trái phép.
- Cross-module: dữ liệu thay đổi ở một module phải phản ánh đúng ở module liên quan, báo cáo, dropdown, cache/query.
- Toolbar/filter/search: kiểm tra behavior và đối chiếu kết quả lọc với database/source.
- Export: tải file thật, kiểm tra tên file, extension, format, Excel cell type, PDF Unicode/layout.
- External integration không có quyền test thật: đọc code kỹ, kiểm tra config/error path, ghi `PARTIAL` hoặc gap cho user test.
- Regression vận tải / chuyến xe / phân quyền: đọc `14-production-e2e-harness.md`, chạy spec trong blast radius tương ứng; test mutating bắt buộc snapshot + restore fixture; thiếu service role → UI-only `PARTIAL`.

## Context Preservation & Evolution (bắt buộc)

**Nguyên tắc: promote rule, không dump raw.** File `10`/`12` chỉ là archive index — không ghi quote owner, không lặp lại rule đã promote.

| Loại nội dung | Ghi ở đâu | Sync master? |
|---------------|-----------|--------------|
| Rule DB/auth/permission | `02-database-and-auth-rules.md` | Có |
| Rule UI/UX/harness | `03-ui-ux-and-delivery-standards.md`, `14-production-e2e-harness.md` | Có |
| Checklist triển khai module | `13-trip-execution-vs-approval-spec.md` (khi liên quan) | Có |
| Trạng thái chốt/blocker | `06-decision-status.md` | Project only |
| Câu hỏi mở | `questions.md` | Project only |
| Raw chat / evidence | Sheet ngoài hoặc 1 dòng index trong `10`/`12` | **Không** |

Workflow mỗi lần tiến hóa:

1. Viết rule imperative (≤5 bullet) vào file sống.
2. Cập nhật `SKILL.md` §4/§F chỉ khi rule áp dụng mọi repo 5fedu.
3. Mirror `.agents/5fedu` ↔ `.codex/5fedu`.
4. Sync ngược master: **chỉ** allowlist trong `14` §11 — không đẩy `10`, `12`, `06`, `questions`.

Nếu hai mirror cùng đổi khác nhau → báo conflict, không chọn theo timestamp mù quáng.
