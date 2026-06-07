# Cấu hình Override API Endpoint cho Google Antigravity (Jetski/Cascade)

Tài liệu này ghi lại kết quả nghiên cứu và dịch ngược (reverse engineering) file thực thi của Antigravity Language Server (`language_server_windows_x64.exe`) nhằm tìm kiếm cơ chế thay đổi URL API (Base URL) và mô hình cho Agent.

## Phát hiện cốt lõi (Core Findings)

Antigravity là một ứng dụng Electron được tùy biến từ VS Code. Nhân xử lý AI của nó (tên mã nội bộ là **Jetski** hay **Cascade**) hoạt động thông qua một dịch vụ nền (Language Server) viết bằng Go:

```text
C:\Users\DELL\AppData\Local\Programs\Antigravity\resources\app\extensions\antigravity\bin\language_server_windows_x64.exe
```

Khi khởi động và thực hiện các tác vụ sinh mã, Language Server này sẽ gọi đến API của Google Vertex AI. Bằng cách quét và phân tích các ký tự nhị phân (binary strings) trong file thực thi, chúng tôi phát hiện ra các biến môi trường cấu hình ẩn dưới đây:

### 1. Thay đổi API Base URL (Endpoint)
Dịch vụ sử dụng các biến cấu hình sau để ghi đè endpoint mặc định:
* **`VERTEX_UNISERVE_ENDPOINT_OVERRIDE_USERS`**: Đây là biến môi trường map trực tiếp vào thuộc tính `uniserve_endpoint_override` của Protobuf request gửi tới Vertex AI. 
  > [!TIP]
  > Bạn có thể đặt biến này trỏ về proxy của bạn (ví dụ: `http://localhost:8045/v1`) để chuyển hướng toàn bộ các truy vấn AI của Agent.

### 2. Ghi đè mô hình (Model Overrides)
* **`CASCADE_DEFAULT_MODEL_OVERRIDE`**: Cho phép bạn ghi đè mô hình AI mặc định được Cascade (tên gọi của Agent trong Antigravity) sử dụng.
* **`CASCADE_FREE_CONFIG_OVERRIDE`** & **`CASCADE_PREMIUM_CONFIG_OVERRIDE`**: Ghi đè các cấu hình tính năng/hạn mức tương ứng của tầng miễn phí/trả phí.
* **`LLM_SESSION_ID`**: Mã phiên làm việc của mô hình ngôn ngữ lớn (LLM).

### 3. Cấu hình gRPC và Cache
* **`VERTEX_PREDICTION_GRPC`**: Bật/tắt giao thức gRPC khi kết nối tới Vertex AI để thực hiện dự đoán (predictions).
* **`DURABLE_CACHE_TRUSTED_USERS`**: Cấu hình bộ nhớ đệm ẩn (implicit cache) cho các truy vấn code.

---

## Hướng dẫn kết nối API AI tự cấu hình

Nếu bạn đang chạy một máy chủ Proxy trung gian (OpenAI-compatible hoặc custom gateway) tương thích với cấu trúc request của Vertex AI, bạn có thể cấu hình như sau:

### Cách 1: Thiết lập qua Biến Môi Trường Hệ Thống (Windows Powershell)
Trước khi khởi chạy ứng dụng Antigravity, hãy đặt các biến môi trường trong phiên terminal hoặc cấu hình biến môi trường của User:

```powershell
# Thiết lập biến trỏ endpoint API AI của bạn
[Environment]::SetEnvironmentVariable("VERTEX_UNISERVE_ENDPOINT_OVERRIDE_USERS", "https://your-custom-proxy-api.com/v1", "User")

# Ghi đè mô hình mặc định nếu cần
[Environment]::SetEnvironmentVariable("CASCADE_DEFAULT_MODEL_OVERRIDE", "gemini-1.5-pro", "User")
```

### Cách 2: Chạy trực tiếp từ Terminal
Mở PowerShell và khởi chạy Antigravity cùng với các biến môi trường cấu hình:

```powershell
$env:VERTEX_UNISERVE_ENDPOINT_OVERRIDE_USERS = "https://your-custom-proxy-api.com/v1"
$env:CASCADE_DEFAULT_MODEL_OVERRIDE = "gemini-1.5-pro"
& "C:\Users\DELL\AppData\Local\Programs\Antigravity\Antigravity.exe"
```

> [!WARNING]
> Do Antigravity sử dụng giao thức truyền tải dữ liệu được định nghĩa chặt chẽ theo protobuf của Google Vertex AI (ví dụ các trường `safety_settings`, `generation_config`, `usage_metadata`), máy chủ API custom của bạn cần phải parse và trả về định dạng response khớp với API của Vertex AI để Agent không bị lỗi crash parser.
