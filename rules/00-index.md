# 00-index.md

## Bản đồ Chỉ mục Định tuyến Tri thức của Agent (Knowledge Routing Index)

Tệp tin này hoạt động như một bản đồ định hướng chính thức. Tất cả các Agent trước khi cập nhật bất kỳ bài học, tri thức, quy tắc hay context mới nào từ feedback của người dùng **bắt buộc** phải tra cứu bản đồ này để ghi nhận đúng tệp tin quy tắc chuyên biệt của harness, nghiêm cấm việc điền bừa bãi.

---

### Bản đồ Định tuyến Quy tắc (Knowledge Routing Map)

| Phân vùng tri thức | File/chủ sở hữu | Ghi vào đây khi |
|---|---|---|
| **Ý đồ & Runtime chung** | [00-runtime-and-intent.md](00-runtime-and-intent.md) | Định tuyến intent, risk profile, trạng thái kết thúc `PASS/PARTIAL/BLOCKED`, hard activation contract. |
| **Quy trình SOP & Giao tiếp** | [01-agent-workflow-sop.md](01-agent-workflow-sop.md) | Planning, execution loop, prompt compiler, reporting, verification cadence, cách giao tiếp trong turn. |
| **Chất lượng code, DB/API, Permission** | [02-code-quality-and-debt.md](02-code-quality-and-debt.md) | Clean code, anti-regression, React/state correctness, schema drift, DB/API errors, permission/RLS, technical debt. |
| **Context, Tools & Knowledge Loading** | [03-context-and-tools.md](03-context-and-tools.md) | Thứ tự đọc context, trigger skill, context-evolution, tool inventory, grounding/spec lookup. |
| **Skills & 5fedu Integration** | [04-skills-and-5fedu.md](04-skills-and-5fedu.md) | Registry skill, cách detect 5fedu, rule kích hoạt `5fedu-project`, fidelity gate cấp dự án. |
| **Harness Mutation/Safety** | [05-harness-mutation-gate.md](05-harness-mutation-gate.md) | Learning tiers, khi nào được sửa `rules/`, `skills/`, `workflows/`, `platforms/`, sync harness. |
| **Outcome Contract** | [06-opus-emulation-contract.md](06-opus-emulation-contract.md), [00-universal-frontier-contract.md](00-universal-frontier-contract.md), [07-finish-to-completion.md](07-finish-to-completion.md) | Chuẩn outcome chung, finish-to-completion, không fake PASS, mức MEDIUM/HIGH. |
| **UI/UX Pattern & Template Parity** | [08-ui-consistency-gate.md](08-ui-consistency-gate.md) | Layout/list/table/export UI, design fidelity, component parity, mock-data UI, rich text rendering. |
| **Platform Boundary** | [platform-boundary.md](platform-boundary.md), [antigravity-overlay.md](antigravity-overlay.md) | Ranh giới Codex/Grok/Antigravity, adapter riêng từng nền, path runtime/platform-specific behavior. |
| **5fedu project-local context** | `<project>/{.codex,.agents,.grok,.kiro}/5fedu/*.md` | Spec module, sheet/source map, quyết định owner, câu hỏi mở, backlog, owner feedback thô. Không ghi vào global rules nếu chưa trừu tượng hóa. |


---

### Quy trình cập nhật Tri thức mới (Knowledge Update Workflow)

1.  **Phân loại tri thức**: Phân tích xem bài học/yêu cầu mới của người dùng thuộc phân vùng nào (UI, Database, Workflow...).
2.  **Định vị File**: Tra cứu bảng trên để tìm đường dẫn file quy tắc lives tương ứng.
3.  **Cập nhật chính xác**: Sử dụng công cụ chỉnh sửa để thêm quy tắc vào đúng file đích. Giữ nguyên 100% các luật cũ trong file, không ghi đè cẩu thả.
4.  **Cập nhật Plan**: Cập nhật thay đổi này vào phần Nợ kỹ thuật / Nhật ký thay đổi của `implementation_plan.md` trong thư mục artifact hiện hành (ví dụ: `<artifact>/implementation_plan.md`).
5.  **Sync đúng tầng**: Sửa canonical source trước (`rules/`, `skills/`, `workflows/`, `shared/`), sau đó chạy script sync để sinh mirror/live. Không sửa mirror để làm nguồn chân lý.
