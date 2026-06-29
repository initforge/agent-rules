# 5fedu Context Index

ÄÃ¢y lÃ  index project-local cho 5fedu. Agent Ä‘á»c file nÃ y trÆ°á»›c Ä‘á»ƒ biáº¿t pháº£i Ä‘á»c gÃ¬ tiáº¿p theo, khÃ´ng Ä‘á»c toÃ n bá»™ context folder theo thÃ³i quen.

## Loading Policy

LuÃ´n Ä‘á»c trÆ°á»›c:

- `AGENTS.md`
- `00-index.md`
- `04-decision-status-and-backlog.md` hoáº·c legacy `06-decision-status.md`
- `questions.md`
- `05-source-specs-and-coverage.md` hoáº·c legacy `11-current-sheets-source-map.md` khi task cáº§n Ä‘á»‘i chiáº¿u spec/source

Äá»c sÃ¢u theo domain:

- `02-database-and-auth-rules.md`: database, auth, permission, RLS, trigger, rollup, schema.
- `03-ui-ux-and-delivery-standards.md`: UI, UX, list/detail/form, toolbar, filter, export, responsive, production UI rules.
- `04-business-patterns.md`: ERP/admin patterns nhÆ° master-detail, approval workflow, derived fields, lookup autofill, report/export parity, shared base entity + specialized roles.
- Legacy files `03-database-supabase.md`, `04-auth-permissions-and-flows.md`, `05-delivery-quality.md`, `07-working-format.md`, `08-source-examples.md`, `09-coverage-audit.md` chá»‰ Ä‘á»c khi repo cÃ²n dÃ¹ng layout cÅ© hoáº·c task cáº§n báº±ng chá»©ng cá»¥ thá»ƒ.
- `10-owner-feedback-lessons.md` vÃ  `12-owner-feedback-transport-ui.md` lÃ  log/lesson evidence. Náº¿u tháº¥y rule dÃ¹ng láº¡i Ä‘Æ°á»£c, promote vÃ o file rule sá»‘ng phÃ¹ há»£p.
- `13-trip-execution-vs-approval-spec.md`: checklist triá»ƒn khai Chuyáº¿n xe â€” tÃ¡ch TT thá»±c hiá»‡n vs duyá»‡t (owner 2026-06-15).
- `14-production-e2e-harness.md`: harness Playwright production â€” fixtures, backup/restore, blast radius, lá»‡nh cháº¡y, gate deploy bundle.

## Execution Contract

- KhÃ´ng blind-code. TrÆ°á»›c khi sá»­a, xÃ¡c Ä‘á»‹nh file sá»­a trá»±c tiáº¿p, file liÃªn quan, data/API/UI/caller bá»‹ áº£nh hÆ°á»Ÿng.
- KhÃ´ng isolated fix. Sá»­a schema/API/type/service/UI pháº£i rÃ  cÃ¡c nÆ¡i dÃ¹ng liÃªn quan.
- KhÃ´ng placeholder code cho feature Ä‘Ã£ Ä‘Æ°á»£c yÃªu cáº§u tháº­t.
- KhÃ´ng bÃ¡o xong náº¿u chÆ°a verify gate cá»‘t lÃµi.
- KhÃ´ng tá»± push, trá»« khi user yÃªu cáº§u rÃµ trong session.
- KhÃ´ng Ä‘á»ƒ ná»£ ká»¹ thuáº­t má»›i thÃ nh máº·c Ä‘á»‹nh. Náº¿u task táº¡o ná»£ má»›i, pháº£i phÃ¢n loáº¡i, sá»­a ngay náº¿u nghiÃªm trá»ng, hoáº·c ghi rÃµ `Remaining debt`.

## Smart Intent Contract

Khi prompt cÃ³ tÃ­n hiá»‡u rá»™ng, agent pháº£i tá»± kÃ­ch hoáº¡t nhanh gate tÆ°Æ¡ng á»©ng:

