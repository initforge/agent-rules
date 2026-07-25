# No-vision worker contract

**Vai trò:** Contract cho worker không có vision capability (không xem screenshot/design file). Worker chỉ implement sau khi nhận packet đầy đủ.

## Prerequisites

Worker chỉ được implement khi nhận được **tất cả**:

- [ ] source.lock.yaml — template identity + snapshot
- [ ] structural-map.yaml — source → target mapping, create/adapt/reuse
- [ ] visual-contract.yaml — shell_must, variable slots, alignment, responsive
- [ ] behavior-contract.yaml — behaviors, states, motion, accessibility, interaction flows
- [ ] architecture-adaptation.yaml — preserve, adapt, must_not_copy
- [ ] deviations.yaml — approved custom behaviors

## Worker constraints

### MUST

- Implement theo mapping trong packet (không chọn mapping khác)
- Tôn trọng `decision` field: create = viết mới theo template; adapt = copy template + modify variable slots; reuse = import shared
- Áp dụng variable slot values từ spec/schema, không copy từ template module
- Tôn trọng `must_not_copy` — không copy architecture/pattern bị cấm
- Implement `shell_must` invariants chính xác
- Implement behavior, states, motion, responsive theo contract
- Ghi `must_not_copy` entries vào danh sách forbidden để review
- Implement deviation đã được duyệt

### MUST NOT

- **Không tự chọn mapping khác.** Planner quyết định, worker ghi nhận.
- **Không invent missing visual facts.** Nếu visual-contract.yaml không có alignment/color/dimension → block, hỏi planner, không tự suy luận.
- **Không thay đổi `decision`.** Nếu `decision: adapt`, worker phải copy template → modify, không viết lại từ đầu.
- **Không copy `must_not_copy` entries.** Worker phải đọc architecture-adaptation.yaml và kiểm tra target không chứa forbidden pattern.
- **Không thêm behavior ngoài contract.** Nếu behavior phát sinh → block, báo planner.
- **Không implement uncertain mappings** (`uncertainty: true`) — planner owns those.
- **Không gộp file.** Worker phải tạo đúng số file trong target_paths.

## Non-vision FAQ

| Tình huống | Hành động |
|---|---|
| Không biết màu sắc của badge | Lấy từ visual-contract.yaml hoặc mở template code reference |
| Không biết khoảng cách padding | Mở template code reference (tailwind classes) |
| Cần xem design spec | Yêu cầu planner bổ sung alignment_notes trong visual-contract.yaml |
| Phát hiện variable slot thiếu | Ghi lại, implement với placeholder, báo planner |
| Source code không match contract | Block, báo planner resolve trước |
| Need screenshot để verify | Yêu cầu planner; không tự suy luận từ memory |

## Reporting

Worker report phải gồm:

```text
Status: complete | partial | blocked
Files created: [list]
Deviations applied: [DEV-001, DEV-002]
Uncertain mappings: [none | list — must be planner-owned only]
Missing visual facts: [none | list — visual-contract gaps found]
Forbidden patterns avoided: [must_not_copy entries verified]
Proof executed: [lint, typecheck, build, interaction check]
Unresolved: [list]
```
