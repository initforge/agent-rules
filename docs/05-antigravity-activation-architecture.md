# Kiến Trúc Kích Hoạt Antigravity Rules

Tài liệu này giải thích **tại sao** và **bằng cách nào** agent-rules được kích hoạt trong Antigravity IDE. Đây là tài liệu tham chiếu cho cả người dùng và Codex khi cần hiểu hoặc bảo trì hệ thống rules.

## Tại Sao Cần Tài Liệu Này?

Codex CLI và Antigravity IDE có **cơ chế kích hoạt rules hoàn toàn khác nhau**. Nếu không hiểu sự khác biệt, rules sẽ tồn tại trên đĩa nhưng không bao giờ được đọc.

| Aspect | Codex CLI | Antigravity IDE |
|---|---|---|
| **Entrypoint** | `.codex/AGENTS.md` import `@rules/*.md` | `~/.gemini/GEMINI.md` (global) + `.agents/rules/*.md` (workspace) |
| **Cách nạp rules** | `@` import explicit trong AGENTS.md | Tự động scan `.agents/rules/` và đọc YAML frontmatter |
| **Cần frontmatter?** | KHÔNG. Chỉ cần import path | CÓ. Bắt buộc `description` + `alwaysApply` hoặc `globs` |
| **Không có frontmatter** | Vẫn hoạt động nếu có import | **Mặc định "Model Decision" → agent thường bỏ qua** |
| **Global rules** | `~/.codex/rules/*.md` | `~/.gemini/GEMINI.md` |
| **Profile/model config** | `agents/*.toml` | Không hỗ trợ. Antigravity tự quản model |
| **Hooks** | `hooks.json` → PreInvocation scripts | **KHÔNG hỗ trợ** `hooks.json`. Hooks chỉ cho Codex CLI |

## 3 Lớp Kích Hoạt

### Lớp 1: Global Rules (`~/.gemini/GEMINI.md`)

```text
C:\Users\DELL\.gemini\GEMINI.md
```

**Ý đồ**: File này tự động inject vào MỌI conversation, MỌI workspace. Chứa quy tắc chung nhất:
- Giao tiếp tiếng Việt
- Final status PASS/PARTIAL/BLOCKED
- Evidence labels bắt buộc
- Safe override (không tự commit/push/deploy)
- Quality gate cơ bản

**Giới hạn**: 12,000 ký tự. Không đưa quy tắc đặc thù dự án vào đây.

### Lớp 2: Workspace Rules (`.agents/rules/*.md`)

```text
<project-root>/.agents/rules/     (Opus-emulation — sync từ grok/)
├── 00-runtime-and-intent.md        (alwaysApply: true)
├── 01-agent-workflow-sop.md        (alwaysApply: true)
├── 02-code-quality-and-debt.md   (alwaysApply: true)
├── 03-context-and-tools.md         (alwaysApply: true)
├── 04-skills-and-5fedu.md          (alwaysApply: true)
├── 05-harness-mutation-gate.md     (alwaysApply: true)
├── 06-opus-emulation-contract.md   (alwaysApply: true)
├── antigravity-overlay.md          (alwaysApply: true)
└── platform-boundary.md            (alwaysApply: true)
```

Master: `agent-rules/grok/` → `./grok/scripts/sync-all-harness.sh`

**Ý đồ của YAML frontmatter**:

```yaml
---
description: Mô tả ngắn để Antigravity hiểu khi nào cần đọc file này
alwaysApply: true    # true = inject mọi turn, false = agent tự quyết
---
```

Các kiểu kích hoạt:

| `alwaysApply` | Hành vi |
|---|---|
| `true` | **Always On** — inject vào mọi turn, mọi task |
| `false` hoặc không có | **Model Decision** — agent đọc `description`, tự quyết có cần không |
| (dùng `globs`) | **Glob** — tự động inject khi file đang sửa khớp glob pattern |

**Nguyên tắc chọn `alwaysApply: true`**: Chỉ dùng cho rules mà agent PHẢI tuân thủ mọi lúc bất kể task gì (final status, safe override, quality gate, code discipline, intent routing, debt control). Hiện có **9 files** `alwaysApply: true`.

**Nguyên tắc `alwaysApply: false`**: Dùng cho rules chỉ cần khi task cụ thể (planning mode, execution flow, context tools, root cause analysis, tool inventory, codex overlay). Agent sẽ đọc `description` và tự quyết.

### Lớp 3: Knowledge Items (memory phụ trợ)

```text
C:\Users\DELL\.gemini\antigravity\knowledge\agent-rules-runtime\
```

**Ý đồ**: Chỉ là memory gợi nhớ cho agent giữa các session. **KHÔNG dùng KI thay rules/hook**. KI có thể bị stale hoặc không kích hoạt đúng. Enforcement nằm ở Lớp 1 + Lớp 2.

## Cấu Trúc Master → Project

```text
Nguồn chuẩn (master source):
  P:\agent-rules\antigravity\.agents\rules\*

Workspace-local (agent-rules repo):
  P:\agent-rules\.agents\rules\*

Các dự án (installed via script):
  P:\tahdieuphoi\.agents\rules\*
  P:\FaBsolution\.agents\rules\*
```

Script cài đặt: `P:\agent-rules\codex\scripts\install-antigravity-adapter.ps1`
Script thêm frontmatter: `P:\agent-rules\antigravity\scripts\add-rules-frontmatter.ps1`

## Những Thứ KHÔNG Hoạt Động

| Thứ | Tại sao không hoạt động |
|---|---|
| `hooks.json` với `PreInvocation` | Antigravity IDE không chạy hooks. Đây là format Codex CLI |
| Rules không có frontmatter | Antigravity mặc định "Model Decision" → thường bỏ qua |
| `.codex/AGENTS.md` import `@rules/*.md` | Chỉ cho Codex CLI. Antigravity không đọc `.codex/` |
| `agents/*.toml` profile | Chỉ cho Codex CLI orchestration |
| KI thay rules | KI là memory, không phải enforcement |

## Bảo Trì

### Thêm rule mới

1. Tạo file `.md` trong `P:\agent-rules\antigravity\.agents\rules\`
2. Thêm YAML frontmatter với `description` và `alwaysApply`
3. Thêm entry vào `add-rules-frontmatter.ps1`
4. Chạy script trên tất cả projects
5. Cập nhật tài liệu này

### Đồng bộ khi rule thay đổi

```powershell
# Thêm frontmatter vào master
& "P:\agent-rules\antigravity\scripts\add-rules-frontmatter.ps1" `
    -RulesDir "P:\agent-rules\antigravity\.agents\rules"

# Copy master → workspace-local
& "P:\agent-rules\antigravity\scripts\add-rules-frontmatter.ps1" `
    -RulesDir "P:\agent-rules\.agents\rules"

# Copy master → projects
& "P:\agent-rules\antigravity\scripts\add-rules-frontmatter.ps1" `
    -RulesDir "P:\tahdieuphoi\.agents\rules"

& "P:\agent-rules\antigravity\scripts\add-rules-frontmatter.ps1" `
    -RulesDir "P:\FaBsolution\.agents\rules"
```

### Verify activation

Mở Antigravity IDE → dropdown "..." → Rules → kiểm tra:
- Rules có `alwaysApply: true` hiển thị là "Always On"
- Rules có `alwaysApply: false` hiển thị là "Model Decision"
- `~/.gemini/GEMINI.md` hiển thị dưới "Global"
