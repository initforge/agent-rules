# Antigravity Adapter

## Kết luận thiết kế

Nên có README, ý đồ và chú thích rõ ràng cho Antigravity, nhưng không nên biến Antigravity thành bản copy đầy đủ của Codex runtime. Antigravity đọc rules/workflows theo cơ chế riêng; vì vậy repo này cần một adapter mỏng:

- `antigravity/README.md`: giải thích ý đồ và cách cài.
- `antigravity/.agents/rules/`: rule nền ngắn, luôn hữu ích.
- `antigravity/.agents/rules/01-intent-contract.md`: hợp đồng ý đồ để Antigravity chọn workflow và tránh hiểu sai request.
- `antigravity/.agents/workflows/`: quy trình gọi được bằng slash command.
- `antigravity/scripts/`: preflight/check nhẹ.
- `codex/scripts/install-antigravity-adapter.ps1`: cài adapter vào project.

Adapter này cố ý không có profile/model config. Với Codex, người dùng có thể tự đổi model hoặc dùng `codex/agents/*.toml` khi cần orchestration theo pha. Với Antigravity, model/effort để Antigravity tự quản, ví dụ Gemini 3.5 Flash medium.

## Bằng chứng nghiên cứu

Tài liệu Antigravity hiện mô tả Project là cấu hình gồm một hoặc nhiều folder, có settings/permissions riêng cho agent. Điều này hợp với cách dùng adapter theo từng project thay vì chỉ nhét global prompt.

Rules của Antigravity là Markdown constraint, workspace rules nằm dưới `.agents/rules`, và mỗi rule có thể bật theo Manual, Always On, Model Decision hoặc Glob. Antigravity cũng nói `.agents/rules` là mặc định mới, vẫn backward-compatible với `.agent/rules`.

Workflows là Markdown steps, gọi được bằng slash command như `/workflow-name`, phù hợp để map các case kiểu `/5fedu-project`, `/codex-research`, `/runtime-sync-audit`.

Hooks chạy quanh execution loop, cấu hình bằng `hooks.json`, có `PreInvocation`, `PreToolUse`, `PostToolUse`, `PostInvocation`, `Stop`. Vì hook có thể can thiệp mạnh, adapter chỉ để template disabled mặc định.

Permissions của Antigravity có `Deny > Ask > Allow`, và trên Windows path được normalize trước khi evaluate. Vì vậy docs/rule nên ghi path Windows rõ ràng nhưng permission setup cần kiểm tra trong UI Antigravity.

Nguồn:

- https://www.antigravity.google/docs/projects
- https://antigravity.google/docs/rules-workflows
- https://www.antigravity.google/docs/hooks
- https://antigravity.google/docs/permissions

## Cách giải quyết vấn đề "agent không sát ý đồ"

| Vấn đề | Cách xử lý |
|---|---|
| Rule quá dài làm agent chậm hoặc bỏ sót | Chỉ để rule nền ngắn trong `.agents/rules` |
| Case chuyên biệt như 5fedu bị hiểu sai | Tạo workflow slash command riêng và bắt đọc đúng skill gốc |
| Antigravity khác Codex harness | Dịch phase/skill/risk thành workflow thay vì ép dùng nguyên cấu trúc `.codex` |
| Profile/model config gây nhiễu | Không port `codex/agents/*.toml`; để Antigravity tự quản model/effort |
| Multi-repo/context thiếu | Dùng Antigravity Project với đủ folder liên quan |
| Hook quá mạnh dễ gây side effect | Hook template disabled, chỉ bật khi đã kiểm tra |
| Runtime và backup lệch | Dùng `/runtime-sync-audit`; không tự sync `config.toml` |

## Quy trình đề xuất

1. Cài adapter vào project:

```powershell
& "P:\agent-rules\codex\scripts\install-antigravity-adapter.ps1" -ProjectRoot "P:\repo"
```

*Lưu ý:* Hệ thống hiện tại thống nhất sử dụng duy nhất thư mục `.agents`. Mọi cấu hình cũ dạng `.agent` sẽ tự động bị xóa bởi preflight script để tránh trùng lặp tài nguyên.

2. Giao thức Đọc Đầu tiên (First-Read Entry Point):
Khi tiếp nhận task, Agent tuân thủ thứ tự ưu tiên đọc tài liệu:
* **Bước 1**: Đọc KI Summary.
* **Bước 2**: Đọc tệp `.agents/rules/10-fast-context.md` cục bộ của dự án.
* **Bước 3**: Đọc các tệp quy tắc đặc thù dự án (nếu có, e.g. `devconnect-xml-drawing.md`).
* **Bước 4**: Chỉ tải (lazy-load) tệp `SKILL.md` chi tiết của Skill cần thiết khi bắt tay vào triển khai.

3. Trong Antigravity, dùng slash command:

- `/5fedu-project`
- `/codex-research`
- `/runtime-sync-audit`

4. Chỉ bật hook khi cần preflight tự động:

```powershell
& "P:\agent-rules\codex\scripts\install-antigravity-adapter.ps1" -ProjectRoot "P:\repo" -IncludeDisabledHook
```

Sau đó vào `.agents/hooks.json`, đổi `"enabled": false` thành `true` nếu muốn.

## Quy tắc bảo trì

- Khi thêm skill Codex có ý đồ riêng, thêm workflow Antigravity tương ứng.
- Khi rule chỉ là hành vi nền, thêm vào `.agents/rules` nhưng giữ dưới 12,000 ký tự mỗi file.
- **Tách biệt tuyệt đối rules**: Cấm chèn quy tắc đặc thù của riêng dự án vào các file rules dùng chung (như `00-antigravity-runtime-intent.md` hay `core.md`). Quy tắc của dự án nào phải viết thành file riêng trong `.agents/rules/` của dự án đó.
- Không thêm profile/model config vào adapter Antigravity trừ khi Antigravity có cơ chế chính thức cần dùng.
- Khi workflow có thể phá dữ liệu, không dùng turbo/auto-run.
- Khi source runtime thay đổi, cập nhật README và doc này cùng lúc.

