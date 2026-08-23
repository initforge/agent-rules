# North-Star vNext: on-demand MCP, deterministic 5fedu và portable one-copy harness

## 1. Mục tiêu và kết luận audit

- `agent-rules` hiện không có daemon riêng chạy thường trú. Tuy nhiên các MCP đã được ghi vào cấu hình global của host nên Codex/OpenCode và các host khác tự khởi động chúng. Tại thời điểm audit, nhóm process MCP dùng khoảng 1,8 GB RAM; lần đo trước khoảng 2,67 GB.
- `AGENT_RULES_GLOBAL_MCP_PROFILE=none` hiện không hội tụ về trạng thái sạch: installer giữ lại entry cũ. Ngoài ra installer đang provision mọi MCP, gồm cả Pencil explicit-only; `sync` provision hai lần; `verify` có đường dẫn gây mutation; reconcile có thể trả success dù MCP bị BLOCKED.
- 5fedu đã có activation explicit-only đúng ý tưởng, nhưng runtime còn đưa domain/template context quá rộng. Các chuỗi "intent detected" và "template checked" không tồn tại trong canonical source, nên khả năng cao đến từ projection/runtime cũ hoặc telemetry nội bộ bị model diễn đạt ra ngoài.
- Nền tảng nên được giữ lại: `WorkRequest → WorkSpec → TaskPacket`, Evidence Ledger, acceptance audit, proof router, Capability Broker, heartbeat, bounded repair, resource governor và artifact pointer.
- Các phần mới hoặc còn thiếu: effective intent qua nhiều lượt trao đổi, pre-handoff audit đầy đủ, workspace transaction, pre-effect enforcement, trajectory supervision, adaptive persistence, closure compaction và idle-zero MCP.
- Đây không chỉ là "đơn giản hóa MCP". MCP là một subsystem; mục tiêu tổng thể là harness portable, operator-controlled, evidence-derived và không tạo filesystem bureaucracy.

## 2. Canonical contracts và public interfaces

### Effective intent và one-copy handoff

- Giữ `WorkRequest` làm nguồn raw intent, bổ sung `intent_events` append-only:
  - `ADD`, `CORRECT`, `CONFIRM`, `REJECT`, `SUPERSEDE`.
  - Mỗi event có `id`, subject, provenance, rationale, nguồn tham chiếu và `replaces`.
- Mở rộng `WorkSpec` thành effective state hiện hành:
  - Requirements, constraints, non-goals, decisions, assumptions, unresolved items và references.
  - Mỗi item có trạng thái `ACTIVE`, `REJECTED`, `SUPERSEDED` hoặc `UNRESOLVED`.
  - Không parse Markdown/projection ngược lại thành canonical truth.
- Nâng cấp `PortablePlan` hiện có thành frozen execution contract, không tạo thêm một hệ memory song song. Contract chứa:
  - Frozen effective-intent hash.
  - Tasks và dependency.
  - Traceability requirement → task → acceptance → proof.
  - Scope, effect policy, capabilities, budget, concurrency, recovery và stop conditions.
  - References đủ để worker không phải đoán lại.
- Plan và prompt là hai renderer của cùng frozen contract. Cùng revision phải có cùng semantic hash.
- Không tự sinh plan/prompt trước yêu cầu rõ như "lập plan" hoặc "xuất prompt".
- Thêm:
  - `agent-rules handoff plan|prompt --output - --persist auto|never|always`
  - Mặc định xuất một self-contained artifact ra stdout.
  - `plan compile` trở thành compatibility alias.
  - Receiver có full runtime thì xác minh hash và chạy contract; receiver không có runtime vẫn nhận đủ scope, tasks, proof, failure rules và closure criteria trong một lần copy.

### Mandatory pre-handoff audit

Audit phải trả `PASS`, `BLOCKED` hoặc `NEEDS_USER`, không được mặc định BLOCKED như semantic auditor hiện tại. Nó kiểm tra đủ mười điểm:

1. Mọi effective requirement được cover.
2. Constraints và non-goals còn nguyên.
3. Quyết định đã chốt được encode.
4. Quyết định rejected/superseded không tái xuất hiện.
5. Không có assumption chưa được authorize.
6. Unresolved question không bị biến thành fact.
7. Mọi requirement có implementation responsibility.
8. Mọi requirement có acceptance/proof phù hợp.
9. References quan trọng đủ cho worker.
10. Candidate không drift khỏi effective intent cuối.

Ba gate độc lập:

- Intent completeness.
- Plan/spec completeness.
- Implementation completeness.

Convergence phải so candidate với toàn bộ effective intent, kể cả requirement chưa có claim. Không được bỏ qua finding chỉ vì claim anchor chưa tồn tại.

