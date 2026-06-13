# 5fedu Context Map

## Decision

Use a two-layer setup:

- Global layer: one `/5fedu` prompt, this `5fedu-project` skill, reusable templates, and optional install script.
- Project layer: repo-local `AGENTS.md` plus synced `.agents/5fedu/*.md` and `.codex/5fedu/*.md` mirrors, including `06-decision-status.md` when the legacy expanded layout exists.

Do not put all 5fedu rules into global `AGENTS.md`; that would load customer-specific context for unrelated work.

Do not require `/5fedu` for ordinary implementation. `/5fedu` is only for initial scaffold or later maintenance of context/rules/status. For normal work, the repo-local `AGENTS.md` is the entrypoint.

## Confirmation State

Every 5fedu repo should track decisions in `.agents/5fedu/04-decision-status-and-backlog.md` and mirror the state to `.codex/5fedu/04-decision-status-and-backlog.md`; when legacy expanded files exist, keep `06-decision-status.md` synchronized too.

Allowed statuses:

- `DA_CHOT`: confirmed and usable.
- `CHUA_CHOT`: not confirmed; do not implement the related risky area.
- `CAN_HOI_THEM`: missing or unclear information; ask before proceeding.

Update the status only from explicit user/owner/spec evidence.

## Default Stack To Confirm

- Frontend: React (Vite) + TypeScript.
- UI: Tailwind CSS + internal `components/ui` components with shadcn-like style; do not assume shadcn/Radix registry install.
- Data/state: TanStack Query for server state, Zustand for client state, React Hook Form + Zod for forms.
- Backend: Supabase PostgreSQL + Auth; some early phases may use mock data only if approved.
- Media: Cloudinary.
- Sometimes: Google Sheets/AppSheet credentials.

Always confirm actual project stack and credentials before wiring real integrations.

## Template Source

Frontend template:

- `https://github.com/tahdieuphoi-ctrl/TAH_app`

The template usually contains most frontend modules. Prefer adding/adapting. Avoid broad edits/deletes unless the spec requires it and the user approves.

## Frontend Mapping

Default domains seen in the template:

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

Mapping must be exact:

```text
spec item -> submenu/domain -> module -> view -> tab -> route -> source path -> database table -> service/handler
```

If a screenshot/spec is ambiguous, ask for the Google Sheet, source file, or owner clarification.

## Database Conventions

Baseline table naming:

- Use submenu abbreviation + module name.
- Good: `hc_phieu_hanh_chinh`, `var_nhan_su`.
- Bad: `nhan-su`, `1.nhan-su`.

Baseline columns:

- `id int8`
- label/name column, usually Vietnamese without accents in code such as `ten`, `ho_va_ten`
- grouping/classification columns
- relationship columns as `id_<doi_tuong>`, for example `id_khach_hang`, `id_san_pham`
- `mo_ta` or `dien_giai`
- `ghi_chu`
- `trang_thai`
- `id_nguoi_tao` for most business tables; may be omitted for some system master tables such as phÃ²ng ban/chá»©c vá»¥ if the owner confirms
- `tg_tao`
- `tg_cap_nhat`

Every full table should have:

- complete column structure
- authenticated policy
- index/function/indexing convention required by the project
- trigger for `tg_cap_nhat`

Ask for a sample SQL/table when the "hÃ m index" convention is not clear.

Hard owner-feedback gate:

- App table `id` must be `int8` and auto-incrementing, using identity/bigserial in Supabase/PostgreSQL.
- Do not use `uuid` or `text` as primary key for normal app tables unless a sheet/owner explicitly confirms the exception.
- Foreign keys to app tables must match `int8`.
- Verify schema with `information_schema.columns` after migration.

## Auth And Permissions

- Login uses fake email: user enters `admin`, app uses `admin@gmail.com`.
- Disable registration by default.
- Default account: username `admin`, password `5fedu.com`.
- **Hard credential rule**: Admin password is ALWAYS `5fedu.com` — never change it, never use `123456` or any other value for admin. Regular user accounts default to `123456`. When writing seed/test scripts or browser subagent login: MUST use the correct password per this rule. When testing password-change features: use a dedicated test account, NEVER test on the main admin account.
- Employee module fields should stay lean: `id`, `ho_va_ten`, `avatar`, `trang_thai`, `id_phong_ban`, `id_chuc_vu`, `so_dien_thoai`, `email`, `ten_dang_nhap`.
- Creating or renaming `ten_dang_nhap` should create/delete a Supabase Auth account as `<ten_dang_nhap>@gmail.com` with default password `123456`, only after the secure implementation path is confirmed.
- Login must use `ten_dang_nhap`, not `ma_nhan_vien`.
- Employee create/update/delete of `ten_dang_nhap` must sync Supabase Auth through a server/admin path; never put service role in frontend.
- Permissions are app-controlled by default for business data unless the user asks for Supabase RLS enforcement.
- Module key stored in Supabase should be the module slug only, for example `nhan-vien`, not `he-thong/nhan-vien`.

Default permission names:

- `xem`
- `them`
- `sua`
- `xoa`
- `quan_tri`
- UI-only `tat_ca`, not persisted as a separate database right.

## UI And Flow Rules

- Desktop: list view.
- Mobile: card view.
- Standard views: list, card, detail, form.
- Return to the previous logical place after save/cancel:
  - list -> edit -> form -> save/cancel -> list
  - detail -> edit -> form -> save/cancel -> detail
  - parent detail -> add child row -> form -> save/cancel -> parent detail
- If a module has tabs, the active tab must be represented in the router query as `?tab=<tab>`.
- Search must cover all table fields and linked display fields. Example: searching creator name must work even if the table stores only `id_nguoi_tao`.
- Notification is demo by default: icon shows demo state and clicking explains the feature is unavailable.

## File Export / Download Convention (Chrome-hardened)

- **Never use data URIs** for client-side file downloads. Chrome ignores the `download` attribute on data URIs and blob URLs created from them, resulting in UUID filenames.
- **Never use library-native download methods** (`XLSX.writeFile()`, `jsPDF.save()`). Chrome may show the file in its download manager but NOT persist it to the Downloads folder.
- **Always use `saveBlobAs()`** from `lib/utils.ts`:
  - XLSX: `XLSX.write(wb, { type: 'array' })` → `new Blob([wbout])` → `saveBlobAs(blob, filename)`
  - PDF: `doc.output('blob')` → `saveBlobAs(pdfBlob, filename)`
  - CSV: `new Blob(['\uFEFF' + csvContent])` → `saveBlobAs(blob, filename)`
- `saveBlobAs` uses anchor element + `dispatchEvent(new MouseEvent('click'))` + 15s cleanup delay. This makes Chrome treat it as a real user-initiated download → correct filename + persisted to disk.

## Required Questions Before Build

- What is the exact app name and current spec source?
- Should the TAH template be cloned/adapted now?
- What domains/modules/views/tabs are in scope for this slice?
- Which credentials are available now: Supabase, Cloudinary, Google Sheets/AppSheet, Vercel?
- Should this slice use real Supabase or approved mock data?
- What are the table prefixes and any sample SQL/table from the owner?
- What exact permission rule applies per module?
- Which functions can remain demo and which must be production-real?
