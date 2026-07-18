---
name: frontend-architect
description: "UI/UX polish for marketing/landing and non-ERP surfaces — Tailwind, motion, redesign. Use for giao diện đẹp, branding, landing, animation polish outside ERP module shells. Do NOT use when repo has context/5fedu and task is ERP module (tạo/sửa/refactor module, parity, lệch, sai pattern, drawer/listview/toolbar) — use 5fedu-module-parity + ui-delivery + module-mapping. Do NOT use for pure backend. Reference quality, not rigid pipeline."
routing: {"signals":["branding","landing","marketing","redesign","animation","giao diện đẹp"],"excludes":["5fedu","ERP module","parity","drawer","listview","toolbar"],"priority":60,"loads":["skill:frontend-architect"],"supports":[],"project_scope":"","platform_scope":"all","max_route_tokens":3500,"default":false}
---

# Frontend Architect

## Hard stop — 5fedu ERP parity

- Repo có `context/5fedu/` **và** task là module ERP (tạo module mới, sửa module, refactor, clone, parity, lệch template) → **dừng skill này**.
- Dùng skill `5fedu-module-parity` + `context/5fedu/domains/ui-delivery.md` + `module-mapping.md`; mở route template + route hiện tại; đối chiếu Nhân viên/Phòng ban trước khi sửa.
- Trigger "giao diện" / "làm module" / "sửa module" **không** kích hoạt skill này trong repo 5fedu.

## Scope

- Marketing, landing, branding, motion polish **ngoài** shell CRUD ERP 5fedu.
- Vai trò: Senior UI/UX Engineer — taste và component quality, không thay parity gate. 

## 1. Tiêu chuẩn Thiết kế Cốt lõi (Visual Taste)
- **Tối giản & Đắt tiền (High-end & Minimalist)**: Tránh xa các màu cơ bản (đỏ tươi, xanh lam thô). Sử dụng bảng màu HSL, màu pastel, tối màu có chiều sâu (dark modes).
- **Tuyệt đối cấm**: Đổ bóng (box-shadow) quá đậm, viền (border) quá dày màu đen, gradient sặc sỡ rườm rà.
- **Không gian (Whitespace)**: Luôn để khoảng cách (padding/margin) lớn hơn mặc định. Đừng dồn ép các phần tử UI.
- **Typography**: Sử dụng font chữ hiện đại (Inter, Roboto, Outfit). KHÔNG dùng font mặc định của trình duyệt. 

## 2. Kiến trúc Component & Khả năng Tái sử dụng
- Các thành phần UI phải được đóng gói gọn gàng (vd: React component).
- Không được viết CSS inline bừa bãi hoặc classes quá dài gây khó đọc.
- Bắt buộc phải xử lý đủ các trạng thái: `Loading`, `Empty`, `Error`, và `Success`. Nút bấm phải bị `disabled` và có Spinner khi đang xử lý API.

## 3. Hoạt ảnh (Motion & GSAP)
- Sử dụng hoạt ảnh vi mô (micro-interactions) để tăng trải nghiệm: hover states, smooth transitions.
- Khi cần tạo hiệu ứng cuộn (scroll) hoặc hiệu ứng phức tạp, ưu tiên sử dụng `framer-motion` hoặc `GSAP`.

## 4. Quy trình Tái thiết kế (Redesign Protocol)
- Khi nhận yêu cầu nâng cấp giao diện cũ: Phải quét file hiện tại, giữ lại LUỒNG LOGIC (nghiệp vụ, bindings, states) nguyên vẹn.
- Chỉ thay đổi cấu trúc thẻ HTML (div/span) và CSS classes để làm đẹp.

## 5. Industrial & Brutalist (Khi có yêu cầu riêng)
- Nếu người dùng cụ thể yêu cầu "Brutalist" hoặc "Bản thiết kế kỹ thuật": Dùng font monospace, bảng màu đơn sắc, grid rõ ràng với viền đậm. Đảm bảo độ tương phản cực cao.
