# Owner Feedback Lessons — Archive Index

> **Không phải rule file.** Rule sống: `02-database-and-auth-rules.md`, `03-ui-ux-and-delivery-standards.md`, `AGENTS.md`.

## Cấm dump raw vào đây

1. Promote imperative rule vào pillar 02/03/00.
2. Thêm một dòng vào bảng index (nếu cần truy vết).
3. **Không** sync file này lên agent-rules master.

## Promoted index

| Chủ đề | Rule sống |
|--------|-----------|
| `id int8`, FK `int8`, staff lean | `02` 5fedu-Specific Baseline |
| `ten_dang_nhap`, admin `5fedu.com`, auth sync server-side | `02`, `AGENTS.md` |
| Permission đa account, export Excel/PDF | `02`, `03` |
| TDZ/hooks production | `03` |
| Master-detail verify | `03` |
| Admin sửa/xóa chuyến Đã duyệt; nút vs toast; CT edit ≠ báo cáo TX | `03` § Cascading Locks, `14` §12, `lib/permissions.ts` |