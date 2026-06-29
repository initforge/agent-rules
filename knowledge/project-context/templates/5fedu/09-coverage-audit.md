# Coverage Audit

## Má»¥c tiÃªu

File nÃ y Ä‘á»‘i chiáº¿u prompt/áº£nh ban Ä‘áº§u vá»›i bá»™ context hiá»‡n táº¡i Ä‘á»ƒ trÃ¡nh máº¥t Ã½. Khi bá»• sung rule má»›i, cáº­p nháº­t audit náº¿u rule Ä‘Ã³ thay Ä‘á»•i pháº¡m vi hoáº·c cÃ¡ch AI pháº£i lÃ m viá»‡c.

## Káº¿t luáº­n hiá»‡n táº¡i

Bá»™ context Ä‘Ã£ Ä‘á»§ Ä‘á»ƒ AI lÃ m viá»‡c Ä‘á»™c láº­p theo Ä‘Ãºng hÆ°á»›ng 5fedu trong pháº¡m vi an toÃ n:

- Biáº¿t pháº£i Ä‘á»c `AGENTS.md` vÃ  context project-local khi lÃ m trong repo.
- Biáº¿t khÃ´ng cáº§n ngÆ°á»i dÃ¹ng gá»i `/5fedu` má»—i láº§n.
- Biáº¿t format/cÃ¡ch lÃ m máº·c Ä‘á»‹nh khi ngÆ°á»i dÃ¹ng Ä‘Æ°a Ã­t instruction.
- Biáº¿t pháº§n nÃ o pháº£i há»i láº¡i vÃ¬ lÃ  giÃ¡ trá»‹ cá»¥ thá»ƒ tá»«ng app.
- Biáº¿t khÃ´ng tá»± suy diá»…n credentials, schema production, permission rule cá»¥ thá»ƒ, hoáº·c sá»­a/xÃ³a lá»›n template.
- Biáº¿t scope hiá»‡n táº¡i lÃ  full app A-Z; khÃ´ng há»i ngÆ°á»i dÃ¹ng "module Ä‘áº§u tiÃªn/phase Ä‘áº§u".

## Äá»‘i chiáº¿u yÃªu cáº§u

