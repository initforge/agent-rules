# Working Format

## Má»¥c tiÃªu

File nÃ y ghi khung format/cÃ¡ch lÃ m máº·c Ä‘á»‹nh Ä‘á»ƒ AI hiá»ƒu nÃªn lÃ m theo hÆ°á»›ng 5fedu, ká»ƒ cáº£ khi dá»¯ kiá»‡n cá»¥ thá»ƒ tá»«ng app chÆ°a chá»‘t.

NguyÃªn táº¯c: format cÃ³ thá»ƒ Ä‘Ã£ chá»‘t, nhÆ°ng giÃ¡ trá»‹ cá»¥ thá»ƒ váº«n pháº£i há»i náº¿u chÆ°a cÃ³ nguá»“n rÃµ.

## App vÃ  template

Format Ä‘Ã£ chá»‘t:

- Æ¯u tiÃªn dÃ¹ng template `https://github.com/tahdieuphoi-ctrl/TAH_app`.
- Vá»›i dá»± Ã¡n nÃ y: clone/adapt template lÃ  `DA_CHOT`; app name lÃ  `TAH APP`; scope lÃ  full app A-Z theo áº£nh/spec Ä‘Ã£ gá»­i.
- Template source local náº±m á»Ÿ `P:\tah-app-5f\.agents\template-source\TAH_app`.
- Khi scaffold/adapt, Ä‘á»c cáº¥u trÃºc template trÆ°á»›c rá»“i map spec vÃ o domain/module/view cÃ³ sáºµn.
- Æ¯u tiÃªn thÃªm hoáº·c adapt, háº¡n cháº¿ sá»­a/xÃ³a module template.
- Náº¿u cáº§n sá»­a/xÃ³a lá»›n, bÃ¡o lÃ½ do, rá»§i ro, file bá»‹ áº£nh hÆ°á»Ÿng vÃ  xin chá»‘t trÆ°á»›c.

KhÃ´ng há»i láº¡i:

- CÃ³ clone template khÃ´ng.
- App name lÃ  gÃ¬.
- LÃ m module Ä‘áº§u tiÃªn/phase Ä‘áº§u nÃ o.

Thay vÃ o Ä‘Ã³:

- Tá»± Ä‘á»c template/source.
- Map toÃ n bá»™ áº£nh/spec Ä‘Ã£ cÃ³.
- BÃ¡o cÃ¡o chá»— nÃ o giá»¯ nguyÃªn, chá»— nÃ o cáº§n adapt, chá»— nÃ o cáº§n há»i thÃªm vÃ¬ thiáº¿u dá»¯ kiá»‡n quyáº¿t Ä‘á»‹nh.

Náº¿u ngÆ°á»i dÃ¹ng Ä‘Æ°a Ã­t instruction:

- TrÆ°á»›c tiÃªn tÃ¬m module tÆ°Æ¡ng tá»± trong template.
- Náº¿u module Ä‘Ã£ cÃ³, láº­p bÃ¡o cÃ¡o adapt: giá»¯ gÃ¬, thÃªm gÃ¬, sá»­a gÃ¬, vÃ¬ sao.
- Náº¿u module chÆ°a cÃ³, táº¡o module má»›i theo cáº¥u trÃºc template gáº§n nháº¥t.
- **RÃ  soÃ¡t Gaps (Khoáº£ng trá»‘ng giao diá»‡n)**: Khi chuáº©n hÃ³a má»™t module theo máº«u chuáº©n vÃ ng (nhÆ° NhÃ¢n viÃªn), pháº£i linh hoáº¡t Ä‘á»‘i chiáº¿u Ä‘a chiá»u cáº£ spec/mÃ£ nguá»“n cÅ© cá»§a module Ä‘Ã³ láº«n template máº«u Ä‘á»ƒ nháº­n diá»‡n cÃ¡c thiáº¿u sÃ³t (gaps) khi káº¿t há»£p cáº£ hai. KhÃ´ng Ä‘Æ°á»£c Ã¡p dá»¥ng ráº­p khuÃ´n gÃ¢y máº¥t/thiáº¿u tÃ­nh nÄƒng nguyÃªn báº£n hoáº·c bá» sÃ³t cÃ¡c tÆ°Æ¡ng tÃ¡c áº©n (nhÆ° nÃºt sá»­a dÃ²ng khi chá»n, Ä‘á»•i tráº¡ng thÃ¡i hÃ ng loáº¡t, cÃ¡c nÃºt liÃªn há»‡ Ä‘á»™ng).

## Tech stack

Format Ä‘Ã£ chá»‘t:

- Máº·c Ä‘á»‹nh kiá»ƒm tra app theo hÆ°á»›ng React Vite TypeScript.
- UI theo Tailwind CSS vÃ  component ná»™i bá»™ `components/ui`.
- Server state theo TanStack Query, client state theo Zustand.
- Form theo React Hook Form + Zod.
- Backend theo Supabase PostgreSQL + Auth.
- Media theo Cloudinary náº¿u app cÃ³ upload/áº£nh.
- Vá»›i dá»± Ã¡n nÃ y, stack áº£nh 1 Ä‘Ã£ `DA_CHOT`; Google Sheets/AppSheet chá»‰ coi lÃ  kháº£ nÄƒng thÆ°á»ng gáº·p, khÃ´ng tá»± báº­t náº¿u spec khÃ´ng nÃ³i.

Chá»‰ há»i thÃªm náº¿u phÃ¡t hiá»‡n template/source khÃ¡c áº£nh/spec:

- Stack tháº­t trong repo mÃ¢u thuáº«n áº£nh/spec.
- CÃ³ Google Sheets/AppSheet khÃ´ng.

## Credentials

Format Ä‘Ã£ chá»‘t:

- Há»i credentials ngay Ä‘áº§u pháº§n backend/integration.
- Kiá»ƒm tra Ä‘Ãºng format mÃ  khÃ´ng in secret.
- KhÃ´ng lÆ°u secret tháº­t vÃ o repo, plan, docs, log, hoáº·c cÃ¢u tráº£ lá»i.
- Chá»‰ ghi tÃªn biáº¿n mÃ´i trÆ°á»ng, nÆ¡i cáº¥u hÃ¬nh, vÃ  cÃ¡ch verify khÃ´ng lá»™ giÃ¡ trá»‹.

Checklist credentials thÆ°á»ng gáº·p:

- Supabase URL: dáº¡ng `https://<project-ref>.supabase.co`.
- Supabase anon key: JWT public anon key.
- Supabase service role key: chá»‰ dÃ¹ng server/admin task, khÃ´ng Ä‘Æ°a vÃ o frontend.
- Database connection string/password: chá»‰ dÃ¹ng migration hoáº·c thao tÃ¡c DB trá»±c tiáº¿p.
- Cloudinary cloud name/upload preset/API credentials.
- Google Sheets/AppSheet credentials náº¿u dá»± Ã¡n dÃ¹ng.
- Vercel token/project/env náº¿u deploy hoáº·c Edge Function.

Vá»›i dá»± Ã¡n nÃ y: Supabase tháº­t lÃ  `DA_CHOT`; khÃ´ng máº·c Ä‘á»‹nh mock backend. Náº¿u chÆ°a cÃ³ credential values thÃ¬ ghi blocker Ä‘Ãºng tÃªn credential, khÃ´ng há»i láº¡i "cÃ³ dÃ¹ng Supabase tháº­t khÃ´ng".

## Database

Format Ä‘Ã£ chá»‘t:

- TÃªn báº£ng: viáº¿t táº¯t submenu + tÃªn module.
- Dáº¡ng Ä‘Ãºng: `hc_phieu_hanh_chinh`, `var_nhan_su`.
- KhÃ´ng dÃ¹ng tÃªn báº£ng kiá»ƒu route nhÆ° `nhan-su`, khÃ´ng báº¯t Ä‘áº§u báº±ng sá»‘.
- `id` dÃ¹ng `int8` náº¿u khÃ´ng cÃ³ lÃ½ do Ä‘Æ°á»£c chá»‘t khÃ¡c.
- Cá»™t liÃªn káº¿t dÃ¹ng dáº¡ng `id_<doi_tuong>`, vÃ­ dá»¥ `id_khach_hang`.
- `tg_tao` vÃ  `tg_cap_nhat` cÃ³ á»Ÿ má»i báº£ng.
- `id_nguoi_tao` cÃ³ á»Ÿ háº§u háº¿t báº£ng nghiá»‡p vá»¥, trá»« báº£ng há»‡ thá»‘ng/master data khi Ä‘Æ°á»£c chá»‘t.
- Báº£ng Ä‘áº§y Ä‘á»§ cáº§n policy authenticated, index/search convention, trigger cáº­p nháº­t `tg_cap_nhat`.

