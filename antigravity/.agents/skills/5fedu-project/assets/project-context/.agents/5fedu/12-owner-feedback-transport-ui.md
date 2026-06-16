# Owner Feedback Transport UI — Archive Index

> **Không phải rule file.** Chỉ index truy vết. Rule sống: `02-database-and-auth-rules.md`, `03-ui-ux-and-delivery-standards.md`, `13-trip-execution-vs-approval-spec.md`, `14-production-e2e-harness.md`.

## Cấm dump raw vào đây

Khi có feedback vận tải/UI mới:

1. **Promote ngay** vào file rule sống (1–5 bullet imperative, không quote owner dài).
2. Cập nhật `06-decision-status.md` nếu đổi phạm vi `DA_CHOT`.
3. Chỉ thêm **một dòng** vào bảng dưới: `ngày | chủ đề | promoted → file §`.
4. Sync master: **chỉ file rule** (xem `14` §11).

## Promoted index (2026-06-15)

| Ngày | Chủ đề | Rule sống |
|------|--------|-----------|
| 2026-05-31 | CRUD nghiệp vụ, combobox, derived fields, export | `03` Universal Verification Gate |
| 2026-06-10 | Một lớp duyệt (superseded) | — |
| 2026-06-14 | Toolbar một nút Quản lý duyệt | `03` popup phê duyệt |
| 2026-06-15 | TH vs duyệt, báo cáo CT, cascade cha, lương R6 | `02` §10, `03` Hai lớp trạng thái, `13` R1–R7 |
| 2026-06-15 | Không duyệt lẻ CT | `03` harness, `13` R4, `14` §6 |
| 2026-06-15 | Báo cáo CT (không modal ghi chú cha) | `03`, `DriverCtReportDialog` pattern |

Raw chat owner: Google Sheet + `13-trip-execution-vs-approval-spec.md` §6.