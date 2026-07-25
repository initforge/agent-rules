---
name: 5fedu-module-parity
description: "5fedu ERP module UI parity — clone/adapt from Nhân viên/Phòng ban template. Use when làm module mới, thêm module, tạo màn hình/trang, sửa module, chỉnh module, refactor module, thêm chức năng vào module, clone module, lệch, sai pattern, thiếu nút, drawer sai, listview sai, toolbar sai, parity, đối chiếu template, nhập hàng lệch. Do NOT use for branding/landing/redesign outside ERP shells (frontend-architect). Do NOT use without context/5fedu in active repo."
routing: {"signals":["5fedu","context/5fedu","5fedu ui","làm module","sửa module","refactor module","drawer","listview","parity"],"intent_signals":["5fedu_ui"],"excludes":["branding","landing","redesign outside ERP"],"priority":80,"loads":["project:5fedu:router","pattern-inventory","module-mapping","ui-delivery"],"requires":["5fedu-project"],"supports":["qa-skills","browser-qa"],"project_scope":"5fedu","platform_scope":"all","max_route_tokens":10400,"default":false}
---

# 5fedu module parity

**Ý đồ:** Task tạo/sửa/refactor module ERP → đối chiếu template **trước** khi code — không chờ user báo lệch.

## Source-lock materialization flow

Trước khi parity coding, agent phải resolve source lock để pin exact template revision:

1. **Confirm 5fedu profile enabled** — workspace có `context/5fedu/` hoặc 5fedu profile active.
2. **Resolve source lock** — đọc `source-lock.json` (project → harness fallback). Contract ghi exact repository URL + full 40-char commit SHA + integrity hash + module index.
3. **Materialize pinned revision** — chạy `automation/14-materialize-template-source.ps1` (xem source-lock-guide.md).
   - Cache tại `.agent/source-lock-cache/` — isolated, gitignored.
   - Nếu cache miss: cần `-AllowNetwork` (explicit) hoặc `-LocalRepoOverride`.
   - Nếu thất bại → dừng parity claims.
4. **Expose only relevant module** — dùng module index trong source-lock.json + module-inventory.yaml để chỉ materialize module cần + dependencies.
5. **Record in plan/evidence** — ghi source revision, materialized path, verification state.
6. **Detect drift** — HEAD ≠ locked commit → stale warning.
7. **Clean** — `-Clean` flag xoá cache.

Quy tắc: no floating default branch, no implicit network, no full-template auto-load, failure to pin stops parity.

## Hard stop

- Có `context/5fedu/` + module ERP → **dừng** `frontend-architect`, `master-image-generation`.
- Có `project-local/00-index.md` → đọc router dự án trước (spec/sheets đã chốt).
- Trước khi lập kế hoạch parity hoặc sửa code, phải tìm template **trong workspace đang mở** theo `template_source.discovery` của inventory. Không dùng đường dẫn tuyệt đối cố định.
- Không có candidate đủ anchor → **dừng slice parity và hỏi owner:** “Không tìm thấy template 5fedu cục bộ trong workspace. Hãy cung cấp hoặc copy template vào workspace, rồi chỉ rõ thư mục nguồn.”
- Có nhiều candidate, package identity không rõ, hoặc owner fork không được xác nhận → **dừng slice parity và hỏi owner:** “Có nhiều/không rõ template cục bộ; thư mục nào là template có thẩm quyền cho task này?” Không tự chọn theo tên thư mục, tuổi file hay cảm tính.
- Chỉ khi đã chọn được một template cục bộ có thẩm quyền mới được mở `template_paths`, ghi snapshot (Git commit nếu có, nếu không hash xác định của các anchor đã mở), rồi mới code. Remote URL, tài liệu tĩnh, screenshot, memory hoặc app khác không thay thế template code cục bộ.

## Đọc theo thứ tự (một luồng)