- `verify production háº¿t`, `test production`, `kiá»ƒm tra live`: Ä‘á»c index/mapping trÆ°á»›c, suy ra module/role/database/UI/export/cross-flow, rá»“i má»›i verify production.
- `UI`, `chÆ°a chuáº©n`, `thiáº¿u`, `khÃ´ng giá»‘ng`, `module thiáº¿u`, `tÃ­nh nÄƒng thiáº¿u`: Ä‘á»c mapping, tÃ¬m `/template` trÆ°á»›c. Náº¿u template cÃ³ máº«u Ä‘á»§ Ä‘Ã¡p á»©ng prompt/app thÃ¬ bÃ¡m sÃ¡t template vÃ  Ä‘á»•i tá»‘i thiá»ƒu; chá»‰ dÃ¹ng fallback/golden reference khi template thiáº¿u, khÃ´ng Ä‘á»§ hÃ nh vi, hoáº·c cÃ³ báº±ng chá»©ng Ä‘ang ngÃµ cá»¥t.
- Má»i thay Ä‘á»•i UI 5fedu, gá»“m lÃ m má»›i, lÃ m láº¡i, chá»‰nh sá»­a, loáº¡i bá», bá»• sung module, bá»• sung nÃºt, bá»• sung tÃ­nh nÄƒng, Ä‘á»•i layout, Ä‘á»•i flow hoáº·c Ä‘á»•i responsive behavior, báº¯t buá»™c bÃ¡m pattern UI cá»§a template theo Ä‘Ãºng surface/hÃ nh vi tÆ°Æ¡ng á»©ng.
- TrÆ°á»›c khi code UI/module, báº¯t buá»™c táº¡o **Pattern Fidelity Packet** theo máº«u trong `02-frontend-mapping.md`. Thiáº¿u packet nÃ y thÃ¬ chÆ°a Ä‘Æ°á»£c code.
- Cáº¥m tá»± cháº¿ tÃªn module, mÃ´ táº£, nÃºt, icon, tab, route, empty-state copy hoáº·c workflow. Náº¿u khÃ´ng cÃ³ nguá»“n rÃµ tá»« spec/template/app thÃ¬ há»i hoáº·c Ä‘Ã¡nh dáº¥u `CAN_HOI_THEM`.
- `permission`, `phÃ¢n quyá»n`, `role`, `RLS`, `auth`: Ä‘á»c database/auth rules vÃ  test Ä‘a account/Ä‘a cáº¥p.
- `export`, `download`, `Excel`, `PDF`, `CSV`: táº£i file tháº­t vÃ  kiá»ƒm format/ná»™i dung.
- `cleanup`, `gitignore`, `xÃ³a file`, `trÃ¹ng chá»©c nÄƒng`: kiá»ƒm reference báº±ng Codebase Memory MCP hoáº·c `rg`/native navigation, package scripts, CI vÃ  docs trÆ°á»›c khi xÃ³a.

Vá»›i task lá»›n hoáº·c production/UI/permission/database/export, report cuá»‘i pháº£i cÃ³ `Context loaded`, `Verification`, `Technical debt check`, `Status`; riÃªng UI pháº£i cÃ³ `Template checked` vÃ  `Pattern fidelity`.

## Verification Policy

Máº·c Ä‘á»‹nh cá»§a 5fedu:

- Test production sau khi code Ä‘Ã£ Ä‘Æ°á»£c push vÃ  CI/CD deploy xong.
- Náº¿u user yÃªu cáº§u test local, test local trÆ°á»›c hoáº·c thay production theo yÃªu cáº§u.
- KhÃ´ng tá»± táº¡o Vercel site/project má»›i.
- KhÃ´ng manual deploy báº±ng terminal náº¿u user khÃ´ng yÃªu cáº§u rÃµ.

Test khÃ´ng chá»‰ lÃ  báº¥m nÃºt:

