# Grok CLI Harness — Intent Manifest

Lớp `cursor/` + `.grok/` tồn tại để Grok CLI (Composer 2.5) có **đủ 3 tầng**, không chỉ rules rỗng:

```text
.grok/rules/     ← hành vi (gates, intent, verify)
.grok/skills/    ← quy trình (5fedu, research, playwright, ...)
<project>/.grok/5fedu/  ← context nghiệp vụ (chỉ trong dự án 5fedu, do skill cài)
```

## Vì sao rules alone không đủ

Rules nói "dùng skill `5fedu-project`" nhưng **không có skill trong `.grok/skills/`** → Grok không kích hoạt được → bệnh "rule văn hay, runtime trống".

## Ba tầng và ai sở hữu gì

| Tầng | Master | Live Grok | Nội dung |
|---|---|---|---|
| Rules | `cursor/rules/` | `.grok/rules/` | Opus-emulation gates (MEDIUM default) |
| Skills | `cursor/skills/` | `.grok/skills/` | Copy từ `codex/skills/` (canonical) |
| 5fedu context | skill assets | `<repo>/.grok/5fedu/` | Cài bởi `5fedu-project` vào **dự án khách** |

## Compat tự động (Grok CLI)

Grok **cũng scan** (không cần duplicate nếu đã có):

- `.agents/skills/` — bản Antigravity đầy đủ hơn (UI skills cũ)
- `~/.grok/skills/` — bundled Grok (implement, review, docx, ...)

Ưu tiên: `.grok/skills/` > `.agents/skills/` > `~/.grok/skills/`.

## Sync

```bash
./cursor/scripts/sync-harness.sh
grok inspect   # phải thấy rules + skills
```

## Chống tự tiến hóa harness

Agent **mặc định không được** sửa harness khi làm task thường. Chi tiết: `.grok/rules/05-harness-mutation-gate.md`.

Learning → L1 project trước; L2/L3 chỉ khi user nói rõ "sửa harness/rule/skill".

## Protected

Không cleanup/xóa: `.grok/rules/`, `.grok/skills/`, `cursor/`, skill `5fedu-project`.