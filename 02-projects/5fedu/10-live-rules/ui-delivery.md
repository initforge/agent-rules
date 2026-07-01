# Pillar 3: UI/UX Parity and Delivery Gates

Tai lieu nay chi giu rule song cho UI/pattern/workflow cua 5fedu. Khong dung file nay de luu raw feedback, case dump hoac note legacy dai dong.

## Core UI Source Of Truth

- Template/current app la source of truth bat buoc.
- Khong tu che pattern moi neu da co pattern song trong template/app.
- Khong lay module dang loi hoac module clone sai lam chuan nguoc lai.
- Truoc khi code UI/module, phai xac dinh reference dung theo surface/behavior.
- 5fedu thuong co template/ref routes san; agent phai mo va doi chieu bang mat truoc khi code task UI dai, khong lam theo tri nho.

Thu tu uu tien:

1. template truc tiep cung behavior
2. template cung surface
3. module song trong app cung behavior
4. shared primitive/component/helper da co

## Canonical References

- CRUD/list/form/detail: lay `Nhan vien`
- Hierarchy 2 cap: lay `Phong ban`
- To chuc ben trong hierarchy 2 cap: lay `Chuc vu` nhung van xem `Phong ban` la truc cha
- Stats/report/tab-view: lay tab `Thong ke` cua `Nhan vien`
- Print/PDF/export: lay toolbar in/xuat va helper export dang song

Quy tac baseline:

- `Nhan vien` la module goc va la canonical reference cho moi module CRUD chuan hoac bien the CRUD trong nhom quan tri noi bo.
- `Phong ban` chi dung 2 cap neu spec/template/app chua xac nhan cau truc sau hon.
- `Chuc vu` la lop doi tuong gan ben trong cay `Phong ban`; khi dung form, filter, grouping, detail va permission scope, khong xu ly `Chuc vu` nhu mot module doc lap cat roi khoi truc to chuc.
- Neu module moi co nature "entity quan tri noi bo", uu tien clone/adapt tu `Nhan vien`; chi doi phan nghiep vu can thiet, khong doi layout/surface vo co.
- Neu module co `Thong ke`, phai reuse shell stats cua `Nhan vien`: tab `stats`, toolbar loc, KPI, chart, grid, export/report, drilldown.

Neu reference duoc chon khong khop behavior thi phai bo, khong duoc bam module quen tay.

## Surface Classification Gate

Truoc khi sua UI/module, phai phan loai tung surface dang cham vao:

- CRUD listview: toolbar, search, filter chip, column visibility, export, pagination, row action, row-click detail.
- Form drawer: header, section layout, footer action, submit/cancel state.
- Detail drawer: header summary, section cards, footer `Dong / Sua / Xoa`, permission/action placement.
- Stats/report tab-view: tab shell cua factory/page, toolbar filter/report actions, cards/table/chart/export/print.
- Hierarchy 2 cap: parent-child grouping theo mau `Phong ban`/`Chuc vu`, khong lam flat list neu source co quan he cap.

Form them va detail drawer phai di thanh cap reference. Khong duoc lay form tu module A nhung detail tu pattern roi rac module B neu template goc da co cap dung.

Neu mot prompt noi "sai pattern", "thieu nut", "drawer sai", "thanh bo loc sai" thi khong chi sua dung mot control bi nhac; phai audit tat ca surface cua module do va cac module cung pattern trong batch.

Trong audit surface, phai tach ro control cung ten nhung khac pattern:

- Toolbar filter dung filter chip pattern (`FilterChip*`, `ToolbarFilterChipGroup`, count/reset neu co), khong thay bang combobox form.
- Form/drawer input dung form combobox/searchable combobox pattern, khong be nguyen filter chip vao form.
- Richtext/action popup trong form phai dung modal/popover theo design system, khong dung native `prompt/alert/confirm` neu app da co pattern song.

## Hard Gates

