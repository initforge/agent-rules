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

## Context Preservation

- Tinh gọn bằng phân tầng, không xóa mất tri thức.
- Rule sống nằm ở `00-05` hoặc legacy rule files phù hợp.
- `10` và `12` chỉ giữ log/evidence.
- Mỗi feedback mới phải được phân loại: local log, project rule, 5fedu reusable rule, hoặc global cross-stack rule.
- Sync `.agents/5fedu` và `.codex/5fedu` sau khi cập nhật context. Nếu hai bên cùng thay đổi khác nhau, báo conflict, không chọn theo timestamp một cách mù quáng.
