# Source Examples

## Má»¥c tiÃªu

File nÃ y lÆ°u vÃ­ dá»¥ cá»¥ thá»ƒ Ä‘Ã£ rÃºt tá»« prompt/áº£nh ban Ä‘áº§u. DÃ¹ng nÃ³ nhÆ° reference Ä‘á»ƒ AI suy luáº­n Ä‘Ãºng style 5fedu khi ngÆ°á»i dÃ¹ng Ä‘Æ°a Ã­t instruction hÆ¡n, nhÆ°ng khÃ´ng thay tháº¿ viá»‡c chá»‘t spec tháº­t.

## áº¢nh 1: app vÃ  stack

VÃ­ dá»¥ app:

- TÃªn app: `TAH APP`.

Stack thÆ°á»ng tháº¥y:

- Frontend: React (Vite) + TypeScript.
- UI: Tailwind CSS + component ná»™i bá»™ trong `components/ui`, phong cÃ¡ch tÆ°Æ¡ng tá»± shadcn, khÃ´ng dÃ¹ng registry shadcn/Radix náº¿u chÆ°a cáº§n.
- Dá»¯ liá»‡u: TanStack Query cho server state + Zustand cho client state.
- Form: React Hook Form + Zod.
- Backend: Supabase PostgreSQL + Auth.
- Dev máº·c Ä‘á»‹nh cÃ³ thá»ƒ dÃ¹ng mock náº¿u Ä‘Æ°á»£c chá»‘t.
- Media: Cloudinary.
- ThÃ´ng tin káº¿t ná»‘i thÆ°á»ng gá»“m Supabase vÃ  Cloudinary; cÃ³ thá»ƒ cÃ³ Google Sheets/AppSheet tÃ¹y dá»± Ã¡n.

## áº¢nh 2: domain/sidebar

Domain/sidebar máº«u:

- Trang chá»§
- HÃ nh chÃ­nh
- NhÃ¢n sá»±
- Váº­n hÃ nh
- Kinh doanh
- Marketing
- TÃ i chÃ­nh
- Mua hÃ ng
- Sáº£n xuáº¥t
- Kho váº­n
- Äiá»u hÃ nh
- Há»‡ thá»‘ng
- Trá»£ lÃ½ AI
- ThÃ´ng tin báº£n quyá»n

## áº¢nh 3-4: module/view/tab máº«u

VÃ­ dá»¥ mapping tá»« sheet:

| Submenu | NhÃ³m module | TÃªn view/module | Tab |
| --- | --- | --- | --- |
| Há»‡ thá»‘ng | SÆ¡ Ä‘á»“ | PhÃ²ng ban | |
| Há»‡ thá»‘ng | SÆ¡ Ä‘á»“ | Chá»©c vá»¥ | |
| Há»‡ thá»‘ng | SÆ¡ Ä‘á»“ | NhÃ¢n viÃªn | |
| Há»‡ thá»‘ng | Thiáº¿t láº­p khÃ¡c | ThÃ´ng tin cÃ´ng ty | |
| Há»‡ thá»‘ng | Thiáº¿t láº­p khÃ¡c | PhÃ¢n quyá»n | |
| Quáº£n lÃ½ váº­n táº£i | Káº¿ hoáº¡ch | Chuyáº¿n xe | Danh sÃ¡ch, Danh sÃ¡ch CT |
| Quáº£n lÃ½ váº­n táº£i | Káº¿ hoáº¡ch | Báº£ng lÆ°Æ¡ng | Danh sÃ¡ch |
| Quáº£n lÃ½ váº­n táº£i | Káº¿ hoáº¡ch | Thá»‘ng kÃª chuyáº¿n | Lá»c theo ngÃ y, chuyáº¿n, tÃ i xáº¿, Ä‘á»‹a Ä‘iá»ƒm, xe, thá»‘ng kÃª lÆ°Æ¡ng, chi phÃ­ |
| Quáº£n lÃ½ váº­n táº£i | Káº¿ hoáº¡ch | Thá»‘ng kÃª lÆ°Æ¡ng | Lá»c theo ngÃ y, tÃ i xáº¿ |
| Quáº£n lÃ½ váº­n táº£i | Thiáº¿t láº­p | TÃ i xáº¿ | |
| Quáº£n lÃ½ váº­n táº£i | Thiáº¿t láº­p | Äá»‹a Ä‘iá»ƒm | |
| Quáº£n lÃ½ váº­n táº£i | Thiáº¿t láº­p | Danh sÃ¡ch xe | |

