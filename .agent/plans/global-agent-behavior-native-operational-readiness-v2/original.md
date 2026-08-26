# One-shot Correction v2 Revised — Operational Readiness, Native thật, Owner Validation

## 1. Mục tiêu và quyết định khóa

Làm việc trong đúng branch/worktree riêng đã được cấp, bắt đầu từ `5777d43875693cc6e3311f29bf7598ec4f0495cb`. Không chuyển sang `main`, không sửa worktree khác, không push, merge, rebase hay tạo PR. Hoàn thành xong thì commit local, để working tree sạch và đứng yên chờ owner review.

Tạo phase:

`global-agent-behavior-native-operational-readiness-v2`

Phase này supersede `global-agent-behavior-native-live-closure-v1` nhưng không sửa lịch sử v1. Giữ nguyên raw intent và `REQ-101…REQ-122`; thêm amendment thay đổi cách nghiệm thu:

- Agent phải làm hết mọi việc an toàn, trong scope và có thể tự thực hiện.
- Không yêu cầu agent chứng minh thay những trải nghiệm chỉ GUI/login/người dùng mới quan sát được.
- Không tạo verifier, bridge, mode hoặc artifact mới chỉ để lấp ô PASS.
- Deterministic failure còn tái hiện được vẫn là blocker, không được đẩy sang owner.
- GUI/model/UX claim không thể quan sát sau một bounded attempt được ghi `NEEDS_USER`.
- `task_state=COMPLETE` được phép tồn tại cùng các claim `NEEDS_USER`.
- Kết quả tổng là `PASS` khi mọi claim bắt buộc đã chứng minh; `PARTIAL` khi implementation dùng được nhưng còn human residual; `BLOCKED` khi còn lỗi agent có thể sửa hoặc kiến trúc chưa hoạt động.
- Không dùng trạng thái, profile giao tiếp hay CLI command mới.

Sửa semantics của bốn requirement cuối:

- `REQ-118`: giữ 14 journey trong catalog, nhưng journey phụ thuộc GUI/login trở thành bounded attempt + human residual.
- `REQ-120`: local operational-readiness gate, không phải tuyệt đối live-release gate.
- `REQ-121`: sửa và kiểm tra workflow definition tại local; remote CI để owner chạy sau.
- `REQ-122`: local commit + review handoff; tuyệt đối không push.

Giữ nguyên:

- Năm rules hiện tại.
- Tám public CLI command.
- Giao tiếp tự nhiên, outcome-first.
- Không khôi phục `vibe-coder`, `plain-vietnamese`, `technical_explain`, `operator-profile`.
- Core install không đụng MCP.
- WorkerPacket là cơ chế nội bộ, không bắt người dùng hiểu ticket/DAG/capsule.
- Không chỉnh tay `generated/` hoặc installed mirrors.

## 2. Global behavior và interface phải đạt

### Luồng production duy nhất

Nối thật, không chỉ tạo module/test riêng:

`RequestIntake → PlanCompiler → ContextRuntime → SkillResolver → CapabilityBroker → ExecutionCoordinator → ProofRouter → RunStore → OutcomeReducer`

`HostAdapter` là host edge, không tự viết state hoặc outcome.

Acceptance:

- Public `run` và plan-based run cùng đi qua luồng này.
- Không còn production path song song tự resolve skill, tự ghi state hoặc tự sinh PASS.
- Fresh worker chỉ nhận plan artifact vẫn có raw intent, quyết định, scope, packet hiện tại, skill/capability route, proof và next action.
- Planner không tự bịa owned path, native surface hoặc generic verifier khi thiếu truth.

### WorkerPacket

Compiler tự sinh WorkerPacket theo:

`1 behavioral outcome + 1 ownership boundary + 1 proof boundary`

WorkerPacket phải chứa lineage, dependencies, owned/forbidden scope, locked decisions, input, skill/capability cần dùng, procedure, outputs, acceptance, verification, rollback và escalation.

Không giữ nhiều nguồn active như ticket/task graph/TaskPacket/worker packet. Format cũ chỉ có migrator một chiều.

### Completion behavior global

Mỗi claim ghi rõ:

- `agent_verifiable`: agent phải tự làm và tự kiểm tra.
- `owner_observable`: agent thử nếu môi trường cho phép, sau đó bàn giao.
- `omitted`: lý do bỏ qua và điều kiện cần chạy lại.

Agent chỉ được dừng khi:

- Không còn deterministic failure chưa xử lý.
- Không còn hành động agent-actionable hợp lý trong scope.
- Native surface và install target đã được xác định bằng installed host/help/package/official source.
- File/config đã được cài và readback bằng host nếu host có surface inspect.
- Human residual đã ghi bước thử ngắn, expected result và nơi báo lỗi.