### Quy cháº¿ liÃªn káº¿t cÃ¡c báº£ng dÃ­nh nhau (Table Relations Convention):
- Khi thay Ä‘á»•i cáº¥u trÃºc hoáº·c há»£p nháº¥t báº£ng (vÃ­ dá»¥: gá»™p `vt_tai_xe` vÃ o `var_nhan_vien`), báº¥t ká»³ cáº­p nháº­t schema (migration) nÃ o cÅ©ng pháº£i thá»±c hiá»‡n **trong cÃ¹ng má»™t transaction** (`begin; ... commit;`) Ä‘á»ƒ Ä‘áº£m báº£o tÃ­nh nguyÃªn tá»­.
- Báº¯t buá»™c pháº£i **quÃ©t sáº¡ch vÃ  chuyá»ƒn Ä‘á»•i toÃ n bá»™ khÃ³a ngoáº¡i cÅ© sang khÃ³a ngoáº¡i má»›i** á»Ÿ táº¥t cáº£ cÃ¡c báº£ng tham chiáº¿u cÃ³ liÃªn quan.
- **Xá»­ lÃ½ dá»¯ liá»‡u má»“ cÃ´i (Orphaned Records)**: Khi thay Ä‘á»•i khÃ³a ngoáº¡i liÃªn káº¿t, náº¿u báº£ng tham chiáº¿u cÃ³ dÃ²ng dá»¯ liá»‡u trá» vá» ID khÃ´ng cÃ²n tá»“n táº¡i, **cáº¥m tá»± Ã½ xÃ³a bá» dá»¯ liá»‡u** cá»§a ngÆ°á»i dÃ¹ng. Thay vÃ o Ä‘Ã³, pháº£i di chuyá»ƒn cÃ¡c báº£n ghi má»“ cÃ´i nÃ y vÃ o báº£ng gá»‘c má»›i báº±ng Ä‘Ãºng ID cÅ© cá»§a chÃºng, Ä‘iá»n cÃ¡c trÆ°á»ng báº¯t buá»™c (`NOT NULL`) báº±ng giÃ¡ trá»‹ máº·c Ä‘á»‹nh há»£p lá»‡ (vÃ­ dá»¥: `ten_dang_nhap = 'username'`) trÆ°á»›c khi kÃ­ch hoáº¡t rÃ ng buá»™c khÃ³a ngoáº¡i má»›i.
- Thiáº¿t láº­p cÃ¡c trigger tÃ­nh toÃ¡n tá»± Ä‘á»™ng á»Ÿ má»©c Database Ä‘á»ƒ Ä‘á»“ng bá»™ hÃ³a sá»‘ liá»‡u tá»©c thá»i giá»¯a cÃ¡c báº£ng dÃ­nh nhau (nhÆ° tá»« chuyáº¿n xe chi tiáº¿t -> chuyáº¿n xe -> báº£ng lÆ°Æ¡ng), ngÄƒn ngá»«a trÃ´i lá»‡ch sá»‘ liá»‡u.
- **Xá»­ lÃ½ Thá»±c thá»ƒ Con Má»“ CÃ´i trÃªn Giao diá»‡n PhÃ¢n cáº¥p (Orphaned Nodes rendering)**: Äá»‘i vá»›i cÃ¡c thá»±c thá»ƒ con (vÃ­ dá»¥: Chá»©c vá»¥) Ä‘Æ°á»£c hiá»ƒn thá»‹ trÃªn giao diá»‡n nhÃ³m theo thá»±c thá»ƒ cha (vÃ­ dá»¥: PhÃ²ng ban):
  1. Khi má»™t thá»±c thá»ƒ cha bá»‹ xÃ³a vÃ  cÆ¡ sá»Ÿ dá»¯ liá»‡u sá»­ dá»¥ng rÃ ng buá»™c `ON DELETE SET NULL`, cÃ¡c thá»±c thá»ƒ con sáº½ bá»‹ máº¥t liÃªn káº¿t (`phong_ban_id = null`).
  2. Cáº¥m áº©n hoÃ n toÃ n (tÃ ng hÃ¬nh) cÃ¡c thá»±c thá»ƒ con nÃ y trÃªn giao diá»‡n quáº£n lÃ½. Báº¯t buá»™c thuáº­t toÃ¡n dá»±ng cÃ¢y (render) pháº£i gom táº¥t cáº£ cÃ¡c thá»±c thá»ƒ má»“ cÃ´i nÃ y vÃ o má»™t nhÃ³m giáº£ láº­p á»Ÿ cuá»‘i danh sÃ¡ch (vÃ­ dá»¥: "Chá»©c vá»¥ chÆ°a phÃ¢n phÃ²ng ban") Ä‘á»ƒ ngÆ°á»i dÃ¹ng cÃ³ thá»ƒ nhÃ¬n tháº¥y, chá»‰nh sá»­a gÃ¡n láº¡i phÃ²ng ban há»£p lá»‡ hoáº·c thá»±c hiá»‡n xÃ³a thá»§ cÃ´ng.
  3. Báº¯t buá»™c Ä‘á»“ng bá»™ logic lá»c/hiá»ƒn thá»‹: Khi táº¡o má»›i hoáº·c chá»‰nh sá»­a thá»±c thá»ƒ con trÃªn UI, pháº£i Ä‘áº·t trÆ°á»ng chá»n thá»±c thá»ƒ cha lÃ  báº¯t buá»™c (`required`). Äá»“ng thá»i, cÃ¡c dropdown chá»n á»Ÿ phÃ¢n há»‡ khÃ¡c (vÃ­ dá»¥: chá»n Chá»©c vá»¥ khi thÃªm NhÃ¢n viÃªn) pháº£i Ä‘á»“ng nháº¥t, trÃ¡nh hiá»‡n tÆ°á»£ng báº¥t nháº¥t dá»¯ liá»‡u ("cÃ³ trong DB, hiá»ƒn thá»‹ á»Ÿ form thÃªm nhÃ¢n viÃªn nhÆ°ng tÃ ng hÃ¬nh á»Ÿ trang quáº£n lÃ½ chá»©c vá»¥").


Dá»¯ kiá»‡n cáº§n há»i theo app:

- Prefix submenu Ä‘áº§y Ä‘á»§.
- SQL/table máº«u náº¿u cÃ³.
- "HÃ m index" nghÄ©a chÃ­nh xÃ¡c lÃ  SQL index, search function/RPC, hay convention riÃªng.
- Báº£ng nÃ o Ä‘Æ°á»£c miá»…n `id_nguoi_tao`.

## Frontend mapping

Format Ä‘Ã£ chá»‘t:

```text
spec -> submenu/domain -> module -> view -> tab -> route -> source path -> database table -> service/handler
```

- KhÃ´ng code trÆ°á»›c khi mapping Ä‘á»§ cho pháº§n Ä‘ang lÃ m.
- Náº¿u áº£nh/spec thiáº¿u rÃµ, há»i thÃªm.
- Search pháº£i bao phá»§ trÆ°á»ng trá»±c tiáº¿p vÃ  trÆ°á»ng liÃªn káº¿t hiá»ƒn thá»‹.
- Desktop Æ°u tiÃªn list view, mobile Æ°u tiÃªn card view.
- Module nhiá»u tab pháº£i giá»¯ tab hiá»‡n táº¡i trÃªn router query `?tab=...`.

VÃ­ dá»¥ mapping vÃ  schema rÃºt tá»« áº£nh/spec ban Ä‘áº§u náº±m á»Ÿ `context/5fedu/08-source-examples.md`.

## Auth vÃ  permission

Format Ä‘Ã£ chá»‘t:

- Login fake email: nháº­p `admin` thÃ¬ dÃ¹ng `admin@gmail.com`.
- Bá» Ä‘Äƒng kÃ½ máº·c Ä‘á»‹nh.
- Account máº·c Ä‘á»‹nh: `admin` / `5fedu.com`.
- Module nhÃ¢n viÃªn giá»¯ trÆ°á»ng chÃ­nh, khÃ´ng kÃ©o theo cÃ¡c trÆ°á»ng rÆ°á»m rÃ  náº¿u app khÃ´ng cáº§n.
- Quyá»n máº·c Ä‘á»‹nh dÃ¹ng `xem`, `them`, `sua`, `xoa`, `quan_tri`; `tat_ca` chá»‰ lÃ  UI helper, khÃ´ng lÆ°u thÃ nh quyá»n riÃªng.
- Permission xá»­ lÃ½ app-side máº·c Ä‘á»‹nh, khÃ´ng tá»± Ä‘áº©y sang Supabase RLS náº¿u chÆ°a Ä‘Æ°á»£c yÃªu cáº§u.

### TiÃªu chuáº©n hoÃ n thiá»‡n ÄÄƒng kÃ½ / Äá»•i máº­t kháº©u:
- **ÄÄƒng kÃ½ (Registration)**: KhÃ´ng cÃ³ mÃ n hÃ¬nh Ä‘Äƒng kÃ½ cÃ´ng khai. Luá»“ng Ä‘Äƒng kÃ½ Ä‘Æ°á»£c thay tháº¿ hoÃ n toÃ n báº±ng luá»“ng táº¡o tÃ i khoáº£n cá»§a quáº£n trá»‹ viÃªn (Admin táº¡o NhÃ¢n viÃªn, há»‡ thá»‘ng tá»± Ä‘á»™ng gá»i API `/api/employee-auth-sync` Ä‘á»ƒ Ä‘Äƒng kÃ½ tÃ i khoáº£n Auth cá»§a Supabase vá»›i máº­t kháº©u máº·c Ä‘á»‹nh `123456`).
- **Äá»•i máº­t kháº©u (Password Change)**: Pháº£i sá»­ dá»¥ng API thá»±c táº¿ (`supabase.auth.updateUser({ password })`). Tuyá»‡t Ä‘á»‘i cáº¥m sá»­ dá»¥ng mÃ£ giáº£ (mock) hoáº·c thÃ´ng bÃ¡o thÃ nh cÃ´ng áº£o. Sau khi Ä‘á»•i máº­t kháº©u thÃ nh cÃ´ng:
  - Há»‡ thá»‘ng pháº£i buá»™c Ä‘Äƒng xuáº¥t hoáº·c lÃ m má»›i phiÃªn.
  - Pháº£i kiá»ƒm thá»­ thá»±c táº¿ (Smoke test) báº±ng cÃ¡ch Ä‘Äƒng nháº­p láº¡i báº±ng máº­t kháº©u cÅ© (Ä‘á»ƒ cháº¯c cháº¯n máº­t kháº©u cÅ© **bá»‹ tá»« chá»‘i**) vÃ  máº­t kháº©u má»›i (Ä‘á»ƒ cháº¯c cháº¯n máº­t kháº©u má»›i **Ä‘Æ°á»£c cháº¥p nháº­n**).
  - Káº¿t thÃºc kiá»ƒm thá»­ pháº£i khÃ´i phá»¥c máº­t kháº©u tÃ i khoáº£n vá» máº·c Ä‘á»‹nh cá»§a há»‡ thá»‘ng.


