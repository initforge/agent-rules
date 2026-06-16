# Universal Frontier Contract

**Một master nội dung — ba runtime native — cùng một chuẩn frontier.**

User **không** phải chọn Grok cho E2E, Codex cho plan, Antigravity cho UI. **Bất kỳ** nền tảng nào cũng phải đủ mạnh để build project phức tạp **một mình**, với mọi model và mọi cách làm việc (terminal, IDE, slash workflow, profile phase).

## Nguyên tắc

1. **Cùng outcome bar** — `PASS` / `PARTIAL` / `BLOCKED`, Visible Echo, Multi-Skill Stack, Anti-Fake-PASS, **finish-to-completion** (`07`), execution ladder, debt gate.
2. **Khác execution harness** — mỗi platform dùng cơ chế native mạnh nhất của nó, không copy máy móc.
3. **Master chung** — sửa `codex/rules` + `codex/skills`; sync ra Grok / Codex / Antigravity.
4. **Không routing “cực”** — không doc kiểu “task này bắt buộc Grok”. Task phức tạp = skill stack đầy đủ trên platform user đang dùng.

## Chuẩn frontier (mọi platform)

| Capability | Bắt buộc |
|---|---|
| Turn-0 Skill Scan + Visible Echo | Mọi lượt, mọi model |
| Multi-Skill Stack + Primary + Scope Redirect | Task đa domain |
| `researcher` trước greenfield / stall | Không implement mù |
| `product-ui-craft` + browser verify | Task UI |
| `e2e-qa` execution ladder | Không loop `*:deep` |
| 5fedu gates | Mapping → template → verify |
| Technical debt + Anti-Fake-PASS | Trước final |
| `07-finish-to-completion` | Không handoff sớm; scope lock N/N |
| Complex project | Plan slices, cross-module, permission matrix — **không** đổi platform |

## Platform-native harness (cùng chuẩn, khác “cơ”)

### Grok CLI — terminal frontier

- **Load:** `~/.grok/.grok/rules/` + `~/.grok/skills/`
- **Enforce:** `~/.grok/hooks/skill-orchestrator.json` — PreToolUse mechanical (E2E ladder, skill-read, harness commit)
- **State:** `~/.grok/skill-state/`
- **Điểm mạnh native:** chặn terminal cứng, session inject, global một lần cài

### Codex CLI — phase frontier

- **Load:** `~/.codex/rules/` via `AGENTS.md` import + `agents/*.toml` profiles
- **Enforce:** rules + `workflow-router` + `~/.codex/hooks/skill-orchestrator.json` (khi platform hỗ trợ) + `~/.codex/scripts/skill-gate.py`
- **State:** `~/.codex/skill-state/`
- **Điểm mạnh native:** multi-phase planner/implementer/reviewer, TOML profile, deterministic patch discipline

### Antigravity IDE — IDE frontier

- **Load:** `~/.gemini/GEMINI.md` + `.agents/rules/` (frontmatter `alwaysApply`) + `.agents/workflows/` slash
- **Enforce:** 9+ rules Always On + workflow phase + `PreInvocation` preflight inject + **tự** tuân execution ladder (không chờ hook terminal)
- **State:** `.agents/` project context; preflight nhắc Turn-0 mỗi invocation
- **Điểm mạnh native:** IDE context, slash `/e2e-qa` `/researcher` `/product-ui-craft`, multi-folder project, visual iteration

## Enforcement parity (ý đồ, không identical API)

| Gate | Grok | Codex | Antigravity |
|---|---|---|---|
| E2E deep ladder | Hook advisory + state | Hook advisory + rule | Rule + workflow + self-check |
| Skill read trước tool | Turn-0 rule + inject | Turn-0 + profiles | Always On + workflow |
| Harness validate trước commit | Advisory + rule | Advisory + rule | Rule + preflight |
| Visible Echo | Inject + rule | Rule | frontmatter alwaysApply |
| Complex multi-domain | Multi-Skill Stack | Stack + workflow-router | Stack + slash workflows |

**Không** platform nào được coi là “bản nhẹ chỉ cho task nhỏ”. Nếu platform thiếu hook API → **bù bằng rule cứng hơn + workflow + self-checkpoint** — outcome vẫn frontier.

## Khi user chỉ dùng 1 platform

| Scenario | Grok alone | Codex alone | Antigravity alone |
|---|---|---|---|
| Greenfield app | researcher → craft → e2e | same stack + plan slices | same + slash workflows |
| 5fedu full module | 5fedu → craft → e2e | same + profiles | same + IDE verify |
| Harness maintenance | validate + hooks | validate + sync | validate + adapter |
| Stuck bug | researcher → fix → e2e | same | same + playwright workflow |

## Sync & install

```bash
bash scripts/sync-all-harness.sh   # master → mirrors + auto global install
```

- Grok: `install-grok-global.sh`
- Codex: `install-codex-global.sh`
- Antigravity: `install-antigravity-adapter.ps1` vào project + `sync-all-harness` cho `.agents/`

## Final (mọi platform)

```text
Skill scan:
Skills active:
Primary (this step):
Skill activated:
Verification:
Technical debt check:
Status: PASS/PARTIAL/BLOCKED
```

Thiếu evidence → `PARTIAL`/`BLOCKED` — **không** nói user “chuyển sang platform khác”.