---
description: >-
  BAT BUOC. Hop dong kich hoat cung: final status PASS/PARTIAL/BLOCKED,
  evidence labels, safe override, protected files, trigger gates,
  technical debt gate. Doc file nay truoc moi task.
alwaysApply: true
---

# Antigravity Hard Activation Contract

File này là rule ưu tiên cao cho Antigravity. Mục tiêu là bù điểm yếu của Antigravity: ít tự kích hoạt context/gate hơn Codex.

## Override An Toàn

- Không tự commit, push, deploy, force-push, migration production hoặc xóa dữ liệu nếu user chưa yêu cầu rõ trong session hiện tại.
- Nếu rule cũ nói tự commit/push/sync destructive, rule này thắng.
- Không ghi đè thay đổi của user.
- Không báo `PASS` nếu thiếu evidence cốt lõi mà agent có thể tự kiểm.
- Không xóa hoặc cleanup file ép chặt Antigravity chỉ vì thấy trùng/lâu/ít dùng. Những file này là guardrail runtime, không phải artifact.

## Protected Runtime Files

Các file sau là lớp ép chặt bắt buộc. Chỉ được sửa khi mục tiêu là nâng cấp rule/runtime; không được xóa trong cleanup thường:

- `.agents/AGENTS.md`
- `.agents/hooks.json`
- `.agents/rules/00-hard-activation-contract.md`
- `.agents/rules/00-antigravity-runtime-intent.md`
- `.agents/rules/01-intent-contract.md`
- `.agents/rules/10-fast-context.md`
- `.agents/rules/prompt-intent-router.md`
- `.agents/rules/quality-gates.md`
- `.agents/rules/technical-debt-control.md`
- `.agents/rules/clean-code.md`
- `.agents/workflows/*.md`
- `.agents/skills/*/SKILL.md`
- `.agents/5fedu/00-index.md`

Nếu user yêu cầu cleanup, trước khi xóa bất kỳ file nào gần các path trên phải dừng, kiểm tra mục đích, và giữ lại nếu nó giúp agent tự kích hoạt context/gate/final status.

## Bắt Buộc Đầu Lượt

Trước khi sửa hoặc verify:

1. Đọc `AGENTS.md` nếu repo có.
2. Đọc `.agents/rules/00-hard-activation-contract.md`.
3. Nếu repo có `.agents/5fedu`, đọc `.agents/5fedu/00-index.md` trước.
4. Chỉ đọc context chi tiết khi prompt hoặc mapping cho thấy task dính domain đó.
5. Bắt buộc tuân thủ luật suy luận sâu sắc (deep-reasoning) và xuất Status Block ở cuối phản hồi trong MỌI session chat (kể cả khi chỉ thảo luận nghiệp vụ, thiết kế hoặc QA).

## Trigger Phải Tự Kích Hoạt

| Prompt signal | Gate bắt buộc |
| --- | --- |
| `verify production`, `verify production hết`, `test production`, `kiểm tra live` | Đọc mapping trước, suy ra module/role/database/UI/export/cross-flow, rồi mới verify production |
| `UI`, `giao diện`, `chưa chuẩn`, `thiếu`, `không giống`, `module thiếu`, `tính năng thiếu` | CHỈ áp dụng cho dự án 5fedu: Tìm `/template` trước, bám sát và đổi tối thiểu, chỉ dùng golden reference khi template thiếu/không đủ/ngõ cụt và ghi `Template checked`. Với dự án KHÔNG PHẢI 5fedu: Bỏ qua hoàn toàn, tập trung vào design system/style mặc định của dự án đó. |
| `permission`, `phân quyền`, `role`, `account`, `auth`, `RLS` | Test đa account/đa cấp nếu có quyền; không chỉ test admin |
| `database`, `schema`, `migration`, `Supabase`, `trigger`, `rollup` | Trace schema/service/query và verify database nếu có quyền |
| `export`, `download`, `Excel`, `PDF`, `CSV` | Tải file thật và kiểm format/nội dung |
| `cleanup`, `gitignore`, `xóa file`, `trùng chức năng`, `không dùng` | Check references bằng `rg`/GitNexus/package scripts/CI/docs trước khi xóa |
| `audit`, `review`, `nợ kỹ thuật`, `bất hợp lý` | Findings first, phân loại risk/debt, không chỉ summary |

## 5fedu Hard Mode (CHỈ áp dụng khi tồn tại thư mục `.agents/5fedu/`)

Quy tắc dưới đây CHỈ được kích hoạt nếu trong thư mục gốc của dự án hiện tại có tồn tại thư mục `.agents/5fedu/`. Nếu không tồn tại thư mục này, tuyệt đối KHÔNG áp dụng các quy tắc sau:

- Không phụ thuộc global rule thay cho project-local context.
- `AGENTS.md` và `.agents/5fedu/00-index.md` là nguồn kích hoạt đầu.
- UI task phải đi: mapping -> `/template` trực tiếp -> code hiện tại -> context rule -> sửa tối thiểu -> verify. Chỉ thêm golden reference khi template thiếu, không đủ hành vi, hoặc có bằng chứng đang ngõ cụt.
- Golden reference phải khớp loại hành vi, không fallback máy móc sang một module chung. Khi template thiếu/không đủ, phải research trong nhiều tab/module theo behavior/output/surface/data relationship/permission pattern để chọn reference phù hợp nhất. Ví dụ `in bảng lương` là print/export PDF: nếu `/template` không có payroll thì tìm `print`, `pdf`, `export`, `report`, `profile`, `jspdf`, `autoTable`, mọi tab/module có PDF/report/export tương tự, utility export, rồi mới thiết kế phần còn thiếu. Nếu `/template` đã có mẫu PDF/export đủ dùng thì bám sát mẫu đó, không tự chế luồng mới.
- Production verify phải đi: mapping -> affected surfaces -> context domain -> deploy/build status -> browser/DB/export/cross-module checks.
- Nếu user nói “chưa chuẩn” hoặc “thiếu”, phải coi đó là yêu cầu audit khoảng lệch với template/spec, không chỉ sửa một điểm bề mặt.

## Technical Debt Hard Gate

Trước khi kết thúc task vừa/lớn, UI, production, permission, database, export hoặc cleanup:

- Phân loại nợ mới theo: correctness, data, permission, UX, architecture, test, operational, knowledge.
- Nợ nghiêm trọng trong scope phải sửa trước khi báo `PASS`.
- Nếu còn nợ được chấp nhận, ghi `Remaining debt` và lý do.
- Trước push/commit được user yêu cầu, chạy hoặc mô phỏng debt/artifact check; không stage artifact ngoài scope.

## Final Evidence Bắt Buộc

Với task không nhỏ, final/report phải có các nhãn ổn định sau:

```text
Intent detected:
Context loaded:
Template checked:
Verification:
Technical debt check:
Status: PASS/PARTIAL/BLOCKED
```

Nếu không thể kiểm một mục, ghi blocker và báo `PARTIAL` hoặc `BLOCKED`, không báo `PASS`.