Dá»¯ kiá»‡n cáº§n há»i theo module:

- Rule xem/thÃªm/sá»­a/xÃ³a/quáº£n trá»‹ cá»¥ thá»ƒ.
- Pháº¡m vi xem theo cÃ¡ nhÃ¢n/phÃ²ng/nhÃ³m/cáº¥p báº­c.
- Module cÃ³ ngoáº¡i lá»‡ so vá»›i default khÃ´ng.

## Delivery

Format Ä‘Ã£ chá»‘t:

- KhÃ´ng Ä‘á»ƒ nÃºt báº¥m khÃ´ng pháº£n há»“i hoáº·c flow giáº£ vá» thÃ nh cÃ´ng.
- Náº¿u mock, ghi rÃµ mock á»Ÿ Ä‘Ã¢u vÃ  Ä‘iá»u kiá»‡n chuyá»ƒn sang tháº­t.
- TrÆ°á»›c khi bÃ¡o xong pháº£i verify theo pháº§n Ä‘Ã£ lÃ m.
- Giai Ä‘oáº¡n gáº§n bÃ n giao pháº£i láº­p plan tá»‘i Æ°u Supabase Egress + Vercel Edge Function vÃ  tra docs chÃ­nh thá»©c má»›i nháº¥t.

## Khi instruction Ã­t

AI Ä‘Æ°á»£c phÃ©p tá»± suy luáº­n trong pháº¡m vi format Ä‘Ã£ chá»‘t:

- Suy luáº­n vá»‹ trÃ­ cáº§n Ä‘á»c trong template.
- Äá» xuáº¥t mapping spec -> module/view/table.
- Äá» xuáº¥t schema draft theo format 5fedu.
- Äá» xuáº¥t service/handler tÃ¡ch riÃªng Ä‘á»ƒ dá»… debug.
- Tá»± láº­p thá»© tá»± triá»ƒn khai full app theo dependency, vÃ­ dá»¥ template -> env -> schema -> auth -> services -> UI mapping -> QA, nhÆ°ng khÃ´ng há»i ngÆ°á»i dÃ¹ng chá»n "phase Ä‘áº§u".

AI khÃ´ng Ä‘Æ°á»£c tá»± chá»‘t:

- credentials tháº­t
- schema/migration tháº­t
- xÃ³a/sá»­a lá»›n template
- permission rule cá»¥ thá»ƒ náº¿u ngÆ°á»i dÃ¹ng chÆ°a Ä‘Æ°a
- báº­t RLS thay cho app-side permission
- dÃ¹ng mock khi ngÆ°á»i dÃ¹ng yÃªu cáº§u ná»‘i tháº­t
- thu háº¹p scope thÃ nh má»™t module Ä‘áº§u tiÃªn khi ngÆ°á»i dÃ¹ng Ä‘Ã£ chá»‘t lÃ m full app A-Z

## Owner Feedback Gate & Platform Separation

### 1. PhÃ¢n biá»‡t Ná»n táº£ng Äá»™c láº­p (.agents/ vs .codex/)
* **Antigravity (Agent)**: Sá»­ dá»¥ng cÃ¡c quy táº¯c, log vÃ  mapping Ä‘áº·t táº¡i `context/5fedu/`.
* **Codex (CLI)**: Sá»­ dá»¥ng cÃ¡c cáº¥u hÃ¬nh Ä‘áº·t táº¡i `context/5fedu/`.
AI pháº£i tá»± nháº­n diá»‡n mÃ´i trÆ°á»ng runtime Ä‘á»ƒ truy cáº­p Ä‘Ãºng thÆ° má»¥c ná»n táº£ng, khÃ´ng hoÃ¡n Ä‘á»•i hoáº·c sá»­ dá»¥ng nháº§m tá»‡p cá»§a nhau.

### 2. NguyÃªn táº¯c Tiáº¿n hÃ³a tá»« Feedback (Quy táº¯c Cá»©ng)
* CÃ¡c tá»‡p `context/5fedu/10-owner-feedback-lessons.md` vÃ  `context/5fedu/12-owner-feedback-transport-ui.md` Ä‘Ã³ng vai trÃ² lÃ  **lá»‹ch sá»­ pháº£n há»“i thÃ´** vÃ  **mapping Ä‘áº·c thÃ¹ dá»± Ã¡n** (link sheets, danh sÃ¡ch quan há»‡...).
* Khi cÃ¡c bug hoáº·c yÃªu cáº§u chá»‰nh sá»­a trong file 10-12 Ä‘Ã£ Ä‘Æ°á»£c giáº£i quyáº¿t, toÃ n bá»™ cÃ¡c quy luáº­t rÃºt ra (vÃ­ dá»¥: ID lÃ  `int8`, Ä‘Äƒng nháº­p `ten_dang_nhap`, footer phÃ¢n trang, nÃºt duyá»‡t tÃ¡ch biá»‡t) **báº¯t buá»™c pháº£i Ä‘Æ°á»£c chuyá»ƒn hÃ³a thÃ nh luáº­t ná»n toÃ n cá»¥c** (trong `07-working-format.md`, `00-antigravity-runtime-intent.md` hoáº·c `global-rules.md`). KhÃ´ng Ä‘á»ƒ quy Ä‘á»‹nh kiáº¿n trÃºc chung á»Ÿ dáº¡ng text feedback thÃ´ Ä‘á»ƒ trÃ¡nh loÃ£ng context.

### 3. Checklist Kiá»ƒm soÃ¡t Pháº£n há»“i (Owner Feedback Gate)

Khi lÃ m database/auth/nhÃ¢n viÃªn/giao diá»‡n, pháº£i cháº¡y checklist nÃ y trÆ°á»›c khi code:

- `id` báº£ng app Ä‘Ã£ lÃ  `int8` auto increment chÆ°a?
- CÃ³ dÃ¹ng nháº§m `uuid` cho `id` khÃ´ng?
- Foreign key tá»›i báº£ng app Ä‘Ã£ lÃ  `int8` chÆ°a?
- Báº£ng nhÃ¢n viÃªn cÃ³ Ä‘ang bá»‹ thÃªm trÆ°á»ng linh tinh ngoÃ i source khÃ´ng?
- Login cÃ³ dÃ¹ng Ä‘Ãºng `ten_dang_nhap` thay vÃ¬ `ma_nhan_vien` khÃ´ng?
- ThÃªm/sá»­a/xÃ³a `ten_dang_nhap` Ä‘Ã£ Ä‘á»“ng bá»™ Supabase Auth qua server/admin path chÆ°a?
- ÄÃ£ Ä‘á»c `context/5fedu/10-owner-feedback-lessons.md` vÃ  `context/5fedu/12-owner-feedback-transport-ui.md` Ä‘á»ƒ láº¥y mapping vÃ  log thÃ´ chÆ°a?

Náº¿u cÃ¢u tráº£ lá»i nÃ o lÃ  chÆ°a, dá»«ng triá»ƒn khai vÃ  sá»­a mapping/schema/plan trÆ°á»›c.

## Quy Táº¯c Thiáº¿t Káº¿ Giao Diá»‡n (UI) & Nghiá»‡p Vá»¥ Váº­n Táº£i (Quy Táº¯c Cá»©ng)

1. **Thá»© Tá»± Danh Má»¥c TrÃªn Trang Chá»§**:
   - Menu Ä‘iá»u hÆ°á»›ng pháº£i sáº¯p xáº¿p theo Ä‘Ãºng thá»© tá»±:
     1. `Quáº£n lÃ½ váº­n táº£i`
     2. `Há»‡ thá»‘ng`
     3. `ThÃ´ng tin báº£n quyá»n`

