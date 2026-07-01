# Agent Rules repository

Canonical architecture:

- `00-guides/`: docs dẫn đường cho maintainer và người mới.
- `01-global/rules/`: global context luôn nạp.
- `01-global/skills/`: kỹ năng lazy-load theo trigger.
- `01-global/integrations/`: integrations và policy cài sẵn.
- `02-projects/`: context cấp dự án và template 5fedu.
- `03-platforms/`: delta riêng cho Codex, Grok, Antigravity.
- `04-automation/`: build, cài, kiểm tra, sync guard.
- `05-generated/`: generated output, không sửa tay.
- `06-plans/`: plan và research archive.

�?c `01-global/rules/manifest.yaml` v� `00-guides/00-system-map.md` tru?c khi s?a harness. Kh�ng s?a tay `05-generated/` ho?c global runtime mirrors nhu canonical source. Kh�ng commit, push ho?c deploy n?u chua du?c y�u c?u r�.