### Execution policy

Mở rộng `TaskPacket` bằng policy machine-checkable:

- Phase: `DISCOVER`, `PLAN`, `IMPLEMENT`, `VERIFY`, `REPAIR`, `CLOSE`.
- Owned/forbidden scope.
- Effects: read, filesystem mutation, command execution, network, MCP, external write, destructive action.
- Allowed capabilities và resources.
- Wall-clock, step, tool-call, retry và repair budget.
- Concurrency and ownership.
- Required proof, recovery và stop conditions.

Operator luôn chọn host/model. Harness chỉ ghi nhận requested/resolved/observed model khi host cung cấp:

- Không tự chọn hoặc tự đổi provider/model.
- Loại `selectProviderByEvidence` khỏi execution authority; giữ ranking dưới dạng telemetry/report nếu còn hữu ích.
- Migrate legacy `approvedModels`/`approvedRouting` thành capability/observation contract, có compatibility reader cho artifact cũ.
- Nếu policy yêu cầu strong planner/reviewer mà capability không thể xác minh, trả `NEEDS_USER`; không tự route sang model khác.
- Deterministic proof chạy trước. Strong semantic review chỉ chạy khi risk/policy yêu cầu.

## 3. Implementation changes

### A. Dogfood ngay từ đầu

- Trước khi sửa code, phân loại task này là owner-authorized new phase; audit và retire pointer `adaptive-minimal-proof-testing` nếu merged baseline và evidence đủ, nếu không thì ghi blocker rõ ràng.
- Dùng chính plan này làm một frozen contract duy nhất; không tạo support directory mặc định.
- Tạo một worktree/branch duy nhất: `codex/northstar-on-demand-portable-harness`.
- Mọi packet trong quá trình triển khai đều có phase, scope, effect policy, budget và proof.
- Runtime/harness sở hữu progress, checkpoint và evidence; worker không được tự viết competing plan, PASS hoặc canonical state.
- Subagent mặc định bằng 0, tối đa 2 cho research/review độc lập hoặc worktree không chồng scope.

### B. MCP task-scoped và idle-zero

- Tách ba khái niệm: package đã cài trên disk, host exposure và process activation.
- Installer chỉ cài integration thuộc install profile; explicit-only như Pencil chỉ cài khi operator chọn.
- Default global profile là `none` và phải hội tụ:
  - Entry có ownership/fingerprint của agent-rules được remove hoặc disable.
  - Entry legacy có exact known fingerprint được backup rồi migrate.
  - Entry đã bị người dùng chỉnh và không xác định ownership phải `NEEDS_USER`, không xóa mù.
- Host config không được chứa MCP agent-rules đang enabled mặc định:
  - Host hỗ trợ disabled descriptor thì lưu disabled.
  - Host không bảo đảm disabled không spawn thì gỡ entry và dùng task-local overlay.
- Khi router chọn MCP cho một task, runtime materialize đúng tập MCP đó, khởi động trong lease của task và ghi PID/process-tree receipt.
- Task không route MCP thì không có managed MCP process.
- Kết thúc, timeout, crash hoặc cancellation đều teardown toàn process tree; không có persistent broker/HTTP daemon.
- Sửa các lỗi hiện tại:
  - `install` không provision toàn registry.
  - `sync` chỉ reconcile một lần.
  - `verify` tuyệt đối read-only.
  - Reconcile exit code phản ánh MCP `BLOCKED/NEEDS_USER`.
  - Remote MCP không được connect/network ngoài task đã route.
- Binaries/cache có thể tiếp tục chiếm disk theo lựa chọn task-scoped; guarantee bắt buộc là 0 managed process, CPU, RAM và network khi không có task.

### C. 5fedu deterministic activation và disclosure

- Chỉ activate khi project/profile/CLI marker xác nhận `domain_pack=5fedu`; từ khóa trong prompt không bao giờ kích hoạt.
- Router telemetry như `intent_signals`, matched phrases hoặc "intent detected" chỉ là internal data, không được đưa vào ordinary answer.
- Runtime không còn in domain/template summary chung cho mọi task 5fedu.
- Reference broker phải trả receipt gồm manifest ID, source path, anchors, hash và component/behavior thực sự dùng.
- Chỉ khi receipt đó được consume, renderer thêm footer ngắn:

  `5fedu reference used: <component/behavior> — <manifest-bound path/anchor>, sha256:<short>`

- 5fedu inactive hoặc active nhưng chưa dùng reference: không banner, không "template checked", không footer.
- Nếu source bắt buộc nhưng chưa truy cập được: `BLOCKED/NEEDS_USER`, không tuyên bố đã check.
- Test cả canonical source lẫn runtime đã cài để bắt stale projection.

