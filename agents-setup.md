# Hướng Dẫn Setup Agent Rules

Thư mục này là nơi lưu bản sync, backup và bootstrap dài hạn cho hệ agent.

## Mô Hình Chuẩn

### Codex CLI

Runtime hằng ngày:

```text
C:\Users\DELL\.codex
```

Bản sync và bootstrap:

```text
P:\agent-rules
```

Loader tương thích:

```text
P:\agent-rules\global-rules.md
P:\agent-rules\clean-code.md
P:\agent-rules\codex-overlay.md
```

Ý nghĩa:
- Codex chạy từ file local dưới `C:\Users\DELL\.codex`.
- `P:\agent-rules` là repo source/mirror để restore máy mới và backup.
- File root dưới `P:\agent-rules` chỉ là loader mỏng để project cũ vẫn import được.

### Antigravity IDE

Global rules (inject vào MỌI conversation):

```text
C:\Users\DELL\.gemini\GEMINI.md
```

Master source cho workspace rules:

```text
P:\agent-rules\platforms\antigravity\.agents\rules\
```

Workspace-local rules (mỗi project):

```text
<project-root>\.agents\rules\*.md   (phải có YAML frontmatter)
```

Ý nghĩa:
- `~/.gemini/GEMINI.md` là global rules, tự inject vào mọi conversation.
- Mỗi project có `.agents/rules/*.md` riêng, mỗi file PHẢI có YAML frontmatter (`description` + `alwaysApply`).
- Không có frontmatter = Antigravity mặc định bỏ qua.
- `hooks.json` KHÔNG hoạt động trong Antigravity IDE (chỉ cho Codex CLI).
- Chi tiết kiến trúc: [docs/05-antigravity-activation-architecture.md](docs/05-antigravity-activation-architecture.md)

### Không lưu secret

Không lưu secret thật trong rule, docs, skill, template hoặc inventory.

## Cấu Trúc Hiện Tại

```text
P:\agent-rules\
|- agents-setup.md
|- clean-code.md
|- codex-overlay.md
|- global-rules.md
|- .agents\               ← Workspace rules cho Antigravity (có frontmatter)
|  |- AGENTS.md
|  |- INTENT.md
|  |- hooks.json
|  |- rules\              ← Rules với YAML frontmatter
|  |- skills\
|  `- workflows\
|- platforms\
|  |- antigravity\         ← Master source cho Antigravity adapter
|  |- .agents\
|  |  |- rules\           ← Master rules (frontmatter source of truth)
|  |  |- skills\
|  |  `- workflows\
|  |- scripts\
|  |  `- add-rules-frontmatter.ps1
|  `- README.md
|  |- codex\               ← Codex CLI platform adapter
|  |- AGENTS.md
|  |- RTK.md
|  |- config.toml
|  |- rules\
|  |- templates\
|  |- prompts\
|  |- scripts\
|  |- agents\
|  |- skills\
|  |- docs\
|  `- inventory\
`- docs\
   |- 01-technical-specification.md
   |- 02-operations-and-sync.md
   |- 03-maintenance-and-risks.md
   |- 04-antigravity-adapter.md
   `- 05-antigravity-activation-architecture.md
```

## Restore Trên Máy Mới

### Codex CLI

1. Đảm bảo `P:\agent-rules` tồn tại.
2. Copy vào `C:\Users\DELL\.codex`
3. Chạy:

```powershell
& "$env:USERPROFILE\.codex\scripts\verify-codex-rules.ps1"
& "$env:USERPROFILE\.codex\scripts\verify-toolchain.ps1"
& "$env:USERPROFILE\.codex\scripts\inventory-current-machine.ps1"
```

4. Đọc và bổ sung phần còn thiếu từ:
- `C:\Users\DELL\.codex\docs\bootstrap-new-machine.md`
- `C:\Users\DELL\.codex\docs\tool-registry.md`
- `C:\Users\DELL\.codex\docs\mcp-registry.md`
- `C:\Users\DELL\.codex\docs\skills-registry.md`
- `C:\Users\DELL\.codex\docs\profile-matrix.md`

### Antigravity IDE

1. Đảm bảo `C:\Users\DELL\.gemini\GEMINI.md` tồn tại và chứa global rules ngắn cho mọi conversation.
2. Copy/cài workspace rules từ `P:\agent-rules\platforms\antigravity\.agents\` vào `<project-root>\.agents\`.
3. Chạy frontmatter script trên mỗi project:

```powershell
& "P:\agent-rules\platforms\antigravity\scripts\add-rules-frontmatter.ps1" `
    -RulesDir "P:\du-an-cua-ban\.agents\rules"
```