2. **Thiáº¿t Káº¿ Form & Detail Drawer**:
   - Táº¥t cáº£ cÃ¡c module pháº£i thiáº¿t káº¿ form nháº­p liá»‡u vÃ  mÃ n chi tiáº¿t (Detail Drawer) theo chuáº©n cá»§a template, khÃ´ng sá»­ dá»¥ng CRUD generic thÃ´.
   - **Footer Drawer Chi tiáº¿t**: Footer pháº£i sá»­ dá»¥ng layout, vá»‹ trÃ­ nÃºt, kÃ­ch thÆ°á»›c nÃºt vÃ  nhÃ£n nÃºt theo reference drawer hiá»‡n cÃ³ cá»§a template.
   - **Form Drawer Footer**: CÃ¡c form drawer (ThÃªm/Sá»­a) pháº£i tÃ¡i sá»­ dá»¥ng footer/action primitive chuáº©n cá»§a dá»± Ã¡n thay vÃ¬ code tay thá»§ cÃ´ng.
   - **Icon Hiá»ƒn Thá»‹**: CÃ¡c trÆ°á»ng thÃ´ng tin chi tiáº¿t trong Drawer cáº§n cÃ³ icon Lucide tÆ°Æ¡ng á»©ng Ä‘á»©ng trÆ°á»›c nhÃ£n (label) Ä‘á»ƒ tÄƒng tÃ­nh tháº©m má»¹ vÃ  dá»… Ä‘á»c.
   - **Icon Trong Ã” Báº£ng (Cell Icons)**: CÃ¡c giÃ¡ trá»‹ dá»¯ liá»‡u chÃ­nh trong Ã´ cá»§a báº£ng pháº£i hiá»ƒn thá»‹ kÃ¨m icon theo helper/pattern hiá»‡n cÃ³ náº¿u template Ä‘ang dÃ¹ng cÃ¡ch nÃ y.
   - **NÃºt Chá»‰nh Sá»­a**: Sá»­ dá»¥ng Ä‘á»“ng bá»™ icon chá»‰nh sá»­a theo template/app hiá»‡n táº¡i cho cÃ¹ng má»™t hÃ nh Ä‘á»™ng, khÃ´ng trá»™n nhiá»u icon khÃ¡c nhau.

3. **CÆ¡ Cháº¿ TÃ­nh ToÃ¡n Tá»± Äá»™ng**:
   - CÃ¡c trÆ°á»ng tá»•ng há»£p (nhÆ° `so_chuyen`, `tong_tien_luong`, `tong_phi`, `tong_luong_chuyen`, `tong_chi_phi_chuyen`, `tong_con_lai`) báº¯t buá»™c pháº£i tÃ­nh tá»± Ä‘á»™ng tá»« báº£ng chi tiáº¿t hoáº·c dá»¯ liá»‡u chuyáº¿n xe thá»±c táº¿.
   - Tuyá»‡t Ä‘á»‘i cáº¥m cho phÃ©p ngÆ°á»i dÃ¹ng nháº­p tay cÃ¡c giÃ¡ trá»‹ nÃ y.

4. **TrÆ°á»ng LiÃªn Káº¿t Lá»›n (Relations)**:
   - CÃ¡c trÆ°á»ng nháº­p liá»‡u liÃªn quan Ä‘áº¿n Ä‘á»‘i tÆ°á»£ng lá»›n (nhÆ° tÃ i xáº¿, Ä‘á»‹a Ä‘iá»ƒm, xe, chuyáº¿n xe) báº¯t buá»™c pháº£i sá»­ dá»¥ng `Combobox` hoáº·c `AsyncCombobox` há»— trá»£ tÃ¬m kiáº¿m, cáº¥m sá»­ dá»¥ng tháº» `<select>` thÃ´.
   - Thiáº¿t láº­p há»— trá»£ tÃ i xáº¿ ngoÃ i cÃ´ng ty: ThÃ´ng tin tÃ i xáº¿ pháº£i cho phÃ©p nháº­p Ä‘á»™c láº­p, liÃªn káº¿t `id_nhan_vien` (nhÃ¢n viÃªn ná»™i bá»™) lÃ  tÃ¹y chá»n (optional).

5. **PhÃ¢n TÃ¡ch Action & Form**:
   - CÃ¡c hÃ nh Ä‘á»™ng nghiá»‡p vá»¥ (nhÆ° `Duyá»‡t` chuyáº¿n Ä‘i/báº£ng lÆ°Æ¡ng, `In` báº£ng lÆ°Æ¡ng, `Xuáº¥t` bÃ¡o cÃ¡o) pháº£i tÃ¡ch biá»‡t hoÃ n toÃ n khá»i form nháº­p liá»‡u. NÃºt duyá»‡t khÃ´ng Ä‘Æ°á»£c Ä‘áº·t bÃªn trong form.

6. **Hiá»ƒn Thá»‹ Lá»‹ch Sá»­ LiÃªn Quan (Detail History)**:
   - MÃ n hÃ¬nh chi tiáº¿t cá»§a cÃ¡c thá»±c thá»ƒ chÃ­nh pháº£i render danh sÃ¡ch lá»‹ch sá»­ tÆ°Æ¡ng á»©ng:
     - **Chi tiáº¿t tÃ i xáº¿**: Hiá»ƒn thá»‹ lá»‹ch sá»­ chuyáº¿n xe vÃ  lá»‹ch sá»­ lÆ°Æ¡ng.
     - **Chi tiáº¿t Ä‘á»‹a Ä‘iá»ƒm**: Hiá»ƒn thá»‹ danh sÃ¡ch chuyáº¿n xe/chuyáº¿n chi tiáº¿t liÃªn quan.
     - **Chi tiáº¿t xe**: Hiá»ƒn thá»‹ lá»‹ch sá»­ chuyáº¿n xe Ä‘Ã£ cháº¡y.

