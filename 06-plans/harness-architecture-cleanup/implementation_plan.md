# Kế hoạch dọn kiến trúc harness

Trạng thái: `IMPLEMENTED — PASS`  
Phạm vi: `P:\agent-rules` + runtime global liên quan trên máy hiện tại  
Nguyên tắc: chưa xóa hoặc di chuyển payload trước khi owner duyệt plan này.

## 1. Owner intent

1. Xóa GitNexus sạch khỏi repo và máy vì owner không còn dùng.
2. Dùng `DeusData/codebase-memory-mcp` làm code-intelligence MCP duy nhất; không cài lại GitNexus dưới bất kỳ hình thức nào.
3. Không lưu Caveman như một cây `SKILL.md` được copy thủ công; coi Caveman là dependency từ repo upstream và cài bằng installer.
4. Loại skill/workflow/Markdown không phù hợp hoặc trùng với runtime/plugin.
5. Gom canonical source theo phân hệ rõ ràng; ba platform mirror cùng core/capabilities và chỉ khác overlay/config adapter.
6. Dọn `.agents` và `.codex` về đúng nghĩa project adapter mỏng, không chứa bản sao Knowledge Core.
7. Sau cleanup, mỗi file phải có đúng một owner: core, capability tự viết, integration, platform overlay hoặc project context.

## 2. Current-state evidence

- GitNexus đang được cài global bằng npm: `gitnexus@1.6.5`.
- Metadata package xác nhận upstream thật: `https://github.com/abhigyanpatwari/GitNexus`, không phải `nxpatterns/gitnexus` như một số docs cũ ghi.
- Codex live config còn `[mcp_servers.gitnexus]` trỏ tới `gitnexus.cmd`.
- `agents-skills/` có 7 GitNexus skills và 8 Caveman/Cavecrew/compress packages, tổng 31 file.
- `~/.agents/skills/` đang có cùng 15 package nói trên.
- `.agents/` local hiện có 227 file, 126 Markdown, 99 thư mục, khoảng 2.3 MB; toàn bộ thư mục bị gitignore và phần lớn là mirror cũ.
- `platforms/antigravity/.agents/` vật lý cũng có 227 file; Git chỉ track 4 file entry/overlay, phần còn lại là generated mirror.
- `.codex/5fedu/` có 15 file đang được track trong chính repo harness dù đây không phải repo dự án 5fedu.
- `skills/` có 22 package đang hoạt động; riêng `.system` có 50 file. Nhiều package tài liệu/security đã có bản runtime/plugin do nền tảng cung cấp.
- `workflows/` có 14 Markdown: 10 wrapper gọi lại skill cùng tên; 4 wrapper trỏ tới skill đã bị gộp/xóa hoặc logic nên là script.
- Root còn loader/legacy rời: `clean-code.md`, `codex-overlay.md`, `global-rules.md`, `shared/`.

## 3. Target architecture

Canonical source được gom thành bốn phân hệ cấp cao:

```text
knowledge/       # core + capabilities + project-context templates
integrations/    # code intelligence, token compression, external tools
platforms/       # chỉ delta Codex/Grok/Antigravity
automation/      # build/install/verify generated mirrors
```

Cây chi tiết và mirror graph: [research/mirror-and-subsystem-design.md](research/mirror-and-subsystem-design.md).

Chi tiết audit context/token: [research/context-information-architecture-audit.md](research/context-information-architecture-audit.md).

### 3.1 Context envelope và token budgets

| Tier | Owner | Budget mục tiêu | Activation |
|---|---|---:|---|
| T0 Bootstrap | platform entrypoint | ≤300 token | Always |
| T1 Knowledge Core | `knowledge/core/` | ≤4,000 token tổng | Always |
| T2 Platform delta | named overlay | ≤600 token/platform | Platform-only |
| T3 Skill catalog | generated metadata/native discovery | ≤1,500 token tổng | Discovery |
| T4 Capability body | `knowledge/capabilities/<subsystem>/<slug>/SKILL.md` | ≤2,000 token base | Triggered |
| T5 References | `references/`, scripts/assets docs | lazy | Explicit need |
| T6 Project index | `<repo>/context/00-index.md` | ≤500 token | Repo-only |
| T7 Project packs | `<repo>/context/domains/*.md` | ≤1,500 token/file | Domain-triggered |
| T8 Evidence/archive | logs/raw feedback/legacy | không auto-load | Explicit lookup |