| YÃªu cáº§u gá»‘c | ÄÃ£ phá»§ á»Ÿ Ä‘Ã¢u | Tráº¡ng thÃ¡i | Ghi chÃº |
| --- | --- | --- | --- |
| 5fedu cÃ³ convention/rule/workflow riÃªng theo dá»± Ã¡n | `AGENTS.md`, `00-index.md` | ÄÃ£ phá»§ | Context náº±m trong repo, khÃ´ng nhÃ©t full global |
| AGENTS.md trong dá»± Ã¡n hoáº·c bÄƒm nhá» file vÃ  AGENTS.md káº¿t ná»‘i | `AGENTS.md`, `context/5fedu/*.md` | ÄÃ£ phá»§ | AGENTS lÃ  con trá» nháº¹/loading policy |
| KhÃ´ng lÃ m phÃ¬nh global context | `AGENTS.md`, `00-index.md`, skill `5fedu-project` | ÄÃ£ phá»§ | Global chá»‰ giá»¯ `/5fedu` vÃ  skill scaffold/báº£o trÃ¬ |
| CÃ³ slash Ä‘á»ƒ setup/báº£o trÃ¬ context 5fedu | `C:\Users\ADMIN\.codex\prompts\5fedu.prompt.md` | ÄÃ£ phá»§ | Chá»‰ má»™t slash `/5fedu` |
| `/5fedu` khÃ´ng pháº£i lá»‡nh cáº¥p context má»—i láº§n | `AGENTS.md`, `00-index.md`, `06-decision-status.md` | ÄÃ£ phá»§ | Normal work tá»± Ä‘á»c AGENTS/context |
| Scope dá»± Ã¡n lÃ  full app A-Z | `00-index.md`, `06-decision-status.md`, `07-working-format.md` | ÄÃ£ chá»‘t | AI tá»± chia plan ná»™i bá»™ náº¿u cáº§n |
| Há»i Ä‘Ã ng hoÃ ng, khÃ´ng suy diá»…n lung tung | `00-index.md`, `06-decision-status.md`, `questions.md` | ÄÃ£ phá»§ | `CHUA_CHOT/CAN_HOI_THEM` pháº£i há»i |
| Sync vá»›i `initforge/agent-rules` | thao tÃ¡c sync Ä‘Ã£ cháº¡y; `skill/prompt` náº±m trong runtime | ÄÃ£ lÃ m | ChÆ°a commit/push náº¿u user chÆ°a yÃªu cáº§u |
| Tech stack áº£nh 1 | `01-tech-stack-and-template.md`, `06`, `07-working-format.md`, `08-source-examples.md` | ÄÃ£ chá»‘t cho app nÃ y | Náº¿u repo/source mÃ¢u thuáº«n thÃ¬ bÃ¡o |
| Google Sheets/AppSheet cÃ³ thá»ƒ cÃ³ credentials | `01`, `03`, `07`, `questions.md` | ÄÃ£ phá»§ | KhÃ´ng tá»± báº­t náº¿u spec khÃ´ng nÃ³i |
| Template `admin5fedu/5f-template-ket-noi-supabase` | `00`, `01`, `06`, `07`, `08`, `questions.md` | ÄÃ£ chá»‘t vÃ  Ä‘Ã£ clone source local | Source: `P:\5fedunew\template_5fedu\5f-template-ket-noi-supabase-main`; chá»‰nh sá»­a thÃ¬ bÃ¡o |
| Æ¯u tiÃªn thÃªm/adapt, háº¡n cháº¿ sá»­a/xÃ³a template | `01`, `07` | ÄÃ£ phá»§ | Sá»­a/xÃ³a lá»›n pháº£i bÃ¡o vÃ  chá»‘t |
| Domain/sidebar áº£nh 2 | `02`, `08` | ÄÃ£ phá»§ | DÃ¹ng lÃ m vÃ­ dá»¥, khÃ´ng Ã©p scope náº¿u app khÃ¡c |
| Module/view/tab áº£nh 3-4 | `02`, `08` | ÄÃ£ phá»§ | ÄÃ£ thÃªm Há»‡ thá»‘ng/Quáº£n lÃ½ váº­n táº£i máº«u |
| Mapping chÃ­nh xÃ¡c spec -> source/backend | `00`, `02`, `07`, `08` | ÄÃ£ phá»§ | KhÃ´ng code trÆ°á»›c khi mapping Ä‘á»§ pháº§n Ä‘ang lÃ m |
| Supabase tháº­t + credentials Ä‘áº§y Ä‘á»§, check format má»i credentials | `03`, `06`, `07`, `questions.md` | Supabase tháº­t Ä‘Ã£ chá»‘t; credential values chÆ°a cÃ³ | KhÃ´ng in/lÆ°u secret |
| Káº¿t ná»‘i frontend + database tháº­t, khÃ´ng nÃºt cháº¿t | `03`, `05`, `07` | ÄÃ£ phá»§ | Mock pháº£i ghi rÃµ pháº¡m vi |
| TÃ¡ch handler/service Ä‘á»ƒ dá»… check/debug | `03`, `07` | ÄÃ£ phá»§ | Khi code pháº£i map frontend -> service -> table |
| Database convention áº£nh 6 | `03`, `08` | ÄÃ£ phá»§ vÃ­ dá»¥ | Schema final váº«n cáº§n chá»‘t |
| Database structure áº£nh 7 | `03`, `07`, `08` | ÄÃ£ phá»§ | `id int8`, label, nhÃ³m, liÃªn káº¿t, mÃ´ táº£/ghi chÃº, tráº¡ng thÃ¡i, audit columns |
| Chat owner áº£nh 8 vá» `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat` | `03`, `07`, `08`, `06` | ÄÃ£ phá»§ | Báº£ng miá»…n `id_nguoi_tao` cáº§n chá»‘t tá»«ng báº£ng |
| Clean code, reusable, dá»… má»Ÿ rá»™ng | `05`, global clean-code rules | ÄÃ£ phá»§ | Khi code váº«n theo rule clean-code global |
| Folder theo chá»©c nÄƒng, tham kháº£o template | `05`, `07` | ÄÃ£ phá»§ | TÃªn thÆ° má»¥c module tiáº¿ng Viá»‡t |
| TÃªn submenu/thÆ° má»¥c module tiáº¿ng Viá»‡t | `02` | ÄÃ£ phá»§ | GiÃºp tra cá»©u cho ngÆ°á»i khÃ´ng biáº¿t tiáº¿ng Anh |
| TÃªn view dáº¡ng `nhan-vien-form` | `02` | ÄÃ£ phá»§ | Hybrid tiáº¿ng Viá»‡t khÃ´ng dáº¥u + suffix English |
| TÃªn báº£ng prefix submenu + module | `03`, `07` | ÄÃ£ phá»§ | Prefix Ä‘áº§y Ä‘á»§ cáº§n chá»‘t |
| Báº£ng Ä‘áº§y Ä‘á»§ cÃ³ policy authenticated, index, trigger `tg_cap_nhat` | `03`, `07` | ÄÃ£ phá»§ | â€œHÃ m indexâ€ cáº§n giáº£i thÃ­ch/máº«u |
| Fake email login | `04`, `07` | ÄÃ£ phá»§ | `admin` -> `admin@gmail.com` |
| Bá» Ä‘Äƒng kÃ½ | `04`, `07` | ÄÃ£ phá»§ | |
| TÃ i khoáº£n máº·c Ä‘á»‹nh admin/5fedu.com | `04`, `07` | ÄÃ£ phá»§ | |
| Module nhÃ¢n viÃªn rÃºt gá»n trÆ°á»ng | `04`, `07` | ÄÃ£ phá»§ | |
| Táº¡o/xÃ³a Supabase Auth theo `ten_dang_nhap@gmail.com`, password `123456` | `04` | ÄÃ£ phá»§ | HIGH risk, cáº§n plan trÆ°á»›c khi code |
| Responsive: desktop listview, mobile cardview | `02`, `07` | ÄÃ£ phá»§ | |
| Standard list/card/detail/form view theo template | `02`, `05` | ÄÃ£ phá»§ | |
| Flow Ä‘á»©ng Ä‘Ã¢u quay láº¡i Ä‘Ã³ | `04` | ÄÃ£ phá»§ | |
| Tab group cÃ³ `?tab=` | `02`, `07` | ÄÃ£ phá»§ | |
| Search cáº£ trÆ°á»ng trá»±c tiáº¿p vÃ  liÃªn káº¿t | `02`, `05`, `07` | ÄÃ£ phá»§ | |
| Notification demo | `02` | ÄÃ£ phá»§ | Icon demo, click bÃ¡o chÆ°a sáºµn cÃ³ |
| Permission máº·c Ä‘á»‹nh `xem/them/sua/xoa/quan_tri/tat_ca` | `04`, `07` | ÄÃ£ phá»§ | `tat_ca` khÃ´ng lÆ°u DB |
| VÃ­ dá»¥ phÃ¢n quyá»n Phiáº¿u hÃ nh chÃ­nh | `04` | ÄÃ£ phá»§ | |
| Module key Supabase chá»‰ slug module, vÃ­ dá»¥ `nhan-vien` | `02`, `04` | ÄÃ£ phá»§ | KhÃ´ng lÆ°u `he-thong/nhan-vien` |
| App-side permission, khÃ´ng cáº§n RLS máº·c Ä‘á»‹nh | `03`, `07` | ÄÃ£ phá»§ | |
| Tá»‘i Æ°u Supabase Egress + Vercel Edge Function cuá»‘i dá»± Ã¡n | `05`, `07` | ÄÃ£ phá»§ | Khi lÃ m pháº£i tra docs chÃ­nh thá»©c má»›i nháº¥t |
| Sau nÃ y bá»• sung rule khÃ´ng Ä‘Æ°á»£c missing | `AGENTS.md`, `/5fedu`, `06`, file audit nÃ y | ÄÃ£ phá»§ | DÃ¹ng `/5fedu` Ä‘á»ƒ báº£o trÃ¬ context |