4. Mở Antigravity IDE → dropdown "..." → Rules → verify "Always On" hiển thị đúng.

## Bảo Trì Hằng Ngày

Khi setup Codex local thay đổi:

```powershell
& "$env:USERPROFILE\.codex\scripts\sync-codex-to-p.ps1"
```

Khi restore từ bản sync:

```powershell
& "$env:USERPROFILE\.codex\scripts\sync-p-to-codex.ps1"
```

Sync harness đồng bộ (repo root master → Antigravity + `.agents` + `.grok` mirror):

```powershell
& "P:\agent-rules\scripts\sync-platform-skills.ps1"
# hoặc: bash P:/agent-rules/scripts/sync-all-harness.sh
```

Grok CLI global (mirror codex, không master `grok/`):

```powershell
& "P:\agent-rules\scripts\install-grok-global.ps1"
```

Khi Antigravity rules thay đổi:

```powershell
# Thêm/update frontmatter trên tất cả locations
& "P:\agent-rules\platforms\antigravity\scripts\add-rules-frontmatter.ps1" -RulesDir "P:\agent-rules\platforms\antigravity\.agents\rules"
& "P:\agent-rules\platforms\antigravity\scripts\add-rules-frontmatter.ps1" -RulesDir "P:\agent-rules\.agents\rules"
& "P:\agent-rules\platforms\antigravity\scripts\add-rules-frontmatter.ps1" -RulesDir "P:\tahdieuphoi\.agents\rules"
& "P:\agent-rules\platforms\antigravity\scripts\add-rules-frontmatter.ps1" -RulesDir "P:\FaBsolution\.agents\rules"
```

## Quy Tắc Vận Hành

- Runtime logic Codex nằm trong `%USERPROFILE%\.codex` (hoặc `C:\Users\<username>\.codex`).
- Bản mirror/bootstrap nằm trong `P:\agent-rules`.
- Global Antigravity rules nằm trong `%USERPROFILE%\.gemini\GEMINI.md`.
- Master Antigravity rules nằm trong `P:\agent-rules\platforms\antigravity\.agents\rules\`.
- File root `P:\agent-rules\*.md` chỉ là loader tương thích.
- **Phạm vi áp dụng `.agents` (Workspace rules)**: Chỉ cài đặt thư mục `.agents` cho một số trường hợp đặc thù (như dự án phát triển quy tắc `agent-rules` hoặc các dự án có quy định nghiệp vụ/kỹ thuật khắt khe như **5fedu**). Đối với các dự án thông thường, không duy trì thư mục `.agents` nhằm tránh nhiễu quy tắc cũ và tiết kiệm token ngữ cảnh; AI sẽ sử dụng bộ Global Rules chung là đủ.
- Nội dung hướng tới người dùng phải dùng tiếng Việt có dấu đầy đủ.
- Dùng skill `researcher` làm lớp nghiên cứu chính (Codex + Grok).
- Dùng `workflow-router` và metadata trong plan để route phase/profile.
- Dùng clean-code thực dụng: cleanup phải giảm rủi ro, nếu không thì để sau.
- Dùng GitNexus trước khi xóa, đổi tên, di chuyển hoặc refactor code dùng chung khi repo đã index.
