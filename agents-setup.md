# HÆ°á»›ng Dáº«n Setup Agent Rules

ThÆ° má»¥c nÃ y lÃ  nÆ¡i lÆ°u báº£n sync, backup vÃ  bootstrap dÃ i háº¡n cho há»‡ agent.

## MÃ´ HÃ¬nh Chuáº©n

Runtime háº±ng ngÃ y:

```text
C:\Users\DELL\.codex
```

Báº£n sync vÃ  bootstrap:

```text
P:\agent-rules\codex
```

Loader tÆ°Æ¡ng thÃ­ch:

```text
P:\agent-rules\global-rules.md
P:\agent-rules\clean-code.md
P:\agent-rules\codex-overlay.md
```

Ã nghÄ©a:
- Codex cháº¡y tá»« file local dÆ°á»›i `C:\Users\DELL\.codex`.
- `P:\agent-rules\codex` lÃ  báº£n mirror Ä‘á»ƒ restore mÃ¡y má»›i vÃ  backup.
- File root dÆ°á»›i `P:\agent-rules` chá»‰ lÃ  loader má»ng Ä‘á»ƒ project cÅ© váº«n import Ä‘Æ°á»£c.
- KhÃ´ng lÆ°u secret tháº­t trong rule, docs, skill, template hoáº·c inventory.

## Cáº¥u TrÃºc Hiá»‡n Táº¡i

```text
P:\agent-rules\
|- agents-setup.md
|- clean-code.md
|- codex-overlay.md
|- global-rules.md
|- codex\
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
`- gemini\
```

## Restore TrÃªn MÃ¡y Má»›i

1. Äáº£m báº£o `P:\agent-rules\codex` tá»“n táº¡i.
2. Copy vÃ o:

```text
C:\Users\DELL\.codex
```

3. Cháº¡y:

```powershell
& "$env:USERPROFILE\.codex\scripts\verify-codex-rules.ps1"
& "$env:USERPROFILE\.codex\scripts\verify-toolchain.ps1"
& "$env:USERPROFILE\.codex\scripts\inventory-current-machine.ps1"
```

4. Äá»c vÃ  bá»• sung pháº§n cÃ²n thiáº¿u tá»«:
- `C:\Users\DELL\.codex\docs\bootstrap-new-machine.md`
- `C:\Users\DELL\.codex\docs\tool-registry.md`
- `C:\Users\DELL\.codex\docs\mcp-registry.md`
- `C:\Users\DELL\.codex\docs\skills-registry.md`
- `C:\Users\DELL\.codex\docs\profile-matrix.md`

## Báº£o TrÃ¬ Háº±ng NgÃ y

Khi setup Codex local thay Ä‘á»•i:

```powershell
& "$env:USERPROFILE\.codex\scripts\sync-codex-to-p.ps1"
```

Khi restore tá»« báº£n sync:

```powershell
& "$env:USERPROFILE\.codex\scripts\sync-p-to-codex.ps1"
```

## Quy Táº¯c Váº­n HÃ nh

- Runtime logic náº±m trong `C:\Users\DELL\.codex`.
- Báº£n mirror bootstrap náº±m trong `P:\agent-rules\codex`.
- File root `P:\agent-rules\*.md` chá»‰ lÃ  loader tÆ°Æ¡ng thÃ­ch.
- Ná»™i dung hÆ°á»›ng tá»›i ngÆ°á»i dÃ¹ng pháº£i dÃ¹ng tiáº¿ng Viá»‡t cÃ³ dáº¥u Ä‘áº§y Ä‘á»§.
- DÃ¹ng `codex-research` lÃ m lá»›p nghiÃªn cá»©u chÃ­nh.
- DÃ¹ng `workflow-router` vÃ  metadata trong plan Ä‘á»ƒ route phase/profile.
- DÃ¹ng clean-code thá»±c dá»¥ng: cleanup pháº£i giáº£m rá»§i ro, náº¿u khÃ´ng thÃ¬ Ä‘á»ƒ sau.
- DÃ¹ng GitNexus trÆ°á»›c khi xÃ³a, Ä‘á»•i tÃªn, di chuyá»ƒn hoáº·c refactor code dÃ¹ng chung khi repo Ä‘Ã£ index.