## CÃ¡ch suy luáº­n khi user cáº¥p Ã­t instruction

AI Ä‘Æ°á»£c tá»± suy luáº­n theo thá»© tá»±:

1. Äá»c `AGENTS.md`, `00-index.md`, `06-decision-status.md`, `questions.md`.
2. Äá»c `07-working-format.md` Ä‘á»ƒ náº¯m format/cÃ¡ch lÃ m.
3. Äá»c `08-source-examples.md` Ä‘á»ƒ láº¥y vÃ­ dá»¥ neo theo áº£nh/spec ban Ä‘áº§u.
4. TÃ¬m trong template/source trÆ°á»›c khi táº¡o má»›i.
5. Äá» xuáº¥t mapping vÃ  cÃ¡c cÃ¢u há»i cÃ²n thiáº¿u.
6. Tá»± chia thá»© tá»± triá»ƒn khai ná»™i bá»™ náº¿u cáº§n, khÃ´ng há»i "phase Ä‘áº§u/module Ä‘áº§u tiÃªn" khi scope Ä‘Ã£ lÃ  full app.

AI khÃ´ng Ä‘Æ°á»£c tá»± chá»‘t cÃ¡c Ä‘iá»ƒm sau náº¿u chÆ°a cÃ³ nguá»“n:

- credentials
- schema/migration production
- permission rule cá»¥ thá»ƒ tá»«ng module
- xÃ³a/sá»­a lá»›n template
- prefix má»›i hoáº·c quy Æ°á»›c index chÆ°a cÃ³ máº«u
- app hiá»‡n táº¡i cÃ³ Ä‘Ãºng toÃ n bá»™ vÃ­ dá»¥ tá»« áº£nh hay khÃ´ng
## Cáº­p nháº­t audit 2026-05-31

| YÃªu cáº§u/pháº£n há»“i má»›i | ÄÃ£ phá»§ á»Ÿ Ä‘Ã¢u | Tráº¡ng thÃ¡i | Ghi chÃº |
| --- | --- | --- | --- |
| `id` cÃ¡c báº£ng pháº£i lÃ  `int8` tá»± Ä‘á»™ng tÄƒng dáº§n | `03-database-supabase.md`, `07-working-format.md`, `10-owner-feedback-lessons.md` | ÄÃ£ chá»‘t | Supabase há»— trá»£ identity/bigserial |
| KhÃ´ng dÃ¹ng `uuid` cho khÃ³a chÃ­nh báº£ng app náº¿u chÆ°a chá»‘t | `03`, `10` | ÄÃ£ chá»‘t | Cáº§n audit migration hiá»‡n táº¡i |
| Báº£ng nhÃ¢n viÃªn bá» trÆ°á»ng linh tinh | `04-auth-permissions-and-flows.md`, `10-owner-feedback-lessons.md` | ÄÃ£ chá»‘t | Chá»‰ giá»¯ trÆ°á»ng nghiá»‡p vá»¥ chÃ­nh tá»« source |
| Login dÃ¹ng `ten_dang_nhap`, khÃ´ng dÃ¹ng `ma_nhan_vien` | `04`, `07`, `10` | ÄÃ£ chá»‘t | LÃ  gate trÆ°á»›c khi má»Ÿ rá»™ng auth |
| ThÃªm/sá»­a/xÃ³a username pháº£i Ä‘á»“ng bá»™ Supabase Auth user | `04`, `10` | ÄÃ£ chá»‘t | Pháº£i qua server/admin path |
| Cáº§n Ä‘á»c Google Sheets qua browser Ä‘Ã£ Ä‘Äƒng nháº­p Google | `00-index.md`, `questions.md`, `10` | Äang thá»±c hiá»‡n | Playwright headed Ä‘Ã£ má»Ÿ Ä‘á»ƒ user auth Google |
| Hai Google Sheets public Ä‘Ã£ Ä‘Æ°á»£c táº£i/phÃ¢n tÃ­ch lÃ m source chÃ­nh | `11-current-sheets-source-map.md`, `06-decision-status.md` | ÄÃ£ chá»‘t | DÃ¹ng Ä‘á»ƒ Ä‘á»‘i chiáº¿u module/schema/rule trÆ°á»›c khi sá»­a code |

