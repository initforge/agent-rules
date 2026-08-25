# Agent Rules

**Luận đề:** một agent operating environment trung lập nhà cung cấp, biến ý định người dùng thành công việc có biên rõ ràng, giữ worker rẻ/thay thế được, và chỉ công nhận hoàn thành dựa trên evidence chứ không dựa vào lời model nói.

## Kiến trúc canonical

Contract runtime North-Star hiện nằm trong `packages/engine/src/northstar/` và `packages/kernel/src/northstar/`. Phase mới bắt đầu từ plan được owner phê duyệt; projection của phase cũ không giữ trong workspace.

| Subsystem | Trạng thái | Implementation canonical |
|---|---|---|
| WorkRequest / WorkSpec / TaskPacket / RunState | operational | `packages/engine/src/northstar/protocol.ts`, `compiler.ts` |
| Traceability + spec revision impact | operational | `packages/engine/src/northstar/compiler.ts` |
| Durable worker runtime + bounded repair | operational | `packages/engine/src/runner/`, `northstar/runtime.ts` |
| Evidence-derived acceptance | operational | `northstar/evidence-ledger.ts`, `acceptance-audit.ts` |
| Context Compiler | operational | `northstar/context.ts` |
| Skill Fabric | operational | `northstar/routing.ts` + `generated/context-graph.json` |
| Capability Broker | operational | `northstar/routing.ts` |
| Verification Graph | operational | `northstar/verification-graph.ts` + runner verifier |
| Model Governor | logical routing operational; cần host attestation | `northstar/model-governor.ts` |
| Trigger normalization | operational ở lớp normalize | `northstar/trigger.ts` |
| Host adapters | tùy host còn cần live certification | `platforms/`, `northstar/host-adapters.ts` |
| Domain packs | operational | `northstar/domain-packs.ts`, `profiles/` |

Không xóa component production cũ chỉ vì kiến trúc mới có tên khác. Chỉ xóa khi replacement đã thắng behavioral/eval parity.

## Completion đáng tin

```text
WorkRequest -> WorkSpec -> TaskPacket -> bounded worker
                                      -> Verification Graph
                                      -> hash-chained Evidence Ledger
                                      -> deterministic acceptance
                                      -> independent acceptance audit
                                      -> PASS | PARTIAL | BLOCKED | FAILED
```

Worker không có quyền tự PASS. Làm yếu verification, sửa ngoài scope, thiếu mandatory claim, evidence chain hỏng, source lock chưa xác minh hoặc hết repair budget đều phải fail closed.

## 5fedu — reference dùng chung trong harness

`profiles/5fedu/` là explicit-only và mặc định không hoạt động với project thường. Template ERP do owner cung cấp được nhúng **một lần duy nhất trong agent-rules** dưới dạng snapshot có manifest + SHA-256. Project đích không cần cài/copy template đó.

```bash
agent-rules init --domain-pack 5fedu
agent-rules reference 5fedu features/he-thong/nhan-vien/nhan-vien.module.tsx
```

Module Nhân viên là CRUD shell chuẩn; Phòng ban là hierarchy/related-data shell; Phân quyền phải suy ra từ source module/route/permission thật. Pack lưu source pointer + behavior contract để model không tự chế ERP theo trí nhớ.

## Pencil / pen.dev

Pencil là **manual-only**. `integrations/manual/pencil-mcp/` không nằm trong automatic registry và không có keyword trigger. Chỉ gắn khi người vận hành chủ động chọn Pencil/pen.dev hoặc explicit provider `design.*`. UI production vẫn phải PASS bằng browser/runtime evidence; render `.pen` không thay thế verification code thật.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `packages/engine/` | production runtime + North-Star facade |
| `packages/kernel/src/northstar/` | runtime contracts, protocol và trust decisions |
| `packages/cli/` | CLI |
| `rules/` | invariants always-on nhỏ |
| `skills/` | skills lazy-load |
| `integrations/` | automatic registry + `manual/` explicit-only |
| `profiles/` | domain/project packs explicit như 5fedu |
| `platforms/` | host adapters/contracts |
| `automation/` | build/install/validation/certification |
| `generated/` | machine output, không sửa tay |
| `.agent/` | plans, runs, checkpoints, journals, evidence |

## Chạy nhanh

```bash
npm ci
npm run build
npm test
npm run verify:all
```

`verify:all` phải fail-closed. Thiếu PowerShell, Playwright/browser binaries hoặc native host CLI cần thiết thì báo BLOCKED/FAIL, không skip để lấy xanh giả.

## North-Star direct run

S0/S1 có scope + verifier rõ:

```bash
agent-rules init --agent claude
agent-rules run "Fix parser regression" \
  --own src/parser \
  --verify-exec npm \
  --verify-arg=test \
  --verify-kind test
agent-rules status
```

S2/S3 bắt buộc qua strong-planner/spec compilation rõ ràng trước khi TaskPacket được phép execute.

## Durable runner

Được gọi qua `agent-rules run` (xem North-Star runtime ở trên). Public CLI là
đúng 8 lệnh — `install`, `uninstall`, `doctor`, `status`, `run`, `integration`,
`init`, `reference` — chi tiết nội bộ nằm sau `--details`/`--json`.

## Đọc tiếp

1. [`packages/engine/src/northstar/`](packages/engine/src/northstar/)
2. [`packages/kernel/src/northstar/`](packages/kernel/src/northstar/)
3. [`profiles/5fedu/README.md`](profiles/5fedu/README.md) khi chủ động bật 5fedu

**Governance:** chỉ sửa canonical source; không làm yếu gate để migration trông xanh.
