# Control Plane V2 — bản đồ kiến trúc

## A. Ranh giới authority

Control Plane là projection cho operator, không phải authority source. Công
việc active được đọc từ `.agent/current.json`; plan truth đến từ ledger đã bind
và requirements; PASS chỉ do verifier/evidence reducer suy ra.

UI có thể yêu cầu transaction supersede canonical qua `/api/authority/supersede`
khi được phép, nhưng không được tạo authority bằng local state, label, selection,
session hay telemetry.

## B. Ranh giới dữ liệu

Giữ các API operator hiện có cho health, authority, plans, runs, audit, config
và mutation. Giữ nguyên các endpoint chẩn đoán nội bộ nếu compatibility cần,
nhưng chúng không phải data source của UX V2 và không thuộc thiết kế lại.

Frontend chỉ có một typed client/view-model boundary. Raw enum, hash, plan ID,
generation và evidence identity giữ nguyên; tiếng Việt chỉ thuộc presentation
layer.

## C. Bề mặt operator

`/workspace` là entry chính, đặt một case active làm tâm điểm thay vì hiển thị
lưới KPI. Workspace liên kết authority, plan, run, blocker, evidence và next
safe action trong cùng một ngữ cảnh.

Các flow phụ là:

- Kế hoạch: lineage, requirement, quyết định và thay đổi authority.
- Lần chạy: trạng thái thực thi, tiến độ, lỗi và recovery rõ ràng.
- Bằng chứng: traceability, verifier, freshness và nguồn bằng chứng.
- Hệ thống: health, capability, store và trạng thái read-only theo ngôn ngữ
  vận hành dễ hiểu.

Navigation không có mục dành cho diagnostic nội bộ. Route cũ, nếu cần, chuyển
về flow phù hợp hoặc giữ compatibility projection đến khi có parity evidence.

## D. Cấu trúc frontend

Giữ React/TypeScript/Vite. Đích tổ chức tham khảo:

```text
src/client/
  app/
  components/
  features/workspace/
  features/plans/
  features/runs/
  features/evidence/
  features/system/
  i18n/
  state/
  styles/
```

Có thể giữ cấu trúc phẳng hơn nếu tái sử dụng không tốt, nhưng không được có hai
nguồn sự thật cho authority, copy hay view-model.

## E. Nguồn thiết kế

`packages/control-plane/design/control-plane.pen` chỉ được tạo và sửa qua
Pencil MCP với editor foreground. Evidence thiết kế phải có live MCP receipt,
frame ID và render được cho owner thấy. Render Pencil không thay browser/runtime
acceptance.

## F. Persistence và Docker

Preview mount repository tại `/workspace:ro`. Store và telemetry đi qua path
explicit dưới `/var/lib/control-plane`; writable repository là opt-in, không
phải default và phải được test riêng.

## G. Failure semantics

Pencil unavailable, integrity mismatch, unbound authority, stale generation và
native capability unavailable phải trở thành BLOCKED/action-needed trung thực.
Chúng không được thay bằng mock data, success label hoặc dashboard trống.

## H. Cutover và retirement

V2 có feature mode để rollback trong lúc parity. Chỉ archive legacy khi browser
parity, API parity, accessibility, visual/runtime evidence và lifecycle
tombstone cùng tồn tại.