### D. Cross-host enforcement và Gemini/Antigravity case

- Thêm versioned host-capability attestation: native pre-effect enforcement, sandbox, path permissions, MCP lifecycle, worktree support, telemetry và compaction.
- Enforcement order:
  1. Native sandbox/hook/permission nếu có proof.
  2. Capability Broker nếu tool/effect nằm trong broker.
  3. Isolated workspace transaction.
  4. `BLOCKED` nếu không kiểm soát được mutation.
- Mọi mutating worker mặc định chạy trong disposable worktree transaction. Chỉ promote diff vào canonical branch sau scope audit, verification và acceptance.
- Read-only work có thể chạy trực tiếp khi sandbox chứng minh không mutation.
- Mở rộng heartbeat/resource governor thành trajectory supervisor:
  - Detect lặp tool/read sequence, no-progress, retry storm, budget exhaustion và orphan process.
  - Pause/repair/stop có bounded reason receipt.
  - Shared mutation luôn serialized; concurrency chỉ cho read-only hoặc transaction không chồng scope.
- Antigravity chỉ là adapter/eval case:
  - Gỡ hard-coded Gemini/provider routing khỏi agent templates.
  - `PreToolUse` phải trả `deny/ask/force_ask` theo execution policy thay vì luôn `allow`.
  - Không có nhánh core mang tên Gemini 3.7 Flash hoặc Antigravity.