7. **TrÃ¬nh BÃ y Báº£ng & PhÃ¢n Trang**:
   - **Äá»“ng Bá»™ ChÃ¢n Trang PhÃ¢n Trang**: Táº¥t cáº£ cÃ¡c báº£ng dá»¯ liá»‡u, ká»ƒ cáº£ báº£ng bÃ¡o cÃ¡o/thá»‘ng kÃª tÃ¹y chá»‰nh, pháº£i sá»­ dá»¥ng chÃ¢n trang phÃ¢n trang chuáº©n cá»§a template. KhÃ´ng Ä‘á»ƒ báº£ng tráº§n khÃ´ng cÃ³ footer phÃ¢n trang.
   - **Tiáº¿ng Viá»‡t HÃ³a Header**: TÃªn cÃ¡c cá»™t trong báº£ng khi render Ä‘á»™ng pháº£i Ä‘Æ°á»£c Ã¡nh xáº¡ qua bá»™ tá»« Ä‘iá»ƒn dá»‹ch `HEADER_LABELS` Ä‘á»ƒ hiá»ƒn thá»‹ tiáº¿ng Viá»‡t cÃ³ dáº¥u chuáº©n hÃ³a, khÃ´ng hiá»ƒn thá»‹ key DB thÃ´.
   - **NÃºt Xuáº¥t (Export)**: Chuyá»ƒn nÃºt Xuáº¥t trÃªn thanh cÃ´ng cá»¥ thÃ nh dáº¡ng chá»‰ hiá»ƒn thá»‹ biá»ƒu tÆ°á»£ng Táº£i xuá»‘ng (Download icon-only kÃ¨m tooltip mÃ´ táº£), khÃ´ng dÃ¹ng text nÃºt to báº£n.
    - **Quy chuáº©n Äá»‹nh dáº¡ng Excel & PDF khi Xuáº¥t (Excel & PDF Export Format, Style & Font Preloading)**: Má»i thao tÃ¡c xuáº¥t dá»¯ liá»‡u ra file Excel (.xlsx) vÃ  PDF pháº£i tuÃ¢n thá»§ thiáº¿t káº¿ chuyÃªn nghiá»‡p vÃ  Ä‘á»‹nh dáº¡ng rÃµ rÃ ng:
      - **Äá»“ng bá»™ Excel**: Header cá»§a file Excel pháº£i cÃ³ font chá»¯ Segoe UI, in Ä‘áº­m, mÃ u chá»¯ tráº¯ng (#FFFFFF) vÃ  ná»n Ã´ lÃ  mÃ u xanh dÆ°Æ¡ng Ä‘áº­m thÆ°Æ¡ng hiá»‡u (#1E3A8A). CÃ¡c cá»™t sá»‘ liá»‡u (tiá»n lÆ°Æ¡ng, chi phÃ­, doanh thu, sá»‘ lÆ°á»£ng...) báº¯t buá»™c pháº£i Ä‘Æ°á»£c xuáº¥t dÆ°á»›i dáº¡ng Number thá»±c táº¿ (cell type 'n') kÃ¨m numFmt: "#,##0". CÃ¡c Ã´ Tá»•ng cá»™ng báº¯t buá»™c dÃ¹ng cÃ´ng thá»©c Ä‘á»™ng (vÃ­ dá»¥: SUM). ÄÃ³ng bÄƒng dÃ²ng tiÃªu Ä‘á» vÃ  báº­t hiá»ƒn thá»‹ Ä‘Æ°á»ng lÆ°á»›i.
      - **Äá»“ng bá»™ PDF**:
        - Pháº£i in hoa tiÃªu Ä‘á» tiáº¿ng Viá»‡t cÃ³ dáº¥u, cá»¡ font 14pt, chá»¯ Ä‘áº­m mÃ u Navy #1E3A8A cÄƒn giá»¯a. Subtitle cÄƒn giá»¯a dáº¡ng: Xuáº¥t ngÃ y: YYYY-MM-DD, Tá»•ng sá»‘: X báº£n ghi.
        - ÄVT: Náº¿u báº£ng cÃ³ sá»‘ tiá»n, hiá»ƒn thá»‹ dÃ²ng nhá»: ÄÆ¡n vá»‹ tÃ­nh: Äá»“ng (VNÄ) cÄƒn lá» pháº£i ngay trÃªn báº£ng.
        - Cá»™t dá»¯ liá»‡u: Sá»‘/tiá»n cÄƒn pháº£i (right), ngÃ y thÃ¡ng/tráº¡ng thÃ¡i/biá»ƒn sá»‘ cÄƒn giá»¯a (center), cÃ¡c cá»™t chá»¯ khÃ¡c cÄƒn trÃ¡i (left). Dá»¯ liá»‡u tiá»n pháº£i Ä‘Æ°á»£c format vi-VN kÃ¨m kÃ½ tá»± dong.
        - Header báº£ng mÃ u Navy #1E3A8A chá»¯ tráº¯ng Ä‘áº­m, cá»¡ 7.5pt, cell padding 2.5mm.
        - Bá»• sung footer in chÃ¬m tÃªn há»‡ thá»‘ng vÃ  Trang X trÃªn Y á»Ÿ táº¥t cáº£ cÃ¡c trang.
      - **Quy chuáº©n Tinh gá»n**: KhÃ´ng hiá»ƒn thá»‹ cÃ¡c khá»‘i chá»¯ kÃ½ hoáº·c cÃ¡c thÃ´ng tin doanh nghiá»‡p chi tiáº¿t (Ä‘á»‹a chá»‰, sá»‘ Ä‘iá»‡n thoáº¡i, email) trÃªn tÃ i liá»‡u xuáº¥t Excel/PDF/BÃ¡o cÃ¡o Ä‘á»ƒ tá»‘i giáº£n giao diá»‡n vÃ  trÃ¡nh rÆ°á»m rÃ .
      - **ÄÆ¡n vá»‹ tÃ­nh (ÄVT)**: Má»i tiÃªu Ä‘á» bÃ¡o cÃ¡o xuáº¥t ra pháº£i chá»‰ rÃµ Ä‘Æ¡n vá»‹ tÃ­nh.
      - **TÃªn file tiáº¿ng Viá»‡t**: Khi gá»i ExportDialog, luÃ´n truyá»n fileName=config.title thay vÃ¬ slug config.id Ä‘á»ƒ file lÆ°u cÃ³ tÃªn rÃµ nghÄ©a.
      - **Excel Style chi tiáº¿t**:
      - Header cá»§a file Excel pháº£i cÃ³ font chá»¯ Segoe UI, in Ä‘áº­m, mÃ u chá»¯ tráº¯ng (`#FFFFFF`) vÃ  ná»n Ã´ lÃ  mÃ u xanh dÆ°Æ¡ng Ä‘áº­m thÆ°Æ¡ng hiá»‡u (`#1E3A8A`). CÃ¡c Ã´ header pháº£i cÃ³ viá»n má»ng vÃ  cÄƒn giá»¯a.
     - CÃ¡c cá»™t sá»‘ liá»‡u (tiá»n lÆ°Æ¡ng, chi phÃ­, doanh thu, sá»‘ lÆ°á»£ng...) báº¯t buá»™c pháº£i Ä‘Æ°á»£c xuáº¥t dÆ°á»›i dáº¡ng **Number thá»±c táº¿ (cell type 'n')**, khÃ´ng Ä‘Æ°á»£c xuáº¥t dÆ°á»›i dáº¡ng String/Text (cell type 's') Ä‘á»ƒ trÃ¡nh lá»—i cáº£nh bÃ¡o cá»§a Excel (green triangle) vÃ  cho phÃ©p ngÆ°á»i dÃ¹ng sá»­ dá»¥ng cÃ¡c hÃ m tÃ­nh toÃ¡n (SUM, AVERAGE, v.v.). Äá»“ng thá»i, Ä‘á»‹nh dáº¡ng hiá»ƒn thá»‹ sá»‘ pháº£i Ã¡p dá»¥ng `numFmt: "#,##0"`.
     - CÃ¡c Ã´ dá»¯ liá»‡u thÃ´ng thÆ°á»ng pháº£i Ä‘Æ°á»£c cÄƒn chá»‰nh (align) há»£p lÃ½: cá»™t sá»‘ cÄƒn lá» pháº£i (right), cá»™t ngÃ y thÃ¡ng/tráº¡ng thÃ¡i/biá»ƒn sá»‘ cÄƒn giá»¯a (center), cÃ¡c cá»™t chá»¯ khÃ¡c cÄƒn lá» trÃ¡i (left). CÃ¡c dÃ²ng xen káº½ cÃ³ thá»ƒ tÃ´ mÃ u ná»n xÃ¡m ráº¥t nháº¹ (`#F8FAFC` vÃ  `#FFFFFF`) Ä‘á»ƒ tÄƒng Ä‘á»™ tÆ°Æ¡ng pháº£n.
     - **Excel Formula (CÃ´ng thá»©c Ä‘á»™ng)**: CÃ¡c Ã´ Tá»•ng cá»™ng trong Excel báº¯t buá»™c sá»­ dá»¥ng cÃ´ng thá»©c Ä‘á»™ng (nhÆ° `{ f: 'SUM(B4:B12)', v: 100 }`) thay vÃ¬ ghi giÃ¡ trá»‹ tÄ©nh, giÃºp káº¿ toÃ¡n/kiá»ƒm toÃ¡n truy váº¿t vÃ  tá»± Ä‘á»™ng cáº­p nháº­t khi chá»‰nh sá»­a dá»¯ liá»‡u. CÃ¡c Ã´ tá»‰ lá»‡ pháº§n trÄƒm tá»«ng dÃ²ng cÅ©ng pháº£i tÃ­nh báº±ng cÃ´ng thá»©c tá»‰ trá»ng so vá»›i tá»•ng sá»‘ (vÃ­ dá»¥: `=B4/$B$12`).
     - **ÄÃ³ng bÄƒng dÃ²ng (Freeze Panes)**: Äá»‘i vá»›i cÃ¡c báº£ng dá»¯ liá»‡u dÃ i (tab Danh sÃ¡ch, Thá»‘ng kÃª...), pháº£i Ä‘Ã³ng bÄƒng dÃ²ng tiÃªu Ä‘á» (`ws['!freeze'] = { xSplit: 0, ySplit: 3 }`) Ä‘á»ƒ tiÃªu Ä‘á» cá»‘ Ä‘á»‹nh khi cuá»™n dá»¯ liá»‡u.
     - **ÄÆ°á»ng lÆ°á»›i rÃµ nÃ©t (Gridlines)**: LuÃ´n Ã©p hiá»ƒn thá»‹ Ä‘Æ°á»ng lÆ°á»›i trong file Excel (`ws['!views'] = [{ showGridLines: true }]`).
     - **ÄÆ¡n vá»‹ tÃ­nh (ÄVT)**: Má»i tiÃªu Ä‘á» bÃ¡o cÃ¡o xuáº¥t ra pháº£i chá»‰ rÃµ Ä‘Æ¡n vá»‹ tÃ­nh (vÃ­ dá»¥: *ÄÆ¡n vá»‹ tÃ­nh: Äá»“ng (VNÄ) / Chuyáº¿n*).

8. **Quáº£n lÃ½ mÃºi giá» vÃ  Ä‘á»“ng bá»™ Drawer (UI/UX)**:
   - **MÃºi giá» Local khi lá»c bÃ¡o cÃ¡o**: KhÃ´ng sá»­ dá»¥ng `.toISOString().split('T')[0]` Ä‘á»ƒ Ä‘á»‹nh dáº¡ng ngÃ y lá»c á»Ÿ client vÃ¬ nÃ³ gÃ¢y trÃ´i ngÃ y theo UTC (UTC+7 bá»‹ lÃ¹i 7 tiáº¿ng sáº½ trÃ´i vá» ngÃ y hÃ´m trÆ°á»›c). Báº¯t buá»™c trÃ­ch xuáº¥t trá»±c tiáº¿p cÃ¡c thÃ nh pháº§n ngÃ y cá»¥c bá»™ (`d.getFullYear()`, `d.getMonth() + 1`, `d.getDate()`).
   - **CÆ¡ cháº¿ táº£i file Blob URL trÃªn Chrome**: Chrome sandbox cháº·n cÃ¡c lÆ°á»£t táº£i tá»« Data URI trá»±c tiáº¿p. Báº¯t buá»™c giáº£i mÃ£ Base64 sang Blob vÃ  táº¡o Object URL (`URL.createObjectURL(blob)`), Ä‘á»“ng thá»i tÄƒng thá»i gian chá» thu há»“i `URL.revokeObjectURL` lÃªn tá»‘i thiá»ƒu `30 giÃ¢y` Ä‘á»ƒ trÃ¬nh duyá»‡t hoÃ n táº¥t ghi file xuá»‘ng á»• Ä‘Ä©a.
   - **Loáº¡i trá»« Drawer lá»“ng nhau**: Äá»ƒ trÃ¡nh Form sá»­a bá»‹ che khuáº¥t bÃªn dÆ°á»›i Drawer xem chi tiáº¿t, pháº£i Ã¡p dá»¥ng cÆ¡ cháº¿ loáº¡i trá»« (Mutual Exclusion): khi Form sá»­a Ä‘Æ°á»£c báº­t, báº¯t buá»™c unmount/Ä‘Ã³ng Drawer xem chi tiáº¿t tÆ°Æ¡ng á»©ng.
   - **Kiá»ƒm soÃ¡t an toÃ n kiá»ƒu dá»¯ liá»‡u (TypeScript Safe-guards)**: Khi thao tÃ¡c vá»›i cÃ¡c Ä‘á»‘i tÆ°á»£ng cÃ³ thuá»™c tÃ­nh Ä‘á»™ng hoáº·c kiá»ƒu chÆ°a xÃ¡c Ä‘á»‹nh (nhÆ° `TransportRow` cÃ³ index signature lÃ  `unknown`, dá»¯ liá»‡u tá»« báº£ng cáº¥u hÃ¬nh Ä‘á»™ng `var_cong_ty`), báº¯t buá»™c Ã©p kiá»ƒu sang `any` trÆ°á»›c khi truyá»n vÃ o cÃ¡c constructor nghiÃªm ngáº·t (nhÆ° `new Date(value as any)`) hoáº·c trÆ°á»›c khi truy cáº­p thuá»™c tÃ­nh Ä‘á»™ng. LuÃ´n kiá»ƒm tra tÃ­nh kháº£ dá»¥ng (`if (row)`) trÆ°á»›c khi truy xuáº¥t `.id` cá»§a cÃ¡c state drawer lá»“ng nhau Ä‘á»ƒ loáº¡i bá» triá»‡t Ä‘á»ƒ lá»—i sáº­p trang (white screen) á»Ÿ runtime.

9. **Quy chuáº©n in áº¥n Phiáº¿u lÆ°Æ¡ng & Chá»©ng tá»« (Print Standards)**:
   - **Cáº¥u trÃºc In A4 dá»c**: Khi thá»±c hiá»‡n hÃ nh Ä‘á»™ng in chá»©ng tá»« (vÃ­ dá»¥: In báº£ng lÆ°Æ¡ng), há»‡ thá»‘ng pháº£i má»Ÿ cá»­a sá»• in riÃªng biá»‡t thÃ´ng qua `window.open` vá»›i cáº¥u trÃºc HTML ngá»¯ nghÄ©a sáº¡ch vÃ  CSS `@media print` Ä‘Æ°á»£c cáº¥u hÃ¬nh chuáº©n A4 dá»c (`@page { size: A4 portrait; margin: 15mm; }`).
   - **áº¨n thÃ nh pháº§n Ä‘iá»u hÆ°á»›ng**: ToÃ n bá»™ thanh cÃ´ng cá»¥, nÃºt báº¥m hÃ nh Ä‘á»™ng hoáº·c cÃ¡c pháº§n tá»­ thá»«a cá»§a trang web gá»‘c pháº£i Ä‘Æ°á»£c áº©n hoÃ n toÃ n trÃªn giao diá»‡n in tháº­t.
   - **Thiáº¿t káº¿ tinh gá»n**: KhÃ´ng váº½ cÃ¡c thÃ´ng tin doanh nghiá»‡p chi tiáº¿t (nhÆ° Äá»‹a chá»‰, SÄT, Email) á»Ÿ Ä‘áº§u trang in vÃ  khÃ´ng hiá»ƒn thá»‹ cÃ¡c khung chá»¯ kÃ½ kÃ½ duyá»‡t (nhÆ° NgÆ°á»i láº­p biá»ƒu, Káº¿ toÃ¡n trÆ°á»Ÿng, GiÃ¡m Ä‘á»‘c phÃª duyá»‡t) á»Ÿ cuá»‘i trang in. Chá»‰ giá»¯ láº¡i tiÃªu Ä‘á» chá»©ng tá»«, ká»³ thanh toÃ¡n, báº£ng kÃª dá»¯ liá»‡u tÃ i chÃ­nh chi tiáº¿t, tá»•ng tiá»n thá»±c nháº­n vÃ  pháº§n sá»‘ tiá»n viáº¿t báº±ng chá»¯ Ä‘á»ƒ Ä‘áº£m báº£o giao diá»‡n chuyÃªn nghiá»‡p, Ä‘Æ¡n giáº£n, khÃ´ng cáº§u ká»³ phá»©c táº¡p.
   - **Báº£ng kÃª & Dá»c hÃ³a dá»¯ liá»‡u tÃ i chÃ­nh**:
     - Chi tiáº¿t tá»«ng chuyáº¿n Ä‘i, biá»ƒn sá»‘ xe, phá»¥ phÃ­ pháº£i hiá»ƒn thá»‹ dáº¡ng báº£ng kÃª rÃµ rÃ ng á»Ÿ Má»¥c I.
     - CÃ¡c khoáº£n tá»•ng há»£p thu nháº­p & kháº¥u trá»« pháº£i Ä‘Æ°á»£c trÃ¬nh bÃ y theo chiá»u dá»c á»Ÿ Má»¥c II (Earnings & Deductions) Ä‘á»ƒ dá»… so khá»›p sá»‘ liá»‡u. CÃ¡c khoáº£n kháº¥u trá»« (táº¡m á»©ng, pháº¡t...) hiá»ƒn thá»‹ dáº¡ng trá»« `-` vÃ  tÃ´ mÃ u Ä‘á» cáº£nh bÃ¡o (`#dc2626`).
   - **Dá»‹ch sá»‘ tiá»n sang chá»¯**: Báº¯t buá»™c tÃ­ch há»£p thuáº­t toÃ¡n dá»‹ch sá»‘ tiá»n thá»±c nháº­n sang chá»¯ tiáº¿ng Viá»‡t chuáº©n (`numberToVietnameseWords`) á»Ÿ chÃ¢n báº£ng tÃ­nh Ä‘á»ƒ Ä‘áº£m báº£o tÃ­nh phÃ¡p lÃ½ vÃ  chá»‘ng sá»­a Ä‘á»•i chá»©ng tá»«.


## Thiáº¿t káº¿ cÃ¡c Module DÃ¹ng chung dá»¯ liá»‡u (Shared Data Modules Pattern)

Äá»‘i vá»›i cÃ¡c module nghiá»‡p vá»¥ cÃ³ sá»± chá»“ng chÃ©o hoáº·c liÃªn quan cháº·t cháº½ Ä‘áº¿n nhau vá» máº·t thÃ´ng tin (vÃ­ dá»¥: NhÃ¢n sá»± & TÃ i xáº¿, KhÃ¡ch hÃ ng & NhÃ  cung cáº¥p...):

1. **Dá»¯ liá»‡u (Database - Single Source of Truth)**:
   - Thiáº¿t káº¿ má»™t báº£ng dá»¯ liá»‡u gá»‘c duy nháº¥t (vÃ­ dá»¥: `var_nhan_vien`) Ä‘á»ƒ lÆ°u trá»¯ táº¥t cáº£ thÃ´ng tin chung.
   - Sá»­ dá»¥ng cÃ¡c cá» boolean (vÃ­ dá»¥: `la_tai_xe: boolean`) Ä‘á»ƒ phÃ¢n loáº¡i Ä‘á»‘i tÆ°á»£ng thay vÃ¬ tÃ¡ch ra thÃ nh cÃ¡c báº£ng Ä‘á»™c láº­p. CÃ¡ch nÃ y giÃºp trÃ¡nh trÃ¹ng láº·p dá»¯ liá»‡u vÃ  Ä‘á»“ng bá»™ hÃ³a phá»©c táº¡p.

2. **Giao diá»‡n (UI - Dedicated Modules)**:
   - Váº«n duy trÃ¬ cÃ¡c module/mÃ n hÃ¬nh quáº£n lÃ½ riÃªng biá»‡t cho tá»«ng vai trÃ² nghiá»‡p vá»¥ (vÃ­ dá»¥: cÃ³ cáº£ trang NhÃ¢n viÃªn vÃ  trang TÃ i xáº¿).
   - Module chuyÃªn sÃ¢u (vÃ­ dá»¥: TÃ i xáº¿) sáº½ tá»± Ä‘á»™ng lá»c dá»¯ liá»‡u tá»« báº£ng gá»‘c theo cá» phÃ¢n loáº¡i (`la_tai_xe === true`).
   - Module chuyÃªn sÃ¢u nÃ y sáº½ chá»©a cÃ¡c tab/má»¥c hiá»ƒn thá»‹ chi tiáº¿t nghiá»‡p vá»¥ sÃ¢u hÆ¡n mÃ  module gá»‘c khÃ´ng cáº§n hiá»ƒn thá»‹ (vÃ­ dá»¥: TÃ i xáº¿ cáº§n hiá»ƒn thá»‹ *Lá»‹ch sá»­ chuyáº¿n xe*, *Lá»‹ch sá»­ lÆ°Æ¡ng*; trong khi NhÃ¢n sá»± nÃ³i chung thÃ¬ khÃ´ng cáº§n).

3. **CÆ¡ cháº¿ liÃªn káº¿t Ä‘iá»u hÆ°á»›ng (Navigation Link)**:
   - Trong form nháº­p liá»‡u cá»§a module gá»‘c (vÃ­ dá»¥: form NhÃ¢n sá»±), khi tÃ­ch chá»n cá» vai trÃ² (vÃ­ dá»¥: `la_tai_xe`), cáº§n hiá»ƒn thá»‹ ngay má»™t link Ä‘iá»u hÆ°á»›ng nhanh (vÃ­ dá»¥: `Xem thÃ´ng tin táº¡i Module TÃ i xáº¿ â†’`) Ä‘á»ƒ hÆ°á»›ng dáº«n ngÆ°á»i dÃ¹ng sang trang chuyÃªn mÃ´n Ä‘á»ƒ quáº£n lÃ½ sÃ¢u hÆ¡n.

4. **HÃ nh Ä‘á»™ng XÃ³a (Soft Delete Role)**:
   - Khi xÃ³a má»™t Ä‘á»‘i tÆ°á»£ng á»Ÿ module chuyÃªn sÃ¢u (vÃ­ dá»¥: xÃ³a TÃ i xáº¿ khá»i danh sÃ¡ch tÃ i xáº¿), hÃ nh vi há»‡ thá»‘ng lÃ  **chuyá»ƒn cá» phÃ¢n loáº¡i vá» `false`** (vÃ­ dá»¥: `la_tai_xe: false`), chá»© khÃ´ng Ä‘Æ°á»£c xÃ³a váº­t lÃ½ báº£n ghi trong báº£ng gá»‘c (`var_nhan_vien`) Ä‘á»ƒ báº£o toÃ n thÃ´ng tin há»“ sÆ¡ nhÃ¢n viÃªn gá»‘c.

5. **Cáº¥u hÃ¬nh Dropdown liÃªn káº¿t (Dropdown-as-a-Service Pattern)**:
   - CÃ¡c trÆ°á»ng khÃ³a ngoáº¡i trá» Ä‘áº¿n báº£ng dÃ¹ng chung (vÃ­ dá»¥: `id_tai_xe` trÃªn chuyáº¿n xe, báº£ng lÆ°Æ¡ng) pháº£i sá»­ dá»¥ng combobox/select lá»c Ä‘á»™ng dá»¯ liá»‡u Ä‘Ã£ lá»c theo vai trÃ² (`la_tai_xe = true`) á»Ÿ táº§ng Service/API trÆ°á»›c khi náº¡p vÃ o UI.
   - NhÃ£n hiá»ƒn thá»‹ cá»§a cÃ¡c khÃ³a ngoáº¡i nÃ y pháº£i Ä‘Æ°á»£c phÃ¢n giáº£i dá»±a trÃªn thÃ´ng tin Ä‘áº§y Ä‘á»§ tá»« báº£ng dÃ¹ng chung Ä‘á»ƒ Ä‘áº£m báº£o tÃ­nh nháº¥t quÃ¡n (vÃ­ dá»¥: hiá»ƒn thá»‹ `ho_va_ten` tá»« `var_nhan_vien` thay vÃ¬ chá»‰ hiá»ƒn thá»‹ ID thÃ´).

6. **Äá»“ng bá»™ Auth vÃ  Báº£o máº­t Äá»•i máº­t kháº©u**:
   - Giao diá»‡n Ä‘á»•i máº­t kháº©u (Change Password) trÃªn trang cÃ¡ nhÃ¢n pháº£i hoáº¡t Ä‘á»™ng trá»±c tiáº¿p thÃ´ng qua API `supabase.auth.updateUser` thay vÃ¬ hiá»ƒn thá»‹ "Coming Soon".
   - Luá»“ng Ä‘á»“ng bá»™ hÃ³a tÃ i khoáº£n admin (`api/employee-auth-sync`) cáº§n Ä‘Æ°á»£c bá»c lá»›p fallback tá»± Ä‘á»™ng catch lá»—i cáº£nh bÃ¡o nhÆ°ng cho phÃ©p lÆ°u dá»¯ liá»‡u gá»‘c thÃ nh cÃ´ng náº¿u mÃ´i trÆ°á»ng khÃ´ng thiáº¿t láº­p Service Role Key.

## BÃ i há»c Kinh nghiá»‡m & NguyÃªn táº¯c Thiáº¿t káº¿ Hiá»ƒn thá»‹ (UI/UX Lessons Learned)

1. **Kháº¯c phá»¥c sá»± báº¥t nháº¥t giá»¯a Mock Data vÃ  Real Database**:
   - Dá»¯ liá»‡u thá»±c táº¿ thÆ°á»ng phÃ¡t sinh cÃ¡c Ã´ liÃªn káº¿t bá»‹ trá»‘ng (`null` hoáº·c `undefined`) do import hoáº·c thao tÃ¡c cÅ©.
   - LuÃ´n thiáº¿t káº¿ giáº£i phÃ¡p hiá»ƒn thá»‹ vÃ  gom nhÃ³m dá»± phÃ²ng (nhÆ° nhÃ³m giáº£ láº­p "KhÃ¡c" cho cÃ¡c dÃ²ng má»“ cÃ´i) Ä‘á»ƒ trÃ¡nh hiá»‡n tÆ°á»£ng áº©n/tÃ ng hÃ¬nh dá»¯ liá»‡u trÃªn UI.

2. **Äá»“ng bá»™ hÃ³a thuá»™c tÃ­nh thá»±c thá»ƒ liÃªn káº¿t á»Ÿ táº§ng Service**:
   - Khi giao diá»‡n cáº§n sáº¯p xáº¿p hoáº·c nhÃ³m dá»¯ liá»‡u con dá»±a theo thá»© tá»± cá»§a thá»±c thá»ƒ cha (vÃ­ dá»¥: sáº¯p xáº¿p vá»‹ trÃ­ chá»©c vá»¥ theo phÃ²ng ban), táº§ng Service/API pháº£i chá»§ Ä‘á»™ng náº¡p thuá»™c tÃ­nh thá»© tá»± cá»§a cha (vÃ­ dá»¥: `thu_tu` cá»§a phÃ²ng ban) vÃ  map vÃ o dá»¯ liá»‡u tráº£ vá» cho Client.

3. **NguyÃªn táº¯c Sáº¯p xáº¿p NhÃ³m Giáº£ láº­p/Dá»± phÃ²ng (Fallback Groups)**:
   - CÃ¡c nhÃ³m áº£o/giáº£ láº­p gom dá»¯ liá»‡u má»“ cÃ´i (nhÆ° nhÃ³m "KhÃ¡c") báº¯t buá»™c pháº£i Ä‘Æ°á»£c quy Ä‘á»‹nh trá»ng sá»‘ lá»›n nháº¥t trong hÃ m so sÃ¡nh (`sort`), Ä‘áº£m báº£o chÃºng luÃ´n Ä‘Æ°á»£c hiá»ƒn thá»‹ á»Ÿ vá»‹ trÃ­ cuá»‘i cÃ¹ng dÆ°á»›i cÃ¹ng cá»§a danh sÃ¡ch.

4. **Máº­t kháº©u máº·c Ä‘á»‹nh â€” QUY Táº®C Cá»¨NG (Credentials Convention)**:
   - **TÃ i khoáº£n admin**: Máº­t kháº©u luÃ´n lÃ  `5fedu.com`. Tuyá»‡t Ä‘á»‘i KHÃ”NG Ä‘Æ°á»£c thay Ä‘á»•i, khÃ´ng dÃ¹ng `123456` hay báº¥t ká»³ giÃ¡ trá»‹ nÃ o khÃ¡c cho admin.
   - **TÃ i khoáº£n ngÆ°á»i dÃ¹ng/nhÃ¢n viÃªn thÆ°á»ng**: Máº­t kháº©u máº·c Ä‘á»‹nh khi táº¡o má»›i lÃ  `123456`.
   - Khi viáº¿t script táº¡o tÃ i khoáº£n, test login, seed user hoáº·c browser subagent test: Báº®T BUá»˜C pháº£i dÃ¹ng Ä‘Ãºng máº­t kháº©u theo quy táº¯c trÃªn. Sai máº­t kháº©u â†’ lock out há»‡ thá»‘ng.
   - Khi test tÃ­nh nÄƒng "Äá»•i máº­t kháº©u" trÃªn giao diá»‡n Profile: PHáº¢I Ä‘á»•i láº¡i vá» Ä‘Ãºng máº­t kháº©u gá»‘c sau khi test xong, hoáº·c dÃ¹ng tÃ i khoáº£n test riÃªng â€” KHÃ”NG BAO GIá»œ test Ä‘á»•i máº­t kháº©u trÃªn tÃ i khoáº£n admin chÃ­nh.
   - **BÃ i há»c**: Conversation trÆ°á»›c Ä‘Ã£ vÃ´ tÃ¬nh lÃ m máº¥t password admin do test khÃ´ng Ä‘Ãºng quy trÃ¬nh, gÃ¢y lock out toÃ n bá»™ há»‡ thá»‘ng.

 5. **Xuáº¥t file trÃªn trÃ¬nh duyá»‡t â€” bÃ i há»c download & font preload**:
   - KhÃ´ng xuáº¥t file theo cÃ¡ch lÃ m máº¥t tÃªn file, khÃ´ng persist vÃ o Downloads, hoáº·c bá»‹ service worker/browser cháº·n. LuÃ´n verify báº±ng file táº£i tháº­t trÃªn trÃ¬nh duyá»‡t má»¥c tiÃªu.
   - Æ¯u tiÃªn má»™t helper download thá»‘ng nháº¥t cá»§a dá»± Ã¡n cho PDF/XLSX/CSV thay vÃ¬ má»—i module tá»± dÃ¹ng API download khÃ¡c nhau.
   - PDF tiáº¿ng Viá»‡t pháº£i preload/register font theo má»™t cÆ¡ cháº¿ dÃ¹ng chung, cÃ³ cache promise Ä‘á»ƒ trÃ¡nh race condition khi nhiá»u tÃ¡c vá»¥ export cháº¡y gáº§n nhau.
   - BÃ i há»c ká»¹ thuáº­t chi tiáº¿t nhÆ° data URI, blob, `MouseEvent`, `showSaveFilePicker`, Workbox denylist lÃ  evidence/reference; chá»‰ Ã¡p dá»¥ng nguyÃªn vÄƒn khi dá»± Ã¡n hiá»‡n táº¡i dÃ¹ng cÃ¹ng stack vÃ  tÃ¡i hiá»‡n cÃ¹ng lá»—i.

 6. **Popup XÃ¡c nháº­n Báº¯t buá»™c cho hÃ nh Ä‘á»™ng con/nested nguy hiá»ƒm (Action Confirmation)**:
   - Má»i nÃºt hÃ nh Ä‘á»™ng trÃªn báº£ng con nhÃºng hoáº·c nested detail drawer (nhÆ° Sá»­a, XÃ³a, Äá»•i tráº¡ng thÃ¡i, BÃ¡o cÃ¡o tiáº¿n Ä‘á»™) Ä‘á»u báº¯t buá»™c pháº£i hiá»ƒn thá»‹ há»™p thoáº¡i xÃ¡c nháº­n theo cÆ¡ cháº¿ chuáº©n cá»§a dá»± Ã¡n trÆ°á»›c khi thá»±c hiá»‡n.
   - KhÃ´ng cháº¥p nháº­n ngoáº¡i lá»‡ "Form Ä‘Ã£ lÃ  bÆ°á»›c Ä‘á»‡m Ä‘á»§". NgÆ°á»i dÃ¹ng trÃªn mobile dá»… báº¥m nháº§m nÃºt nhá», popup xÃ¡c nháº­n lÃ  lá»›p báº£o vá»‡ báº¯t buá»™c.
   - **BÃ i há»c**: NÃºt sá»­a dÃ²ng con vÃ  nÃºt thay Ä‘á»•i tráº¡ng thÃ¡i dÃ²ng con trong drawer tá»«ng bá»‹ bá» sÃ³t khÃ´ng cÃ³ popup xÃ¡c nháº­n.

 7. **PWA Service Worker áº£nh hÆ°á»Ÿng download filename (PWA Download Exclusion â€” QUY Táº®C Cá»¨NG)**:
   - Khi á»©ng dá»¥ng sá»­ dá»¥ng VitePWA + Workbox, Service Worker cÃ³ thá»ƒ intercept cÃ¡c blob download request lÃ m máº¥t tÃªn file hoáº·c gÃ¢y lá»—i. Báº¯t buá»™c pháº£i cáº¥u hÃ¬nh loáº¡i trá»« (`navigateFallbackDenylist`) trong Workbox config Ä‘á»‘i vá»›i cÃ¡c Ä‘Æ°á»ng dáº«n download, preview.
   - Äá»“ng thá»i, khi implement `saveBlobAs`, Æ°u tiÃªn sá»­ dá»¥ng `showSaveFilePicker` (File System Access API) trÃªn cÃ¡c trÃ¬nh duyá»‡t Chromium hiá»‡n Ä‘áº¡i Ä‘á»ƒ cÃ³ tráº£i nghiá»‡m download tin cáº­y nháº¥t vÃ  luÃ´n giá»¯ Ä‘Ãºng tÃªn file.

 8. **Mobile Card Responsive pháº£i tham chiáº¿u template**:
   - Mobile card cá»§a má»i module pháº£i tuÃ¢n thá»§ cáº¥u trÃºc mobile card hiá»‡n cÃ³ trong template/app.
   - Khi lÃ m mobile card cho module má»›i, pháº£i Ä‘á»‘i chiáº¿u reference implementation gáº§n nháº¥t theo cÃ¹ng surface/hÃ nh vi; chá»‰ dÃ¹ng chi tiáº¿t cáº¥u trÃºc nhÆ° `leading`, `titleRow`, `subheader`, `metaLine` náº¿u template hiá»‡n táº¡i Ä‘ang dÃ¹ng pattern Ä‘Ã³.

 9. **Äá»“ng bá»™ Format giá»¯a cÃ¡c Trang In (Print Format Parity â€” QUY Táº®C Cá»¨NG)**:
   - Táº¥t cáº£ cÃ¡c trang preview/in (nhÆ° In báº£ng lÆ°Æ¡ng, In há»“ sÆ¡ nhÃ¢n viÃªn) pháº£i Ä‘á»“ng nháº¥t vá» cáº¥u trÃºc layout vÃ  thiáº¿t káº¿ tinh gá»n theo quy chuáº©n A4.
   - Sá»­ dá»¥ng chung cáº¥u trÃºc Header (logo cÃ´ng ty bÃªn trÃ¡i, tÃªn Ä‘á»‹a chá»‰ cÃ´ng ty bÃªn cáº¡nh, khÃ´ng Ä‘á»ƒ thÃ´ng tin linh tinh hoáº·c mÃ£ phiáº¿u to báº£n bÃªn pháº£i), style báº£ng dá»¯ liá»‡u header xanh dÆ°Æ¡ng (`bg-primary text-white`), vÃ  áº©n hoÃ n toÃ n cÃ¡c thÃ nh pháº§n chá»¯ kÃ½ kÃ½ duyá»‡t á»Ÿ cuá»‘i trang.
   - Trá»±c tiáº¿p láº¥y thÃ´ng tin cÃ´ng ty tá»« source chung cá»§a dá»± Ã¡n thay vÃ¬ truyá»n prop thá»§ cÃ´ng tá»« trang cha.

 10. **Deploy Production chá»‰ dÃ¹ng Git Push (Deploy Governance â€” QUY Táº®C Cá»¨NG)**:
   - Project `tah-app.vercel.app` Ä‘Ã£ Ä‘Æ°á»£c ná»‘i vá»›i GitHub repo qua Vercel Dashboard (auto-deploy on push). **KHÃ”NG ÄÆ¯á»¢C** dÃ¹ng `npx vercel --prod` hoáº·c `node scripts/deploy-no-git.js` Ä‘á»ƒ deploy thá»§ cÃ´ng â€” sáº½ táº¡o ra project Vercel má»›i hoáº·c link nháº§m project, gÃ¢y deploy lÃªn domain sai.
   - **Quy trÃ¬nh Ä‘Ãºng duy nháº¥t**: `git push` â†’ Vercel tá»± detect â†’ build â†’ deploy lÃªn `tah-app.vercel.app`.
   - **BÃ i há»c**: ÄÃ£ tá»«ng deploy nháº§m sang `tahdieuphoi.vercel.app` (project má»›i do Vercel CLI tá»± táº¡o) thay vÃ¬ `tah-app.vercel.app`, khiáº¿n báº£n má»›i khÃ´ng lÃªn production tháº­t.

 11. **ThÃ´ng tin cÃ´ng ty pháº£i cÃ³ Single Source of Truth**:
   - Má»i component vÃ  utility export/preview cáº§n thÃ´ng tin cÃ´ng ty (logo, tÃªn, Ä‘á»‹a chá»‰, SÄT, email) pháº£i Ä‘á»c tá»« nguá»“n state/service chung cá»§a dá»± Ã¡n.
   - KhÃ´ng tá»± fetch thÃ´ng tin cÃ´ng ty riÃªng láº» trong tá»«ng page/component náº¿u template Ä‘Ã£ cÃ³ source chung. Object fetch riÃªng thÆ°á»ng thiáº¿u trÆ°á»ng, gÃ¢y layout khÃ´ng Ä‘á»“ng nháº¥t giá»¯a preview vÃ  export.
   - Reference implementation cá»¥ thá»ƒ cá»§a dá»± Ã¡n hiá»‡n táº¡i chá»‰ dÃ¹ng lÃ m evidence; khÃ´ng hard-code tÃªn store/component náº¿u template Ä‘á»•i.
  12. **TrÃ¡nh Stale Closure trong Callback Há»™p thoáº¡i XÃ¡c nháº­n (Stale Closure Prevention â€” QUY Táº®C Cá»¨NG)**:
    - Khi tÃ­ch há»£p cÃ¡c há»™p thoáº¡i xÃ¡c nháº­n cÃ³ form/input Ä‘á»™ng (nhÆ° dialog BÃ¡o cÃ¡o/Äá»•i tráº¡ng thÃ¡i) báº±ng hÃ m `confirm()` tá»« Zustand, tuyá»‡t Ä‘á»‘i **KHÃ”NG** truyá»n cÃ¡c biáº¿n closure cá»¥c bá»™ (`let selectedStatus`, `onStatusChange`) trá»±c tiáº¿p vÃ o cÃ¡c prop callback cá»§a element hoáº·c callback `onConfirm`.
    - **LÃ½ do**: Khi component re-render, cÃ¡c hÃ m callback nÃ y váº«n giá»¯ tham chiáº¿u cÅ© (stale closure) tá»« render trÆ°á»›c Ä‘Ã³, lÃ m lá»‡ch dá»¯ liá»‡u gá»­i lÃªn hoáº·c khiáº¿n Promise khÃ´ng Ä‘Æ°á»£c resolve/reject dáº«n Ä‘áº¿n káº¹t/loading khÃ´ng Ä‘Ã³ng Ä‘Æ°á»£c modal.
    - **Giáº£i phÃ¡p chuáº©n**:
      1. LÆ°u trá»¯ hÃ m callback báº±ng `useRef` (vd: `const onStatusChangeRef = useRef(onStatusChange); useEffect(() => { onStatusChangeRef.current = onStatusChange }, [onStatusChange]);`).
      2. ÄÃ³ng gÃ³i dá»¯ liá»‡u thay Ä‘á»•i vÃ o má»™t object wrapper á»•n Ä‘á»‹nh (vd: `const currentValues = { status: initialStatus };` vÃ  cáº­p nháº­t thÃ´ng qua `onChange={(v) => { currentValues.status = v; }}`).
      3. Gá»i qua ref trong `onConfirm` (vd: `onConfirm: async () => { if (onStatusChangeRef.current) await onStatusChangeRef.current(currentValues.status); }`).
    - **BÃ i há»c**: NÃºt BÃ¡o cÃ¡o vÃ  Äá»•i tráº¡ng thÃ¡i trÃªn toolbar tá»«ng sá»­ dá»¥ng cÃ¡c biáº¿n cá»¥c bá»™ thuáº§n vÃ  hÃ m trá»±c tiáº¿p gÃ¢y káº¹t cá»©ng há»™p thoáº¡i khi cáº­p nháº­t.