Current baseline để so sau cleanup:

- Codex always-import chain: khoảng 16.1k token.
- Grok global `AGENTS.md`: khoảng 8.0k token.
- Root rules: khoảng 23.9k token.
- Mục tiêu: giảm Codex/Grok/Antigravity always-loaded context xuống T0 + T1 + T2, tối đa khoảng 4.9k token mỗi platform.

### 3.2 Naming and intent contract

Quy ước bắt buộc:

- Machine path dùng lowercase kebab-case ASCII.
- Core dùng prefix cách 10; load order do `knowledge/core/manifest.yaml` quyết định, không suy từ glob/file name.
- Tên mô tả responsibility ổn định; cấm tên theo model/marketing/lịch sử như `opus-emulation`, `frontier`, `universal` nếu không phải API thực.
- Platform file bắt buộc mang platform name: `codex-overlay.md`, `grok-overlay.md`, `antigravity-overlay.md`.
- Index, decision log, reference dùng suffix nhất quán: `*-index.md`, `*-decision-log.md`, `*-reference.md`.
- Một intent có đúng một owner; file khác chỉ link, không diễn giải lại.

Core target nằm trong phân hệ Knowledge:

```text
knowledge/core/
  manifest.yaml
  00-bootstrap.md
  10-execution.md
  20-quality-and-safety.md
  30-context-routing.md
  40-harness-governance.md
```

Ownership:

- `00-bootstrap`: identity, source map, hard constraints tối thiểu.
- `10-execution`: scope → execute → verify → status.
- `20-quality-and-safety`: mutation, data/security/destructive boundaries.
- `30-context-routing`: progressive disclosure và skill activation algorithm.
- `40-harness-governance`: promotion, sync, canonical/runtime boundaries.
- UI/5fedu/security/docs/PDF/tool-specific procedure chuyển sang triggered skills/references.

### 3.3 Single trigger registry

- `description` trong mỗi `SKILL.md` là source of truth cho trigger và non-trigger.
- `knowledge/core/30-context-routing.md` chỉ mô tả thuật toán scan/activate; không chứa bảng liệt kê capability.
- Generator tạo catalog/inventory theo platform từ frontmatter; không viết tay registry thứ hai.
- Xóa trigger maps trùng trong rule 03, rule 04, workflows và docs registry.
- Validator fail khi workflow/reference gọi skill không tồn tại hoặc hai active skills có trigger overlap chưa khai báo precedence.

### 3.4 Project context canonical

Project có context riêng dùng một cây trung lập:

```text
<repo>/
  AGENTS.md
  context/
    00-index.md
    decisions.md
    domains/
      database.md
      auth.md
      ui.md
  .agents/                 # Antigravity pointer/adapter only
  .codex/                  # Codex pointer/config only
```

`.agents`/`.codex` không giữ bản sao domain context. Adapter chỉ chỉ tới `context/` canonical và khai báo activation phù hợp platform.

### 3.5 Mirror contract

- `knowledge/core/` được build và cài giống nhau vào ba runtime global.
- `knowledge/capabilities/` được group theo phân hệ cho người đọc, sau đó build sang layout native của từng platform.
- `platforms/<platform>/` chỉ cộng overlay/profile/config riêng; cấm copy core vào source adapter.
- `integrations/<subsystem>/<tool>/adapters/` sinh MCP/tool config riêng cho từng platform nhưng trỏ cùng dependency/binary khi có thể.
- `build/<platform>/` là preview generated, gitignored; runtime global là installed mirror.
- Mỗi mirror có source hash/provenance; validator so theo phân hệ và báo drift ngắn gọn.
- Reverse sync runtime → canonical chỉ qua explicit import + reviewed diff; cấm timestamp merge.

Không duy trì trong repo harness sau cleanup:

```text
agents-skills/
.agents/
.codex/
workflows/                         # xóa nếu toàn bộ wrapper đã hấp thụ vào skill/script
shared/
clean-code.md
codex-overlay.md
global-rules.md
```

## 4. Deletion and migration matrix

### 4.1 GitNexus — hard delete

Xóa repo payload/runtime:

