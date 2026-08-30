# 5fedu permission rules

Route for permission, data scope, `cap_bac`, sidebar/navigation, route guards,
stats/report access, or RLS decisions.

1. Preserve six basic rights: `Xem`, `Thêm`, `Sửa`, `Xóa`, `Quản trị`, and
   `Tất cả`. Use a no-diacritics module slug (for example `nhan_vien`) and the
   project mapping between application and database keys.
2. Sidebar configuration is the navigation authority. The permission matrix
   must mirror the visible subsystem → group → module hierarchy, rather than
   source-folder or bounded-context names.
3. A statistics tab inside CRUD inherits its parent module and exposes view/
   export only. A standalone statistics surface either has a view-only row or
   explicitly borrows its parent permission; it does not receive misleading
   CRUD rights.
4. Apply `cap_bac` scope exactly: level 1 or `quyen_quan_tri` has all records;
   level 2 has `phong_id` scope and only unlocked department edits; level 3 has
   `nhom_id` scope; other users have only records tied to `id_nhan_vien` or
   `nguoi_tao`.
5. Default row filtering belongs in the application/service layer. Every app
   table still has authenticated-only RLS; sensitive row-level RLS (such as
   payroll) requires owner confirmation. UI visibility, route/service guards,
   and database policy must agree.
6. A new module starts by locating its sidebar subsystem/group, then registers
   its matrix and app/DB key, verifies navigation filtering, route guard, and
   toolbar hooks, and selects inherited or standalone stats access.

Never infer approval from edit permission, and never validate permissions only
as an administrator.
