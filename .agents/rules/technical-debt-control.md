---
description: >-
  BAT BUOC. Kiem soat no ky thuat: phan loai debt, severity matrix,
  khi nao phai sua truoc PASS, debt register format.
alwaysApply: true
---

# Technical Debt Control

## Trigger

Áp dụng khi viết code, sửa lỗi, review, refactor, test, cleanup, hoặc chuẩn bị push/commit.

## Mục Tiêu

Không để task hoàn thành bằng cách đổi nợ kỹ thuật lấy tốc độ ngắn hạn mà không nhìn thấy chi phí. Nợ kỹ thuật không bị cấm tuyệt đối, nhưng phải được phát hiện, giới hạn, ghi nhận và xử lý khi nó tạo rủi ro thật.

## Debt Taxonomy

Phân loại nợ kỹ thuật theo tác hại:

- Correctness debt: logic sai ngầm, edge case bỏ qua, state lệch, cache không invalidated.
- Data debt: schema mơ hồ, migration không idempotent, dữ liệu test lẫn production, thiếu constraint, thiếu rollback.
- Permission debt: chỉ test admin, UI ẩn nhưng API vẫn mở, role/row filter không được verify.
- UX debt: flow thiếu trạng thái loading/error/empty, toolbar/filter/export hoạt động nửa vời, responsive vỡ.
- Architecture debt: coupling cao, shared module phình, generic hóa ép buộc, abstraction che behavior.
- Test debt: thiếu test/gate cho behavior mới hoặc regression quan trọng.
- Operational debt: script một lần không dọn, env/gitignore sai, build/deploy/checklist không tái chạy được.
- Knowledge debt: rule mới chỉ nằm trong chat/log, context không sync, quyết định chưa cập nhật.

## Debt Budget

Mỗi task chỉ được để lại nợ khi tất cả đúng:

- không phá acceptance criteria;
- không che lỗi nghiêm trọng;
- không tăng rủi ro data loss/security/permission;
- có lý do rõ vì sao chưa xử lý ngay;
- có vị trí ghi lại: plan, TODO có issue/link, backlog, hoặc final `Remaining debt`.

Không được để lại nợ loại này nếu có thể xử lý trong scope hợp lý:

- lỗi build/type/lint do chính task tạo;
- dead button, fake CRUD, mock data trong feature đã yêu cầu thật;
- permission chỉ test admin khi feature có phân quyền;
- export không tải/mở file thật;
- database write không đối chiếu record/policy khi có quyền;
- UI 5fedu không đối chiếu `/template` trước, hoặc fallback sang reference không cùng behavior/surface khi template thiếu/không đủ;
- context/rule mới chỉ nằm trong chat mà không promote/sync.

## Pre-Change Debt Check

Trước khi sửa task MEDIUM/HIGH:

1. Xác định vùng code có nợ sẵn hay không.
2. Phân biệt existing debt với debt do task tạo.
3. Không ôm cleanup rộng nếu nó không trực tiếp giảm rủi ro task.
4. Nếu phải chạm nợ sẵn, ghi rõ trong risk register hoặc final.

Có thể chạy quét tín hiệu nợ kỹ thuật trước khi audit sâu, trước cleanup lớn, hoặc trước push/commit:

```powershell
C:\Users\DELL\.codex\scripts\audit-technical-debt.ps1 -RepoRoot <repo>
```

Script này chỉ là signal scan, không phải verdict. Phải phân loại findings theo taxonomy trước khi sửa hoặc xóa.

## During-Change Controls

- Giữ diff nhỏ, theo module sở hữu.
- Không tạo generic abstraction trước khi có pattern thật.
- Không copy-paste logic nghiệp vụ mà không kiểm rule khác biệt.
- Không thêm dependency production nếu không có lý do mạnh và verification.
- Không bỏ qua error path/loading/empty state ở UI có user thao tác.
- Không thêm script tạm mà không có cleanup/gitignore hoặc docs dùng lại.
- Không tạo TODO mơ hồ; TODO phải có owner/context hoặc không viết.

## Pre-Done Debt Gate

Trước khi báo xong, tự kiểm:

1. Task có tạo nợ mới không?
2. Nợ đó thuộc taxonomy nào?
3. Có nợ nào đáng sửa ngay vì rủi ro cao hoặc nằm đúng scope không?
4. Có file tạm, script debug, artifact test, export download, screenshot/video cần dọn hoặc gitignore không?
5. Có context/rule/decision cần cập nhật để tránh lặp lỗi không?
6. Verification đã chứng minh không tăng nợ correctness/data/permission chưa?

Nếu có nợ nghiêm trọng trong scope, sửa tiếp rồi verify lại. Nếu không thể sửa ngay, báo `PARTIAL` hoặc ghi `Remaining debt` rõ ràng.

## Push/Commit Debt Gate

Trước khi stage/commit/push khi user đã yêu cầu:

1. Chạy `git status --short` để phân biệt thay đổi của agent và thay đổi có sẵn của user.
2. Dọn artifact rõ ràng: cache, log, screenshot/video test, file export download, script debug một lần.
3. Kiểm `.gitignore` có che đúng artifact ngoài lề nhưng không che source script/build/test/migration cần dùng.
4. Với file bị xóa: có bằng chứng reference check bằng `rg`, GitNexus, package scripts, CI, docs hoặc tool mạnh hơn.
5. Không stage thay đổi ngoài scope nếu không cần cho task.
6. Nếu còn debt nghiêm trọng trong scope, không push như `PASS`; báo `PARTIAL` hoặc sửa tiếp.

## Protected Runtime Debt Gate

Các file ép hành vi agent không được coi là nợ kỹ thuật chỉ vì chúng là context/rules:

- `AGENTS.md`
- `.agents/AGENTS.md`
- `.agents/hooks.json`
- `.agents/rules/00-hard-activation-contract.md`
- `.agents/rules/prompt-intent-router.md`
- `.agents/rules/quality-gates.md`
- `.agents/rules/technical-debt-control.md`
- `.agents/workflows/*.md`
- `.agents/skills/*/SKILL.md`
- `.agents/5fedu/00-index.md`
- `.codex/5fedu/00-index.md`

Nếu agent định xóa, gộp, rename hoặc gitignore các file này, phải dừng và chứng minh file không còn vai trò kích hoạt context/gate/final status. Mặc định là giữ.

## Debt Evidence Format

Với task vừa/lớn, report nên có:

```text
Technical debt check:
- New debt: none | <items>
- Reduced debt: <items>
- Remaining debt: none | <items + reason>
- Cleanup/gitignore: <what was checked>
```

Nếu có report file, có thể kiểm bằng:

```powershell
C:\Users\DELL\.codex\scripts\validate-task-evidence.ps1 -ReportPath <path> -Mode generic
```

Mẫu report có sẵn:

```text
C:\Users\DELL\.codex\templates\task-evidence-template.md
C:\Users\DELL\.codex\templates\technical-debt-register.md
```

## 5fedu-Specific Debt Rules

- Production-first verification là nợ nếu code đã push/deploy nhưng chưa verify production và không có blocker rõ.
- UI không theo `/template` khi template đủ, hoặc fallback reference không cùng behavior/surface khi template thiếu/không đủ, là nợ nghiêm trọng.
- Generic CRUD hời hợt cho module nghiệp vụ là nợ kiến trúc và UX.
- Derived totals cho phép nhập tay là nợ correctness/data.
- Permission chưa test đa account/đa cấp là nợ permission.
- Supabase schema/auth rule không sync với context là nợ knowledge.
- Toolbar/filter/export thiếu behavior thật là nợ UX/test.
