---
name: 5fedu-module-parity
description: "5fedu ERP module UI parity — clone/adapt from Nhân viên/Phòng ban template. Use when làm module mới, thêm module, tạo màn hình/trang, sửa module, chỉnh module, refactor module, thêm chức năng vào module, clone module, lệch, sai pattern, thiếu nút, drawer sai, listview sai, toolbar sai, parity, đối chiếu template, nhập hàng lệch. Do NOT use for branding/landing/redesign outside ERP shells (frontend-architect). Do NOT use without context/5fedu in active repo."
routing: {"signals":["5fedu","context/5fedu","5fedu ui","làm module","sửa module","refactor module","drawer","listview","parity"],"intent_signals":["5fedu_ui"],"excludes":["branding","landing","redesign outside ERP"],"priority":80,"loads":["project:5fedu:router","pattern-inventory","module-mapping","ui-delivery"],"requires":["5fedu-project"],"supports":["qa-skills","browser-qa"],"project_scope":"5fedu","platform_scope":"all","max_route_tokens":10400,"default":false}
---

# 5fedu module parity

**Ý đồ:** Task tạo/sửa/refactor module ERP → đối chiếu template **trước** khi code — không chờ user báo lệch.

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

## Pattern Fidelity Packet (bắt buộc, hard gate)

Packet phải hoàn tất **trước khi parity coding**; không có template identity/snapshot, map surface hoặc nguồn variable thì dừng slice parity theo Hard stop. Hai phần — **không** gộp:

| Phần | Nội dung |
|---|---|
| **Shell parity** | Surface + `shell_must` từ inventory đã đối chiếu template_paths |
| **Variable map** | Fields drawer, filter chip options, KPI cards, columns, export — nguồn spec/schema module (không copy mù Nhân viên) |

Packet phải lưu đủ các mục inventory yêu cầu: template identity + snapshot; target surface + reference paths; target paths; map shell/behavior/state/motion/responsive; variable map kèm nguồn schema/spec; approved deviations; verification evidence. Với template chọn từ fork, identity phải nêu fork được owner xác nhận.

## Copy/adapt contract

- Module mới: copy structural file graph từ reference đã mở và xác nhận trước; rename cơ học rồi mới thay variable slots/domain logic.
- Module cũ: diff target với reference, transplant shell fragment thiếu; không ghi đè business logic đang sống.
- Ghi source path cục bộ, revision/hash, copy map, variable map và khác biệt có chủ đích vào PAF/evidence.
- Không có template source chính xác hoặc reference còn mơ hồ: block riêng parity slice và hỏi; cấm code theo trí nhớ/cảm giác, remote, docs hay screenshot.

## Report contract

Khi task cần báo cáo kỹ thuật, ghi `Template reference` (local identity, source path, snapshot), `Shell parity`, `Variable map`, `Pattern fidelity` và `Verification`. Câu trả lời mặc định vẫn bắt đầu bằng tác động nghiệp vụ; metadata chỉ hiện khi có giá trị hoặc được hỏi.

## Deep QA (optional)

Owner yêu cầu test như user / exploratory / verify UI sau parity → mid-flow combo `qa-skills` + `browser-qa`. Không thay checklist mapping/template.