- `agents-skills/gitnexus-*`.
- `C:\Users\ADMIN\.agents\skills\gitnexus-*`.
- npm global package bằng `npm uninstall -g gitnexus`.
- `[mcp_servers.gitnexus]` trong `~/.codex/config.toml` và mọi live MCP config tương ứng.
- `platforms/codex/scripts/gitnexus-preflight.ps1`.
- GitNexus entries trong inventory snapshots, MCP/tool/skill registries, profiles, templates, README badges và docs.
- Generated `.gitnexus/` trong repo đã index, nhưng chỉ sau bước discovery liệt kê đường dẫn tuyệt đối để tránh xóa nhầm dữ liệu không-generated.

Viết lại generic, không để tên tool chết:

- `rules/02-code-quality-and-debt.md`: dùng `rg`/native symbol search/call-site search.
- `rules/03-context-and-tools.md`: bỏ toàn bộ section GitNexus.
- `rules/08-ui-consistency-gate.md`, `skills/5fedu-project/**`, `skills/researcher/**`: thay GitNexus bằng capability trung lập.
- Codex profiles/scripts/templates: dùng `rg`, targeted reads và native code navigation.

Acceptance: `rg -i gitnexus` không còn kết quả trong canonical repo, runtime global hoặc config đang hoạt động; `Get-Command gitnexus` không còn; npm global không còn package.

Sau removal, không có fallback “cài GitNexus nếu Codebase MCP lỗi”. Fallback duy nhất là `rg` + targeted reads + native symbol navigation.

### 4.2 Code intelligence — Codebase Memory MCP

Canonical integration:

```text
integrations/code-intelligence/codebase-memory-mcp/
  manifest.json
  install.ps1
  uninstall.ps1
  verify.ps1
  adapters/
    codex.toml
    grok.json
    antigravity.json
```

Yêu cầu:

- Upstream duy nhất: `https://github.com/DeusData/codebase-memory-mcp`.
- Một binary neutral dùng chung; không cài riêng dưới `.gemini`, `.codex`, `.grok`.
- Pin release + checksum; installer hiện tại tải `latest` không verify checksum phải được thay.
- Không dùng upstream multi-agent auto-config trực tiếp vì có thể ghi instruction/hooks ngoài architecture đã duyệt; repo tự sinh ba config adapters.
- Đăng ký MCP cho Codex, Grok, Antigravity và verify handshake/tool discovery từng nền.
- Rules dùng capability name `code-intelligence`, không rải vendor name khắp core.
- Auto-index mặc định off; index/project graph là generated state, không living context.
- Không tạo thêm các Markdown skills kiểu `codebase-mcp-exploring/debugging/...`.

Acceptance: ba runtime cùng trỏ một binary đã verify checksum/version; query smoke test pass; GitNexus không còn trong fallback/config/docs.

### 4.3 Caveman — external integration, không vendor payload

Xóa:

- Toàn bộ `agents-skills/caveman*`, `agents-skills/cavecrew`, `agents-skills/compress`.
- Các bản copy tương ứng trong `~/.agents/skills`.
- Caveman/Cavecrew references trong README, skill registry và docs registry cũ.

Tạo:

- `integrations/caveman/manifest.json`: upstream `JuliusBrussee/caveman`, ref/version đã pin, platforms được phép cài.
- `integrations/caveman/install.ps1`: clone/fetch upstream hoặc gọi installer upstream đã pin; mặc định `--dry-run`, chỉ cài khi có `-Apply`.
- `integrations/caveman/uninstall.ps1`: gọi upstream uninstall và dọn skill do `npx skills` quản lý.
- `integrations/caveman/README.md`: ownership, install/uninstall/verify ngắn; không copy nội dung skill.

Chính sách mặc định: `--minimal`, cài theo platform được chọn; không tự thêm per-repo rule, hook hoặc MCP shrink. Các option mở rộng phải là flag tường minh.

Nguồn upstream để triển khai: `https://github.com/JuliusBrussee/caveman/blob/main/INSTALL.md`.

### 4.4 Active capabilities

Giữ làm capability tự viết global và gom theo subsystem dưới `knowledge/capabilities/`:

