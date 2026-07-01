---
name: frontend-architect
description: "UI/UX standards — Tailwind, component states, motion, redesign. Use when building or polishing UI/UX, layout, CSS, animation, redesign, giao diện đẹp, tailwind, component. Do NOT use for 5fedu ERP module parity (use 5fedu ui-delivery + module-mapping) or pure backend work. Skill is reference quality, not a rigid pipeline."
---

# Kỹ năng Kiến trúc sư Frontend (Frontend Architect Skill)

Kỹ năng này chịu trách nhiệm cho MỌI TÁC VỤ liên quan đến giao diện người dùng (UI), trải nghiệm (UX), CSS/Tailwind, hoạt ảnh (Animation), và cấu trúc Component. 

Khi kích hoạt kỹ năng này, Agent đóng vai trò là một **Senior UI/UX Engineer** kiêm **Design Architect**. 

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
