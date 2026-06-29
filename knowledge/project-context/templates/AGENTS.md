# 5fedu Project Entry

Repo này dùng context project-local cho 5fedu. File này là con trỏ nhẹ, không phải nơi nhét toàn bộ rule chi tiết.

Người dùng không cần gọi `/5fedu` mỗi lần làm việc. `/5fedu` chỉ dùng để scaffold hoặc bảo trì context.

## Luôn Đọc Trước Khi Làm

Đọc lớp index/mapping nhẹ:

- `context/5fedu/00-index.md`: cách nạp context, execution contract, verify policy.
- `context/5fedu/04-decision-status-and-backlog.md` hoặc `context/5fedu/06-decision-status.md`: trạng thái `DA_CHOT`, `CHUA_CHOT`, `CAN_HOI_THEM`.
- `context/5fedu/questions.md`: câu hỏi còn mở.
- `context/5fedu/05-source-specs-and-coverage.md` hoặc `context/5fedu/11-current-sheets-source-map.md` khi task cần đối chiếu spec/source.

Sau đó chỉ đọc file chi tiết khi task thật sự dính domain đó.

## Chỉ Đọc Khi Liên Quan

- Database/auth/schema/permission/RLS/trigger/rollup: đọc `context/5fedu/02-database-and-auth-rules.md` và legacy `context/5fedu/03-database-supabase.md`, `context/5fedu/04-auth-permissions-and-flows.md` nếu có.
- UI/UX/list/detail/form/toolbar/filter/export/responsive: đọc `context/5fedu/03-ui-ux-and-delivery-standards.md`, legacy `context/5fedu/05-delivery-quality.md`, `context/5fedu/07-working-format.md` nếu có.
- ERP/admin business patterns như master-detail, approval workflow, derived totals, lookup autofill, report/export parity: đọc `context/5fedu/04-business-patterns.md`.
- Feedback cũ, lỗi nhắc lại, vận tải, hoặc owner correction: tìm trong `context/5fedu/10-owner-feedback-lessons.md` và `context/5fedu/12-owner-feedback-transport-ui.md`, sau đó kiểm tra bài học đã được promote vào rule sống chưa.
- Template parity: với mọi task UI hoặc khi user nói UI/tính năng/module `chưa chuẩn`, `thiếu`, `không giống`, `chưa đủ`, phải đọc mapping trước và tìm `/template` trước. Nếu template đủ đáp ứng prompt/app thì bám sát template và đổi tối thiểu. Chỉ dùng golden reference khi template thiếu/không đủ/ngõ cụt; khi đó phải research nhiều tab/module theo behavior/output/surface/data/permission để chọn reference phù hợp nhất, không mặc định một module cố định.
- Pattern fidelity: trước khi code UI/module, phải lập mapping ngắn từ spec -> submenu -> module -> tab/route -> template/current-app reference -> labels/actions/fields/service. Cấm tự chế tên module, mô tả, nút, icon, tab, copy hoặc workflow nếu spec/template/app đã có nguồn.

## Quy Tắc Cứng

- Không đoán module, route, bảng, cột, credential, quyền hoặc flow khi status còn `CHUA_CHOT` hoặc `CAN_HOI_THEM`.
- Khi dữ kiện cụ thể chưa chốt, vẫn theo format/cách làm 5fedu đã chốt; chỉ hỏi phần giá trị còn thiếu.
- Khi user chốt hoặc bổ sung rule mới, ghi log nếu cần, promote thành rule sống, cập nhật decision status trong `context/5fedu`, rồi kiểm tra pointer `.agents/AGENTS.md` và `.codex/AGENTS.md`.
- File `10` và `12` là log; không để rule quan trọng chỉ nằm ở đó.
- Không lưu secret thật vào repo hoặc tài liệu.
- Không tự push. Với 5fedu, production verification thường cần push/deploy, nhưng chỉ push khi user yêu cầu rõ trong session.
- Với Codex, không tự mở browser/Playwright để verify mặc định. Dùng build/test/source trace/API/DB/artifact evidence trước; browser/live visual verification chỉ chạy khi user yêu cầu rõ.
- Mặc định verify 5fedu bằng evidence phù hợp sau khi thay đổi đã được push/deploy; nếu user yêu cầu test local thì ưu tiên local.
- Nếu user yêu cầu `verify production hết`, không nhảy thẳng vào browser. Đọc index/mapping trước, suy ra module/role/database/UI/export/cross-flow, rồi mới nạp context chi tiết và chạy verify.
- Với task UI, báo cáo cuối phải nêu `Template checked` hoặc lý do không thể kiểm template.
- Với task UI/module, báo cáo cuối phải nêu `Pattern fidelity` gồm reference đã dùng và các phần đã giữ nguyên từ pattern.
- Với task vừa/lớn, production, UI, permission, database, export hoặc cleanup, báo cáo cuối phải có `Technical debt check`. Nợ nghiêm trọng trong scope phải sửa trước khi báo `PASS`.

## Owner Feedback Gate

- App table primary key mặc định là `id int8` auto-increment; foreign key tới app table cũng là `int8`.
- Login dùng `ten_dang_nhap`; admin mặc định là `admin` / `5fedu.com`.
- Tài khoản thường mặc định `123456`; không test đổi mật khẩu trên admin chính.
- Supabase service role không bao giờ nằm ở client.
- CRUD không được mock ảo khi feature đã yêu cầu thật.
- Permission phải test đa tài khoản, đa cấp bậc, UI và API/database nếu có thể.
- Dữ liệu liên module phải verify qua lại: module nguồn, module phụ thuộc, báo cáo, dropdown, rollup, cache/query.
- Toolbar, filter, search, export, drawer, pagination và responsive behavior đều là bề mặt test thật.
