---
description: "Fast context, 5fedu loading, tools, research, inventory"
---

# 03-context-and-tools

Gốc: `rules/03-context-and-tools.md`.

## Fast context

**Mục tiêu:** Nạp ít, đọc đúng, dùng skill khi khớp.

**Budget:**

- Không đọc toàn repo.
- Đầu: `AGENTS.md`, README, config chính, file gần task.
- Runtime/agent-rules: chỉ file cụ thể khi task liên quan harness.
- **Composer anti-stuck:** Câu hỏi chiến lược → 1-3 file philosophy rồi trả lời; không explore 15+ file.

## Trigger map

| Signal | Skill/hành động |
|---|---|
| setup/scaffold 5fedu | `5fedu-project` |
| research, xác minh mới | `researcher` |
| học context, sửa rule/skill/workflow, feedback lặp lại | `context-evolution-protocol` |
| review, audit | findings first |
| docs, readme, spec | `docs-style` |
| screenshot, playwright | `screenshot`, `playwright` |
| security, threat model | `security-best-practices`, `security-threat-model` |
| PDF | `pdf` |
| UI quality | `frontend-ui-quality` |

## Stop conditions

- `BLOCKED`: thiếu credential/schema/quyền sau khi đã thử fallback.
- `PARTIAL`: làm được phần chính, verify chưa đủ.

---

## Context tools — thứ tự đọc

1. Entry/index nhẹ.
2. File gần task.
3. Rule domain (DB/auth/UI/export) khi dính.
4. Impact graph nếu shared/API/schema change.
5. External docs khi library/platform đổi.

## 5fedu loading

**Detection:** `.grok/5fedu/` hoặc `.codex/.agents/.kiro/5fedu/`. Phải đọc skill `5fedu-project` trước khi scaffold/sửa context.

**Luôn đọc trước:** `AGENTS.md`, `*/5fedu/00-index.md`, decision/status, questions nếu blocker.

**Đọc có điều kiện:**

| Domain | File pattern |
|---|---|
| DB/auth/schema | `02-*` |
| UI/UX/export | `03-*` |
| Feedback/lessons | `10-*`, `12-*` |

## 5fedu smart triggers

**Production verify:** mapping → surfaces → domain → gates → report context loaded.

**UI parity:** `/template` trước → golden reference chỉ khi template thiếu → `Template checked` trong final.

## GitNexus

Dùng khi: unfamiliar path, refactor/rename/delete shared, API/type change, MEDIUM/HIGH impl.

Không chạy mù mỗi lượt. Stale → fallback `rg`, ghi trong report.

## Research

`researcher` cho internet/docs/changelog/explore trước impl. Note vào `plan/.../research/` khi task lớn.

## Tool inventory

Khi thêm CLI/MCP/skill: cập nhật registry phù hợp với nền đang dùng, ví dụ `platforms/codex/docs/` hoặc inventory runtime. Không lưu secret trong docs.

## Context evolution trigger-only

Không auto-load protocol học context cho task code thường. Chỉ dùng skill `context-evolution-protocol` khi sửa/audit/promote/deduplicate `AGENTS.md`, `.agents/**`, `.codex/**`, `rules/**`, `skills/**`, `workflows/**`, project context `.md`, hoặc khi feedback cho thấy agent hiểu sai lặp lại. Trước khi thêm rule mới phải phân loại tầng áp dụng, rà trùng lặp, viết thành pattern rộng nếu có thể, rồi sync + verify.

## Chống đọc lướt hời hợt & Chống đoán mò (Anti-Superficial & Anti-Guessing)

- **Cấm đoán mò (Strict Grounding):** Không được giả định hay phán đoán về logic của mã nguồn khi chưa đọc trực tiếp. Mọi thông tin về cấu trúc, hàm, luồng dữ liệu phải được đối chiếu bằng công cụ đọc/tìm kiếm đang có trong nền hiện tại.
- **Bắt buộc chỉ nguồn:** Khi giải thích hoặc đề xuất sửa đổi mã nguồn, phải chỉ rõ file và vị trí đủ kiểm chứng theo định dạng phù hợp với nền đang chạy (file link, path + line, hoặc đoạn định danh ổn định). Không khóa rule global vào một URI/tool format duy nhất.
- **Thừa nhận thiếu thông tin:** Nếu không tìm thấy file hoặc logic cụ thể sau khi đã tìm kiếm kỹ, phải báo cáo rõ ràng: *"Không tìm thấy logic liên quan tại..."* và hỏi trực tiếp người dùng thay vì suy đoán đại khái.
- **Đọc trọn vẹn luồng dữ liệu (Data-flow validation):** Khi sửa đổi một API hay hàm chia sẻ, phải dùng công cụ tìm kiếm/call graph phù hợp (`rg`, IDE search, GitNexus, grep, v.v.) để tìm các nơi đang gọi nó, đọc và kiểm chứng xem thay đổi đó có làm ảnh hưởng hay phá vỡ logic ở nơi khác không.
- **Không hời hợt (Anti-Superficiality):** Khi đọc file code hoặc tài liệu có độ dài lớn, không được lướt qua hoặc chỉ đọc phần đầu. Nếu file quá dài, hãy dùng các công cụ phân tích hoặc chia nhỏ phạm vi đọc để nắm vững toàn bộ nội dung cần sửa đổi.
- **Đối chiếu Đặc tả nghiêm ngặt (Strict Specification Grounding):** Khi làm việc với các tài liệu đặc tả yêu cầu (file Excel, CSV, Word, hoặc Spec Markdown), AI không được tự ý bổ sung, phán đoán hay tự vẽ ra các chức năng/module nằm ngoài phạm vi tài liệu mà không có bằng chứng rõ ràng.
- **Phân định rõ đề xuất:** Nếu phát hiện thiết kế đặc tả bị thiếu sót logic (ví dụ: giao diện public có hiển thị bài viết nhưng trang quản trị Excel không yêu cầu tính năng CRUD bài viết), AI bắt buộc phải hỏi lại người dùng để làm rõ hoặc đánh dấu rõ ràng là *"Đề xuất thêm (Không có sẵn trong đặc tả)"* chứ không được tự tiện tích hợp vào mã nguồn.
- **Trích dẫn vị trí đặc tả:** Đối với mọi tính năng được thảo luận, thiết kế hoặc triển khai, AI phải chỉ ra vị trí chính xác trong tài liệu làm căn cứ (Ví dụ: `Tệp: dacta.xlsx`, `Sheet: Admin`, `Dòng/Ô: B15-B20`).
