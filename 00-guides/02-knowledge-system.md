# Hệ Thống Tri Thức

Context được nạp tiến dần theo thứ tự:

1. `01-global/rules`
2. file gần task nhất trong repo
3. một skill phù hợp trong `01-global/skills`
4. references/scripts của skill khi thật sự cần
5. context dự án trong `02-projects`
6. nguồn ngoài khi task cần facts mới hoặc docs upstream

Quyền sở hữu trigger nằm trong từng `SKILL.md`. Repo không duy trì thêm một bảng trigger viết tay khác.

Budget hiện hành:

- bootstrap: 300 token
- global core: 4,000 token
- overlay mỗi platform: 600 token
- skill body: 3,500 token
- project index: 1,800 token
- lazy project pack: 8,000 token

Raw evidence, legacy files và generated output không được coi là default context.


