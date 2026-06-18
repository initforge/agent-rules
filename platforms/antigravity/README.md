# Antigravity Adapter

Adapter này dịch runtime Codex trong `P:\agent-rules\codex` sang cấu trúc mà Google Antigravity đọc: rules với YAML frontmatter, workflows, skills, và global rules file.

## ⚠️ QUAN TRỌNG: Codex vs Antigravity Khác Nhau Hoàn Toàn

```text
CODEX CLI:
  .codex/AGENTS.md → @import rules/*.md → Đọc nội dung
  Không cần frontmatter. Chỉ cần import path.

ANTIGRAVITY IDE:
  ~/.gemini/GEMINI.md → Tự inject vào MỌI conversation (global)
  .agents/rules/*.md  → Đọc YAML frontmatter để quyết định kích hoạt
  Không có frontmatter = agent KHÔNG ĐỌC = rules chết
```

**Tài liệu kiến trúc chi tiết**: [docs/05-antigravity-activation-architecture.md](../docs/05-antigravity-activation-architecture.md)

## 3 Lớp Kích Hoạt

| Lớp | File | Vai trò |
|---|---|---|
| Global rules | `~/.gemini/GEMINI.md` | Inject vào MỌI conversation, MỌI workspace |
| Workspace rules | `.agents/rules/*.md` với YAML frontmatter | `alwaysApply: true` = Always On, `false` = Model Decision |
| Skills/Workflows | `.agents/skills/*/SKILL.md`, `.agents/workflows/*.md` | Kích hoạt theo trigger/request |

## YAML Frontmatter Bắt Buộc

Mọi file `.agents/rules/*.md` PHẢI có frontmatter:

```yaml
---
description: Mô tả ngắn (1-3 câu) để agent hiểu khi nào cần đọc
alwaysApply: true   # hoặc false
---
```

**Không có frontmatter = Antigravity mặc định "Model Decision" = thường bỏ qua hoàn toàn.**

Script thêm frontmatter: `antigravity/scripts/add-rules-frontmatter.ps1`

## Cài Adapter Vào Project

```powershell
# Cài rules + entrypoints + frontmatter
& "P:\agent-rules\codex\scripts\install-antigravity-adapter.ps1" `
    -ProjectRoot "P:\du-an-cua-ban"

# Thêm frontmatter (nếu install script chưa thêm)
& "P:\agent-rules\antigravity\scripts\add-rules-frontmatter.ps1" `
    -RulesDir "P:\du-an-cua-ban\.agents\rules"
```

## Files KHÔNG Hoạt Động Trong Antigravity

| File | Lý do |
|---|---|
| `hooks.json` | Antigravity IDE không chạy hook scripts. Đây là format Codex CLI. Giữ cho tương lai nhưng không dựa vào |
| `agents/*.toml` | Profile/model config chỉ cho Codex CLI orchestration |
| `.codex/AGENTS.md` | Chỉ Codex CLI đọc `.codex/` |
| Rules không frontmatter | Antigravity bỏ qua |

## Quy trình Đọc đầu tiên

1. **Global**: `~/.gemini/GEMINI.md` tự inject
2. **Always On rules**: 9 files có `alwaysApply: true` tự inject
3. **Model Decision rules**: 6 files có description, agent tự quyết
4. **Skills**: `SKILL.md` đọc khi agent thấy relevant
5. **5fedu context**: `.agents/5fedu/00-index.md` đọc khi task liên quan 5fedu

## Ghi chú vận hành

- **Không đưa secret** vào rule, workflow hoặc inventory.
- **Không gitignore `.agents/`** để đảm bảo Antigravity đọc rules ổn định.
- **Rule phải ngắn** (< 12,000 ký tự/file). Workflow mới là nơi chứa quy trình nhiều bước.
- **Không port `codex/agents/*.toml`** sang Antigravity.
- **Project nhiều repo** nên cấu hình Antigravity Project với đủ folder liên quan.
- Nội dung hướng tới người dùng phải dùng tiếng Việt có dấu đầy đủ.

## Nguồn tham khảo

- [Kiến trúc kích hoạt chi tiết](../docs/05-antigravity-activation-architecture.md)
- [Đặc tả kỹ thuật](../docs/01-technical-specification.md)
- [Vận hành và đồng bộ](../docs/02-operations-and-sync.md)
