# Agent-rules vs Shipyard — research note

## Summary

- `agent-rules` là control plane cho hành vi agent: context routing, skill lazy-load, PAF, tier routing, scope lock, ledger và runtime parity trên Codex/Grok/Antigravity/Cursor.
- Shipyard là delivery factory cho một app repo: lane cô lập bằng clone/port/DB/Redis, pipeline `/ship-feature`, CI/E2E/browser QC, senior GO/NO-GO, PR watch và dev-QC sau merge.
- `agent-rules` có plan contract sâu và portable hơn; Shipyard có execution orchestration, liveness và evidence thực dụng hơn.
- Hai bộ bổ sung nhau: agent-rules quyết định agent nên hiểu/lập kế hoạch/làm theo nguyên tắc nào; Shipyard cung cấp nơi chạy, cô lập, kiểm thử và đưa feature tới PR.

## Evidence

### Agent-rules

- PAF yêu cầu meta, outcome, IN/OUT, context routing, phase, known-unknowns, gates, Plan QA, HANDOFF và revision protocol.
- Mỗi phase có ngân sách nguyên tử: tối đa 5 file, 8 AC, một subsystem/layer, verify độc lập, build-green và không hidden dependency.
- Task Density Contract yêu cầu file + anchor, context files, contract refs, edge cases, regression map, forbidden, depends-on, AC có verify/expected output.
- Goal autopilot thêm self-QA tối đa 3 vòng, progress ledger, completion-ledger, self-review, final miss-sweep và escalation sau hai lần fail cùng cách.
- Runtime thực tế hiện có 15 rules, 15 skill roots, 4 platform overlays, integration policy, build/install/doctor và validator; repo hiện không có thay đổi chưa commit.
- `automation/audit-plan-artifact.ps1` kiểm tra wiring/section/keyword và cấm một số cấu trúc sai; nó chưa semantic-review nội dung acceptance criteria, dependency hay chất lượng verify command.
- `skills/finish-to-completion/references/slice-gate-protocol.md` và completion ledger là hard contract bằng grep/evidence ở mức agent workflow, nhưng `automation/11-audit-slice-ledger.ps1` được tài liệu nói là chưa implement.

### Shipyard

- Repo chính thức đang ở commit `66a0ea9356a5130b452f37e62d9b8262c75fd446` trên `main`.
- README mô tả pipeline: intake → plan → implement → CI/dev preflight → E2E → code review → browser QC → senior GO/NO-GO → PR → ticket/CI watch → human merge → dev QC hoặc follow-up fix PR.
- `/ship-feature` frontload Q&A, khảo sát repo, viết plan, debate plan bằng agent độc lập, rồi TDD và commit trên feature branch.
- Lane state ghi stage/heartbeat; dashboard phân biệt progress, liveness, gate decision, CI, PR, ticket và proof gallery.
- QC plan có in-scope/out-of-scope/smoke set; qc-local/dev-qc phải cover positive, negative, reload, re-login, layout narrow/short viewport và lưu screenshot theo path cố định.
- Senior gate đọc requirement, code-review, QC report, merge-safety và QC-plan coverage; chỉ `VERDICT: GO` mới được push/open PR.
- `/split-batch` tìm surface thật, hotspot, overlap matrix và dispatch order để giảm conflict giữa các lane.
- Shipyard có profile abstraction, nhưng operational contract hiện gắn với Claude Code, Bash/flock, Docker, `gh`, Playwright MCP và Postgres + Redis qua docker-compose.
- Workflow analysis của chính Shipyard ghi nhận chi phí thực tế: build/e2e serialization, DB pollution, CI access, liveness và merge-race; sau đó các vấn đề được chuyển thành guard/fast-path/heartbeat/QC.

## Risks

- PAF có thể tạo false precision: exact file/anchor và phase budget giúp L0 không đoán, nhưng nếu discovery sai thì executor bị khóa vào plan sai.
- Plan validator có thể cho PASS một PAF “đủ section” nhưng AC mơ hồ hoặc verify command yếu; cần semantic plan review hoặc rubric machine-checkable.
- Agent-rules có nhiều references và tier/lane/ledger khái niệm; nếu trigger/precedence không rõ, ceremony có thể vượt giá trị task.
- Shipyard là pipeline opinionated: setup nặng, cần tài nguyên cho nhiều lane và việc serialized có thể làm parallelism suy giảm.
- Shipyard không phải framework plan tổng quát cho architecture/research/docs/harness governance; nó tối ưu cho feature delivery của app repo.
- Cả hai vẫn dựa nhiều vào model tuân thủ prose. Shipyard có state/scripts/proof mạnh hơn, nhưng một số quyết định review/QC vẫn do agent tự báo cáo.
- Cả hai repo snapshot được khảo sát đều không có file `LICENSE` ở root; cần kiểm tra quyền sử dụng trước khi copy trực tiếp vào sản phẩm/khách hàng.

## Recommendation

- Giữ PAF làm canonical plan contract của agent-rules; không thay bằng stage list của Shipyard.
- Mượn từ Shipyard ba primitive: `stage state + heartbeat`, `QC plan sống + proof path`, và `independent GO/NO-GO gate`.
- Bổ sung semantic Plan QA: mỗi AC phải map tới deliverable, file/symbol, verify command, expected output và risk; kiểm tra dead verify command, AC trùng, AC không observable và dependency cycle.
- Thêm trường `flex_budget` hoặc `decision_points` cho mỗi phase: khóa outcome/invariant/OUT; cho phép executor chọn implementation trong vùng an toàn.
- Tách `hard_lock`, `soft_assumption`, `known_unknown` và `discovery_branch` để tránh coi mọi file path đã đoán là bất biến.
- Đổi “1 phase = 1 session” thành “1 phase = 1 context-safe slice”; session chỉ là cơ chế vận hành mặc định, không phải đơn vị logic cứng.
- Dùng Shipyard-style `stage ledger` cho task dài nhưng giữ PAF/ledger của agent-rules làm source of truth; không nhập toàn bộ lane/PR machinery vào global rules.
- Nếu cần delivery automation, xây một adapter/platform skill riêng cho Shipyard thay vì làm `agent-rules` phụ thuộc Claude Code, Docker hoặc GitHub.

## Unknowns

- Chưa chạy toàn bộ Shipyard test suite hoặc dashboard live; nhận định operational được lấy từ source, skill/agent contracts, README và workflow-analysis đã commit.
- Chưa có benchmark A/B cùng một feature chạy bằng PAF thuần so với Shipyard pipeline; chưa thể định lượng yield, wall-clock hoặc tỉ lệ miss.
- Chưa kiểm tra chính sách license upstream của từng repo ngoài việc root không có `LICENSE` trong snapshot.

## Hand to Plan Architect — PAF §5

- KU1: Semantic Plan QA nên enforce bằng script nào và mức nào không làm plan-authoring thành ceremony cho task tiny?
- KU2: Chọn một task chuẩn 3–5 phase để benchmark PAF-only, Shipyard-only và hybrid; đo AC miss, verify coverage, wall-clock, human nudges.
- KU3: Xác định adapter boundary nếu tích hợp Shipyard-style stage/heartbeat/proof vào agent-rules mà không kéo Claude/Docker/PR assumptions vào global layer.
- KU4: Owner quyết định `flex_budget` thuộc PAF canonical hay skill execute; cần giữ một concept một nơi.