Không tiếp tục đào improvement ngoài acceptance sau khi finding set đã khóa. Finding mới chỉ được nhận nếu chứng minh một acceptance hiện tại sai hoặc là regression do correction tạo ra.

### Native acceptance theo bốn tầng

1. `SURFACE_CONFIRMED`: đúng format/path/plugin/profile/mod do host thực sự hỗ trợ.
2. `INSTALLED`: mutation đã hoàn thành, giữ user-owned bytes.
3. `OFFLINE_VERIFIED`: host CLI/config/profile readback nhìn thấy projection.
4. `LIVE_VERIFIED`: model/session thật sử dụng được.

Ba tầng đầu là agent-required nếu host hiện diện và có readback. Tầng bốn được agent thử có giới hạn; GUI/login không điều khiển được thì `NEEDS_USER`.

Binary tồn tại hoặc file nằm trên disk chỉ chứng minh detection/placement, không chứng minh consumption.

## 3. Implementation packets

### COR-000 — Phase admission và blocker map

- Xác nhận current branch/worktree, baseline SHA và clean tree.
- Tạo v2 plan hợp schema; preserve exact raw intent và 22 requirement.
- Ghi amendment operational-readiness nói trên.
- Import blocker `SB-01…SB-32`; `SB-14=BASELINE_RESOLVED`.
- Phân loại mỗi blocker:
  - `AGENT_ACTIONABLE`
  - `OWNER_OBSERVABLE`
  - `BASELINE_RESOLVED`
  - `OUT_OF_SCOPE_FUTURE`
- Map blocker → canonical owner → packet → acceptance → verifier.
- Không thực hiện full-repo ceremony 22 tầng; chỉ inventory production flow, host surfaces và known blockers.
- Activate v2 pointer trong branch này, không chạm `main`.

### COR-001 — WorkerPacket và global runtime wiring

- Implement WorkerPacket validator/compiler và migration một chiều.
- Nối compiler vào PlanCompiler và ContextCapsule.
- Cắt runtime về 11 canonical owners.
- Chứng minh production callsite thực sự gọi luồng canonical.
- Loại hard-coded PASS và duplicate semantic owners sau parity.
- Giữ nguyên public CLI.

### COR-002 — Context, handoff và skills

- `SKILL.md` là routing source duy nhất.
- Resolve đúng một lần mỗi context generation.
- Explicit invocation thắng deterministic route.
- Installed skill hash được bind lúc dispatch.
- Sync đúng 34 global skills tới native host surface.
- Chạy deterministic positive/negative route matrix cho 34 skills.
- Chạy fresh-worker canary cho ít nhất:
  - `plan-and-handoff`
  - `context-evolution-protocol`
  - `verification-router`
- Fresh worker phải đọc installed copy, không đọc repo source thay thế.
- Compaction/resume giữ raw intent, decision, current packet, route receipt, evidence và next action.

### COR-003 — RunStore, proof và outcome

- Mọi run/evidence/ledger/result write đi qua RunStore.
- Thực hiện process lock/CAS, atomic replace, generation check và crash journal.
- OutcomeReducer là nơi duy nhất sinh claim outcome/result.
- Evidence bind source candidate, environment class, host surface và acceptance.
- Stale/foreign evidence, prose report, missing readback hoặc verifier không chạy không thể tạo PASS.
- `human_residuals` nằm trong canonical result/report; không tạo thêm hệ thống trạng thái.

### COR-004 — HostAdapter và install transaction

Một contract duy nhất:

- behavior: detect, inventory, planInstall, install, reload, readback, offlineCanary, authenticatedCanary, rollback, uninstall.
- capability: activationScope, planLease, activate, observeToolRegistry, invokeCanary, release.
- provenance: installed version, rules/skills/hooks/MCP surface, write/readback/reload mechanism, auth boundary, scope và rollback.

Mọi install/update/uninstall đi qua transaction:

1. Detect exact version.
2. Inventory native state.
3. Resolve owned targets.
4. Validate path/symlink/reparse/ownership.
5. Capture preimage bytes, permissions và hashes.
6. Build mutation plan.
7. `--dry-run` dừng, zero mutation/process spawn.
8. Atomic apply.
9. Native reload/restart nếu tự động hóa an toàn.
10. Host readback.
11. Appropriate canary.
12. Full rollback khi fail.
13. Byte-equal verification.
14. Reinstall nếu final state phải được giữ.

Không aggregate `UNSUPPORTED`, `NOT_FOUND` hoặc file existence thành success.

### COR-005 — CapabilityBroker và MCP

