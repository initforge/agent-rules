# 5fedu Project Entry

Repo nÃ y dÃ¹ng context project-local cho 5fedu. File nÃ y lÃ  con trá» nháº¹, khÃ´ng pháº£i nÆ¡i nhÃ©t toÃ n bá»™ rule chi tiáº¿t.

NgÆ°á»i dÃ¹ng khÃ´ng cáº§n gá»i `/5fedu` má»—i láº§n lÃ m viá»‡c. `/5fedu` chá»‰ dÃ¹ng Ä‘á»ƒ scaffold hoáº·c báº£o trÃ¬ context.

## LuÃ´n Äá»c TrÆ°á»›c Khi LÃ m

Äá»c lá»›p index/mapping nháº¹:

- `context/5fedu/00-index.md`: cÃ¡ch náº¡p context, execution contract, verify policy.
- `context/5fedu/04-decision-status-and-backlog.md` hoáº·c `context/5fedu/06-decision-status.md`: tráº¡ng thÃ¡i `DA_CHOT`, `CHUA_CHOT`, `CAN_HOI_THEM`.
- `context/5fedu/questions.md`: cÃ¢u há»i cÃ²n má»Ÿ.
- `context/5fedu/05-source-specs-and-coverage.md` hoáº·c `context/5fedu/11-current-sheets-source-map.md` khi task cáº§n Ä‘á»‘i chiáº¿u spec/source.

Sau Ä‘Ã³ chá»‰ Ä‘á»c file chi tiáº¿t khi task tháº­t sá»± dÃ­nh domain Ä‘Ã³.

## Chá»‰ Äá»c Khi LiÃªn Quan

- Database/auth/schema/permission/RLS/trigger/rollup: Ä‘á»c `context/5fedu/02-database-and-auth-rules.md` vÃ  legacy `context/5fedu/03-database-supabase.md`, `context/5fedu/04-auth-permissions-and-flows.md` náº¿u cÃ³.
- UI/UX/list/detail/form/toolbar/filter/export/responsive: Ä‘á»c `context/5fedu/03-ui-ux-and-delivery-standards.md`, legacy `context/5fedu/05-delivery-quality.md`, `context/5fedu/07-working-format.md` náº¿u cÃ³.
- ERP/admin business patterns nhÆ° master-detail, approval workflow, derived totals, lookup autofill, report/export parity: Ä‘á»c `context/5fedu/04-business-patterns.md`.
- Feedback cÅ©, lá»—i nháº¯c láº¡i, váº­n táº£i, hoáº·c owner correction: tÃ¬m trong `context/5fedu/10-owner-feedback-lessons.md` vÃ  `context/5fedu/12-owner-feedback-transport-ui.md`, sau Ä‘Ã³ kiá»ƒm tra bÃ i há»c Ä‘Ã£ Ä‘Æ°á»£c promote vÃ o rule sá»‘ng chÆ°a.
- Template parity: vá»›i má»i task UI hoáº·c khi user nÃ³i UI/tÃ­nh nÄƒng/module `chÆ°a chuáº©n`, `thiáº¿u`, `khÃ´ng giá»‘ng`, `chÆ°a Ä‘á»§`, pháº£i Ä‘á»c mapping trÆ°á»›c vÃ  tÃ¬m `/template` trÆ°á»›c. Náº¿u template Ä‘á»§ Ä‘Ã¡p á»©ng prompt/app thÃ¬ bÃ¡m sÃ¡t template vÃ  Ä‘á»•i tá»‘i thiá»ƒu. Chá»‰ dÃ¹ng golden reference khi template thiáº¿u/khÃ´ng Ä‘á»§/ngÃµ cá»¥t; khi Ä‘Ã³ pháº£i research nhiá»u tab/module theo behavior/output/surface/data/permission Ä‘á»ƒ chá»n reference phÃ¹ há»£p nháº¥t, khÃ´ng máº·c Ä‘á»‹nh má»™t module cá»‘ Ä‘á»‹nh.
- Pattern fidelity: trÆ°á»›c khi code UI/module, pháº£i láº­p mapping ngáº¯n tá»« spec -> submenu -> module -> tab/route -> template/current-app reference -> labels/actions/fields/service. Cáº¥m tá»± cháº¿ tÃªn module, mÃ´ táº£, nÃºt, icon, tab, copy hoáº·c workflow náº¿u spec/template/app Ä‘Ã£ cÃ³ nguá»“n.

