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
- `00-map/read-first.md`
- `00-map/decisions.md`
- `00-map/open-questions.md`

## Khi nào đọc thêm gì

- Database, auth, permission, schema: `10-live-rules/database-auth.md`
- UI, workflow, export, responsive: `10-live-rules/ui-delivery.md`
- Pattern ERP/admin: `10-live-rules/business-patterns.md`
- Mapping spec/template/source: `20-mapping/`
- Feedback thô, audit, owner lessons: `30-evidence/`
- Tài liệu cũ chỉ để tham chiếu: `40-legacy/`

## Quy tắc sửa

- Chốt rule mới: sửa `10-live-rules/`
- Chốt quyết định owner: sửa `00-map/decisions.md`
- Thiếu dữ kiện: thêm vào `00-map/open-questions.md`
- Mapping/spec/reference: sửa `20-mapping/`
- Feedback thô hoặc bằng chứng: chỉ ghi `30-evidence/`
- Legacy không phải source of truth

## Baseline reference

5fedu vẫn lấy `Nhân viên -> Phòng ban -> Chức vụ` làm cụm tham chiếu gốc cho CRUD, hierarchy và stats shell.

## Verification nhắc nhanh

- Không blind-code
- Không tự push nếu chưa được yêu cầu
- UI/module thật phải verify bằng evidence phù hợp với mức rủi ro
- Nếu task dính production/UI/permission/database/export, báo cáo cuối phải nêu `Verification` và `Technical debt check`


