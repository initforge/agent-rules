# Delivery Và Quality Gates

## Code và thư mục

- Code sạch, dùng lại tốt, dễ mở rộng.
- Cấu trúc thư mục chia theo chức năng/domain, ví dụ Hệ thống, Nhân sự.
- Cây thư mục và file trong từng module ưu tiên tham khảo app template.
- Không refactor rộng nếu không cần để hoàn thành spec.

## Kiểm thử và xác minh

Trước khi báo xong:

- Chạy lint/typecheck/test phù hợp với project.
- Với UI, kiểm tra desktop/mobile, list/card/detail/form flow.
- Với Supabase, kiểm tra query, insert/update/delete, auth và permission rule liên quan.
- Với search, kiểm tra cả trường trực tiếp và trường liên kết.
- Ghi rõ phần chưa verify được nếu thiếu credentials hoặc môi trường.

## Tối ưu cuối dự án

Khi làm xong dự án hoặc gần bàn giao, luôn nhắc/tạo plan:

```text
Lên kế hoạch tối ưu để tránh làm quá tải Supabase Egress và Vercel Edge Function. Tham khảo tài liệu gốc của Supabase và Vercel trước khi chốt.
```

Vì tài liệu nền tảng có thể thay đổi, khi làm bước này phải tra tài liệu chính thức mới nhất.

## Vercel và npm install

- Clean install trên CI/Vercel phải chạy được bằng npm bình thường, không dùng `--force` hoặc `--legacy-peer-deps` để né lỗi peer dependency.
- Trước khi nâng major version của toolchain build/lint như ESLint, Vite, TypeScript, React plugin, phải kiểm tra peer dependency của các plugin chính.
- Với cấu hình hiện tại, giữ `eslint` và `@eslint/js` ở major 9 cho tới khi `eslint-plugin-jsx-a11y` hỗ trợ ESLint 10.
- Build/deploy log không dùng `npm audit` làm gate cài đặt dependency; audit bảo mật là backlog/gate riêng để xử lý có kiểm soát.
