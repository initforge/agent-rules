# Parity packet planning workflow

**Vai trò:** Quy trình planner tạo parity packet — từ discovery đến packet hoàn chỉnh.

## Luồng tổng thể

```text
[1] Discovery ──→ [2] Inspect source ──→ [3] Inspect target ──→ [4] Map ──→ [5] Question ──→ [6] Packet ──→ [7] Verify
```

## 1. Discovery

| Bước | Hành động | Output |
|---|---|---|
| 1.1 | Load `pattern-inventory.yaml`, khớp surface | surface key + `shell_must` list |
| 1.2 | Resolve `source-lock.json` (project → harness) if available. Source-lock ghi exact repository URL + full 40-char commit SHA + integrity hash + module index. Nếu không có source-lock, fallback: tìm template trong workspace theo `template_source.discovery`. | source lock / template path |
| 1.3 | Ghi template identity + snapshot. Nếu source-lock dùng, ghi commit SHA + integrity. Nếu workspace path, ghi Git commit hoặc deterministic hash. | source.lock.yaml (parity packet) + source-lock.json reference |
| 1.4 | Chọn reference module từ `module-mapping.md` + module-inventory.yaml | reference module key + module dependencies |

**Hard stop:** Không có/mơ hồ template hoặc source-lock integrity thất bại → dừng, hỏi owner. Không dùng remote, screenshot, memory. Source-lock ở trạng thái `stale` hoặc `unverified` → không parity claim.

## 2. Inspect source

| Bước | Hành động | Output |
|---|---|---|
| 2.1 | Mở đầy đủ template paths từ inventory | file list |
| 2.2 | Đọc component tree, route, service, store | structural understanding |
| 2.3 | Ghi lại behavior, state, motion, responsive pattern | behavior notes |
| 2.4 | Xác định invariant vs variable | architect notes |

## 3. Inspect target

| Bước | Hành động | Output |
|---|---|---|
| 3.1 | Mở target feature directory (nếu có) | existing structure |
| 3.2 | Đọc target schema (`supabase_table`, API spec) | data contracts |
| 3.3 | Xác định module-specific fields, filters, columns | variable map |

## 4. Map

| Bước | Tạo file | Nội dung chính |
|---|---|---|
| 4.1 | target.yaml | module key, surfaces, target paths, schema source |
| 4.2 | structural-map.yaml | `component_mappings` (create/adapt/reuse per component); `nesting_hierarchy`; `routes` object keyed by canonical target route; `state_ownership`; `data_contracts`; `event_flows` |
| 4.3 | visual-contract.yaml | `surfaces` object keyed by canonical kebab-case surface ID; `shell_must` invariants; variable slot values; `responsive_breakpoints` |
| 4.4 | behavior-contract.yaml | `behaviors` object keyed by canonical kebab-case surface ID; `behavior_must`; `states_must`; `motion_must`; `responsive_must`; accessibility; interaction flows |
| 4.5 | architecture-adaptation.yaml | `preserve`; `adapt`; `must_not_copy`; `target_equivalents`; `accepted_deviations` object keyed by deviation ID |
| 4.6 | deviations.yaml | `deviations` object keyed by deviation ID per `custom_deviation_contract` |

**Quy tắc lập bản đồ:**
- Mỗi mapping có `decision` rõ ràng (create/adapt/reuse/not_applicable)
- Mapping không chắc chắn: `uncertainty: true` + planner tự resolve trước khi giao worker
- `must_not_copy` liệt kê rõ architecture/pattern không được copy từ source
- `accepted_deviations` phải có proof (spec reference, owner confirmation)

## 5. Question

| Bước | Hành động | Output |
|---|---|---|
| 5.1 | Rà "already answered" — source code + target code + inventory đã đủ chưa | loại bỏ câu hỏi thừa |
| 5.2 | Chỉ hỏi material unresolved: source revision, target equivalent, behavior to preserve, architecture must remain target-native, allowed deviations, responsive viewport matrix, data states, proof requirements | question list |
| 5.3 | Ghi vào `open-questions.md` hoặc hỏi trực tiếp owner | answer log |

**Nguyên tắc:** Không hỏi điều đã có trong code. Mỗi câu hỏi phải thay đổi scope/behavior/safety/authority/proof.

## 6. Packet assembly

| Bước | File | Trạng thái |
|---|---|---|
| 6.1 | source.lock.yaml (+ source-lock.json ref) | complete |
| 6.2 | target.yaml | complete |
| 6.3 | structural-map.yaml | complete |
| 6.4 | visual-contract.yaml | complete |
| 6.5 | behavior-contract.yaml | complete |
| 6.6 | architecture-adaptation.yaml | complete |
| 6.7 | deviations.yaml | complete |
| 6.8 | proof.yaml | partial (chưa có verification evidence) |

**Với module mới:** Tạo packet đầy đủ → giao worker → implement → cập nhật proof.yaml.
**Với audit:** Cập nhật packet, diff với source, transplant shell fragment.

## 7. Verify

- Packet validates against `parity\schemas\*.schema.yaml`
- Mọi `uncertainty: true` mapping đã được planner resolve (hoặc đánh dấu planner_owns)
- `must_not_copy` entries không xuất hiện trong target khi review
- Variable map entries có nguồn spec/schema, không copy mù từ template
- Fixtures tồn tại cho negative test scenarios

## Quyền sở hữu mapping

| Mapping | Owner | Worker có thể |
|---|---|---|
| create/adapt/reuse | Planner quyết định, Worker ghi nhận | Không thay đổi |
| Component nesting | Planner | Không thay đổi |
| variable slot values | Planner từ spec/schema | Áp dụng đúng |
| behavior/states/motion | Planner từ inventory + source | Áp dụng đúng |
| must_not_copy | Planner | Không vi phạm |
| deviations | Planner từ owner | Áp dụng đúng |
| uncertain mappings | Planner (chưa giao worker) | Không implement |
