# Runtime Native Live Closure v3 — Explicit Technical Explain & 8-Host End-to-End Proof

## 1. Contract chốt lại

### Tên chính thức

Dùng tên user-facing:

```text
technical-explain
```

Dùng tên field/code:

```text
technical_explain
```

Không dùng các tên gây hiểu nhầm:

```text
technical_mode
auto-revert
revert: after-task-or-topic
```

`technical-explain` chỉ là **cách trả lời/giải thích cho owner**, không phải chế độ thực thi, không thay đổi model, quyền, verification, scope hoặc chất lượng implementation.

### Hành vi mặc định

Mặc định mọi host đều:

- nói tiếng Việt tự nhiên;
- outcome-first;
- tập trung việc cần làm và kết quả;
- không tự đổ log, architecture hoặc code dài;
- không hỏi những câu không ảnh hưởng scope, quyền, an toàn hoặc acceptance.

Bên trong, agent vẫn phải research, đọc code, lập plan, chạy test, review và verify đầy đủ. `technical-explain` chỉ điều khiển phần giải thích cho owner.

### Cách kích hoạt

`technical-explain` chỉ bật khi owner chủ động yêu cầu nội dung kỹ thuật.

Phải nhận diện cả nhiều cách diễn đạt tiếng Việt/Anh, ví dụ:

- “giải thích kỹ thuật”;
- “phân tích nguyên nhân”;
- “tại sao nó hoạt động như vậy?”;
- “đào sâu flow này”;
- “giải thích architecture/code/logic”;
- “review kỹ thuật”;
- “phân tích diff”;
- “chỉ ra trade-off”;
- “debug chi tiết”;
- “giải thích cách triển khai”.

Không được tự bật chỉ vì:

- task có code;
- owner nói “sửa lỗi”, “làm feature”, “triển khai”;
- agent đang đọc file kỹ thuật;
- model tự suy đoán owner muốn nghe architecture.

Nếu yêu cầu chỉ là thực thi, agent thực thi đầy đủ nhưng trả lời theo vibe mặc định.

### Thời hạn hiệu lực

`technical-explain` chỉ áp dụng cho:

- yêu cầu hiện tại;
- các câu hỏi nối tiếp rõ ràng đang tiếp tục cùng chủ đề kỹ thuật.

Khi owner chuyển sang task/chủ đề mới hoặc không còn yêu cầu giải thích kỹ thuật, câu trả lời trở về mặc định. Không lưu technical-explain thành trạng thái bật vĩnh viễn.

Loại bỏ:

- `session_override`;
- `override on/off` như cơ chế vận hành thông thường;
- trạng thái technical mode persistent trong `.agent/operator-profile/state.json`.

Nếu cần test nội bộ, chỉ cho phép test inject `technical_explain_requested`, không tạo CLI toggle có thể làm sai contract.

## 2. Thay đổi implementation

Cập nhật canonical profile:

`P:\agent-rules\operator-profiles\vibe-product\profile.json`

Cập nhật kernel profile resolver:

`P:\agent-rules\packages\kernel\src\northstar\operator-profile.ts`

Cập nhật CLI/projection:

`P:\agent-rules\packages\cli\src\commands\operator-profile.ts`

Yêu cầu:

- schema mới dùng `technical_explain`;
- trigger matcher hỗ trợ nhiều biến thể ngôn ngữ;
- phân biệt rõ “owner yêu cầu giải thích kỹ thuật” với “task kỹ thuật cần thực thi”;
- owner request có ưu tiên cao nhất;
- mặc định luôn là `technical_explain = false`;
- profile không được làm yếu verification, security, scope hoặc PASS semantics;
- overlay của 8 host phải được regenerate từ canonical source, không sửa tay;
- mọi reference đến `technical_mode`, `technical_revert`, `after-task-or-topic` phải được loại bỏ khỏi active runtime, test, docs và overlay.

## 3. Native materialization và profile live

Chuẩn hóa chuỗi:

```text
canonical profile
→ install state
→ repo projection
→ native materialization
→ native readback
→ host prompt
→ behavior canary
```

`SYNCED` chỉ có nghĩa file projection giống canonical source.

Chỉ trả `NATIVE_LIVE` khi host thật sự:

1. khởi động được;
2. đọc được Agent-Rules;
3. nhận request bình thường;
4. trả lời theo vibe mặc định;
5. nhận request technical-explain;
6. trả lời sâu hơn;
7. request tiếp theo không còn yêu cầu kỹ thuật thì trở về mặc định;
8. không làm yếu verification/scope/security.

Deactivate hoặc đổi profile phải:

- vô hiệu hóa/xóa đúng phần Agent-Rules sở hữu trong native surface;
- không xóa cấu hình riêng của người dùng;
- phát hiện stale overlay/native file;
- không báo PASS nếu native readback còn profile cũ.

## 4. 8-host native live closure

Mỗi host phải có receipt mới bind đúng HEAD hiện tại:

```text
detect binary
→ version
→ install/reconcile Agent-Rules
→ native readback
→ config validation
→ real startup
→ harmless smoke task
→ output verification
→ restart
→ persistence check
```

Ma trận capability:

- Codex, Claude, Grok, Antigravity, Cursor, OpenCode:
  - managed Agent-Rules surface;
  - native startup;
  - Agent-Rules readback;
  - MCP capability đúng contract;
  - smoke task.
- DeepSeek Harness:
  - native home/config;
  - executable/version;
  - profile/plugin/model capability;
  - Agent-Rules native readback;
  - smoke task.
- Command Code:
  - native home/config;
  - executable/version;
  - permission layer;
  - plan mode;
  - isolated agent/worktree;
  - Agent-Rules native readback;
  - smoke task.

