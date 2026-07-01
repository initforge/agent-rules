# Bản Đồ Hệ Thống

Repo này được tổ chức để người mới nhìn cây thư mục là biết ngay vai trò của từng lớp:

- `01-global/rules/`: global context luôn nạp cho mọi task.
- `01-global/skills/`: các `SKILL.md` được nạp lười theo trigger.
- `01-global/integrations/`: tool/integration cài sẵn hoặc khuyến nghị.
- `02-projects/`: context dự án, nhất là gói `5fedu`.
- `03-platforms/`: chỉ chứa delta riêng cho từng runtime.
- `04-automation/`: scripts build, cài, kiểm tra, sync guard.
- `05-generated/`: build preview/generated mirrors, không sửa tay.
- `06-plans/`: plan và research cũ, không phải source vận hành.

## Global đang chạy như thế nào

1. `01-global/rules/` là nguồn chuẩn của global context.
2. `01-global/skills/` là nguồn chuẩn của skills.
3. `04-automation/01-build-runtime.ps1` build hai lớp này sang `05-generated/runtime-build/`.
4. `04-automation/02-install-runtime.ps1` copy build output vào runtime home của Codex, Grok, Antigravity.
5. `01-global/integrations/` cài thêm integrations theo policy:
   - `required`: phải có và verify pass
   - `recommended`: auto-check, thiếu thì auto-install
   - `optional`: không cài mặc định

## Người mới nên đọc theo thứ tự nào

1. File này.
2. `README-vi.md`.
3. `01-global/integrations/README.md`.
4. Nếu làm việc với 5fedu: `02-projects/5fedu/AGENTS.md`.

## Quy tắc đồng bộ

- Mặc định chỉ có một chiều: canonical -> build -> runtime/project.
- Reverse sync chỉ được phép qua `04-automation/07-import-reviewed-changes.ps1`.
- Không kéo generated mirrors, legacy hoặc evidence ngược về rule sống/global.


