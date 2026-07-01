# Bản Đồ Hệ Thống

Repo này được tổ chức để người mới nhìn cây thư mục là biết ngay vai trò của từng lớp:

- `rules/`: global context luôn nạp cho mọi task.
- `skills/`: các `SKILL.md` được nạp lười theo trigger.
- `integrations/`: tool/integration cài sẵn hoặc khuyến nghị.
- `projects/`: context dự án, nhất là gói `5fedu`.
- `platforms/`: chỉ chứa delta riêng cho từng runtime.
- `automation/`: scripts build, cài, kiểm tra, sync guard.
- `05-generated/`: build preview/generated mirrors, không sửa tay.
- `plans/`: plan và research cũ, không phải source vận hành.

## Global đang chạy như thế nào

1. `rules/` là nguồn chuẩn của global context.
2. `skills/` là nguồn chuẩn của skills.
3. `automation/01-build-runtime.ps1` build hai lớp này sang `05-generated/runtime-build/`.
4. `automation/02-install-runtime.ps1` copy build output vào runtime home của Codex, Grok, Antigravity và **Cursor** (`~/.cursor`).
5. `integrations/` cài thêm integrations theo policy:
   - `required`: phải có và verify pass
   - `recommended`: auto-check, thiếu thì auto-install
   - `optional`: không cài mặc định

## Người mới nên đọc theo thứ tự nào

1. File này.
2. `README-vi.md`.
3. `integrations/README.md`.
4. Nếu làm việc với 5fedu: `projects/5fedu/AGENTS.md`.

## Quy tắc đồng bộ

- Mặc định chỉ có một chiều: canonical -> build -> runtime/project.
- Reverse sync chỉ được phép qua `automation/07-import-reviewed-changes.ps1` (có tombstone cho skill đã xóa).
- Sau install chạy `automation/09-doctor.ps1` để kiểm tra manifest parity và integration live.