- CRUD: create/read/update/delete vá»›i dá»¯ liá»‡u tháº­t hoáº·c test data Ä‘Æ°á»£c phÃ©p.
- Database: query Ä‘á»‘i chiáº¿u record, trigger, rollup, cascade, RLS/policy náº¿u cÃ³.
- Permission: táº¡o/dÃ¹ng Ä‘á»§ account Ä‘áº¡i diá»‡n cÃ¡c cáº¥p quyá»n; má»—i account pháº£i test quyá»n xem/thÃªm/sá»­a/xÃ³a vÃ  hÃ nh Ä‘á»™ng trÃ¡i phÃ©p.
- Cross-module: dá»¯ liá»‡u thay Ä‘á»•i á»Ÿ má»™t module pháº£i pháº£n Ã¡nh Ä‘Ãºng á»Ÿ module liÃªn quan, bÃ¡o cÃ¡o, dropdown, cache/query.
- Toolbar/filter/search: kiá»ƒm tra behavior vÃ  Ä‘á»‘i chiáº¿u káº¿t quáº£ lá»c vá»›i database/source.
- Export: táº£i file tháº­t, kiá»ƒm tra tÃªn file, extension, format, Excel cell type, PDF Unicode/layout.
- External integration khÃ´ng cÃ³ quyá»n test tháº­t: Ä‘á»c code ká»¹, kiá»ƒm tra config/error path, ghi `PARTIAL` hoáº·c gap cho user test.
- Regression váº­n táº£i / chuyáº¿n xe / phÃ¢n quyá»n: Ä‘á»c `14-production-e2e-harness.md`, cháº¡y spec trong blast radius tÆ°Æ¡ng á»©ng; test mutating báº¯t buá»™c snapshot + restore fixture; thiáº¿u service role â†’ UI-only `PARTIAL`.

## Context Preservation & Evolution (báº¯t buá»™c)

**NguyÃªn táº¯c: promote rule, khÃ´ng dump raw.** File `10`/`12` chá»‰ lÃ  archive index â€” khÃ´ng ghi quote owner, khÃ´ng láº·p láº¡i rule Ä‘Ã£ promote.

| Loáº¡i ná»™i dung | Ghi á»Ÿ Ä‘Ã¢u | Sync master? |
|---------------|-----------|--------------|
| Rule DB/auth/permission | `02-database-and-auth-rules.md` | CÃ³ |
| Rule UI/UX/harness | `03-ui-ux-and-delivery-standards.md`, `14-production-e2e-harness.md` | CÃ³ |
| Rule business pattern ERP/admin | `04-business-patterns.md` | CÃ³ |
| Checklist triá»ƒn khai module | `13-trip-execution-vs-approval-spec.md` (khi liÃªn quan) | CÃ³ |
| Tráº¡ng thÃ¡i chá»‘t/blocker | `06-decision-status.md` | Project only |
| CÃ¢u há»i má»Ÿ | `questions.md` | Project only |
| Raw chat / evidence | Sheet ngoÃ i hoáº·c 1 dÃ²ng index trong `10`/`12` | **KhÃ´ng** |

Workflow má»—i láº§n tiáº¿n hÃ³a:

1. Viáº¿t rule imperative (â‰¤5 bullet) vÃ o file sá»‘ng.
2. Cáº­p nháº­t `SKILL.md` Â§4/Â§F chá»‰ khi rule Ã¡p dá»¥ng má»i repo 5fedu.
3. Giữ `context/5fedu` là canonical; `.agents/AGENTS.md` và `.codex/AGENTS.md` chỉ là pointer.
4. Sync ngÆ°á»£c master: **chá»‰** allowlist trong `14` Â§11 â€” khÃ´ng Ä‘áº©y `10`, `12`, `06`, `questions`.

Náº¿u hai mirror cÃ¹ng Ä‘á»•i khÃ¡c nhau â†’ bÃ¡o conflict, khÃ´ng chá»n theo timestamp mÃ¹ quÃ¡ng.

