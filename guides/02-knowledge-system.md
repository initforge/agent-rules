# Hệ thống tri thức

**Vai trò:** Giải thích thứ tự nạp context progressive disclosure.  
**Ý đồ:** Agent không preload cả repo; budget nằm ở một nguồn duy nhất.

## Thứ tự nạp

1. `rules/` (theo `rules/manifest.yaml` load_order)
2. File gần task nhất trong repo đang làm
3. Một skill khớp trigger trong `skills/<slug>/SKILL.md`
4. References/scripts của skill khi procedure yêu cầu
5. Context dự án: `projects/5fedu/` hoặc `context/5fedu/` sau cài
6. Nguồn ngoài khi cần facts mới hoặc docs upstream

Trigger source of truth: `description` frontmatter mỗi skill — không duy trì bảng trigger viết tay song song.

## Token budget

**Single source:** [`rules/manifest.yaml`](../rules/manifest.yaml) — không nhân bản số ở đây.

## Không auto-load

Evidence, legacy, `archive/`, `05-generated/`, runtime mirrors.
