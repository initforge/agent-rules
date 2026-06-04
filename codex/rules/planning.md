# Planning Rules

## Trigger

Lập plan khi:

- task chạm từ 2 module trở lên;
- task mơ hồ;
- task MEDIUM/HIGH risk;
- task có thể cần nhiều lượt;
- user yêu cầu plan/chia task;
- repo đã có `plan/`;
- cần giữ context qua compaction;
- cần research hoặc codebase map có thể truy vết.

Không tạo locked plan khi user chỉ thảo luận, task LOW risk rõ ràng, user yêu cầu sửa nhanh trực tiếp, hoặc hướng tiếp cận chưa hội tụ.

## Purpose

Plan là executable contract: map, scope lock, context packet, risk register, verification contract và handoff memory.

Plan không phải transcript, raw research dump, full design doc, nơi paste full source file hoặc full test log.

## Draft Vs Locked Plan

Draft plan:
- dùng khi đang thảo luận;
- có thể ở chat hoặc `plan/<feature>/draft.md`;
- không executable;
- có thể sửa mạnh.

Locked plan:
- dùng khi user đã duyệt hướng hoặc yêu cầu implement;
- nằm dưới `<project_root>/plan/`;
- phải có status, scope, acceptance criteria, verification và stop conditions;
- phải update trước khi implementation lệch hướng.

## Folder Layout

Multi-stage work:

```text
plan/<feature>/
|- 00-index.md
|- 01-<vertical-slice>.md
|- 02-<vertical-slice>.md
|- 03-<vertical-slice>.md
|- research/
|- review/
|- decisions.md
`- handoff.md
```

Numbering rules:

- Dùng số hai chữ số liên tục: `00-index.md`, `01-...md`, `02-...md`, `03-...md`.
- Không skip số.
- Không dùng sparse numbering như `10`, `20`, `30`, `35`, `60` nếu project chưa có convention ghi rõ.
- Không dùng một mega-plan cho HIGH risk hoặc multi-domain work.
- Nếu có hơn 3 vertical slices verify độc lập, tạo folder plan với `00-index.md`.
- Kiểm tra bằng `C:\Users\DELL\.codex\scripts\validate-plan-structure.ps1 -PlanRoot <repo>\plan`.

One small plan:

```text
plan/<slug>.md
```

## Granularity

Ưu tiên vertical slices, không chia tùy tiện theo layer kỹ thuật.

Mỗi plan file nên verify độc lập hoặc giải thích vì sao không thể.

HIGH risk và multi-domain work phải split trước khi execute. Audit findings, readiness scoring và roadmap để trong `00-index.md`, `research/`, hoặc `review/`; executable work để trong `01-...md`, `02-...md`.

## Locked Plan Must Include

- Goal
- Context Packet
- Scope: allowed / not allowed
- Invariants
- Risk Register
- Existing Risks / Test Gaps
- Approach
- Estimated diff size
- Acceptance Criteria
- Edge Cases / Error Paths
- Regression Map
- Verification Contract
- Red flags
- Evidence
- Iteration log

## Context Packet Rule

Context Packet nói implementer phải đọc gì và vì sao.

Nên có:
- current behavior summary;
- relevant files and symbols;
- linked research notes;
- prior decisions;
- assumptions;
- non-goals.

Không chứa full files, raw logs, full docs copy hoặc large pasted code.

## Amendments

Minor amendment được phép khi scope không đổi: path/symbol lệch nhẹ, verify command cần chỉnh local, test path khác, diff estimate lệch nhẹ, note path thay đổi, stale filename được sửa. Ghi vào `Iteration log`.

Major amendment phải dừng khi behavior/API/schema đổi, thêm dependency production, chạm auth/payment/security/database migration/data deletion ngoài dự kiến, mở rộng file scope lớn, yếu acceptance criteria, red flag triggered, same failure lặp lại, hoặc hướng task đổi.

## Plan Lifecycle

Status values:

- `todo`
- `doing`
- `done`
- `blocked`
- `obsolete`

Chỉ mark `done` khi acceptance, verification và evidence pass. Trước khi kết thúc lượt có chạm plan, update `Status`, `Last updated`, `Evidence`, `Iteration log`.

## Plan Cleanup

Old plans giữ lại mặc định.

Khi user yêu cầu xóa plan nhưng không nói “delete all” hoặc “xóa hết”:

- record candidate path và `Status:` trước;
- chỉ xóa plan `done` hoặc `obsolete`;
- giữ `todo`, `doing`, `blocked`, và file không có status rõ;
- không xóa `research/`, `review/`, `decisions.md`, `handoff.md` nếu user chưa nêu rõ.

Khi user nói “delete all plans”, “xóa hết plan”, hoặc tương đương:

- record plan paths và statuses trước;
- xóa đúng scope `plan/` được yêu cầu;
- không xóa application code, docs ngoài `plan/`, hoặc unrelated files.

Ưu tiên dry-run bằng `C:\Users\DELL\.codex\scripts\cleanup-plans.ps1 -PlanRoot <repo>\plan -DryRun`.

## Compact Resilience

Trước khi bắt đầu mỗi plan file: đọc lại `00-index.md`, active plan, `decisions.md`, `handoff.md`, linked `research/` và `review/` notes.

Sau context compaction hoặc gián đoạn dài: đọc lại `Iteration log`, không dựa vào trí nhớ.
