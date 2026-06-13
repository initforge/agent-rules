# Grok CLI / Composer Harness — Coverage Map

Harness thứ 4 cho **Grok CLI** chạy **Composer 2.5**. Gốc nội dung **Codex** (`codex/rules/`), tune **Opus-emulation** (nặng mặc định, ceremony tối thiểu).

> **Runtime thật:** `.grok/rules/` — không phải `.cursor/rules/`. Cursor compat chỉ là mirror phụ.

## Triết lý

| Nền | Độ nặng | Composer so sánh |
|---|---|---|
| Antigravity | Nặng nhất | Composer **không** dùng — quá ceremony |
| Codex | Nặng vừa | **Gốc nội dung** |
| Kiro/Opus | Mỏng | Composer **không** copy nguyên — thiếu verify gate khi rủi ro |
| **Composer** | **Opus-emulation** | Full Codex gates + `06-opus-emulation`; MEDIUM default; anti-stuck explore |

## Cơ chế nạp (Grok CLI)

```text
cursor/rules/*.md          master (sửa)
    ↓ sync-harness.sh
.grok/rules/*.md           live PRIMARY (Grok CLI luôn scan)
.cursor/rules/*.md         mirror Cursor compat (optional)
~/.grok/                   global user
cursor/AGENTS.md           entrypoint
```

Verify: `grok inspect`

## Bộ harness live (rules + skills)

### Rules (9) — `.grok/rules/`

| # | File | Vai trò |
|---|---|---|
| 1 | `00-runtime-and-intent.md` | Intent router, hard activation, 5fedu detect |
| 2 | `01-agent-workflow-sop.md` | Core, planning, execution, RC, quality gates |
| 3 | `02-code-quality-and-debt.md` | Clean code, regression, permission, debt |
| 4 | `03-context-and-tools.md` | Fast context, 5fedu load, tools, research |
| 5 | `04-skills-and-5fedu.md` | **Registry skill + path 5fedu** |
| 6 | `05-harness-mutation-gate.md` | Chống tự tiến hóa harness |
| 7 | `06-opus-emulation-contract.md` | Outcome Opus, MEDIUM default |
| 8 | `platform-boundary.md` | Ranh giới 4 nền |
| 9 | `grok-overlay.md` | Grok CLI: explore budget, fast/full |

### Skills — `.grok/skills/` (gốc `codex/skills/`)

`5fedu-project`, `codex-research`, `docs-style`, `playwright`, `screenshot`, `pdf`, `security-*`, `output-skill`, `workflow-router` (Codex-only), ...

Index: `.grok/skills/00-index.md`. Compat: `.agents/skills/` (Grok auto-scan, có thêm UI skills).

### 5fedu context — trên dự án khách

Skill `5fedu-project` cài `.grok/5fedu/` (+ mirrors). **Không** nằm sẵn trong repo `agent-rules`.

## Coverage map — Codex → Composer

| Codex source (merged) | Composer file | Giữ nguyên | Composer tune |
|---|---|---|---|
| `00-runtime-and-intent` | `00-runtime-and-intent` | Intent signals, hard defaults, 5fedu hard mode, anti-deception | Explore budget ~8 file; preflight 3 câu (LOW); evidence có điều kiện |
| `01-intent-contract` | ↑ (merged) | Activation table | — |
| `00-hard-activation-contract` | ↑ (merged) | Protected files, triggers | Rút gọn anti-laziness |
| `prompt-intent-router` | ↑ (merged) | Signal → gate map | — |
| `core.md` | `01-agent-workflow-sop` | Execution contract 10 điểm | — |
| `planning.md` | ↑ | Plan layout, locked plan fields, integrity | — |
| `deep-reasoning.md` | ↑ | Call graph, data flow | **Chỉ MEDIUM/HIGH**; 2 phương án chỉ HIGH/arch |
| `execution.md` | ↑ | Workflow, hard stops, done=verified | — |
| `root-cause-verification.md` | ↑ | 90% confidence, fact/inference | — |
| `quality-gates.md` | ↑ | Smart verification, matrix, permission/production | — |
| `clean-code.md` | `02-code-quality-and-debt` | Philosophy, cleanup classes, protected files | Paths → `.cursor/` |
| Anti-regression block | ↑ | rg call-sites, UI pattern parity | — |
| Permission discipline | ↑ | Multi-level gate | — |
| `technical-debt-control.md` | ↑ | Taxonomy, budget, pre-done, 5fedu debt | — |
| `10-fast-context.md` | `03-context-and-tools` | Trigger map, stop conditions | **Anti-stuck** rule |
| `context-tools.md` | ↑ | Read order, 5fedu smart triggers | Detection thêm `.cursor/5fedu/` |
| `tool-inventory.md` | ↑ | Registry policy | Tham chiếu `codex/docs/` |
| `platform-boundary.md` | `platform-boundary` | 3 nền → **4 nền** | Thêm Composer row |
| `codex-overlay.md` | `grok-overlay` | Tool-first, skills, MCP | Grok CLI paths, explore budget, fast/full |

## Gate coverage checklist

| Gate | Codex | Composer | Kích hoạt |
|---|---|---|---|
| Safety (no push/deploy/revert) | ✓ | ✓ | always |
| Intent router | ✓ | ✓ | always |
| Scope nhỏ | ✓ | ✓ | always |
| Fake PASS ban | ✓ | ✓ | always |
| Planning / slice | ✓ | ✓ | MEDIUM/HIGH |
| Deep reasoning | ✓ | ✓ (có điều kiện) | MEDIUM/HIGH |
| Root cause 90% | ✓ | ✓ | bug/debug |
| Quality matrix | ✓ | ✓ | theo bề mặt |
| Permission đa account | ✓ | ✓ | signal permission |
| 5fedu template parity | ✓ | ✓ | có `*/5fedu/` |
| Production smart verify | ✓ | ✓ | signal production |
| Regression map | ✓ | ✓ | shared code change |
| Technical debt | ✓ | ✓ | task vừa/lớn |
| Status PASS/PARTIAL/BLOCKED | ✓ | ✓ | task không nhỏ |
| Evidence labels đầy đủ | ✓ | ✓ (có điều kiện) | MEDIUM/HIGH |
| Status block mọi lượt | Antigravity | **không** | — |
| Preflight 8 câu mọi lượt | Antigravity | **không** | — |
| 2 phương án mọi task | Antigravity/deep | **không** | chỉ HIGH |

## Sync khi core safety đổi

1. Sửa `codex/rules/` (nguồn chân lý nội dung).
2. Adapt `cursor/rules/` — rút ceremony, giữ gate.
3. `./cursor/scripts/sync-harness.sh`
4. Báo user nếu cần sync Antigravity/Kiro (không tự sửa chéo).

## Một dòng

Composer = **Codex coverage + Opus outcome (`06`), Antigravity ceremony không**, Kiro hands-off không**.