1. **`context/5fedu/domains/references/pattern-inventory.yaml`** — surface → **shell_must** (parity 100%) vs **variable_slots** (fields/chips/KPIs module-specific). Bắt buộc trước code.
2. **`context/5fedu/domains/module-mapping.md`** — chọn module tham chiếu; chạy **Clone checklist** (mới) hoặc **Audit checklist** (sửa). Checklist **chỉ** ở file này.
3. **`context/5fedu/domains/ui-delivery.md`** — surface classification + verify gates khi implement hoặc user báo lệch pattern.
4. **`context/5fedu/domains/references/ui-delivery-detail.md`** — lazy khi cần deep-dive surface.

## Parity packet (bắt buộc, hard gate)

Packet phải hoàn tất **trước khi parity coding**; không có packet → không implement.

### Cấu trúc packet

Packet là thư mục `parity/<module>/` với các file sau (xem schema tại `parity/schemas/` và example tại `parity/examples/nhap-hang/`):

| File | Vai trò | Schema |
|---|---|---|
| `source.lock.yaml` | Template identity + snapshot (Git commit/hash) | `schemas/source-lock.schema.yaml` |
| `target.yaml` | Module key, surfaces, target paths, schema source | `schemas/target.schema.yaml` |
| `structural-map.yaml` | Source → target: create/adapt/reuse, nesting, routes, state, data contracts, event flows | `schemas/structural-map.schema.yaml` |
| `visual-contract.yaml` | shell_must invariants, variable slot values, alignment, responsive breakpoints | `schemas/visual-contract.schema.yaml` |
| `behavior-contract.yaml` | behavior_must, states, motion, accessibility, interaction flows | `schemas/behavior-contract.schema.yaml` |
| `architecture-adaptation.yaml` | preserve/adapt/must_not_copy, target equivalents, accepted deviations | `schemas/architecture-adaptation.schema.yaml` |
| `deviations.yaml` | Approved deviations (theo custom_deviation_contract của inventory) | — |
| `proof.yaml` | Verification evidence, cross-reference packet integrity | `schemas/proof.schema.yaml` |

### Quy trình

1. **Discovery** → inspect source template, ghi source.lock.yaml
2. **Inspect target** → xác định surfaces, schema source → ghi target.yaml
3. **Map** → tạo structural-map.yaml, visual-contract.yaml, behavior-contract.yaml, architecture-adaptation.yaml, deviations.yaml
4. **Question** → inspect repo trước, chỉ hỏi material unresolved (`parity/questions/question-strategy.md`)
5. **Worker handoff** → worker chỉ implement sau khi nhận packet hoàn chỉnh (`parity/contracts/no-vision-worker-contract.md`)
6. **Verify** → packet validate theo schema; proof.yaml cập nhật evidence

Xem workflow chi tiết tại `parity/workflow/planning-workflow.md`.

### Những mục inventory yêu cầu

Packet phải lưu đủ các mục inventory yêu cầu: template identity + snapshot; target surface + reference paths; target paths; map shell/behavior/state/motion/responsive; variable map kèm nguồn schema/spec; approved deviations; verification evidence. Với template chọn từ fork, identity phải nêu fork được owner xác nhận.

## Copy/adapt contract

- Module mới: copy structural file graph từ reference đã mở và xác nhận trước; rename cơ học rồi mới thay variable slots/domain logic.
- Module cũ: diff target với reference, transplant shell fragment thiếu; không ghi đè business logic đang sống.
- Ghi source path cục bộ, revision/hash, copy map, variable map và khác biệt có chủ đích vào PAF/evidence.
- Không có template source chính xác hoặc reference còn mơ hồ: block riêng parity slice và hỏi; cấm code theo trí nhớ/cảm giác, remote, docs hay screenshot.

## Report contract

Khi task cần báo cáo kỹ thuật, ghi `Template reference` (source.lock.yaml), `Shell parity` (structural-map.yaml + visual-contract.yaml), `Variable map` (visual-contract.yaml variables), `Pattern fidelity` (behavior-contract.yaml) và `Verification` (proof.yaml). Câu trả lời mặc định vẫn bắt đầu bằng tác động nghiệp vụ; metadata chỉ hiện khi có giá trị hoặc được hỏi.

## Deep QA (optional)

Owner yêu cầu test như user / exploratory / verify UI sau parity → mid-flow combo `qa-skills` + `browser-qa`. Không thay checklist mapping/template.
