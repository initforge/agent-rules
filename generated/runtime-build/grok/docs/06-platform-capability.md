# Platform capability matrix

**Vai trò:** Define explicit capability depth per supported product.  
**Distinguish:** product identity from host/runtime identity from historical install path from compatibility path.

> **Last verified:** 2026-07-25  
> **Verification method:** Manual review of platform overlays, platform-contracts.json, and adapters.
> **Next scheduled review:** 2026-10-25 (quarterly)  
> **Change trigger:** Platform adapter addition/removal, new runtime support, or capability status change.

## Identity clarification

| Term | Meaning | Example |
|---|---|---|
| Product identity | The actual product that runs the harness | `codex`, `grok`, `antigravity`, `cursor` |
| Host/runtime identity | CLI binary or runtime name | `codex`, `grok`, `gemini` (Antigravity CLI), `cursor` |
| Historical install path | Where the runtime stores its files | `~/.codex`, `~/.grok`, `~/.gemini/config` (Antigravity), `~/.cursor` |
| Compatibility path | Retained identifier for backward compat | `GEMINI_CONFIG_HOME`, `GEMINI.md`, `~/.gemini/config` |

The filesystem path `~/.gemini/config` and env vars like `GEMINI_CONFIG_HOME` are Antigravity compatibility paths, not Gemini CLI product support. The CLI binary `gemini` is the Antigravity host CLI — not a separate "Gemini CLI" product.

## Product status

| Product | Status | Implemented | Notes |
|---|---|---|---|
| Codex | supported | yes | Native agents, hooks, Plan Mode, MCP |
| Antigravity | supported | yes | Antigravity-native agents, skill gate hooks, browser/MCP tools |
| Cursor | supported | yes | Cursor rules, hooks, native agents (Markdown) |
| Grok | supported | yes | Grok agents (TOML), personas, inject rules, skill gate |
| OpenCode | partial | yes (standalone adapter, not pipeline-integrated) | Adapter implemented; not yet in CI build/install pipeline |
| Gemini CLI | unsupported | no | Not a supported product; Antigravity uses the `gemini` CLI binary |

## Capability dimensions

| Dimension | Definition |
|---|---|
| instructions | Always-load rules and bootstrap context |
| skills | Lazy-loaded SKILL.md triggered by routing |
| subagents | Native subagent/delegation support |
| model routing | Model/effort selection via policy |
| plan mode | Native plan-and-execute workflow |
| hooks | Native event hooks (PreInvocation, PreToolUse, etc.) |
| MCP/tools | MCP tool integration support |
| permissions | Sandbox/permission enforcement |
| telemetry | Event recording and receipts |
| diff/review | Diff, patch, and review workflow |
| install | Runtime build and install pipeline |
| doctor | Runtime health verification |
| uninstall | Clean uninstall support |

## Status values

| Value | Definition |
|---|---|
| native | Host provides first-class support for the capability |
| emulated | Capability provided through portable scripts or workarounds |
| unsupported | Capability is not available on this platform |
| unverified | Capability is built/generated but lacks runtime attestation |

## Capability matrix

| Dimension | Codex | Grok | Antigravity | Cursor | OpenCode | Gemini CLI |
|---|---|---|---|---|---|---|
| instructions | native | native | native | native | unverified | unsupported |
| skills | native | native | native | native | unverified | unsupported |
| subagents | native | native | unverified | native | unverified | unsupported |
| model routing | native | native | native | native | unverified | unsupported |
| plan mode | native | emulated | native | emulated | unverified | unsupported |
| hooks | native | native | native | native | unverified | unsupported |
| MCP/tools | native | native | native | native | unverified | unsupported |
| permissions | native | native | native | native | unverified | unsupported |
| telemetry | native | native | native | native | unverified | unsupported |
| diff/review | native | emulated | native | emulated | unverified | unsupported |
| install | native | native | native | native | unverified | unsupported |
| doctor | native | native | native | native | unverified | unsupported |
| uninstall | native | native | native | native | unverified | unsupported |

### Key findings

1. **Subagents — Antigravity unverified**: Antigravity uses `model: inherit` and lacks an independently attested subagent dispatch receipt. Source files claim potential support but cannot confirm until a runtime probe produces a matching event. Do not claim native subagents without a runtime receipt.

2. **Plan mode — Grok/Cursor emulated**: Neither Grok nor Cursor provide a native plan-and-execute pivot. Plan mode is emulated through workctl and the `plan-and-handoff` skill.

3. **Diff/review — Grok/Cursor emulated**: Native patch/diff review is Codex-native (Plan Mode) and Antigravity-native (plan artifacts). Grok and Cursor rely on portable workctl or manual review.

4. **Gemini CLI — unsupported across all dimensions**: The `gemini` CLI binary is the Antigravity host runtime, not a supported standalone product. No capability is provided for Gemini CLI as a product.

5. **Source parity ≠ behavioral parity**: All four supported platforms have equivalent source files (rules, skills, overlays) installed at runtime. This proves *source parity* only. Behavioral parity — identical agent behavior across platforms — remains unproven without per-platform runtime attestation. The doctor reports this honestly via `NATIVE_UNVERIFIED` / `NATIVE_OBSERVED` layered statuses.

## Probe evidence requirements

| Dimension | Probe method | Requested | Resolved | Observed |
|---|---|---|---|---|
| instructions | manifest.yaml hash match | config manifest | installed hash | doctor INSTALL_PASS |
| skills | SKILL.md routing test | route conformance | graph match | test-context-router.py |
| subagents | Host agent dispatch | agent policy definition | installed agent files | runtime receipt (NATIVE_OBSERVED) |
| model routing | model-policy.json probe | policy definition | installed policy hash | doctor MODEL_POLICY_MATCH |
| plan mode | native UI test | workflow trigger | platform capability claim | live session evidence |
| hooks | Hook event probe | hook config | installed script+config | NATIVE_OBSERVED receipt |
| MCP/tools | MCP config parse | registry integration | merged config | doctor MCP check |
| permissions | Sandbox boundary test | policy definition | enforced rules | live boundary test |
| telemetry | Event ledger check | telemetry contract | event.jsonl presence | hook receipt |
| diff/review | Native review test | review capability | platform docs | live session evidence |
| install | Install script run | installer exists | build output | doctor INSTALL_PASS |
| doctor | Doctor probe | script exists | runtime state | doctor report |
| uninstall | Cleanup test | uninstall exists | script presence | file removal test |

## Runtime probes still required

The following probes are needed to upgrade statuses from unverified/emulated to native:

1. **Antigravity subagent dispatch**: Run a real Antigravity session that delegates to a subagent and captures the dispatch event to `hook-health.json`.
2. **Grok plan mode**: Verify plan-and-execute works end-to-end in a Grok session with workctl.
3. **Cursor plan mode**: Same for Cursor.
4. **Source parity → behavioral parity**: Run identical task fixtures across Codex, Grok, Antigravity, and Cursor, then compare outcomes. M4 maturity requires at least one complete empirical triplet per platform.

## Rejected products

| Product | Reason |
|---|---|
| Gemini CLI | Not a supported adapter; the `gemini` CLI binary is Antigravity's runtime host, not a separate product |