- `5fedu-project`
- `best-of-n`
- `check-work`
- `code-review`
- `context-evolution-protocol`
- `docs-style`
- `finish-to-completion`
- `frontend-architect`
- `master-image-generation`
- `researcher`
- `workflow-router`

Gộp rồi xóa package riêng:

- `output-skill` → gộp contract output đầy đủ vào `finish-to-completion`.
- `browser-automation` → chỉ giữ trigger/capability routing trong skill frontend hoặc dùng browser/Playwright native; không giữ skill một-file trùng chức năng.

Không vendor-copy; chuyển sang dependency manifest/plugin runtime:

- `.system`
- `create-skill`, `help`
- `docx`, `pdf`, `xlsx`, `screenshot`
- `security-best-practices`, `security-ownership-map`, `security-threat-model`

Điều kiện trước khi xóa vendor copy: validator phải chứng minh capability tương ứng có từ plugin/bundled runtime trên từng platform được hỗ trợ. Platform không có capability thì installer phải cài dependency; không fallback bằng copy thủ công vào project.

Xóa sạch mirror/deprecated skill cũ còn sót trong runtime/platform fixture: các skill taste/UI/image/playwright cũ đã được gộp nhưng vẫn còn dưới `.agents` generated tree.

### 4.5 Workflows

- Hấp thụ phần duy nhất của `5fedu-project.md`, `context-evolution-protocol.md`, `docs-style.md`, `researcher.md`, `workflow-router.md` vào `SKILL.md` canonical nếu còn thiếu.
- Xóa wrapper 5 dòng cho PDF/screenshot/security vì trigger skill đã đủ.
- Xóa workflow chết `e2e-qa`, `playwright`, `product-ui-craft` sau khi xác nhận replacement.
- Chuyển `runtime-sync-audit.md` thành script/validator cơ học; không giữ như Markdown workflow.
- Nếu không còn workflow có orchestration độc lập sau audit, xóa toàn bộ `workflows/` và bỏ sync/install của layer này.

### 4.6 `.agents`, `.codex`, Antigravity adapter

- Xóa toàn bộ `.agents/` ignored/generated trong repo này.
- Xóa `.codex/5fedu/` khỏi repo harness; template 5fedu canonical chuyển vào `knowledge/project-context/templates/5fedu/`.
- Di chuyển `platforms/antigravity/.agents/rules/antigravity-overlay.md` tới `platforms/antigravity/antigravity-overlay.md`.
- Di chuyển 3 entry files Antigravity sang `platforms/antigravity/project-adapter/` và rút còn manifest/entrypoint thật sự cần thiết.
- Xóa generated `platforms/antigravity/.agents/{rules,skills,workflows}` khỏi working tree.
- Sửa installer để project chỉ nhận project context/entrypoint; global core và external integrations không được copy vào `.agents`/`.codex`.
- Sửa `.gitignore` và validator để generated project adapter không thể quay lại thành mirror.

### 4.7 Root/docs/platform cleanup

- Merge phần còn giá trị rồi xóa `clean-code.md`, `global-rules.md`, root `codex-overlay.md`, `shared/`.
- Giữ overlay duy nhất tại `platforms/<platform>/<platform>-overlay.md`.
- Gộp docs 01–09 theo reader need; xóa registry công cụ opensource kiểu wishlist.
- Xóa mọi path `C:\Users\DELL`; dùng `$env:USERPROFILE` hoặc path tương đối.
- README chỉ mô tả kiến trúc hiện hành, không quảng bá tool đã xóa hoặc cây generated.

## 5. Execution order

1. Chụp inventory và backup config bị mutate; không backup generated mirrors.
2. Gỡ GitNexus runtime/MCP/skills và generic hóa mọi contract phụ thuộc.
3. Dựng integration Codebase MCP neutral + ba adapters; verify trước khi sửa code-intelligence policy.
4. Tách Caveman thành integration installer rồi xóa vendor payload.
5. Tạo cây `knowledge/`, `integrations/`, `platforms/`, `automation/` và migration map path cũ → mới.
6. Tạo core manifest, mirror manifest và validator token/hash/provenance.
7. Gộp core về 5 responsibilities; chuyển domain/tool procedure sang capability/reference.
8. Prune/merge active capabilities; group theo subsystem và sinh catalog từ frontmatter.
9. Hấp thụ/xóa workflows và trigger registries viết tay.
10. Chuyển project context về cây `context/` canonical; dọn `.agents`, `.codex`, Antigravity fixture.
11. Dọn root/docs/legacy loaders và mọi stale path.
12. Build ba runtime preview, review mirror delta, rồi install global.
13. Chạy full duplicate/reference/runtime/token/MCP validation.

