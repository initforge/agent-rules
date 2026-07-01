# Đọc Trước Khi Làm

Đây là file map ngắn. Mục tiêu là nhìn phát biết:

- file nào phải đọc trước;
- file nào là rule sống;
- file nào là mapping;
- file nào là bằng chứng;
- file nào là legacy;
- file nào được sửa khi owner chốt rule mới.

## Luôn đọc trước

- `AGENTS.md`
- `00-ban-do/doc-truoc.md`
- `00-ban-do/quyet-dinh.md`
- `00-ban-do/cau-hoi-mo.md`

## Khi nào đọc thêm gì

- Database, auth, permission, schema: `10-rule-song/database-auth.md`
- UI, workflow, export, responsive: `10-rule-song/ui-delivery.md`
- Pattern ERP/admin: `10-rule-song/business-patterns.md`
- Mapping spec/template/source: `20-mapping/`
- Feedback thô, audit, owner lessons: `30-bang-chung/`
- Tài liệu cũ chỉ để tham chiếu: `40-legacy/`

## Quy tắc sửa

- Chốt rule mới: sửa `10-rule-song/`
- Chốt quyết định owner: sửa `00-ban-do/quyet-dinh.md`
- Thiếu dữ kiện: thêm vào `00-ban-do/cau-hoi-mo.md`
- Mapping/spec/reference: sửa `20-mapping/`
- Feedback thô hoặc bằng chứng: chỉ ghi `30-bang-chung/`
- Legacy không phải source of truth

## Baseline reference

5fedu vẫn lấy `Nhân viên -> Phòng ban -> Chức vụ` làm cụm tham chiếu gốc cho CRUD, hierarchy và stats shell.

## Verification nhắc nhanh

- Không blind-code
- Không tự push nếu chưa được yêu cầu
- UI/module thật phải verify bằng evidence phù hợp với mức rủi ro
- Nếu task dính production/UI/permission/database/export, báo cáo cuối phải nêu `Verification` và `Technical debt check`
