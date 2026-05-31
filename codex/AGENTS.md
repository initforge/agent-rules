@C:\Users\DELL\.codex\RTK.md
@C:\Users\DELL\.codex\rules\core.md
@C:\Users\DELL\.codex\rules\root-cause-verification.md
@C:\Users\DELL\.codex\rules\planning.md
@C:\Users\DELL\.codex\rules\execution.md
@C:\Users\DELL\.codex\rules\quality-gates.md
@C:\Users\DELL\.codex\rules\context-tools.md
@C:\Users\DELL\.codex\rules\tool-inventory.md
@C:\Users\DELL\.codex\rules\clean-code.md
@C:\Users\DELL\.codex\rules\codex-overlay.md

# BÃ¡Â»â„¢ NÃ¡ÂºÂ¡p Runtime Codex

File nÃƒÂ y lÃƒÂ  Ã„â€˜iÃ¡Â»Æ’m vÃƒÂ o global cho Codex.

## NguÃ¡Â»â€œn Runtime

DÃƒÂ¹ng file local dÃ†Â°Ã¡Â»â€ºi:

```text
C:\Users\DELL\.codex\
```

KhÃƒÂ´ng phÃ¡Â»Â¥ thuÃ¡Â»â„¢c vÃƒÂ o `P:\agent-rules` khi lÃƒÂ m viÃ¡Â»â€¡c hÃ¡ÂºÂ±ng ngÃƒÂ y.

`P:\agent-rules` chÃ¡Â»â€° dÃƒÂ¹ng cho:
- backup
- sync
- bootstrap mÃƒÂ¡y mÃ¡Â»â€ºi
- chia sÃ¡ÂºÂ» rule vÃ¡Â»â€ºi agent/tool khÃƒÂ¡c
- lÃ†Â°u tÃƒÂ i liÃ¡Â»â€¡u setup dÃƒÂ i

## Quy TÃ¡ÂºÂ¯c NgÃƒÂ´n NgÃ¡Â»Â¯

- Giao tiÃ¡ÂºÂ¿p vÃ¡Â»â€ºi ngÃ†Â°Ã¡Â»Âi dÃƒÂ¹ng bÃ¡ÂºÂ±ng tiÃ¡ÂºÂ¿ng ViÃ¡Â»â€¡t cÃƒÂ³ dÃ¡ÂºÂ¥u Ã„â€˜Ã¡ÂºÂ§y Ã„â€˜Ã¡Â»Â§.
- KhÃƒÂ´ng dÃƒÂ¹ng tiÃ¡ÂºÂ¿ng ViÃ¡Â»â€¡t khÃƒÂ´ng dÃ¡ÂºÂ¥u.
- KhÃƒÂ´ng dÃƒÂ¹ng tiÃ¡ÂºÂ¿ng Anh nÃ¡ÂºÂ¿u cÃƒÂ³ cÃƒÂ¡ch nÃƒÂ³i tiÃ¡ÂºÂ¿ng ViÃ¡Â»â€¡t tÃ¡Â»Â± nhiÃƒÂªn.
- GiÃ¡Â»Â¯ tiÃ¡ÂºÂ¿ng Anh cho thuÃ¡ÂºÂ­t ngÃ¡Â»Â¯ kÃ¡Â»Â¹ thuÃ¡ÂºÂ­t, tÃƒÂªn model, lÃ¡Â»â€¡nh, Ã„â€˜Ã†Â°Ã¡Â»Âng dÃ¡ÂºÂ«n, API, package, schema key, tÃƒÂªn tool, tÃƒÂªn sÃ¡ÂºÂ£n phÃ¡ÂºÂ©m vÃƒÂ  mÃƒÂ£ nguÃ¡Â»â€œn.

## TÃƒÂ³m TÃ¡ÂºÂ¯t VÃ¡ÂºÂ­n HÃƒÂ nh

Task nhÃ¡Â»Â rÃƒÂµ rÃƒÂ ng -> sÃ¡Â»Â­a trÃ¡Â»Â±c tiÃ¡ÂºÂ¿p + verify tÃ¡Â»â€˜i thiÃ¡Â»Æ’u.

Task vÃ¡Â»Â«a -> Ã„â€˜Ã¡Â»Âc ngÃ¡Â»Â¯ cÃ¡ÂºÂ£nh + lÃ¡ÂºÂ­p plan khi cÃƒÂ³ nhiÃ¡Â»Âu lÃƒÂ¡t cÃ¡ÂºÂ¯t + triÃ¡Â»Æ’n khai + verify.

Task rÃ¡Â»Â§i ro cao -> locked plan + risk register + reviewer gate + verify sÃƒÂ¢u.

HIGH risk hoÃ¡ÂºÂ·c multi-domain -> phÃ¡ÂºÂ£i bÃ„Æ’m thÃƒÂ nh `plan/<feature>/00-index.md` vÃƒÂ  cÃƒÂ¡c slice liÃƒÂªn tÃ¡Â»Â¥c `01-...md`, `02-...md`, `03-...md`; khÃƒÂ´ng dÃƒÂ¹ng mega-plan hoÃ¡ÂºÂ·c sÃ¡Â»â€˜ nhÃ¡ÂºÂ£y nhÃ†Â° `30`, `35`, `60` nÃ¡ÂºÂ¿u khÃƒÂ´ng cÃƒÂ³ convention Ã„â€˜Ã†Â°Ã¡Â»Â£c ghi rÃƒÂµ.

`Codex Research` -> lÃ¡Â»â€ºp nghiÃƒÂªn cÃ¡Â»Â©u chÃƒÂ­nh; ghi note vÃƒÂ o `plan/<feature>/research/` hoÃ¡ÂºÂ·c `plan/<feature>/review/`.

`GitNexus` -> cÃƒÂ´ng cÃ¡Â»Â¥ context/impact cÃƒÂ³ kiÃ¡Â»Æ’m soÃƒÂ¡t, khÃƒÂ´ng tÃ¡Â»Â± index mÃ¡Â»â€”i lÃ†Â°Ã¡Â»Â£t.

`RTK` -> lÃ¡Â»â€ºp nÃƒÂ©n lÃ¡Â»â€¡nh; PowerShell cmdlet cÃ¡ÂºÂ§n `rtk proxy powershell`.

Skill/MCP/tool -> ghi inventory vÃƒÂ  tÃƒÂ i liÃ¡Â»â€¡u dÃ†Â°Ã¡Â»â€ºi `.codex\docs` vÃƒÂ  `.codex\inventory`.

TrÃ¡ÂºÂ¡ng thÃƒÂ¡i cuÃ¡Â»â€˜i phÃ¡ÂºÂ£i lÃƒÂ  `PASS`, `PARTIAL`, hoÃ¡ÂºÂ·c `BLOCKED`.

## Quy TÃ¡ÂºÂ¯c CÃ¡Â»Â©ng

Codex lÃƒÂ  chÃ¡Â»Â§ sÃ¡Â»Å¸ hÃ¡Â»Â¯u triÃ¡Â»Æ’n khai cuÃ¡Â»â€˜i cÃƒÂ¹ng.
