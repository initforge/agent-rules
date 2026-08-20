Owner decision: tối ưu mạnh orchestration của active Harness v3 successor theo một additive amendment mới, dự kiến `AM-0002 — adaptive execution optimization`.

Không rewrite hoặc supersede active original plan:

Plan ID:
agent-rules-harness-v3-rearchitecture-20260726-r1

Expected original SHA-256:
c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31

Đây là additive execution-policy refinement. Mọi product requirement, acceptance criterion, finding, receipt, PlanAnchor, task ID và completed MATCH hiện có phải được bảo toàn.

## Safe transition bắt buộc

1. Re-read active original, AM-0001, WorkLedger, shadow tasks/progress/reconciliation và current diff.
2. Xác minh original SHA đúng expected hash.
3. Không interrupt, cancel hoặc thay assignment của:
   - P1-R3B-SKILL-REFERENCE-WRAPPER
   - P1-PARITY-V3-ENGINE-RUNTIME-HARDENING
4. Không dispatch assignment phụ thuộc mới trong lúc hai assignment trên chưa có terminal receipt/review.
5. Hoàn tất/review chúng theo contract đã giao.
6. Checkpoint một revision mới, bảo toàn toàn bộ history.
7. Chỉ sau checkpoint đó mới capture và activate AM-0002.
8. Nếu active state đã tiến xa hơn revision 20, dùng repo/ledger truth mới nhất; không rollback về revision 20.

## Artifact placement

Không tạo child `original.md`, competing plan head hoặc competing ledger.

Tạo đúng một owner-approved supplement:

`.agent/plans/<active-plan-id>/amendments/0002-adaptive-execution-optimization.md`

AM-0002 phải:

- Ghi source owner approval.
- Có SHA-256 riêng.
- `supplements` active parent plan.
- Không sửa parent `original.md`.
- Được thêm vào WorkLedger amendments.
- Có PlanAnchors cho execution-policy requirements.
- Có tracking dưới existing batch/shadow mechanism.
- Chỉ trở thành effective sau safe-transition checkpoint.

WorkLedger JSON vẫn là canonical runtime state. Markdown vẫn là human-readable projection.

## Nội dung AM-0002

### Mục tiêu

Giảm token và wall-clock overhead mà không giảm final fidelity, independent evidence hoặc reconciliation với immutable plan.

### Không thay đổi

- Main agent vẫn orchestration/review/reconciliation only; không sửa source.
- Engine/backend vẫn là canonical enforcement owner.
- Worker không tự khai PASS.
- Mọi AC vẫn cần executed probe và independent reducer.
- Dependency chỉ được dispatch sau khi prerequisite đủ điều kiện reconciled.
- Final independent review và reconciliation vẫn bắt buộc.
- Mọi relevant defect vẫn phải repair tới PASS hoặc blocker thật.
- Giới hạn owned paths, tối đa năm file trọng tâm và tám AC vẫn giữ.
- P0–P9, task IDs, findings và evidence hiện tại không bị xóa hoặc rewrite.

### Tối ưu behavior ngay sau activation

1. Verification phân tầng:
   - edit: focused regression;
   - slice: package build/test/typecheck;
   - batch: integrated workspace verification;
   - stabilization: generated rebuild;
   - certification: OS/host/native matrix.

2. Phân biệt verifier và semantic reviewer:
   - mỗi AC vẫn có independent reducer;
   - không mặc định dùng một LLM reviewer đầy đủ sau từng micro-slice low/medium-risk;
   - semantic/adversarial LLM review chạy ở risk boundary hoặc integrated batch boundary;
   - high-risk security, installer, schema boundary và destructive migration vẫn review riêng.

3. Giữ dependency correctness:
   - không chạy downstream trước prerequisite reconciliation;
   - có thể gộp review wave cho các task độc lập;
   - với chuỗi parity hiện tại, giữ nguyên task IDs/dependencies/AC;
   - chỉ tối ưu verification/review topology, không rewrite task DAG ngầm.

4. Threat matrix:
   - path portability;
   - Windows device names;
   - Unicode/case collisions;
   - symlink/hardlink/junction;
   - resource depth/size/node budgets;
   - schema/executable parity;
   - review/evidence freshness;
   - installer rollback/containment.
   Các family này phải trở thành deterministic/property-based tests thay vì reviewer nghĩ từng literal qua nhiều vòng.

5. Convergence:
   - gom toàn bộ findings của một review wave;
   - defect thật trong requirement hoặc regression vẫn chặn;
   - enhancement ngoài plan phải rollback hoặc owner-approved amendment;
   - cùng failure signature hai lần thì escalate tier;
   - không có tiến triển sau bounded attempts tạo needs-replan/escalation, không false PASS;
   - `PARTIAL` không phải kết thúc do hết token/context.

