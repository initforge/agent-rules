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

Nếu Antigravity trên máy đang dùng layout cũ `.agent`, mirror thêm:

```powershell
& "P:\agent-rules\codex\scripts\install-antigravity-adapter.ps1" `
  -ProjectRoot "P:\du-an-cua-ban" `
  -LegacyAgentSingular
```

## Cách dùng trong Antigravity

- Dùng `/5fedu-project` khi muốn scaffold hoặc cập nhật context 5fedu cho repo.
- Dùng `/codex-research` khi cần nghiên cứu có bằng chứng trước khi code.
- Dùng `/runtime-sync-audit` khi cần kiểm tra `C:\Users\DELL\.codex` và `P:\agent-rules\codex` có lệch không.

## Nguồn nghiên cứu

- Antigravity Projects: https://www.antigravity.google/docs/projects
- Antigravity Rules and Workflows: https://antigravity.google/docs/rules-workflows
- Antigravity Hooks: https://www.antigravity.google/docs/hooks
- Antigravity Permissions: https://antigravity.google/docs/permissions

## Ghi chú vận hành

- Không đưa secret vào rule, workflow hoặc inventory.
- Không gitignore `.agents/` nếu muốn Antigravity đọc workspace rules/workflows ổn định.
- Không port `codex/agents/*.toml` sang Antigravity.
- Rule phải ngắn. Workflow mới là nơi chứa quy trình nhiều bước.
- Project nhiều repo nên cấu hình Antigravity Project với đủ folder liên quan thay vì bắt agent tự mò ngoài workspace.
