# Platform Boundary: Codex vs Antigravity

## Tại sao file này tồn tại

Repo `P:\agent-rules` phục vụ **2 platform agent khác nhau**:

- **Codex CLI** — bạn, đang đọc file này
- **Antigravity IDE** — một agent khác, của Google, chạy trong VS Code

Hai platform này dùng **cùng nội dung rule** nhưng **cơ chế nạp rule hoàn toàn khác nhau**. File này giúp bạn hiểu ranh giới để không vô tình phá kiến trúc của bên kia.

## Cách mỗi platform nạp rules

### Codex (bạn)

```text
AGENTS.md
  @rules/core.md          ← bạn đọc file qua import chain
  @rules/quality-gates.md
  @rules/clean-code.md
  ...
```

- Bạn đọc `AGENTS.md`, lần theo từng dòng `@path`, nạp nội dung.
- Không cần YAML frontmatter. Chỉ cần path import đúng.
- Config/profile nằm trong `agents/*.toml`, `config.toml`.
- Skills nằm trong `~/.codex/skills/`.
- Hooks chạy qua `hooks.json` → `PreInvocation` scripts.

### Antigravity (agent kia)

```text
~/.gemini/GEMINI.md                      ← global, inject mọi conversation
.agents/rules/quality-gates.md           ← scan folder, đọc YAML frontmatter
  ---
  description: "Quality gates..."
  alwaysApply: true                      ← tag này quyết định Antigravity có đọc không
  ---
```

- Antigravity **không đọc** `AGENTS.md` import chain.
- Antigravity **tự scan** thư mục `.agents/rules/` và đọc YAML frontmatter mỗi file.
- `alwaysApply: true` → luôn inject. `false` → agent tự quyết dựa vào `description`.
- **Không có frontmatter = Antigravity bỏ qua file đó**.
- Antigravity không đọc `.codex/`, `agents/*.toml`, `config.toml`.
- Antigravity không chạy `hooks.json`.

## Cấu trúc thư mục và ai sở hữu gì

```text
P:\agent-rules\
│
├── codex\                          ← CHỈ CODEX. Antigravity không đụng.
│   ├── AGENTS.md                   │  Import chain cho Codex
│   ├── rules\                      │  Nội dung rule (không frontmatter)
│   ├── agents\                     │  TOML profiles (planner, implementer...)
│   ├── scripts\                    │  Scripts vận hành Codex
│   ├── templates\                  │  Templates cho plan, report...
│   └── ...                         │
│
├── antigravity\                    ← CHỈ ANTIGRAVITY. Codex không đụng.
│   ├── .agents\
│   │   ├── rules\                  │  Nội dung rule + YAML frontmatter
│   │   ├── skills\                 │  Skills cho Antigravity
│   │   └── workflows\              │  Workflows cho Antigravity
│   ├── scripts\
│   │   ├── add-rules-frontmatter.ps1    │  Script thêm frontmatter
│   │   └── verify-antigravity-activation.ps1
│   └── README.md                   │  Docs kiến trúc Antigravity
│
├── .agents\                        ← Workspace rules (Antigravity đọc khi mở repo này)
│   ├── rules\                      │  Bản copy có frontmatter
│   ├── skills\
│   └── workflows\
│
└── docs\
    └── 05-antigravity-activation-architecture.md
```

## Quy tắc ranh giới

### Codex KHÔNG ĐƯỢC làm

1. **Không xóa, sửa, hoặc cleanup** bất kỳ file nào trong `antigravity/`.
2. **Không xóa YAML frontmatter** trong `.agents/rules/*.md`. Frontmatter đó là cơ chế kích hoạt của Antigravity. Xóa frontmatter = Antigravity mất rule.
3. **Không xóa hoặc sửa** `~/.gemini/GEMINI.md`. Đó là global rules của Antigravity.
4. **Không port** `codex/agents/*.toml` hoặc `codex/config.toml` sang Antigravity. Antigravity không đọc TOML.
5. **Không coi** `.agents/hooks.json` là file của Codex. Hooks đó dùng format Codex nhưng đặt ở `.agents/` cho Antigravity context. Codex hooks nằm ở `.codex/hooks.json` hoặc repo root.

### Codex ĐƯỢC làm

1. **Sửa nội dung** rule trong `codex/rules/*.md` — đây là bản của Codex.
2. **Đề xuất đồng bộ** nếu phát hiện rule trong `codex/rules/` khác nội dung trong `antigravity/.agents/rules/` — nhưng không tự sửa bên Antigravity.
3. **Thêm rule mới** vào `codex/rules/` và import trong `codex/AGENTS.md`.
4. **Đọc** `docs/05-antigravity-activation-architecture.md` nếu cần hiểu kiến trúc Antigravity.

### Khi nào cần đồng bộ 2 bên

Nếu nội dung rule thay đổi (ví dụ: thêm quy tắc mới về database), cần cập nhật cả 2:

| Bên | Cách cập nhật |
|---|---|
| Codex | Sửa `codex/rules/<file>.md`, import trong `codex/AGENTS.md` |
| Antigravity | Sửa `antigravity/.agents/rules/<file>.md`, chạy `add-rules-frontmatter.ps1` nếu file mới |

**Không tự đồng bộ**. Báo cho user biết cần sync bên kia. User sẽ quyết định sync khi nào và bằng script nào.

## Tóm tắt 1 dòng

Codex đọc rules qua **import chain trong AGENTS.md**. Antigravity đọc rules qua **YAML frontmatter trong .agents/rules/**. Hai cơ chế không liên quan nhau. Không đụng vào kiến trúc của bên kia.
