# Agent Rules repository

Canonical architecture:

- `guides/`: docs dẫn đường cho maintainer và người mới.
- `rules/`: global context luôn nạp.
- `skills/`: kỹ năng lazy-load theo trigger.
- `integrations/`: integrations và policy cài sẵn.
- `projects/`: context cấp dự án và template 5fedu.
- `platforms/`: delta riêng cho Codex, Grok, Antigravity, Cursor.
- `automation/`: build, cài, kiểm tra, sync guard.
- `05-generated/`: generated output, không sửa tay.

Đọc `rules/manifest.yaml` và `guides/00-system-map.md` trước khi sửa harness. Không sửa tay `05-generated/` hoặc global runtime mirrors như canonical source. Không commit, push hoặc deploy nếu chưa được yêu cầu rõ.

