# Kế hoạch dứt điểm: Full Native 8 Host + Runtime gọn + Một nguồn sự thật

Execute the entire approved plan end-to-end in one continuous pass. Do not stop for Review A/B, intermediate approval, planning-only output, or partial handoff. Implement, migrate, install all 8 hosts natively, verify, repair failures, and close only when every feasible acceptance criterion passes. Use existing authenticated sessions only; never request or access credentials. For signed-out hosts, exhaust all credential-free native proof and report only the model-turn claim as NEEDS_USER. Do not commit or push.

## 1. Kết quả phải đạt

Hoàn thành trong một phase liên tục, không tách “Review A/B”, không để TODO sang phase sau:

- Cả 8 host đều được cài bằng bề mặt native chính thức của chính host đó: Codex, Claude, Grok, OpenCode, Antigravity, Cursor, DeepSeek Harness và Command Code.
- Native không có nghĩa tám host phải dùng cùng cấu trúc file. Chúng phải cùng thực hiện một behavioral contract nhưng qua cơ chế chính thức riêng.
- Host chưa login như Cursor/Grok vẫn phải được chứng minh tối đa bằng native loader, readback, hook/plugin load, skill catalog và MCP handshake không cần model.
- Chỉ claim `MODEL_BEHAVIOR` được phép `NEEDS_USER` khi thiếu phiên đăng nhập. Điều đó không được phủ định các claim native đã PASS.
- Không đọc, sao chép, ghi hoặc yêu cầu credentials. Nếu host đã login thì dùng nguyên session/keyring sẵn cho một canary vô hại.
- Xóa hoàn toàn operator-profile, `vibe-coder`, `plain-vietnamese`, `technical_explain` và mọi mode giao tiếp liên quan khỏi source đang hoạt động, CLI, rules, tests và installed mirrors.
- Giao tiếp mặc định trở thành một rule tự nhiên: dùng ngôn ngữ của người dùng, nói kết quả trước, từ dễ hiểu; tự thêm chi tiết kỹ thuật khi nó giúp quyết định, debug, verification hoặc khi người dùng hỏi.
- Artifact, skill, MCP và closure giữ nguyên hoặc tăng chất lượng nhưng chỉ còn một quyết định cho mỗi việc.
- Chỉ còn một host registry, một skill resolver, một integration broker, một artifact store, một evidence ledger và một outcome reducer.
- Public UX chỉ hiện trạng thái đơn giản; chi tiết nội bộ nằm sau `--details` hoặc `--json`.
- Không có false PASS, đặc biệt không còn quét một JSON PASS bất kỳ để đóng requirement khác.
- Không commit, push hoặc deploy nếu chưa được yêu cầu.

Luồng đích duy nhất:
`Raw intent → Task contract → Skill/Integration selection → Native host → Evidence ledger → Acceptance audit → Outcome`

## 2. Kiến trúc và public interface đích

### 2.1 Một nguồn sự thật
Giữ `platforms/platform-contracts.json` làm registry host duy nhất, nâng schema và để toàn bộ adapter, docs, fixture và certification được sinh/đọc từ đây. Xóa các bảng host trùng trong CLI, kernel, automation và metadata.
Mỗi `NativeHostContract` phải khai báo: Host ID, CLI/desktop signal và custom home environment; Instruction, skill, agent, hook/plugin/mod, MCP và headless surfaces chính thức; Đường dẫn native, precedence, reload/restart và cách merge bảo toàn config người dùng; Capability thực tế thay vì hardcode theo version; Install, readback, canary và uninstall strategy; Claim nào cần auth và claim nào phải chứng minh được offline; Các giới hạn thật của host; không giả lập capability host không có. Version chỉ là diagnostic. PASS phải đến từ capability/readback/canary, không phải “binary trả về version”.

### 2.2 Native mapping của 8 host
(Spec table per host with projection, credential-free proof, behavioral proof)
Grok compatibility xử lý theo thuật toán cố định 5 bước.
Docs references: Codex AGENTS.md, Codex Skills, Cursor Skills/Plugins/Hooks, OpenCode Skills, Antigravity CLI, Grok native rules/skills/plugins, DeepSeek Harness skills, Command Code Mods.

### 2.3 Public CLI gọn
Public help chỉ giữ: install, uninstall, doctor, status, run, integration list|enable|disable|doctor, init, reference.
Xóa khỏi public CLI: operator-profile, close, M11/terminal-gate/legacy, maintainer-only → agent-rules dev.
Public status: Host: Ready/Needs action/Unsupported; Task: Running/Done/Needs you/Failed.
Ví dụ Grok Ready — native setup verified; model turn not tested because host is signed out. Chi tiết MODEL_BEHAVIOR: NEEDS_USER chỉ trong --details.

### 2.4 Types và artifacts công khai
Thay các schema chồng chéo bằng NativeHostContract, HostCertificationReceipt, SkillManifest, IntegrationLease, ProofPlan, EvidenceRecord, OutcomeReceipt.
Mỗi run chỉ còn run.json, events.jsonl, result.json, artifacts/. Không module nào ngoài RunStore được ghi run artifacts trực tiếp.

## 3. Thay đổi triển khai
3.1 Bảo toàn và xử lý worktree hiện tại: không reset, lưu map, forward-edit, chuyển truth-model-negative, đánh dấu v3 superseded, tạo current pointer mới.
3.2 Native installer transactional: detect, inventory, planInstall, install, certify, rollback, uninstall; yêu cầu bắt buộc liệt kê.
3.3 Native runtime hai lớp nhưng không inject trùng.
3.4 Rules và communication: rút gọn ≤5 nhóm, xóa operator-profiles, kernel types, CLI services, .agent/operator-profile, managed blocks, trigger lists, v.v. Rule giao tiếp duy nhất natural language.
3.5 Skills: native, trigger tốt, không route ba lần.
3.6 MCP: tách khỏi core install.
3.7 Artifact admission và runtime output: RunStore duy nhất.
3.8 Một truth/closure path: EvidenceLedger → AcceptanceAudit → OutcomeReducer → OutcomeReceipt.
3.9 Planning, docs và automation cleanup.

## 4. Verification và certification
4.1 Claim model 9 claims per host; Ready requires 1–7 và 9 PASS; claim 8 conditional.
4.2 Best-effort cho Cursor và Grok chưa login.
4.3 Antigravity: cài agy bằng official installer, thử silent keyring, chứng minh IDE/CLI riêng.
4.4 Automated tests: unit, integration, behavior/eval, quality/release commands.
4.5 Definition of Done enumerated.

## 5. Thứ tự thực hiện và assumptions đã khóa
Thứ tự một pass 16 bước; assumptions liệt kê.