- Cam tu che ten module, button, tab, route, empty state, icon, tooltip, workflow neu khong co nguon ro tu spec/template/app.
- Cam generic hoa luoi bieng. Moi feature van phai co file view/table/form/service rieng theo ownership ro rang.
- CRUD/listview chuan phai co: search, filter toolbar, column visibility, pagination footer, action day du theo permission.
- Detail/form drawer phai dung header/section/footer/action placement theo pattern song.
- Module thuc chat chi la bien the CRUD cua nhom quan tri noi bo thi cam tu che lai form/drawer/action placement lech khoi `Nhan vien`.
- Export that phai co `exportColumns` va `exportMapFn` khop du lieu thuc te.
- Stats/report khong duoc nhét mini-tab vao CRUD page neu da co surface stats rieng.
- Moi truong 5fedu hay dung anh tu link ngoai; moi input/preview/render anh phai cover Google Drive share link, thumbnail va richtext image, khong chi test URL truc tiep.
- Neu doi vi tri/ten module, phai sync dong thoi sidebar/card, breadcrumb, route registry/guard, permission matrix, module key va text label; khong duoc chi doi navigation hien thi.

## Verification Gate For UI

Moi thay doi UI phai verify nhu mot he thong lien ket:

- toolbar, filter, search, column toggle, pagination
- list/detail/form/drawer
- action theo permission
- responsive neu module co mobile behavior
- export file that
- cross-module sync neu du lieu anh huong module khac
- runtime imports/props/hook/factory, khong chi build pass
- local evidence chi la preflight; PASS cho task UI/module can production proof day du
- neu user yeu cau push/deploy, phai push, doi CI/CD deploy xong, roi verify production bang browser/screenshot/console thay vi chi verify local
- neu production chua dat, tiep tuc vong lap sua -> push -> doi deploy -> verify lai; khong dung o local pass
- bang chung chinh la screenshot/anh that cua production tren cac surface lien quan; DOM chi la cong cu ho tro selector/state/debug
- production verify phai dung browser context moi hoac bypass cache/service worker khi co PWA, doi app tai xong roi moi chup/kiem tra
- voi task UI co nhieu batch, production verify phai co interaction check cho cac surface da sua: add drawer, row-click detail, form popup, filter/dropdown, khong chi mo route va doc text
- production verify nen chup du anh desktop/mobile neu module co responsive behavior va giu anh theo surface: route, filter, form drawer, detail drawer, export/preview neu co

## Nostime Decisions Promoted To Living Rules

- Khong co module `Ton kho theo danh muc`.
- `Ton kho` la listview ton thuc te theo san pham.
- `Bao cao NXT` la surface stats/report, khong phai CRUD gia.
- `Bao cao NXT` dung pattern tab-view stats cua `Nhan vien`.
- Sidebar, route guard, permission registry va module key phai di cung nhau.

## Agent Workflow Gate: Pattern Fidelity Audit

Truoc khi bao PASS cho task UI/module rong, agent bat buoc audit:

- reference da chon la gi
- da mo template/current route nao va doi chieu bang mat chua
- da lap map module -> surface -> reference -> expected controls chua
- toolbar da dung pattern chua
- drawer detail/form da dung pattern chua
- listview co con in dam data cell trai pattern khong
- row-click detail va popup/drawer tao moi co dung pattern khong
- export da chay that chua
- stats/report da dung dung nhanh surface chua
- runtime error da quet import/export/props/factory chua
- neu co nhieu module cung loi lap lai, da quet het cac module cung primitive/pattern chua
- cac input anh/preview anh co render duoc Google Drive link chua
- doi ten/doi vi tri module da sync het sidebar, breadcrumb, permission va registry chua
- production da verify interaction sau deploy that chua, hay moi chi build/local route smoke

Report cuoi phai co:

- `Template checked`
- `Pattern fidelity`
- `Verification`
- `Status`

## Plan And Report Contract

Khi lap plan cho task UI/module 5fedu, phai viet theo format co dinh:

1. `Muc tieu`
2. `Khao sat da xac nhan`
3. `Implementation changes`
4. `Verification plan`
5. `Assumptions locked`

Trong plan/report:

- Luon ghi `Template reference` da chon va ly do.
- Luon ghi `Production verification path`.
- Task UI/module phai ghi ro `Verify by image`.
- Khong viet "sua UI theo template" mot cach chung chung; phai neu module goc nao lam baseline va surface nao se reuse.