## áº¢nh 5: mapping source

Khi ngÆ°á»i dÃ¹ng Ä‘Æ°a sheet/áº£nh mapping tÆ°Æ¡ng tá»±, AI pháº£i dÃ¹ng nÃ³ lÃ m nguá»“n chÃ­nh Ä‘á»ƒ tÃ¬m trong source vÃ  map tá»›i route/component/service/table.

KhÃ´ng Ä‘Æ°á»£c tá»± Ä‘á»•i domain/module/view/tab náº¿u chÆ°a há»i.

## áº¢nh 6: schema vÃ­ dá»¥

CÃ¡c báº£ng/cá»™t vÃ­ dá»¥:

- `var_cong_ty`: thÆ°Æ¡ng hiá»‡u/logo, tÃªn á»©ng dá»¥ng, mÃ´ táº£ ngáº¯n, thÃ´ng tin phÃ¡p nhÃ¢n, tÃªn cÃ´ng ty Ä‘áº§y Ä‘á»§, mÃ£ sá»‘ thuáº¿, sá»‘ Ä‘iá»‡n thoáº¡i, email liÃªn há»‡, website, Ä‘á»‹a chá»‰ trá»¥ sá»Ÿ.
- `var_phan_quyen`: `id int8`, `id_chuc_vu text`, `id_module text`, `quyen text`.
- `var_phong_ban`: `id int8`, `tt`, `ma_phong_ban`, `ten_phong_ban`, `mo_ta`, `id_phong_ban_quan_ly`, `trang_thai`.
- `var_chuc_vu`: `id int8`, `tt`, `ma_chuc_vu`, `ten_chuc_vu`, `mo_ta`, `id_phong_ban`, `trang_thai`.
- `var_nhan_vien`: ghi chÃº `cho Ä‘Äƒng nháº­p = tÃªn Ä‘Äƒng nháº­p`.
- `vt_tai_xe`: `id`, `ho_ten`, `trang_thai`, `id_nhan_vien`.
- `vt_xe`: `id`, `hang`, `model`, `doi`, `bien_so`.
- `vt_dia_diem`: `id`, `nhom`, `ten`, `mo_ta`, `tien_luong`, `ghi_chu`, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.
- `vt_chuyen_xe`: `id`, `ngay`, `id_tai_xe`, sá»‘ chuyáº¿n, tá»•ng tiá»n lÆ°Æ¡ng, tá»•ng phÃ­, ghi chÃº, tráº¡ng thÃ¡i.
- `vt_chuyen_xe_ct`: `id`, `id_chuyen_xe`, `id_dia_diem`, tiá»n lÆ°Æ¡ng initial, chi phÃ­ theo chuyáº¿n, ghi chÃº, tráº¡ng thÃ¡i/phÃª duyá»‡t.
- `vt_luong`: `id`, `nam`, `thang`, `id_tai_xe`, tá»•ng lÆ°Æ¡ng theo chuyáº¿n, tá»•ng chi phÃ­ theo chuyáº¿n, tá»•ng chi phÃ­ khÃ¡c, ghi chÃº chi phÃ­, tráº¡ng thÃ¡i, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.

## áº¢nh 7: cáº¥u trÃºc báº£ng chung

Khung cá»™t chung:

- `id`
- tÃªn/label
- tráº¡ng thÃ¡i
- cÃ¡c trÆ°á»ng nhÃ³m/phÃ¢n loáº¡i
- mÃ´ táº£ + ghi chÃº
- `id_nguoi_tao`
- `tg_tao`
- `tg_cap_nhat`

## áº¢nh 8/chat owner

Quy táº¯c owner nÃ³i:

- `id_nguoi_tao` pháº£i cÃ³ á»Ÿ háº§u háº¿t báº£ng.
- CÃ¡c báº£ng há»‡ thá»‘ng nhÆ° phÃ²ng ban/chá»©c vá»¥ cÃ³ thá»ƒ khÃ´ng cáº§n `id_nguoi_tao`.
- `tg_tao` vÃ  `tg_cap_nhat` thÃ¬ báº£ng nÃ o cÅ©ng cÃ³.
- CÃ³ váº¥n Ä‘á» gÃ¬ pháº£i trao Ä‘á»•i láº¡i ngay.

## Giá»›i háº¡n suy luáº­n

ÄÆ°á»£c suy luáº­n:

- Format tá»• chá»©c module.
- HÆ°á»›ng Ä‘áº·t tÃªn báº£ng/cá»™t.
- CÃ¡ch mapping tá»« spec sang frontend/backend.
- CÃ¡ch há»i credentials vÃ  kiá»ƒm tra format.

KhÃ´ng Ä‘Æ°á»£c tá»± chá»‘t:

- App hiá»‡n táº¡i cÃ³ Ä‘Ãºng toÃ n bá»™ vÃ­ dá»¥ trÃªn khÃ´ng.
- Prefix má»›i ngoÃ i vÃ­ dá»¥.
- SQL/migration production.
- Permission cá»¥ thá»ƒ tá»«ng module.
- Credentials hoáº·c secret.

## áº¢nh Sheet 2 ngÃ y 2026-05-30: dá»± Ã¡n vÃ  quy táº¯c triá»ƒn khai

Nguá»“n: áº£nh ngÆ°á»i dÃ¹ng gá»­i trong chat ngÃ y 2026-05-30, sheet `5f edu - XuÃ¢n LÄ©nh`.

### Dá»± Ã¡n

- TÃªn dá»± Ã¡n: `TAH app`.
- Tráº¡ng thÃ¡i: `Má»›i`.
- Deadline 80%: `03/06/2026`.
- Nghiá»‡m thu: `18/06/2026`.
- Tá»•ng tiá»n: `3.000.000`.
- CÃ²n láº¡i: `3.000.000`.

### Quy táº¯c source/code

- Code sáº¡ch, dÃ¹ng láº¡i tá»‘t, dá»… má»Ÿ rá»™ng.
- Cáº¥u trÃºc thÆ° má»¥c chia theo tá»«ng chá»©c nÄƒng, vÃ­ dá»¥ `Há»‡ thá»‘ng`, `NhÃ¢n sá»±`.
- CÃ¢y thÆ° má»¥c tham kháº£o app template.
- File trong tá»«ng module tham kháº£o template.
- TÃªn submenu vÃ  thÆ° má»¥c module dÃ¹ng tiáº¿ng Viá»‡t Ä‘á»ƒ ngÆ°á»i khÃ´ng biáº¿t tiáº¿ng Anh váº«n dá»… tra cá»©u.
- TÃªn view dÃ¹ng dáº¡ng hybrid tiáº¿ng Viá»‡t + English suffix, vÃ­ dá»¥ `nhan-vien-form`.

### Quy táº¯c database chi tiáº¿t

- TÃªn báº£ng viáº¿t theo toÃ n bá»™ submenu + tÃªn module báº±ng dáº¡ng slug/prefix Ä‘Ã£ chá»‘t theo app.
- VÃ­ dá»¥ Ä‘Ãºng: `var_nhan_su`, `hc_phieu_hanh_chinh`.
- VÃ­ dá»¥ sai: `nhan-su`, `1.nhan-su`.
- Cáº¥u trÃºc báº£ng chung gá»“m: `id int8`, cá»™t label/name, cá»™t nhÃ³m/phÃ¢n loáº¡i, cá»™t liÃªn káº¿t dáº¡ng `id_<doi_tuong>`, mÃ´ táº£/diá»…n giáº£i, ghi chÃº, tráº¡ng thÃ¡i, `id_nguoi_tao`, `tg_tao`, `tg_cap_nhat`.
- Báº£ng Ä‘áº§y Ä‘á»§ pháº£i cÃ³ cáº¥u trÃºc cá»™t, policy authenticated, hÃ m index/convention search, trigger cho `tg_cap_nhat`.
- Lá»—i thÆ°á»ng gáº·p cáº§n trÃ¡nh: dÃ¹ng `uuid` cho `id`, sai cáº¥u trÃºc tÃªn cá»™t liÃªn káº¿t.

