# Audit information architecture và token context

## Summary

Vấn đề hiện tại không chỉ là dư file. Harness đang thiếu một mô hình load rõ ràng nên cùng một ý đồ bị đặt ở nhiều tầng, nhiều runtime nạp quá nhiều context trước khi biết task là gì, và tên file phản ánh lịch sử chỉnh sửa hơn là ownership hiện tại.

## Evidence

### Context volume

| Surface | Hiện trạng đo được | Rủi ro |
|---|---:|---|
| `rules/*.md` | ~23.9k token | Quá lớn cho always-loaded core |
| Codex import chain | ~16.1k token | Trả chi phí trước mọi task, kể cả typo nhỏ |
| Grok `AGENTS.md` global | ~8.0k token | Monolith khó route và khó phát hiện drift |
| Antigravity `GEMINI.md` | ~1.2k token, chưa tính global rules | Entrypoint còn chứa policy lẽ ra thuộc core/overlay |
| `skills/**/*.md` | ~270k token | Hợp lý chỉ khi lazy-load; nguy hiểm nếu mirror/scan body rộng |
| `platforms/**/*.md` | ~400k token | Platform adapter đang chứa mirror/vendor payload thay vì delta nhỏ |
| `.agents/` local | 227 file, ~2.3 MB | Project context bị biến thành runtime mirror |

Ước lượng dùng `characters / 3.6`; đây là số định hướng kiến trúc, không phải tokenizer chính xác của từng model.

### Core concentration

- `01-agent-workflow-sop.md`: ~5.2k token.
- `02-code-quality-and-debt.md`: ~4.2k token.
- `antigravity-overlay.md` đang nằm trong root `rules/`: ~3.4k token.
- `08-ui-consistency-gate.md`: ~2.7k token.
- Các khái niệm bị lặp nhiều trong core: `skill` 76 lần, `5fedu` 66, `context` 59, `plan` 52, `PASS` 39, `verify` 37.

### Naming and routing drift

- Ba file cùng prefix `00-`: `00-core-execution-contract`, `00-index`, `00-runtime-and-intent`; thứ tự và precedence không tường minh.
- Index/scripts còn gọi `00-universal-frontier-contract.md` và `06-opus-emulation-contract.md` dù canonical worktree đã xóa/gộp.
- Platform overlay `antigravity-overlay.md` nằm cả root rules và platform fixture.
- Docs có hai file prefix `05-`; tên như `opus-emulation`, `frontier`, `harness-philosophy` mô tả lịch sử/branding hơn là reader intent.
- Skill cũ như `frontend-ui-quality`, `playwright-interactive`, `product-ui-craft`, `e2e-qa` vẫn xuất hiện trong rules, workflows, validators và registry.
- Path hardcode `C:\Users\DELL` và mô hình master cũ vẫn tồn tại cạnh runtime `C:\Users\ADMIN`.

### Trigger duplication

Một skill có thể được route từ bốn nơi:

1. `rules/03-context-and-tools.md`.
2. `rules/04-skills-and-5fedu.md`.
3. `workflows/<skill>.md`.
4. Frontmatter `description` trong `skills/<skill>/SKILL.md`.

Điều này làm trigger drift và tốn context. `SKILL.md` phải là source of truth; global core chỉ cần một activation algorithm ngắn.

## Risks

1. Token budget bị tiêu trước khi agent đọc task/repo, làm giảm không gian cho code, spec và logs.
2. Nhiều rule cùng sở hữu `plan`, `verify`, `PASS` tạo xung đột hoặc khiến agent lặp ceremony.
3. Filename order được dùng thay manifest nên rename/delete dễ làm loader và validator stale.
4. Vendor payload được mirror vào nhiều runtime khiến discovery list dài và cùng skill xuất hiện nhiều lần.
5. Project context copy sang `.agents`/`.codex` tạo hai bản có thể drift.
6. “Nén chữ” mà không đổi load graph chỉ làm context khó hiểu hơn, không giải quyết token gốc.

