---
description: >-
  Huong dan su dung context tools: rg/search tool, list_dir, view_file,
  browser, MCP. Kich hoat khi can tra cuu hoac debug.
alwaysApply: false
---

# Context Tools

## Trigger

Áp dụng khi Codex cần:

- codebase context;
- external research;
- impact analysis;
- large log hoặc test triage;
- UI/browser QA;
- tool, MCP hoặc skill lookup;
- kiểm tra project-local context như 5fedu.

## Thứ Tự Đọc Context

1. Entry/index nhẹ: `AGENTS.md`, `00-index.md`, status/questions/source-map nếu có.
2. File gần task: source path, README/package/config liên quan.
3. Rule chi tiết đúng domain: DB/auth/UI/export/security/permission.
4. Impact/call graph nếu thay đổi shared code, API, schema, public type hoặc flow liên module.
5. External docs chỉ khi behavior/library/platform có thể thay đổi hoặc cần nguồn chính thức.

Không đọc toàn bộ context folder chỉ vì nó tồn tại.

## 5fedu Loading Policy

- Trước mọi task trong repo 5fedu: đọc `AGENTS.md`, `.agents/5fedu/00-index.md`, decision/status, `questions.md`, và source/spec map nếu task cần đối chiếu spec.
- Chỉ đọc `.agents/5fedu/02-*` khi đụng database/auth/schema/permission.
- Chỉ đọc `.agents/5fedu/03-*` khi đụng UI/UX/list/detail/form/export.
- Chỉ đọc `.agents/5fedu/10-*` và `12-*` khi task là feedback, nhắc lại lỗi cũ, vận tải, hoặc cần kiểm tra bài học đã được chuyển hóa chưa.
- File `10` và `12` là raw logs hoặc lesson logs; nếu có bài học dùng lại được, phải promote sang rule sống.

## 5fedu Smart Trigger Policy

Khi user yêu cầu `verify production hết`, `test production`, `kiểm tra live`, hoặc cách nói tương đương:

1. Không nhảy thẳng vào browser/test.
2. Đọc entry/index/mapping trước: `AGENTS.md`, `.agents/5fedu/00-index.md`, decision/status, questions, source/spec map.
3. Từ mapping suy ra module, role, database table, UI surface, export, cross-module flow bị ảnh hưởng.
4. Chỉ sau đó mới đọc context chi tiết đúng domain và chạy quality gates.
5. Báo cáo cuối phải nêu rõ context/mapping đã đọc và các context chi tiết được kích hoạt.

Khi task 5fedu dính UI hoặc user nói `chưa chuẩn`, `thiếu`, `không giống`, `chưa đủ`, `module còn thiếu`, `tính năng còn thiếu`:

1. Đọc index/mapping trước để xác định module và nguồn spec/template.
2. Tìm trong `/template` trước khi thiết kế hoặc sửa UI.
3. Nếu `/template` có mẫu đủ đáp ứng prompt/app, bám sát mẫu đó và chỉ đổi tối thiểu theo domain; không tự thêm UI/flow/behavior ngoài scope.
4. Chỉ dùng golden reference khi `/template` không có mẫu trực tiếp, mẫu không đủ hành vi cần làm, hoặc có bằng chứng đang ngõ cụt. Golden reference phải được chọn từ nhiều tab/module theo behavior/output/surface/data relationship/permission pattern; không mặc định một module chung cho mọi task.
5. So sánh `/template` hoặc reference đã chọn với code hiện tại trước khi sửa.
6. Nếu tìm không ra bằng tên module, tìm tiếp theo hành vi, từ đồng nghĩa nghiệp vụ, shared component, library/API, utility, service/query, test và cấu hình liên quan trước khi tự viết mới.
7. Báo cáo cuối phải có dòng `Template checked` hoặc nêu rõ vì sao không kiểm được.

## GitNexus Policy

Dùng GitNexus cho:

- unfamiliar code path;
- refactor, rename, move, delete;
- shared module change;
- public API hoặc type signature change;
- dependency/caller impact;
- MEDIUM/HIGH implementation;
- architecture review.

Không chạy `gitnexus analyze` mù quáng mỗi lượt. Nếu GitNexus stale hoặc unavailable, fallback bằng `rg` và file reads có mục tiêu, rồi ghi fallback trong báo cáo.

## Research Policy

Codex Research là lớp nghiên cứu chính cho:

- internet/docs research;
- changelog/release-note review;
- external platform behavior;
- codebase exploration trước implementation;
- second-pass reasoning;
- bug-fix escalation khi fix trực tiếp không hội tụ.

Ghi note nghiên cứu vào `plan/<feature>/research/*.md`, `plan/<feature>/review/*.md`, hoặc `plan/<feature>/handoff.md` khi task đủ lớn.

## Tool Output Rule

Large outputs:

- tóm tắt;
- lưu raw output chỉ khi cần;
- không paste log lớn vào chat hoặc plan.