### Auth, tÃ i khoáº£n vÃ  nhÃ¢n viÃªn

- ÄÄƒng nháº­p theo fake email: nháº­p `admin` thÃ¬ app tá»± hiá»ƒu lÃ  `admin@gmail.com`.
- Bá» tÃ­nh nÄƒng Ä‘Äƒng kÃ½.
- TÃ i khoáº£n máº·c Ä‘á»‹nh Ä‘á»ƒ test: `admin` / `5fedu.com`.
- Module nhÃ¢n viÃªn giá»¯ trÆ°á»ng chÃ­nh: `id`, `ho_va_ten`, `avatar`, `trang_thai`, `id_phong_ban`, `id_chuc_vu`, `so_dien_thoai`, `email`, `ten_dang_nhap`.
- Khi táº¡o má»›i hoáº·c Ä‘á»•i `ten_dang_nhap`, Supabase cáº§n táº¡o/xÃ³a tÃ i khoáº£n theo `<ten_dang_nhap>@gmail.com`, máº­t kháº©u máº·c Ä‘á»‹nh `123456`. Flow nÃ y cáº§n xá»­ lÃ½ báº±ng server/admin path, khÃ´ng Ä‘Æ°a service role vÃ o frontend.

### Flow, UI, search, notification

- Flow thao tÃ¡c chuáº©n: Ä‘ang á»Ÿ detail báº£ng cha -> báº¥m thÃªm dÃ²ng con -> má»Ÿ form -> lÆ°u hoáº·c há»§y -> quay láº¡i detail báº£ng cha.
- Module cÃ³ nhiá»u tab pháº£i lÆ°u tab hiá»‡n táº¡i báº±ng router query `?tab=<tab>`.
- Search box pháº£i tÃ¬m Ä‘Æ°á»£c táº¥t cáº£ trÆ°á»ng trong báº£ng vÃ  trÆ°á»ng liÃªn káº¿t hiá»ƒn thá»‹. VÃ­ dá»¥ báº£ng chá»‰ cÃ³ `id_nguoi_tao` nhÆ°ng ngÆ°á»i dÃ¹ng tÃ¬m theo tÃªn nhÃ¢n viÃªn váº«n pháº£i ra káº¿t quáº£.
- Notification máº·c Ä‘á»‹nh lÃ  demo: trÃªn icon cÃ³ dáº¥u demo, báº¥m vÃ o bÃ¡o chá»©c nÄƒng khÃ´ng sáºµn cÃ³ Ä‘á»ƒ ngÆ°á»i dÃ¹ng khÃ´ng Ä‘Ã²i há»i notification tháº­t á»Ÿ giai Ä‘oáº¡n nÃ y.

### Permission chi tiáº¿t

- Máº·c Ä‘á»‹nh module cÃ³ quyá»n `xem`, `them`, `sua`, `xoa`, `quan_tri`.
- CÃ³ thá»ƒ cÃ³ nÃºt chá»n táº¥t cáº£ trÃªn UI, nhÆ°ng khi lÆ°u váº«n lÆ°u tá»«ng quyá»n tháº­t.
- CÃ³ quyá»n module thÃ¬ hiá»ƒn thá»‹ module/submenu; khÃ´ng cÃ³ quyá»n thÃ¬ bá»‹ cháº·n khi truy cáº­p route.
- `quan_tri` luÃ´n Ä‘Æ°á»£c xem, thÃªm, sá»­a, xÃ³a toÃ n bá»™ báº¥t ká»ƒ rule chi tiáº¿t.
- Rule xem cÃ³ thá»ƒ phá»¥ thuá»™c cáº¥p báº­c/phÃ²ng/nhÃ³m:
  - `cap_bac=1`: xem háº¿t.
  - `cap_bac=2`: xem trong phÃ²ng.
  - `cap_bac=3`: xem trong nhÃ³m.
  - cÃ²n láº¡i: chá»‰ xem dá»¯ liá»‡u cá»§a chÃ­nh nhÃ¢n sá»± Ä‘Ã³.
