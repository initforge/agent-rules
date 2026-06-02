# Antigravity Adapter

Adapter này dịch runtime Codex trong `P:\agent-rules\codex` sang cấu trúc mà Google Antigravity đọc nhanh hơn: rules ngắn, workflows gọi được bằng slash command, hook/preflight tùy chọn, và README giải thích ý đồ.

## Ý đồ

Codex runtime là nguồn chuẩn. Antigravity không nên nhận một prompt khổng lồ hoặc bản copy thô của toàn bộ `.codex`, vì như vậy dễ chậm, lệch ngữ cảnh và khó biết khi nào phải dùng skill/workflow nào.

Adapter này chia ý đồ thành ba lớp:

| Lớp | File | Vai trò |
|---|---|---|
| Luật nền | `.agents/rules/*.md` | Luôn nhắc agent cách đọc repo, quản lý rủi ro, verify và không sửa lan |
| Hợp đồng ý đồ | `.agents/rules/01-intent-contract.md` | Chốt cách Antigravity hiểu request và chọn workflow |
| Quy trình gọi được | `.agents/workflows/*.md` | Tương đương slash command cho các case lặp lại như `/5fedu-project` |
| Preflight | `scripts/antigravity-preflight.ps1` | Kiểm tra file bắt buộc trước khi bắt đầu task |

Adapter này cố ý không cài profile/model config cho Antigravity. Model, effort và auto mode thuộc UI/runtime của Antigravity; nếu đang dùng Gemini 3.5 Flash medium thì để Antigravity tự quản. `codex/agents/*.toml` chỉ dành cho Codex CLI orchestration.

## Cài vào một project Antigravity

```powershell
& "P:\agent-rules\codex\scripts\install-antigravity-adapter.ps1" `
  -ProjectRoot "P:\du-an-cua-ban"
```

*Lưu ý:* Hệ thống hiện tại thống nhất sử dụng duy nhất thư mục `.agents` làm chuẩn chung để tránh trùng lặp tài nguyên. Mọi thư mục `.agent` (số ít) cũ sẽ được kịch bản preflight tự động dọn dẹp để đảm bảo tính tinh gọn.

## Quy trình Đọc đầu tiên (First-Read Entry Point)

Khi bắt đầu một phiên làm việc, Agent không tự ý đọc toàn bộ các tệp cấu hình mà đi qua các cổng ưu tiên sau để tránh loãng ngữ cảnh:
1. **KI Summary**: Nắm tổng quan các kịch bản/skills có sẵn.
2. **`10-fast-context.md`**: Đọc nhanh cấu trúc nghiệp vụ của dự án cục bộ hiện tại.
3. **Quy tắc đặc thù dự án**: Đọc riêng các file rules đặc thù (nếu có, ví dụ: `devconnect-xml-drawing.md` hoặc `.agents/5fedu/AGENTS.md`).
4. **Lazy-load Skills**: Chỉ nạp chi tiết các skill tương ứng qua `view_file` khi thực sự cần chạy test hoặc cấu hình đặc biệt.

## Nguồn nghiên cứu

- Antigravity Projects: https://www.antigravity.google/docs/projects
- Antigravity Rules and Workflows: https://antigravity.google/docs/rules-workflows
- Antigravity Hooks: https://www.antigravity.google/docs/hooks
- Antigravity Permissions: https://antigravity.google/docs/permissions

## Ghi chú vận hành

- **Không đưa secret** vào rule, workflow hoặc inventory.
- **Không gitignore `.agents/`** để đảm bảo Antigravity đọc rules ổn định.
- **Tách biệt tuyệt đối rules**: Mọi quy tắc đặc thù của dự án phải được viết thành file riêng (như `local-rules.md`), cấm chèn trực tiếp vào các file rules toàn cầu để tránh bị preflight đè dữ liệu.
- **Không port `codex/agents/*.toml`** sang Antigravity.
- **Rule phải ngắn**. Workflow mới là nơi chứa quy trình nhiều bước.
- **Project nhiều repo** nên cấu hình Antigravity Project với đủ folder liên quan thay vì bắt agent tự mò ngoài workspace.

