# 5fedu Context Index

## Mục tiêu

Đây là bộ context project-local cho dự án 5fedu. Global runtime chỉ giữ quy tắc chung; toàn bộ quy ước riêng của 5fedu nằm trong repo để AI chỉ nạp khi làm đúng dự án này.

Người dùng không cần gọi `/5fedu` để cấp context mỗi lần. `/5fedu` chỉ dùng khi scaffold ban đầu hoặc khi muốn bổ sung/sửa bộ rule/docs/status. Khi làm việc bình thường trong repo, AI phải tự đọc `AGENTS.md` và các file `.codex/5fedu/` liên quan.

## Cách làm bắt buộc

- Không đoán mò spec, màn hình, route, bảng, cột, quyền hoặc credentials.
- Nếu ảnh/spec không đủ rõ, hỏi lại người dùng hoặc yêu cầu link Google Sheet/source chính.
- Khi bắt đầu task, mapping theo chuỗi: spec -> domain/submenu -> module -> view/tab -> route -> source path -> database table -> service/handler.
- Với auth, permission, database, credentials, migration hoặc tài khoản người dùng: coi là HIGH risk, lập locked plan trước khi sửa.
- Không lưu secret thật vào file. Chỉ lưu tên biến môi trường và checklist xác thực.

## Nguồn cần nhớ

- Frontend template: `https://github.com/tahdieuphoi-ctrl/TAH_app`
- Agent rules backup/sync: `https://github.com/initforge/agent-rules`

## Khi thiếu dữ kiện

Hỏi thẳng, ngắn, rõ. Không tự suy diễn. Ghi phần chưa rõ vào `.codex/5fedu/questions.md` hoặc plan của feature đang làm.

## Cách nạp context

`AGENTS.md` là con trỏ nhẹ, không ép nạp toàn bộ tài liệu mỗi lượt. Khi bắt đầu việc, đọc:

- `00-index.md`
- `06-decision-status.md`
- `questions.md`

Sau đó chỉ đọc file chủ đề liên quan đến việc hiện tại.

Việc đọc kỹ mỗi lúc làm việc là khả thi nếu context được chia nhỏ như hiện tại: chỉ ba file nền luôn đọc, còn file chi tiết đọc theo phạm vi task.

## Phân biệt format và giá trị cụ thể

Một số dữ kiện từng app có thể chưa chốt, nhưng khung làm việc 5fedu vẫn phải được hiểu và follow.

Ví dụ:

- Chưa chốt Supabase credentials cụ thể, nhưng đã chốt cách yêu cầu, kiểm tra format, và không lưu secret.
- Chưa chốt prefix bảng đầy đủ, nhưng đã chốt format đặt tên bảng là viết tắt submenu + tên module.
- Chưa chốt permission từng module, nhưng đã chốt format mô tả quyền `xem/them/sua/xoa/quan_tri`.

Khi cần khung làm việc, đọc `.codex/5fedu/07-working-format.md`.

## Trạng thái chốt

Luôn đọc `.codex/5fedu/06-decision-status.md` trước khi triển khai. Chỉ coi một nội dung là đã chốt khi có trạng thái `DA_CHOT` và có nguồn/xác nhận rõ. Nếu trạng thái là `CHUA_CHOT` hoặc `CAN_HOI_THEM`, phải hỏi người dùng trước khi code phần liên quan.
