---
name: 5fedu-module-parity
description: "5fedu ERP module UI parity — clone/adapt from Nhân viên/Phòng ban template. Use when làm module mới, thêm module, tạo màn hình/trang, sửa module, chỉnh module, refactor module, thêm chức năng vào module, clone module, lệch, sai pattern, thiếu nút, drawer sai, listview sai, toolbar sai, parity, đối chiếu template, nhập hàng lệch. Do NOT use for branding/landing/redesign outside ERP shells (frontend-architect). Do NOT use without context/5fedu in active repo."
---

# 5fedu module parity

**Ý đồ:** Mọi task tạo/sửa/refactor module ERP phải đối chiếu template **trước** khi code — không chờ user báo lệch.

## Hard stop

- Repo có `context/5fedu/` **và** task là module ERP → **dừng** `frontend-architect`, `master-image-generation`.
- Đọc `context/5fedu/domains/module-mapping.md` + `ui-delivery.md`.
- Nếu có `project-local/00-index.md` → đọc router dự án trước (spec/sheets đã chốt).

## Gate CREATE (module mới)

1. Tra `module-mapping.md` → chọn module tham chiếu (thường **Nhân viên**).
2. Mở toàn bộ file module gốc trong app/template (không chỉ 1 file).
3. Chạy **Clone checklist** trong `module-mapping.md` — đủ file trước khi viết logic nghiệp vụ.
4. **Cấm** generic monolith (1 config page cho nhiều module).
5. Ghi `Template reference` trong plan.

## Gate EDIT (sửa module cũ)

1. Tra mapping → module tham chiếu.
2. Mở route template + route hiện tại — audit **mọi surface** (toolbar, drawer, filter, pagination, export, confirm).
3. Chạy **Audit checklist** trong `module-mapping.md`.
4. Sửa theo reference — không redesign tự do.

## Canonical references

| Surface | Reference |
|---|---|
| CRUD list/form/detail | **Nhân viên** |
| Hierarchy 2 cấp | **Phòng ban** |
| Entity trong cây | **Chức vụ** |
| Tab stats | Tab **Thống kê** Nhân viên |
| Bảng con detail | **Phòng ban** (`EmbeddedChildDataGrid`) |
| Confirm xóa | **Nhân viên** (`useConfirmStore`) |

## Report contract

Mọi task UI/module kết thúc bằng: `Template reference` | `Pattern fidelity` | `Verification` | `Status`