## Quy Táº¯c Cá»©ng

- KhÃ´ng Ä‘oÃ¡n module, route, báº£ng, cá»™t, credential, quyá»n hoáº·c flow khi status cÃ²n `CHUA_CHOT` hoáº·c `CAN_HOI_THEM`.
- Khi dá»¯ kiá»‡n cá»¥ thá»ƒ chÆ°a chá»‘t, váº«n theo format/cÃ¡ch lÃ m 5fedu Ä‘Ã£ chá»‘t; chá»‰ há»i pháº§n giÃ¡ trá»‹ cÃ²n thiáº¿u.
- Khi user chốt hoặc bổ sung rule mới, ghi log nếu cần, promote thành rule sống, cập nhật decision status trong `context/5fedu`, rồi kiểm tra pointer `.agents/AGENTS.md` và `.codex/AGENTS.md`.
- File `10` vÃ  `12` lÃ  log; khÃ´ng Ä‘á»ƒ rule quan trá»ng chá»‰ náº±m á»Ÿ Ä‘Ã³.
- KhÃ´ng lÆ°u secret tháº­t vÃ o repo hoáº·c tÃ i liá»‡u.
- KhÃ´ng tá»± push. Vá»›i 5fedu, production verification thÆ°á»ng cáº§n push/deploy, nhÆ°ng chá»‰ push khi user yÃªu cáº§u rÃµ trong session.
- Máº·c Ä‘á»‹nh verify 5fedu trÃªn production sau khi thay Ä‘á»•i Ä‘Ã£ Ä‘Æ°á»£c push/deploy; náº¿u user yÃªu cáº§u test local thÃ¬ Æ°u tiÃªn local.
- Náº¿u user yÃªu cáº§u `verify production háº¿t`, khÃ´ng nháº£y tháº³ng vÃ o browser. Äá»c index/mapping trÆ°á»›c, suy ra module/role/database/UI/export/cross-flow, rá»“i má»›i náº¡p context chi tiáº¿t vÃ  cháº¡y verify.
- Vá»›i task UI, bÃ¡o cÃ¡o cuá»‘i pháº£i nÃªu `Template checked` hoáº·c lÃ½ do khÃ´ng thá»ƒ kiá»ƒm template.
- Vá»›i task UI/module, bÃ¡o cÃ¡o cuá»‘i pháº£i nÃªu `Pattern fidelity` gá»“m reference Ä‘Ã£ dÃ¹ng vÃ  cÃ¡c pháº§n Ä‘Ã£ giá»¯ nguyÃªn tá»« pattern.
- Vá»›i task vá»«a/lá»›n, production, UI, permission, database, export hoáº·c cleanup, bÃ¡o cÃ¡o cuá»‘i pháº£i cÃ³ `Technical debt check`. Ná»£ nghiÃªm trá»ng trong scope pháº£i sá»­a trÆ°á»›c khi bÃ¡o `PASS`.

## Owner Feedback Gate

- App table primary key máº·c Ä‘á»‹nh lÃ  `id int8` auto-increment; foreign key tá»›i app table cÅ©ng lÃ  `int8`.
- Login dÃ¹ng `ten_dang_nhap`; admin máº·c Ä‘á»‹nh lÃ  `admin` / `5fedu.com`.
- TÃ i khoáº£n thÆ°á»ng máº·c Ä‘á»‹nh `123456`; khÃ´ng test Ä‘á»•i máº­t kháº©u trÃªn admin chÃ­nh.
- Supabase service role khÃ´ng bao giá» náº±m á»Ÿ client.
- CRUD khÃ´ng Ä‘Æ°á»£c mock áº£o khi feature Ä‘Ã£ yÃªu cáº§u tháº­t.
- Permission pháº£i test Ä‘a tÃ i khoáº£n, Ä‘a cáº¥p báº­c, UI vÃ  API/database náº¿u cÃ³ thá»ƒ.
- Dá»¯ liá»‡u liÃªn module pháº£i verify qua láº¡i: module nguá»“n, module phá»¥ thuá»™c, bÃ¡o cÃ¡o, dropdown, rollup, cache/query.
- Toolbar, filter, search, export, drawer, pagination vÃ  responsive behavior Ä‘á»u lÃ  bá» máº·t test tháº­t.