Không đảo thứ tự 2 và 3: phải dọn tool chết trước khi thay đổi mô hình vendor dependency để validator không nhầm GitNexus là integration được giữ.

## 6. Verification matrix

| Gate | Bằng chứng PASS |
|---|---|
| GitNexus removal | npm/Get-Command/config/`rg` đều không còn GitNexus |
| Codebase MCP | pinned checksum/version; một binary; 3 adapter handshake/query pass |
| Subsystem layout | canonical files nằm đúng knowledge/integration/platform/automation owner |
| Mirror parity | core/capability source hash giống nhau; overlay chỉ có platform delta |
| Caveman ownership | repo không có upstream `SKILL.md`/Python payload; dry-run installer hiển thị đúng upstream/ref |
| Context layers | validator xác nhận core chỉ ở global source/runtime; project dirs không chứa core mirror |
| Token envelope | T0 ≤300, T1 ≤4,000 tổng, T2 ≤600/platform; report before/after |
| Naming | manifest load order hợp lệ; không duplicate prefix/owner; paths theo taxonomy |
| Trigger ownership | catalog sinh từ frontmatter; không bảng trigger viết tay; không overlap vô chủ |
| Progressive loading | smoke test chứng minh task LOW không load domain/project packs; task domain load đúng pack |
| Skill registry | mỗi active skill có owner, trigger và đúng một canonical copy |
| Vendor capabilities | plugin/dependency check pass hoặc installer báo dependency thiếu rõ ràng |
| Workflow cleanup | không wrapper gọi lại skill; không reference skill đã xóa |
| Duplicate audit | hash/name/reference scan không còn mirror stale |
| Runtime install | Codex/Grok/Antigravity global install smoke test pass |
| Documentation | link/path check pass; README EN/VI thống nhất |
| Git hygiene | `git diff --check`; không đụng thay đổi user ngoài plan; không commit/push |

## 7. Risks and controls

- Worktree hiện có nhiều thay đổi skill/rule chưa commit: cleanup phải lập danh sách baseline và không restore/xóa nhầm thay đổi owner.
- Gỡ GitNexus khỏi live config có thể làm Codex MCP load lỗi nếu chỉ xóa binary; phải xóa config trước hoặc cùng transaction.
- Vendor skill không có trên mọi platform: chỉ xóa copy sau capability preflight, không giả định Codex plugin đồng nghĩa Grok/Antigravity có plugin.
- Caveman upstream installer có thể ghi hooks/MCP/project rules; wrapper mặc định dry-run + minimal để không mở rộng scope ngầm.
- `.agents` ignored nên Git không thể chứng minh cleanup bằng status; validator phải kiểm tra filesystem thật.
- Giảm token quá mạnh có thể làm mất enforcement; mỗi rule được gộp phải có behavior test trước/sau, không đánh giá chỉ bằng số token.
- Markdown link không đồng nghĩa platform tự load context; project adapter phải có activation test thực tế trên từng platform.

## 8. Acceptance contract

Chỉ báo `PASS` khi:

- GitNexus biến mất khỏi repo, runtime và config hoạt động.
- Codebase MCP trở thành code-intelligence integration duy nhất và hoạt động trên ba platform.
- Caveman chỉ còn integration manifest/installer, không còn vendor payload.
- `.agents` và `.codex` không còn mirror/context sai repo.
- Skill/workflow matrix đã được thực thi hết và runtime vẫn discover đúng capability.
- Always-loaded context đáp ứng context envelope và behavior smoke tests vẫn giữ outcome contract.
- Naming/manifest/trigger registry có validator chống drift.
- Mirror report chứng minh canonical parity và platform delta rạch ròi theo từng phân hệ.
- Tất cả installer/validator/smoke test pass.

Nếu một vendor capability không thể cài lại trên một platform, trạng thái phải là `PARTIAL`; không giữ duplicate cũ mà gọi là hoàn thành.