- Adapter phải probe version vì schema host thay đổi. Baseline chính thức hiện xác nhận Codex có sandbox và MCP `enabled=false`, Claude và Antigravity có pre-tool deny, còn OpenCode V2 có `disabled=true`; các capability này định hướng adapter nhưng không được giả định nếu live probe thất bại. [Codex sandbox](https://learn.chatgpt.com/docs/sandboxing), [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp), [Claude hooks](https://code.claude.com/docs/en/hooks), [Antigravity hooks](https://www.antigravity.google/docs/hooks), [OpenCode V2 MCP](https://opencode.ai/v2/docs/mcp-servers).

### E. Adaptive artifact lifecycle

- Thêm artifact admission trước mọi persistence:
  - `EPHEMERAL`: task nhỏ/one-shot, không durable support file.
  - `CHECKPOINTED`: long-running hoặc cần restart/resume.
  - `COORDINATED`: multi-agent/process.
  - `AUDITED`: high-risk, provenance/evidence retention.
- Admission chỉ cho persist khi cần sống qua restart, resume, coordination, audit/replay, evidence, external filesystem input hoặc owner policy.
- Support pack trở thành optional projection; `goal`, reconcile và runner không được bắt buộc nó khi TaskPacket/contract đã đủ.
- Worker chỉ nhận bounded context và policy tối thiểu; không nhận manual quản lý artifact.
- Temporary helpers có owner, purpose, TTL, regeneration rule và cleanup state; không tự trở thành project truth.
- Host-native compaction không được coi là guarantee. Nếu host không hỗ trợ, runtime dùng minimal checkpoint và ghi capability `UNSUPPORTED`.
- Current pointer chỉ trỏ một active revision. Stale projection không được active retrieval đọc.

### F. Closure, compaction và garbage collection

- Nâng `closeout` thành `agent-rules close`, giữ alias tương thích.
- Close chỉ thành công sau:
  1. Evidence-derived PASS.
  2. Intent/spec/implementation reconciliation.
  3. Scope và verification integrity PASS.
- Closure transaction:
  - Extract durable semantic residue: purpose, outcome, durable decisions/invariants, changed surfaces, final baseline, proof result, remaining issues và historical pointer.
  - Promote long-lived requirements vào project contracts/rules/tests/docs phù hợp.
  - Retire implementation-local requirements.
  - Chuyển pointer `ACTIVE → RETIRED`; historical data sang cold archive/content-addressed store.
  - Mark regenerable/temp artifacts `PURGE_ELIGIBLE`, rồi purge theo reachability/retention.
  - Không purge evidence bắt buộc, referenced artifact hoặc unresolved work.
- Explicit phrases như "đóng task"/"retire plan" gọi terminal audit; không bypass PASS.
- Historical plans không còn nằm trong hot retrieval. Git history/cold archive giữ khả năng audit mà không làm worker đọc nhầm.

## 4. Test và acceptance plan

### Workflow cases bắt buộc

| Case | Kết quả bắt buộc |
|---|---|
| Fix một file | Không durable support file; minimal receipt |
| Refactor one-shot | Một self-contained contract; không đọc support directory |
| Strong planner → OpenCode | Copy đúng một artifact; receiver đủ context |
| Task 4 giờ/restart | Minimal checkpoint và resume đúng intent |
| Multi-agent | Chỉ coordination state cần thiết; ownership không chồng |
| High-risk/auditable | Giữ provenance/evidence; closure không purge proof |
| External intermediate file | Tạo tạm, có lifecycle, cleanup được |
| Completed plan lâu ngày | Ra khỏi active retrieval; residue vẫn tìm được |
| Long-lived requirement | Promote thành project truth trước retirement |
| Implementation-local requirement | Retire/archive sau closure |

### Evals

- One-copy handoff và cheap-model implementation.
- Artifact minimization và adaptive persistence.
- No support-file invention.
- Kill/restart/resume.
- Projection consistency sau amendment.
- Closure và durable residue.
- Requirement promotion.
- Safe cleanup và reachability GC.
- Cross-host/model portability không model catalog.
- MCP:
  - Cài xong nhưng idle có 0 managed process.
  - Task route một MCP chỉ chạy MCP đó.
  - Task không route không chạy MCP nào.
  - Crash/timeout xong process tree về 0 trong bounded timeout.
  - Reinstall `profile none` xóa/disable entry cũ và idempotent.
- 5fedu:
  - Inactive không route.
  - Active nhưng chưa reference không footer.
  - Receipt thật tạo footer đúng component/anchor/hash.
  - Không output "intent detected"/"template checked".
- Enforcement:
  - Out-of-scope mutation bị chặn trước effect hoặc chỉ xảy ra trong quarantine rồi không promote.
  - Host không chứng minh enforcement phải fallback transaction/BLOCKED.
  - Worker không thể author PASS.
  - Operator model selection không bị override.
- Schema migration:
  - Legacy WorkRequest/WorkSpec/PortablePlan/support pack vẫn đọc được.
  - New renderer round-trip không biến Markdown thành truth.
  - Chỉ xóa legacy compiler sau behavioral/eval parity.

### Verification gates

- `npm ci`
- `npm run build`
- `npm run check`
- `npm test`
- `npm run verify:all`
- Package lifecycle smoke.
- Windows live-host verification với reinstall.
- Installed-runtime parity cho Codex, Claude, Grok, OpenCode, Antigravity, Cursor và retired-platform khi host hiện diện.
- Không weaken/skip/hard-disable verification. Kết quả dùng đúng `PASS/PARTIAL/BLOCKED/UNSUPPORTED/PRE-EXISTING/NEEDS_USER`.

## 5. Reinstall, release và cleanup

1. Sau local PASS, inventory và backup mọi host config trước khi clean reinstall.
2. Uninstall runtime do agent-rules sở hữu, dọn entry MCP legacy đã xác định ownership và terminate đúng managed child process trees.
3. Chạy `agent-rules runtime reinstall all`, reconcile mặc định global MCP profile `none`, doctor và live-host verification.
4. Xác nhận trên fresh host session:
   - Không task: 0 managed MCP process.
   - 5fedu inactive ngoài project tương ứng.
   - Installed projection hash khớp canonical source.
5. Fast-forward/merge candidate đã verified vào local `main`, bảo đảm worktree sạch rồi push thẳng `origin/main`.
6. Chờ toàn bộ workflow của final main SHA xanh:
   - Quality Linux/Windows/macOS.
   - Python tests.
   - Security.
   - Certification.
   - Nếu self-hosted native runner không tồn tại, workflow phải kết thúc xanh nhưng artifact ghi `UNSUPPORTED`; không giả PASS. Native failure thật vẫn làm CI đỏ.
7. Nếu CI fail, sửa trên cùng isolated branch, chạy lại local proof, cập nhật main và chờ lại; không đóng task khi còn check đỏ.
8. Sau CI xanh:
   - Tạo `P:\agent-rules-branch-backups\pre-cleanup-<final-sha>.bundle` bằng `git bundle --all`, verify bundle và ghi SHA-256.
   - Xóa mọi remote branch ngoài `main`, gồm hai branch hiện có `adaptive-minimal-proof-testing`, `integration/persistent-mcp-session-broker` và branch của task.
   - Xóa mọi local branch ngoài `main`, remove mọi auxiliary worktree và prune refs.
   - Xác nhận inventory cuối: đúng một worktree, một local branch `main`, một remote branch `origin/main`, local HEAD bằng final green SHA.
9. Chạy closure transaction, retire active plan, compact residue và cleanup support artifacts. Chỉ báo hoàn thành khi clean reinstall, final CI, branch cleanup và closure đều có receipt PASS.
