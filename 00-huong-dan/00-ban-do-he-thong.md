# Bản Đồ Hệ Thống

Repo này được tổ chức để người mới nhìn cây thư mục là biết ngay vai trò của từng lớp:

- `01-global/loi/`: global context luôn nạp cho mọi task.
- `01-global/ky-nang/`: các `SKILL.md` được nạp lười theo trigger.
- `01-global/tich-hop/`: tool/integration cài sẵn hoặc khuyến nghị.
- `02-du-an/`: context dự án, nhất là gói `5fedu`.
- `03-nen-tang/`: chỉ chứa delta riêng cho từng runtime.
- `04-tu-dong-hoa/`: scripts build, cài, kiểm tra, sync guard.
- `05-ban-dung/`: build preview/generated mirrors, không sửa tay.
- `06-ke-hoach/`: plan và research cũ, không phải source vận hành.

## Global đang chạy như thế nào

1. `01-global/loi/` là nguồn chuẩn của global context.
2. `01-global/ky-nang/` là nguồn chuẩn của skills.
3. `04-tu-dong-hoa/01-build-runtime.ps1` build hai lớp này sang `05-ban-dung/runtime-build/`.
4. `04-tu-dong-hoa/02-cai-runtime.ps1` copy build output vào runtime home của Codex, Grok, Antigravity.
5. `01-global/tich-hop/` cài thêm integrations theo policy:
   - `bat-buoc`: phải có và verify pass
   - `khuyen-nghi`: auto-check, thiếu thì auto-install
   - `tuy-chon`: không cài mặc định

## Người mới nên đọc theo thứ tự nào

1. File này.
2. `README-vi.md`.
3. `01-global/tich-hop/README.md`.
4. Nếu làm việc với 5fedu: `02-du-an/5fedu/AGENTS.md`.

## Quy tắc đồng bộ

- Mặc định chỉ có một chiều: canonical -> build -> runtime/project.
- Reverse sync chỉ được phép qua `04-tu-dong-hoa/07-import-reviewed-changes.ps1`.
- Không kéo generated mirrors, legacy hoặc evidence ngược về rule sống/global.