6. Bookkeeping:
   - engine/CLI dần sở hữu hash, checkpoint, ledger event và shadow regeneration;
   - LLM không được duy trì như bookkeeping worker lâu dài;
   - trước khi engine function tồn tại, transitional checkpoint phải bounded và không sửa source.

7. Communication:
   - user update chỉ ở material events: adoption, batch start, gate pass/fail, blocker, scope change, final;
   - routine heartbeat nằm trong shadow/control-plane;
   - receipts/logs lớn được lưu bằng path/hash, không kể lại trong conversation.

8. Model routing:
   - cheap/fast tier cho bounded mechanical tasks;
   - medium tier cho normal implementation;
   - strong tier cho architecture, repeated failure, high-risk review và final reconciliation;
   - model/host chỉ nhận assignment-relevant context;
   - không truyền toàn bộ conversation nếu artifact/bundle đã đủ.

9. Cross-model portability:
   - mở rộng contract hiện có, không tạo contract cạnh tranh;
   - DeepSeek/Codex/host khác nhận existing PortablePlan/TaskAssignment/export bundle;
   - identity gồm plan ID/hash, amendment/effective-plan hash, assignment ID, baseline và bundle hash;
   - worker không sửa canonical ledger/shadow;
   - controller validate receipt rồi nhập vào WorkLedger;
   - thiếu capability phải degrade/fail trung thực.

## Canonical implementation placement

Chạy Context Evolution Protocol duplicate audit trước mọi canonical edit.

Mở rộng owner hiện có:

- lifecycle/completion invariant ngắn → canonical rules/behaviors owner;
- plan artifact, amendment, export/handoff → `skills/plan-and-handoff`;
- remediation/finalization → `skills/finish-to-completion`;
- scheduling, risk, budget, ledger và bundle enforcement → engine/schema/CLI;
- host delta → platform adapter;
- telemetry/cost → existing P7 owner.

Không tạo thêm skill/rule/schema owner nếu concept đã tồn tại.

## Refactor và delete policy

- Không mass-delete để “tinh gọn”.
- Trước delete phải có semantic/duplicate mapping: old claim → canonical owner.
- Chỉ xóa wording/file cũ sau khi canonical replacement reachable và test pass.
- Không xóa ledger, shadow history, receipts, findings hoặc MATCH evidence.
- Không xóa file đang thuộc active assignment.
- Generated/source cleanup chỉ theo P6/P9 gate.
- 5fedu vendored cleanup chỉ theo P1 semantic ledger và 85% gate.
- Mọi `EXTRA` phải rollback hoặc thành owner-approved amendment.

## Acceptance

AM-0002 chỉ PASS khi:

- Parent original hash không đổi.
- Hai active assignments hiện tại được bảo toàn và xử lý tới terminal review.
- Checkpoint transition fresh.
- Không competing plan/ledger/contract.
- Existing pending tasks giữ IDs, dependencies, anchors và AC.
- New review topology giảm duplicated full verification nhưng không bỏ independent reducer.
- Final reconciliation vẫn đọc original + AM-0001 + AM-0002 + integrated diff + evidence.
- Tests chứng minh low/medium/high-risk routing.
- Tests chứng minh invalid receipt, stale review và missing evidence vẫn chặn.
- Tests chứng minh cross-model assignment có thể resume bằng artifact identity mà không cần conversation history.
- Context duplicate audit và canonical placement PASS.
- Không có source/history deletion ngoài gate đã duyệt.

## Main-agent behavior

Main không trực tiếp sửa source.

Main phải:

- kiểm tra active agents;
- kiểm tra owned paths;
- đọc diff/evidence;
- phát hiện overlap/stale receipt;
- dispatch bounded workers;
- reconcile plan chain;
- mở repair khi defect thật;
- tiếp tục toàn bộ parent plan sau khi AM-0002 batch PASS.

Không dừng ở việc viết AM-0002 hoặc refactor behavior. Sau activation, tiếp tục các task đang còn thiếu của parent plan theo safe dependency order.

## First response contract

Trước khi tiếp tục implementation, báo đúng:

- active plan ID và verified original SHA;
- current ledger revision;
- hai active assignments và trạng thái mới nhất;
- planned safe-transition point;
- AM-0002 path dự kiến;
- confirmation rằng không task/history/MATCH nào bị reset;
- confirmation rằng prompt cũ không được dùng để tạo child original hoặc competing ledger.

Sau đó tiếp tục làm, chỉ cập nhật khi có material event.