@C:\Users\ADMIN\.codex\RTK.md
@C:\Users\ADMIN\.codex\rules\core.md
@C:\Users\ADMIN\.codex\rules\root-cause-verification.md
@C:\Users\ADMIN\.codex\rules\planning.md
@C:\Users\ADMIN\.codex\rules\execution.md
@C:\Users\ADMIN\.codex\rules\quality-gates.md
@C:\Users\ADMIN\.codex\rules\context-tools.md
@C:\Users\ADMIN\.codex\rules\tool-inventory.md
@C:\Users\ADMIN\.codex\rules\clean-code.md
@C:\Users\ADMIN\.codex\rules\codex-overlay.md

# Bá»™ Náº¡p Runtime Codex

File nÃ y lÃ  Ä‘iá»ƒm vÃ o global cho Codex.

## Nguá»“n Runtime

DÃ¹ng file local dÆ°á»›i:

```text
C:\Users\ADMIN\.codex\
```

KhÃ´ng phá»¥ thuá»™c vÃ o `P:\agent-rules` khi lÃ m viá»‡c háº±ng ngÃ y.

`P:\agent-rules` chá»‰ dÃ¹ng cho:
- backup
- sync
- bootstrap mÃ¡y má»›i
- chia sáº» rule vá»›i agent/tool khÃ¡c
- lÆ°u tÃ i liá»‡u setup dÃ i

## Quy Táº¯c NgÃ´n Ngá»¯

- Giao tiáº¿p vá»›i ngÆ°á»i dÃ¹ng báº±ng tiáº¿ng Viá»‡t cÃ³ dáº¥u Ä‘áº§y Ä‘á»§.
- KhÃ´ng dÃ¹ng tiáº¿ng Viá»‡t khÃ´ng dáº¥u.
- KhÃ´ng dÃ¹ng tiáº¿ng Anh náº¿u cÃ³ cÃ¡ch nÃ³i tiáº¿ng Viá»‡t tá»± nhiÃªn.
- Giá»¯ tiáº¿ng Anh cho thuáº­t ngá»¯ ká»¹ thuáº­t, tÃªn model, lá»‡nh, Ä‘Æ°á»ng dáº«n, API, package, schema key, tÃªn tool, tÃªn sáº£n pháº©m vÃ  mÃ£ nguá»“n.

## TÃ³m Táº¯t Váº­n HÃ nh

Task nhá» rÃµ rÃ ng -> sá»­a trá»±c tiáº¿p + verify tá»‘i thiá»ƒu.

Task vá»«a -> Ä‘á»c ngá»¯ cáº£nh + láº­p plan khi cÃ³ nhiá»u lÃ¡t cáº¯t + triá»ƒn khai + verify.

Task rá»§i ro cao -> locked plan + risk register + reviewer gate + verify sÃ¢u.

HIGH risk hoáº·c multi-domain -> pháº£i bÄƒm thÃ nh `plan/<feature>/00-index.md` vÃ  cÃ¡c slice liÃªn tá»¥c `01-...md`, `02-...md`, `03-...md`; khÃ´ng dÃ¹ng mega-plan hoáº·c sá»‘ nháº£y nhÆ° `30`, `35`, `60` náº¿u khÃ´ng cÃ³ convention Ä‘Æ°á»£c ghi rÃµ.

`Codex Research` -> lá»›p nghiÃªn cá»©u chÃ­nh; ghi note vÃ o `plan/<feature>/research/` hoáº·c `plan/<feature>/review/`.

`GitNexus` -> cÃ´ng cá»¥ context/impact cÃ³ kiá»ƒm soÃ¡t, khÃ´ng tá»± index má»—i lÆ°á»£t.

`RTK` -> lá»›p nÃ©n lá»‡nh; PowerShell cmdlet cáº§n `rtk proxy powershell`.

Skill/MCP/tool -> ghi inventory vÃ  tÃ i liá»‡u dÆ°á»›i `.codex\docs` vÃ  `.codex\inventory`.

Tráº¡ng thÃ¡i cuá»‘i pháº£i lÃ  `PASS`, `PARTIAL`, hoáº·c `BLOCKED`.

## Quy Táº¯c Cá»©ng

Codex lÃ  chá»§ sá»Ÿ há»¯u triá»ƒn khai cuá»‘i cÃ¹ng.