## Coverage Owner Feedback UI/Váº­n Táº£i 2026-05-31

| YÃªu cáº§u | File phá»§ | Tráº¡ng thÃ¡i | Ghi chÃº |
| --- | --- | --- | --- |
| Template giao diá»‡n `5f-template-ket-noi-supabase` | `00`, `06`, `12` | ÄÃ£ phá»§ | Template local á»Ÿ `template_5fedu/5f-template-ket-noi-supabase-main` |
| Trang chá»§ theo thá»© tá»± Quáº£n lÃ½ váº­n táº£i -> Há»‡ thá»‘ng -> ThÃ´ng tin báº£n quyá»n | `06`, `07`, `12` | ÄÃ£ phá»§ | LÃ  owner feedback DA_CHOT |
| NhÃ¢n viÃªn cÃ³ email thá»±c táº¿ riÃªng, khÃ´ng trá»™n fake auth email | `06`, `11`, `12` | ÄÃ£ phá»§ | Fake auth váº«n theo `ten_dang_nhap@gmail.com` |
| KhÃ´ng káº¿t luáº­n phÃ²ng ban/chá»©c vá»¥ rá»—ng khi chÆ°a kiá»ƒm tra Supabase/browser | `06`, `10`, `12` | ÄÃ£ phá»§ | DB hiá»‡n cÃ³ dá»¯ liá»‡u; náº¿u UI tráº¯ng kiá»ƒm tra Ä‘Æ°á»ng render/filter/env |
| TÃ i xáº¿ cÃ³ thá»ƒ lÃ  ngÆ°á»i ngoÃ i cÃ´ng ty | `06`, `10`, `11`, `12` | ÄÃ£ phá»§ | `id_nhan_vien` optional |
| Detail tÃ i xáº¿ cÃ³ lá»‹ch sá»­ chuyáº¿n xe/lÆ°Æ¡ng | `06`, `07`, `12` | ÄÃ£ phá»§ | KhÃ´ng chá»‰ render field thÃ´ |
| Äá»‹a Ä‘iá»ƒm/xe cÃ³ form/detail chuáº©n vÃ  lá»‹ch sá»­ liÃªn quan | `06`, `07`, `11`, `12` | ÄÃ£ phá»§ | KhÃ´ng CRUD generic há»i há»£t |
| Báº£ng lÆ°Æ¡ng dÃ¹ng combobox tÃ i xáº¿ | `06`, `07`, `10`, `12` | ÄÃ£ phá»§ | KhÃ´ng dÃ¹ng select thÃ´ |
| Báº£ng lÆ°Æ¡ng tá»± tÃ­nh tá»•ng lÆ°Æ¡ng chuyáº¿n, cÃ³ trá»« tiá»n khÃ¡c/tá»•ng cÃ²n láº¡i/in/duyá»‡t riÃªng | `06`, `07`, `10`, `12` | ÄÃ£ phá»§ | KhÃ´ng nháº­p tay tá»•ng náº¿u tÃ­nh Ä‘Æ°á»£c |
| Chuyáº¿n xe cha tá»± tÃ­nh tá»•ng chuyáº¿n/tá»•ng tiá»n tá»« chi tiáº¿t | `06`, `07`, `10`, `12` | ÄÃ£ phá»§ | KhÃ´ng nháº­p tay tá»•ng náº¿u cÃ³ dá»¯ liá»‡u con |
| Thá»‘ng kÃª chuyáº¿n Ä‘i lÃ m Ä‘Ãºng dashboard/report nghiá»‡p vá»¥ | `06`, `12` | ÄÃ£ phá»§ | Lá»c theo ngÃ y/chuyáº¿n/tÃ i xáº¿/Ä‘á»‹a Ä‘iá»ƒm/xe, cÃ³ lÆ°Æ¡ng/chi phÃ­ |


