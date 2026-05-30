# Coverage Audit

## Mục tiêu

File này đối chiếu prompt/ảnh ban đầu với bộ context hiện tại để tránh mất ý. Khi bổ sung rule mới, cập nhật audit nếu rule đó thay đổi phạm vi hoặc cách AI phải làm việc.

## Kết luận hiện tại

Bộ context đã đủ để AI làm việc độc lập theo đúng hướng 5fedu trong phạm vi an toàn:

- Biết phải đọc `AGENTS.md` và context project-local khi làm trong repo.
- Biết không cần người dùng gọi `/5fedu` mỗi lần.
- Biết format/cách làm mặc định khi người dùng đưa ít instruction.
- Biết phần nào phải hỏi lại vì là giá trị cụ thể từng app.
- Biết không tự suy diễn credentials, schema production, permission rule cụ thể, hoặc sửa/xóa lớn template.

## Đối chiếu yêu cầu

| Yêu cầu gốc | Đã phủ ở đâu | Trạng thái | Ghi chú |
| --- | --- | --- | --- |
| 5fedu có convention/rule/workflow riêng theo dự án | `AGENTS.md`, `00-index.md` | Đã phủ | Context nằm trong repo, không nhét full global |
| AGENTS.md trong dự án hoặc băm nhỏ file và AGENTS.md kết nối | `AGENTS.md`, `.codex/5fedu/*.md` | Đã phủ | AGENTS là con trỏ nhẹ/loading policy |
| Không làm phình global context | `AGENTS.md`, `00-index.md`, skill `5fedu-project` | Đã phủ | Global chỉ giữ `/5fedu` và skill scaffold/bảo trì |
| Có slash để setup/bảo trì context 5fedu | `C:\Users\ADMIN\.codex\prompts\5fedu.prompt.md` | Đã phủ | Chỉ một slash `/5fedu` |
| `/5fedu` không phải lệnh cấp context mỗi lần | `AGENTS.md`, `00-index.md`, `06-decision-status.md` | Đã phủ | Normal work tự đọc AGENTS/context |
| Hỏi đàng hoàng, không suy diễn lung tung | `00-index.md`, `06-decision-status.md`, `questions.md` | Đã phủ | `CHUA_CHOT/CAN_HOI_THEM` phải hỏi |
| Tech stack ảnh 1 | `01-tech-stack-and-template.md`, `07-working-format.md`, `08-source-examples.md` | Đã phủ format | Stack từng app vẫn cần xác nhận |
| Template `tahdieuphoi-ctrl/TAH_app` | `00`, `01`, `07`, `08`, `questions.md` | Đã phủ | Clone/adapt repo hiện tại vẫn cần chốt |
| Domain/sidebar ảnh 2 | `02`, `08` | Đã phủ | Dùng làm ví dụ, không ép scope nếu app khác |
| Module/view/tab ảnh 3-4 | `02`, `08` | Đã phủ | Đã thêm Hệ thống/Quản lý vận tải mẫu |
| Supabase credentials đầy đủ, check format mọi credentials | `03`, `07`, `questions.md` | Đã phủ | Không in/lưu secret |
| Database convention ảnh 6-8 | `03`, `07`, `08` | Đã phủ | Schema final vẫn cần chốt |
| Auth, permission, UI flow, search, notification, delivery | `02`, `04`, `05`, `07` | Đã phủ | Rule cụ thể từng module vẫn cần chốt |
| Tối ưu Supabase Egress + Vercel Edge Function cuối dự án | `05`, `07` | Đã phủ | Khi làm phải tra docs chính thức mới nhất |

## Cách suy luận khi user cấp ít instruction

AI được tự suy luận theo thứ tự:

1. Đọc `AGENTS.md`, `00-index.md`, `06-decision-status.md`, `questions.md`.
2. Đọc `07-working-format.md` để nắm format/cách làm.
3. Đọc `08-source-examples.md` để lấy ví dụ neo theo ảnh/spec ban đầu.
4. Tìm trong template/source trước khi tạo mới.
5. Đề xuất mapping và các câu hỏi còn thiếu.

AI không được tự chốt các điểm sau nếu chưa có nguồn:

- credentials
- schema/migration production
- permission rule cụ thể từng module
- xóa/sửa lớn template
- prefix mới hoặc quy ước index chưa có mẫu
- app hiện tại có đúng toàn bộ ví dụ từ ảnh hay không
