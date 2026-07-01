---
name: master-image-generation
description: "Mockups, brand visuals, image-to-code. Use when user asks to generate UI mockup, sinh ảnh giao diện, brandkit, image-to-code, thiết kế màn hình từ ảnh. Do NOT use for 5fedu ERP parity fixes or ordinary CSS tweaks (use frontend-architect or 5fedu ui-delivery). Reference standards, not mandatory pipeline."
---

# Kỹ năng Xử lý Ảnh & Thiết kế Hình ảnh (Master Image Generation Skill)

Đây là kỹ năng bao trùm cho TẤT CẢ các tác vụ liên quan đến việc sinh ảnh (image_gen), chỉnh sửa ảnh (image_edit) và code từ ảnh.

## 1. Nguyên lý Chung (Imagine Core)
- Khi nào cần sinh ảnh: Không phải cứ nhắc tới "ảnh" là sinh. Chỉ sinh ảnh khi cần thiết lập bản thảo thiết kế (mockup) hoặc thiết kế một assets trực quan.
- Chú ý tính nhất quán của tài sản (Asset consistency): Đảm bảo các luồng UI có chung màu sắc và phong cách thiết kế.

## 2. Thiết kế Giao diện Web (Web Frontend Gen)
- Yêu cầu BẮT BUỘC: Khi sinh thiết kế Landing Page có 8 section, phải sinh ra 8 tấm ảnh nằm ngang riêng biệt. Tuyệt đối không nén tất cả các section vào 1 ảnh dọc nhỏ xíu.
- Cấu trúc: Thử nghiệm các bố cục (composition) đa dạng, không phải lúc nào cũng "Text bên trái, Ảnh bên phải".

## 3. Thiết kế Ứng dụng Di động (Mobile App Gen)
- Luôn đặt màn hình bên trong một khung điện thoại (premium mockup frame) tinh tế.
- Ưu tiên hệ thống phân cấp sạch, chữ to dễ đọc, sử dụng icon tùy biến.

## 4. Brandkit & Nhận diện Thương hiệu
- Thiết kế logo, bảng màu, bảng moodboard: Hướng tới phong cách tối giản, điện ảnh, cao cấp (luxury), hoặc kỹ thuật (dark-tech).

## 5. Từ Ảnh sang Code (Image-to-Code)
- Khi đọc hình ảnh thiết kế để chuyển thành mã nguồn, phải bám sát tuyệt đối tỷ lệ (padding, margin, width).
- Tránh việc sinh ra mã HTML/CSS rườm rà (thẻ div bọc thẻ div quá nhiều).
