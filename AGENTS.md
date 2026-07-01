# Agent Rules repository

Canonical architecture:

- `00-huong-dan/`: docs dẫn đường cho maintainer và người mới.
- `01-global/loi/`: global context luôn nạp.
- `01-global/ky-nang/`: kỹ năng lazy-load theo trigger.
- `01-global/tich-hop/`: integrations và policy cài sẵn.
- `02-du-an/`: context cấp dự án và template 5fedu.
- `03-nen-tang/`: delta riêng cho Codex, Grok, Antigravity.
- `04-tu-dong-hoa/`: build, cài, kiểm tra, sync guard.
- `05-ban-dung/`: generated output, không sửa tay.
- `06-ke-hoach/`: plan và research archive.

Đọc `01-global/loi/manifest.yaml` và `00-huong-dan/00-ban-do-he-thong.md` trước khi sửa harness. Không sửa tay `05-ban-dung/` hoặc global runtime mirrors như canonical source. Không commit, push hoặc deploy nếu chưa được yêu cầu rõ.