## Recommendation

### Context envelope

| Tier | Nội dung | Budget mục tiêu | Load policy |
|---|---|---:|---|
| T0 Bootstrap | identity, source map, 5 hard constraints | ≤300 token/platform | Always |
| T1 Core | intent, execution, safety, context routing | ≤4,000 token tổng | Always |
| T2 Overlay | delta riêng Codex/Grok/Antigravity | ≤600 token/platform | Platform-only |
| T3 Skill catalog | name + trigger metadata | ≤1,500 token tổng hoặc native discovery | Discovery only |
| T4 Skill body | procedure chuyên biệt | ≤2,000 token base/skill | Triggered |
| T5 References | rubric, examples, scripts/assets docs | Không đặt budget tổng | Read-on-demand |
| T6 Project index | domain map, decisions, packs cần đọc | ≤500 token | Repo-only |
| T7 Project packs | DB/auth/UI/module/spec | ≤1,500 token/file | Domain-triggered |
| T8 Evidence/archive | logs, raw feedback, legacy | Không auto-load | Explicit lookup |

### One-owner rule

- Outcome/status contract: một core file.
- Execution/verification: một core file, domain detail chuyển skill/reference.
- Skill trigger: frontmatter của chính skill.
- Platform difference: đúng một named overlay.
- Project fact/decision: đúng một project context canonical.
- Raw feedback/evidence: archive, không living rule.

### Naming contract

- Dùng kebab-case ASCII cho machine paths.
- File core dùng số cách 10 để chèn mới không renumber toàn bộ.
- Tên mô tả responsibility ổn định, không chứa model/marketing/history.
- Suffix bắt buộc theo loại: `*-overlay.md`, `*-index.md`, `*-decision-log.md`, `*-reference.md`.
- Không dùng `global`, `shared`, `core`, `universal` đồng thời cho cùng một tầng.

Đề xuất core names:

```text
knowledge/core/
  manifest.yaml
  00-bootstrap.md
  10-execution.md
  20-quality-and-safety.md
  30-context-routing.md
  40-harness-governance.md
```

Domain-heavy UI, security, document, 5fedu và tooling không nằm trong T1; chúng là skill/reference.

### Project context ownership

```text
<repo>/
  AGENTS.md                    # con trỏ mỏng, platform-neutral
  context/
    00-index.md                # canonical project context index
    decisions.md
    domains/
      database.md
      auth.md
      ui.md
  .agents/                     # Antigravity pointer/adapter only
  .codex/                      # Codex pointer/config only
```

Canonical capabilities được nhóm theo subsystem dưới `knowledge/capabilities/`; xem [mirror-and-subsystem-design.md](mirror-and-subsystem-design.md).

Không copy domain packs vào cả `.agents` và `.codex`. Hai adapter chỉ chỉ đường tới `context/` canonical; nếu platform không hỗ trợ import thì entrypoint yêu cầu đọc path canonical khi trigger khớp.

### Token interaction rules

1. Budget được kiểm bằng validator trên source và runtime installed.
2. Entry/core không chứa examples dài, command matrix, platform paths hoặc vendor names.
3. Skill base chứa decision procedure; examples/rubric dài chuyển `references/`.
4. Description đủ nhạy nhưng ngắn: signal + boundary + non-trigger, không nhét workflow.
5. Agent đọc index trước, pack sau; cấm preload toàn bộ project context.
6. Logs/evidence không được sync vào runtime context.
7. Runtime installer phải tạo report: always-loaded token estimate, catalog size và duplicate count.

## Unknowns

- Từng runtime có tokenizer và cơ chế skill discovery khác nhau; budget dùng ngưỡng bảo thủ và đo bằng cùng một heuristic để phát hiện drift.
- Khả năng Antigravity tự theo import từ project adapter cần verify bằng activation test; plan không giả định Markdown link tự động load.
