# Parity planning question strategy

**Vai trò:** Chiến lược đặt câu hỏi — inspect repo trước, chỉ hỏi material unresolved.

## Question resolution path

```text
Cần quyết định ──→ Inspect source/target code ──→ Đã có trong code? ──→ Yes → dùng, không hỏi
                                                    ↓ No
                                              Trong inventory/spec? ──→ Yes → dùng, không hỏi
                                                    ↓ No
                                              Material unresolved? ──→ No → tự quyết định, log assumption
                                                    ↓ Yes
                                              Hỏi owner (material)
```

## Material vs immaterial

| Loại | Material (hỏi) | Immaterial (tự quyết, log) |
|---|---|---|
| Scope | Thay đổi scope/boundary | Tên biến local |
| Behavior | Thay đổi interaction/UX flow | Implementation detail nhỏ |
| Safety | Ảnh hưởng data/permission/auth | UI spacing/padding quyết định |
| Authority | Cần owner decision chưa có | Test fixture value |
| Proof | Yêu cầu proof method cụ thể | Order của import |

## Đã có trong code

Không hỏi — inspect source và target:

| Câu hỏi phổ biến | Nguồn trả lời |
|---|---|
| "Có field nào?" | Schema/type, DB migration, API types |
| "Module key là gì?" | Route registry, sidebar config |
| "Template reference là gì?" | pattern-inventory.yaml, module-mapping.md |
| "Component nào dùng?" | Template code đã mở |
| "Có shared component không?" | Template code + shared components |
| "Route pattern thế nào?" | Route registry template |
| "Behavior có gì?" | pattern-inventory.yaml behavior_must + states_must |
| "Motion spec?" | pattern-inventory.yaml motion_must |
| "Responsive spec?" | pattern-inventory.yaml responsive_must |

## Material unresolved questions (chỉ hỏi khi không có trong code/spec)

| # | Câu hỏi | Khi nào hỏi | Ghi chú |
|---|---|---|---|
| Q1 | "Exact source revision nào?" | Nhiều template candidate hoặc workspace không Git | Không hỏi nếu template đã rõ + Git commit record được |
| Q2 | "Target module equivalent cho behavior X?" | Behavior không có mapping rõ trong inventory | Thường inventory đã đủ; hỏi khi behavior mới hoàn toàn |
| Q3 | "Behavior nào cần preserve?" | Module cũ đang có behavior khác reference | Chỉ hỏi khi inventory không đề cập behavior đó |
| Q4 | "Architecture nào phải giữ target-native?" | Target đã có architecture khác reference | Tránh worker copy template architecture đè lên target |
| Q5 | "Deviation scope nào được phép?" | Custom behavior không có trong inventory | Phải ghi rõ surface, changed invariant, rationale |
| Q6 | "Responsive viewport matrix?" | Surface có responsive behavior không rõ trong template | Mặc định dùng template nếu inventory có responsive_must |
| Q7 | "Data states nào cần support?" | Ngoài loading/empty/error tiêu chuẩn | Mặc định: loading, empty, error, filtered-empty |
| Q8 | "Proof requirements?" | Risk cao hoặc owner yêu cầu production proof | Mặc định: lint + typecheck + interaction check |

## Quy tắc

1. **Inspect trước, hỏi sau.** Luôn mở source code và target code trước khi formulate question.
2. **Mỗi câu hỏi là material.** Không hỏi "có muốn dùng màu xanh không?" — dùng template.
3. **Closed question.** Cho owner chọn, không để open-ended.
4. **Log assumption.** Nếu tự quyết, ghi assumption trong planner_notes proof.yaml.
5. **Batch questions.** Gom và hỏi một lần, không interrupt.
6. **Không hỏi lại.** Đã trả lời → ghi vào packet, không hỏi lại.
