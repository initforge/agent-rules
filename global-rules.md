# Bộ Nạp Runtime Chung

File này là lớp tương thích cho các project còn import:

```text
@P:\agent-rules\global-rules.md
```

Nguồn runtime Codex được bảo trì tại:

```text
P:\agent-rules\codex
```

Đọc và tuân thủ các rule nền:

```text
@P:\agent-rules\codex\rules\core.md
@P:\agent-rules\codex\rules\root-cause-verification.md
@P:\agent-rules\codex\rules\prompt-intent-router.md
@P:\agent-rules\codex\rules\planning.md
@P:\agent-rules\codex\rules\execution.md
@P:\agent-rules\codex\rules\quality-gates.md
@P:\agent-rules\codex\rules\context-tools.md
@P:\agent-rules\codex\rules\tool-inventory.md
@P:\agent-rules\codex\rules\clean-code.md
@P:\agent-rules\codex\rules\technical-debt-control.md
@P:\agent-rules\codex\rules\codex-overlay.md
@P:\agent-rules\codex\rules\deep-reasoning.md
```

## Ranh Giới Global Và Local

- Global chỉ chứa hành vi chung, clean code, verification, context loading, tool inventory, cleanup và git safety.
- Không đưa logic dự án cụ thể vào global: tên bảng, domain, mật khẩu mặc định, route, module, site production, Vercel project, schema chi tiết, phân quyền riêng.
- Context dự án phải nằm trong repo dự án, ví dụ `AGENTS.md`, `.agents/<project>/`, `.codex/<project>/`, `docs/`, hoặc `plan/`.
- Với 5fedu, dùng skill `5fedu-project` và context project-local. Chỉ promote lên global khi rule đó áp dụng được cho nhiều tech stack hoặc nhiều dự án.

## Quy Tắc Ngôn Ngữ

- Trả lời bằng tiếng Việt có dấu đầy đủ theo mặc định.
- Không dùng tiếng Việt không dấu, trừ khi user yêu cầu ASCII-only hoặc file đích đã có quy ước ASCII-only thật.
- Không dùng tiếng Anh nếu có cách nói tiếng Việt tự nhiên.
- Giữ tiếng Anh cho thuật ngữ kỹ thuật, model, lệnh, đường dẫn, API, package, schema key, tên tool, tên sản phẩm và mã nguồn.

## Quy Tắc Cứng Chung

- Đọc context index/entrypoint trước, đọc sâu theo task sau.
- Không sửa file khi chưa hiểu impact tối thiểu.
- Không tự commit, push, deploy, force-push, hoặc bypass hook nếu user chưa yêu cầu rõ.
- Không tự tạo site/project cloud mới.
- Không lưu secret value vào repo hoặc docs.
- Verify bằng bằng chứng trực tiếp trước khi báo `PASS`.
- Cleanup được phép khi có bằng chứng file thừa, trùng chức năng, cache artifact, output tạm, hoặc script một lần đã xong và không còn được hệ thống gọi.