- Core install không sửa MCP.
- `integration enable/disable/doctor` là flow cấu hình duy nhất.
- CapabilityBroker chọn provider; HostAdapter thực hiện activation.
- Không dùng prompt hint thay activation.
- Giữ nguyên ambient user MCP và không tính nó là agent-rules lease.
- Config merge dùng ownership marker/CAS, không overwrite same-name user provider.
- Secret chỉ tham chiếu env/secret store và luôn redact.
- Ghi đúng activation scope: `TURN`, `SESSION`, `PROCESS`, `PROFILE` hoặc `STATIC`.

Agent-controlled MCP proof:

1. Native config/profile readback.
2. `initialize`.
3. `listTools`.
4. Registry observation nếu host cho phép.
5. Direct canary call nếu runtime điều khiển được.
6. Nonce effect.
7. Teardown/release và rollback.

Nếu bước 4–6 chỉ khả dụng qua GUI model session, hoàn tất 1–3 rồi tạo owner residual; không dựng model giả.

### COR-HOST-01…08 — Native adaptation riêng từng host

Mỗi host có packet riêng vì native surface khác nhau. Mỗi packet trả đúng năm trường:

`native_surface`, `install_target`, `host_readback`, `automated_result`, `owner_check`.

- **Codex:** `$CODEX_HOME/AGENTS.md`, native skills, config/hooks/MCP readback, fresh task nếu điều khiển được.
- **Claude:** `CLAUDE_CONFIG_DIR/CLAUDE.md`, native skills/agents/hooks, `claude mcp` readback, new session nếu khả dụng.
- **OpenCode:** derive dialect từ installed version; native agents/skills/plugin/MCP/config debug, không trộn dialect.
- **Cursor:** phân biệt project `.cursor/rules` và global User Rules. Chỉ dùng programmable global surface nếu installed Cursor thực sự hỗ trợ; signed-out model behavior `NEEDS_USER`.
- **Antigravity:** dùng Gemini/Antigravity instruction, skill và MCP surface thực tế; tận dụng login hiện có nhưng không hỏi credential. Thử một bounded nonce model turn; GUI không điều khiển được thì owner residual.
- **Grok:** dùng `grok inspect --json` và native MCP commands/effective inherited config; loại riêng duplicate agent-rules, không xóa user config. Signed-out model behavior `NEEDS_USER`.
- **DeepSeek Harness:** thực hiện closure chi tiết bên dưới.
- **Command Code:** derive canonical home từ installed `cmdc`; dùng native mods/MCP/skills/hooks/session diagnostics; không dùng song song `.commandcode` và `.command-code`.

### DeepSeek Harness bắt buộc sửa đúng native surface

Baseline đã quan sát:

- CLI `dsh` là `0.1.0-rc.7`.
- Active profiles `web` và `headless`.
- `dsh --dump-config` chạy được.
- Cả hai profile hiện có `0` MCP client row và `0` agent-rules reference.
- `$DSH_HOME/mcp.json` tồn tại nhưng không được DSH composition đọc.
- DSH MCP native là Cordis plugin `@deepseek-ai/dsh-mcp-client`.
- Installed dependency thực tế có thể lệch CLI version; hiện package được resolve là `0.1.0-rc.8`.

Thực hiện:

1. Derive effective `$DSH_HOME`, active profile và package resolution từ installed DSH.
2. Không pin MCP client theo CLI string một cách mù quáng; pin exact version tương thích với resolved profile/bundle dependency.
3. Install global rules tại native `$DSH_HOME/AGENTS.md`, vì `dsh-agent-instructions` đọc trực tiếp file này.
4. Install skills vào `$DSH_HOME/skills` hoặc shared `$DSH_AGENTS_HOME/skills`, rồi kiểm tra bằng native skill registry/tool.
5. Với mỗi enabled MCP provider:
   - add exact dependency bằng native profile plugin mechanism;
   - merge một `@deepseek-ai/dsh-mcp-client` Cordis row vào `cordis.patch.yml`;
   - dùng unique `serverName`;
   - không ghi secret trực tiếp;
   - không dùng generic `mcp.json` làm native proof.
6. Web integration dùng native web profile patch.
7. Headless isolated execution dùng dedicated managed profile/process hoặc run-scoped `--patch`.
8. `dsh --profile <name> --dump-config` phải hiển thị:
   - agent instruction configuration;
   - skill provider configuration;
   - MCP rows tương ứng.
9. Tool registry/model canary được thử nếu session có thể điều khiển. Nếu không, owner residual ghi:
   - mở profile nào;
   - tạo session mới;
   - tool name dự kiến `mcp__<server>__<tool>`;
   - canary prompt/effect expected.
10. Rollback chỉ xóa owned Cordis rows/dependency, restore profile bytes và xác nhận dump-config không còn rows.
11. Retire agent-rules-owned generic `mcp.json` sau khi xác nhận nó không phải user-owned truth.

