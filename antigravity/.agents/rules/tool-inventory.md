# Tool / MCP / Skills Inventory Rules

## Trigger

Áp dụng khi:

- user cài CLI, tool, MCP, skill hoặc plugin mới;
- Codex phát hiện tool hữu ích đã cài;
- `C:\Users\DELL\.codex\config.toml` thay đổi;
- Codex Research, GitNexus, RTK, Node, Python, Flutter hoặc toolchain thay đổi;
- user yêu cầu chuẩn bị máy mới hoặc document setup;
- command fail/succeed vì tool thiếu hoặc vừa được thêm.

## Purpose

Giữ machine knowledge tái lập được. Máy mới phải restore được bằng docs và inventory dưới:

```text
C:\Users\DELL\.codex\docs
C:\Users\DELL\.codex\inventory
```

và bản sync:

```text
P:\agent-rules\codex
```

## Required Docs

Maintain:

```text
C:\Users\DELL\.codex\docs\
|- machine-profile.md
|- tool-registry.md
|- mcp-registry.md
|- skills-registry.md
|- bootstrap-new-machine.md
`- troubleshooting.md
```

Maintain machine-readable inventory:

```text
C:\Users\DELL\.codex\inventory\
|- tools.json
|- env.json
|- paths.json
|- codex-config.snapshot.toml
`- mcp-list.txt
```

## When Adding A CLI Or Tool

Record:

- name;
- purpose;
- install command;
- verify command;
- expected version or version policy;
- config path;
- env var names needed, never secret values;
- common failure;
- how Codex should use it;
- when Codex should not use it;
- runtime-critical or optional.

## When Adding An MCP

Record:

- MCP name;
- purpose;
- install command;
- `codex mcp add` command if applicable;
- config TOML block;
- verify command;
- required env var names;
- usage trigger;
- failure fallback;
- stale-output risk.

## When Adding A Skill

Record:

- skill name;
- runtime: Codex / local tool / plugin / both;
- path;
- purpose;
- trigger;
- inputs;
- outputs;
- scripts used;
- references/assets used;
- install/copy command;
- verify command.

## Secrets Policy

Never store secret values in docs.

Good:

- `OPENAI_API_KEY` required; set in user environment.

Bad:

- `OPENAI_API_KEY=sk-...`

Store only env var names, where to set them, and how to verify presence without printing values.

## Inventory Refresh

When user asks update inventory, sync setup, prepare new machine, or document tools:

```powershell
C:\Users\DELL\.codex\scripts\inventory-current-machine.ps1
```

Then update docs and sync:

```powershell
C:\Users\DELL\.codex\scripts\sync-codex-to-p.ps1
```
