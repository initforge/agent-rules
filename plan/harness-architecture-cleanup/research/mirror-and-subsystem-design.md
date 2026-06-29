# Thiết kế phân hệ và mirror

## Summary

Repo cần tách ba khái niệm đang bị trộn:

1. **Canonical knowledge**: nội dung con người sửa.
2. **Platform adapter**: delta cấu hình riêng từng runtime.
3. **Installed mirror**: output được sinh/cài, không sửa tay và không dùng làm source.

“Mirror lẫn nhau” không có nghĩa là mọi thư mục copy toàn bộ mọi thứ. Ba runtime phải nhận cùng checksum của core/capability canonical; mỗi runtime chỉ cộng overlay/config riêng.

## Target subsystem tree

```text
agent-rules/
├── knowledge/
│   ├── core/                         # always-loaded, platform-neutral
│   │   ├── manifest.yaml
│   │   ├── 00-bootstrap.md
│   │   ├── 10-execution.md
│   │   ├── 20-quality-and-safety.md
│   │   ├── 30-context-routing.md
│   │   └── 40-harness-governance.md
│   ├── capabilities/                 # lazy-loaded skills, grouped by subsystem
│   │   ├── delivery/
│   │   │   ├── finish-to-completion/
│   │   │   └── best-of-n/
│   │   ├── engineering/
│   │   │   ├── check-work/
│   │   │   └── code-review/
│   │   ├── frontend/
│   │   │   ├── frontend-architect/
│   │   │   └── master-image-generation/
│   │   ├── knowledge-management/
│   │   │   ├── context-evolution-protocol/
│   │   │   └── docs-style/
│   │   ├── research/
│   │   │   └── researcher/
│   │   ├── orchestration/
│   │   │   └── workflow-router/
│   │   └── domains/
│   │       └── 5fedu-project/
│   └── project-context/
│       ├── schema.yaml               # contract chung cho context repo
│       └── templates/
│           └── 5fedu/
├── integrations/
│   ├── code-intelligence/
│   │   └── codebase-memory-mcp/
│   │       ├── manifest.json
│   │       ├── install.ps1
│   │       ├── uninstall.ps1
│   │       ├── verify.ps1
│   │       └── adapters/
│   │           ├── codex.toml
│   │           ├── grok.json
│   │           └── antigravity.json
│   └── token-compression/
│       └── caveman/
├── platforms/
│   ├── codex/
│   │   ├── codex-overlay.md
│   │   ├── runtime.yaml
│   │   └── profiles/
│   ├── grok/
│   │   ├── grok-overlay.md
│   │   └── runtime.yaml
│   └── antigravity/
│       ├── antigravity-overlay.md
│       └── runtime.yaml
├── automation/
│   ├── build-runtime.ps1
│   ├── install-runtime.ps1
│   ├── verify-mirrors.ps1
│   └── validate-context.ps1
├── build/                            # generated preview, gitignored
│   ├── codex/
│   ├── grok/
│   └── antigravity/
├── docs/
└── plan/
```

## Mirror contract

```text
knowledge/core ──────────────┬─> build/codex/core ───────> ~/.codex/rules
                             ├─> build/grok/core ────────> ~/.grok/rules
                             └─> build/antigravity/core ─> ~/.gemini/config/rules

knowledge/capabilities ──────┬─> build/codex/skills ─────> ~/.codex/skills
                             ├─> build/grok/skills ──────> ~/.grok/skills
                             └─> build/antigravity/... ──> ~/.gemini/config/skills

platforms/<name>/* ─────────────> chỉ runtime cùng tên
integrations/*/adapters/<name> ─> chỉ MCP/config của runtime cùng tên
knowledge/project-context ──────> chỉ repo được owner chọn cài
```

## Mirror invariants

1. Core semantic content của ba build phải cùng source hash.
2. Capability slug và version phải giống nhau giữa các platform hỗ trợ capability đó.
3. Overlay không được chứa lại đoạn core; chỉ chứa delta.
4. `build/` và runtime global là generated targets; sửa tay bị validator báo drift.
5. Reverse sync không tự merge theo timestamp. Import runtime về source phải tạo diff review có provenance.
6. Mỗi generated file có header: canonical source, source hash, platform adapter và build timestamp.
7. `verify-mirrors` báo theo subsystem, không dump danh sách hàng trăm file.

## Codebase MCP integration

Canonical integration name: `codebase-memory-mcp`  
Upstream: `DeusData/codebase-memory-mcp`  
Capability name trong rules: `code-intelligence`, tránh khóa behavior vào vendor name.

Thiết kế:

- Một binary dùng chung đặt tại `%LOCALAPPDATA%\Programs\codebase-memory-mcp\` trên Windows, không nằm trong `.gemini` hay `.codex`.
- Pin version + SHA-256 trong `manifest.json`; không tải `latest` không kiểm checksum.
- Wrapper chỉ cài binary. Config adapters do repo này sinh để tránh upstream installer ghi nhiều instruction/hook ngoài ý muốn.
- Cùng binary được đăng ký vào Codex, Grok và Antigravity bằng adapter riêng.
- Auto-index mặc định tắt. Repo được index khi task cần code intelligence hoặc owner bật rõ.
- `.codebase-memory/` là generated project state và mặc định gitignore; team-shared graph artifact chỉ bật bằng quyết định project-local.
- Fallback thống nhất: Codebase MCP không khả dụng → `rg` + targeted reads + native symbol navigation.
- Không tạo bộ `codebase-mcp-*` Markdown skills. Core chỉ biết capability; tool instructions ngắn nằm trong integration README/reference và được đọc khi cần vận hành tool.

## Verification

- `build-runtime` tạo ba cây build từ cùng canonical source.
- Hash report chứng minh core/capabilities tương ứng giống nhau.
- Overlay diff report chỉ chứa platform delta.
- Codebase MCP binary checksum/version pass.
- Ba MCP config cùng trỏ một binary và tool handshake pass.
- Task code-intelligence load tool result thay vì preload toàn repo; token report before/after được lưu làm evidence.
