---
name: 5fedu-module-parity
description: "5fedu ERP module UI parity — clone/adapt from Nhân viên/Phòng ban template. Use when làm module mới, thêm module, tạo màn hình/trang, sửa module, chỉnh module, refactor module, thêm chức năng vào module, clone module, lệch, sai pattern, thiếu nút, drawer sai, listview sai, toolbar sai, parity, đối chiếu template, nhập hàng lệch. Do NOT use for branding/landing/redesign outside ERP shells (frontend-architect). Do NOT use without context/5fedu in active repo."
---

# 5fedu module parity

**Ý đồ:** Task tạo/sửa/refactor module ERP → đối chiếu template **trước** khi code — không chờ user báo lệch.

## Hard stop

- Có `context/5fedu/` + module ERP → **dừng** `frontend-architect`, `master-image-generation`.
- Có `project-local/00-index.md` → đọc router dự án trước (spec/sheets đã chốt).

## Đọc theo thứ tự (một luồng)

1. **`context/5fedu/domains/references/pattern-inventory.yaml`** — surface → **shell_must** (parity 100%) vs **variable_slots** (fields/chips/KPIs module-specific). Bắt buộc trước code.
2. **`context/5fedu/domains/module-mapping.md`** — chọn module tham chiếu; chạy **Clone checklist** (mới) hoặc **Audit checklist** (sửa). Checklist **chỉ** ở file này.
3. **`context/5fedu/domains/ui-delivery.md`** — surface classification + verify gates khi implement hoặc user báo lệch pattern.
4. **`context/5fedu/domains/references/ui-delivery-detail.md`** — lazy khi cần deep-dive surface.

## Pattern Fidelity Packet (bắt buộc)

Hai phần — **không** gộp:

| Phần | Nội dung |
|---|---|
| **Shell parity** | Surface + `shell_must` từ inventory đã đối chiếu template_paths |
| **Variable map** | Fields drawer, filter chip options, KPI cards, columns, export — nguồn spec/schema module (không copy mù Nhân viên) |

## Report contract

Mọi task UI/module kết thúc bằng: `Template reference` | `Shell parity` | `Variable map` | `Pattern fidelity` | `Verification` | `Status`

## Deep QA (optional)

Owner yêu cầu test như user / exploratory / verify UI sau parity → mid-flow combo `qa-skills` + `browser-qa`. Không thay checklist mapping/template.