- `them`: nhÃ¢n sá»± cÃ³ chá»©c vá»¥ `cap_bac=1`, hoáº·c cÃ³ quyá»n `quan_tri`, hoáº·c cÃ³ quyá»n `them`.
- `sua`: nhÃ¢n sá»± cÃ³ chá»©c vá»¥ `cap_bac=1`, hoáº·c cÃ³ quyá»n `quan_tri`, hoáº·c cÃ³ quyá»n `sua`.
- `xoa`: nhÃ¢n sá»± cÃ³ chá»©c vá»¥ `cap_bac=1`, hoáº·c cÃ³ quyá»n `quan_tri`, hoáº·c cÃ³ quyá»n `xoa`.
- Module key lÆ°u trÃªn Supabase pháº£i lÃ  tiáº¿ng Viá»‡t khÃ´ng dáº¥u cá»§a tÃªn module, vÃ­ dá»¥ Ä‘Ãºng `nhan-vien`, sai `he-thong/nhan-vien`.
- Vá»›i module nhÆ° báº£ng lÆ°Æ¡ng, dá»¯ liá»‡u cÃ³ thá»ƒ chá»‰ cho phÃ©p xem cá»§a chÃ­nh ngÆ°á»i Ä‘Ã³ theo app-side permission. KhÃ´ng tá»± thÃªm RLS Supabase náº¿u chÆ°a Ä‘Æ°á»£c chá»‘t.

### Delivery

- Giao diá»‡n desktop dÃ¹ng list view, mobile dÃ¹ng card view; form/detail view theo template.
- LÃ m xong dá»± Ã¡n pháº£i cÃ³ plan tá»‘i Æ°u trÃ¡nh quÃ¡ táº£i Supabase Egress vÃ  Vercel Edge Function, tham kháº£o tÃ i liá»‡u chÃ­nh thá»©c má»›i nháº¥t cá»§a Supabase/Vercel.
- Khi push cáº§n push GitHub theo quy trÃ¬nh repo hiá»‡n táº¡i.
## áº¢nh pháº£n há»“i owner ngÃ y 2026-05-31

Nguá»“n: áº£nh chat ngÆ°á»i dÃ¹ng gá»­i ngÃ y 2026-05-31.

CÃ¡c Ã½ Ä‘Ã£ chá»‘t tá»« pháº£n há»“i:

- Owner nháº¯c: `id` cÃ¡c báº£ng pháº£i lÃ  `int8` vÃ  tá»± Ä‘á»™ng tÄƒng dáº§n.
- Supabase cÃ³ tÃ­nh nÄƒng auto increment cho `int8`; khÃ´ng Ä‘Æ°á»£c bá» qua hoáº·c nÃ³i khÃ´ng cÃ³.
- Owner yÃªu cáº§u Ä‘á»c láº¡i note/sheet ká»¹ vÃ¬ Ä‘ang sai nhiá»u, nháº¥t lÃ  pháº§n Ä‘Äƒng nháº­p.
- Báº£ng nhÃ¢n viÃªn pháº£i bá» cÃ¡c trÆ°á»ng linh tinh.
- Pháº§n login pháº£i lÃ m chuáº©n trÆ°á»›c: khÃ´ng pháº£i mÃ£ nhÃ¢n viÃªn, mÃ  lÃ  `ten_dang_nhap`.
- Khi thÃªm/sá»­a `ten_dang_nhap` pháº£i tá»± sá»­a Supabase Auth user; khi xÃ³a pháº£i xÃ³a Supabase Auth user tÆ°Æ¡ng á»©ng.
- NgÆ°á»i dÃ¹ng sáº½ Ä‘Äƒng nháº­p Google trong browser Ä‘á»ƒ cáº¥p quyá»n Ä‘á»c 2 Google Sheets lÃ m source tham chiáº¿u chÃ­nh.

CÃ¡c Ã½ nÃ y Ä‘Ã£ Ä‘Æ°á»£c chuáº©n hÃ³a thÃ nh gate chi tiáº¿t á»Ÿ `context/5fedu/10-owner-feedback-lessons.md`.