Không được báo DSH adapted nếu chỉ có package/file trên disk mà dump-config không có row.

### COR-006 — Integration, local gates và handoff

Chạy proof theo changed scope trước, sau đó full local gate vì đây là runtime-wide correction:

- Plan/schema admission.
- Build và typecheck.
- Affected unit/contract tests.
- Production-flow integration test.
- Fresh-worker plan handoff.
- Skill resolver once/context generation.
- Two-process RunStore contention.
- Crash/resume.
- MCP-required và non-MCP zero-lease.
- Native adapter temp-home transaction/rollback.
- DSH dump-config native rows.
- Packaged CLI smoke.
- Hard-coded PASS mutation rejection.
- `npm test`.
- `npm run verify:all`.
- Workflow definition/static command-surface validation.

Giữ 14 journey trong matrix nhưng phân loại:

- Agent-executable journey phải chạy.
- GUI/login/subjective journey được thử một lần có giới hạn.
- Không khả dụng thì `NEEDS_USER`, không tạo synthetic replacement.

Chạy một independent review trên integrated production diff, tập trung:

- runtime wiring;
- state/outcome ownership;
- native surfaces;
- user-config preservation;
- DSH Cordis/MCP;
- proof downgrade.

Nếu review phát hiện deterministic lỗi, gom thành một correction batch và chạy lại affected/full local gates. Không mở review loop thứ hai; còn lỗi agent-actionable thì `BLOCKED`, còn owner-only observation thì handoff.

## 4. Acceptance và output mong muốn

### Agent completion bắt buộc

- 22 requirement vẫn trace đầy đủ.
- Mọi `AGENT_ACTIONABLE` blocker đã resolved hoặc có deterministic evidence `BLOCKED`.
- Global runtime và WorkerPacket đi qua production callsite.
- Rules vẫn đúng 5; CLI vẫn đúng 8.
- Skills được cài tại native surfaces và hash parity đạt.
- Core install không đụng MCP.
- Native target của mỗi host được derive từ installed host, không từ giả định chung.
- Host readback đạt tối đa trong khả năng host.
- DSH dùng `$DSH_HOME/AGENTS.md`, native skill provider và Cordis MCP rows; generic `mcp.json` không còn được coi là native.
- User-owned bytes ngoài owned region được giữ nguyên.
- Local tests/gates không còn deterministic failure.
- Branch có local commits, working tree sạch.

### Human residual không chặn agent dừng

Mỗi residual phải ngắn và chứa:

- host/claim;
- agent đã chứng minh đến tầng nào;
- lý do không thể tự quan sát tiếp;
- tối đa 3 bước owner cần thử;
- expected visible result;
- log/evidence path cần gửi lại nếu fail.

Các residual dự kiến hợp lệ:

- Cursor/Grok model behavior khi signed-out.
- Antigravity model turn nếu không thể điều khiển foreground GUI.
- DeepSeek GUI model tool call nếu worker không có quyền điều khiển session.
- UX/cảm giác sử dụng dài hạn.
- Remote Quality/Certification vì plan cấm push.

Không được đẩy deterministic config/readback failure thành residual.

### Báo cáo cuối

Báo cáo outcome-first, không xổ internals:

1. Branch, worktree, baseline và local final HEAD.
2. Những behavior/runtime concept đã được wiring.
3. Native matrix 8 host với năm trường bắt buộc.
4. Skill/MCP trạng thái, đặc biệt DSH Cordis rows.
5. Local gate results và deterministic failures nếu có.
6. Human residuals.
7. Exact changed-path summary.
8. Local commit list.
9. `git status --short`.
10. Dòng cuối: `NO PUSH PERFORMED — WAITING FOR OWNER REVIEW`.

Sau báo cáo, không push, không merge, không chuyển branch, không dọn worktree và không tự mở thêm correction. Giữ nguyên branch/worktree để owner review trực tiếp.

## 5. Assumptions và guardrails

- Worker đang ở worktree/branch riêng dựa trên `5777d43`; nếu không đúng, dừng trước mutation và báo exact state.
- Owner cho phép sửa global user-level host configuration trong phạm vi agent-rules-owned projection; phải snapshot và rollback khi fail.
- Không yêu cầu login hay credential mới.
- Installed package/help/config là nguồn truth ưu tiên; official version-matched docs đứng thứ hai; project code không tự chứng nhận host.
- Không thêm public mode, status set, CLI command hoặc artifact collection mới.
- Không theo đuổi sự hoàn hảo tuyệt đối; vẫn phải xử lý hết mọi lỗi agent có thể tái hiện và sửa trong scope.
- Bug owner phát hiện sau trải nghiệm trở thành focused correction packet trên cùng phase, không reopen full architecture hoặc audit lại toàn dự án.