Không ép DeepSeek Harness hoặc Command Code phải có cùng 4 MCP như sáu host kia.

Receipt bắt buộc ghi:

- host;
- version;
- native home;
- current HEAD;
- config hash;
- Agent-Rules projection hash;
- startup;
- smoke task;
- restart/persistence;
- capability;
- lỗi thực tế nếu có.

Receipt bind commit cũ phải là `STALE`, không được dùng lại để claim PASS.

## 5. Canonical prompt, context, skills và handoff

Một contract canonical duy nhất phải giữ:

- raw owner intent;
- requirements;
- claims;
- plan;
- decisions;
- non-goals;
- context capsule;
- selected skills và hash;
- proof obligations;
- evidence;
- source revision;
- handoff hash.

Plan, prompt native và host dialect chỉ là các cách render cùng contract.

Handoff phải:

- không yêu cầu owner viết lại prompt;
- không mất requirement, decision hoặc constraint;
- kiểm tra hash, length, count, truncation, graph và revision;
- ghi source host, target host, context hash, skill hash và coverage;
- có ít nhất một live handoff giữa hai host khác nhau;
- giữ ma trận 56 chiều làm regression test.

Skill phải được chứng minh đủ bốn tầng:

```text
route
→ load SKILL.md thật
→ materialize vào context/prompt
→ ảnh hưởng đúng output
```

Không coi catalog, candidate inventory hoặc filename là bằng chứng skill đã áp dụng.

Giữ nguyên:

- Browser QA: chỉ route khi có browser/UI claim;
- Pencil: explicit-only, foreground và MCP handshake;
- Candidate Fabric;
- 5fedu: explicit domain-pack/reference;
- không load toàn bộ skill mặc định.

## 6. Quality và review contract

### Lifecycle quality

Kiểm tra theo chuỗi:

```text
intake
→ preserve intent
→ research/source grounding
→ requirements/plan
→ implementation
→ Review A
→ verification/QA
→ close
```

Task có rủi ro phải kiểm tra:

- requirement coverage từ claim/evidence thật;
- source truth;
- primary outcome;
- scope;
- architecture fit;
- maintainability;
- UX/product behavior nếu user-facing;
- regression;
- error recovery;
- live proof nếu claim là live.

Task nhỏ chỉ dùng proof tối thiểu phù hợp.

### Review A

- executor tự review bằng fresh context;
- tối đa một correction batch;
- chỉ chặn vì lỗi ảnh hưởng primary outcome, behavior, security, scope, user value hoặc proof bắt buộc;
- không tiếp tục đào lỗi lặt vặt sau khi các gate chính đạt.

### Review B

- mặc định OFF;
- chỉ bật khi owner chủ động yêu cầu;
- tối đa một primary review và một correction review;
- không tự kích hoạt lại vì nit hoặc lỗi không material;
- không được thay thế execution.

Mọi host đều có thể làm planner, implementor, reviewer hoặc verifier. Không hard-code Codex là planner và Antigravity là implementor.

## 7. Model-neutral dogfood

Không gắn harness với Gemini, Antigravity, Codex hoặc model cụ thể.

Ngay trong batch này, implementor phải dogfood bằng chính flow tương lai:

```text
owner prompt
→ canonical plan/context
→ native materialization
→ execution
→ Review A
→ proof
→ handoff/closure receipt
```

Nếu model/host không đủ capability:

- trả `NEEDS_USER` hoặc `BLOCKED`;
- không tự đổi model;
- không tự hạ risk;
- không tạo PASS giả.

Benchmark Flash so với model cao cấp được giữ thành phase đánh giá sau closure, không làm blocker cho native-live closure.

## 8. Acceptance gates

Chạy trên đúng HEAD cuối:

```text
npm ci
npm run build
npm run check
npm test
npm run verify:all
python automation/validate-rule-contracts.py
node automation/validate-canonical-plan.mjs
node automation/verify-windows-hosts.mjs
git diff --check
```

Bắt buộc thêm:

- 8/8 receipts bind current HEAD;
- 8/8 native startup không có config error;
- 8/8 smoke task thành công;
- 8/8 Agent-Rules readback đúng;
- 8/8 profile projection không drift;
- technical-explain canary PASS;
- default vibe canary PASS;
- one live cross-host handoff PASS;
- context/skill canary PASS;
- Review A bounded;
- Review B OFF trong execution mặc định;
- không còn timeout Command Code;
- không còn stale receipt được dùng;
- không còn Mimocode/Control Plane active residue;
- Browser/Pencil/5fedu không auto-route.

Kết quả chỉ được dùng:

```text
PASS
PARTIAL
BLOCKED
UNSUPPORTED
PRE-EXISTING
NEEDS_USER
```

Không chuyển `BLOCKED`, `UNSUPPORTED` hoặc `NEEDS_USER` thành PASS bằng fixture hoặc báo cáo chữ.

## 9. Execution contract cho implementor

Implementor phải:

1. cập nhật native implementation plan từ artifact này;
2. đổi toàn bộ contract cũ sang `technical-explain`;
3. triển khai ngay, không chờ owner duyệt từng bước;
4. không yêu cầu owner viết lại prompt;
5. không mở Review B;
6. chỉ dùng tối đa một correction batch cho Review A;
7. chạy full gates và native canaries;
8. báo cáo tách biệt code-level, installed-level, native-live-level và owner-required evidence;
9. dừng sau báo cáo cuối để owner review;
10. không commit/push nếu chưa được yêu cầu.

Hoàn tất chỉ khi source, native installation, profile behavior, context, skills, handoff, review, quality và evidence cùng trỏ tới một revision hiện tại.
