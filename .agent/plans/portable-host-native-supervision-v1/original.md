# Kế hoạch oneshot: Portable Host-Native Supervisory Evolution v1

## A. Baseline nguồn chính xác

- Plan ID mới: `portable-host-native-supervision-v1`.
- Baseline: `HEAD == origin/main == d793d2c5d185b5cefef2a5ca77760b321d085e1a`.
- Tree: `b2458ea17879f349d49b9f3e6411ad75dbd2665a`.
- Lịch sử: 7 commit reachable; chỉ có local/remote `main`; worktree sạch.
- CI exact SHA:
  - Quality: `FAILURE`, run `32385984931`.
  - Certification: vẫn `QUEUED`, run `32385985010`.
- Lỗi Quality hiện tại: `.agent/current.json.atomicity.activation_state = DEACTIVATED_TERMINAL` không hợp schema chỉ cho `BOOTSTRAP_POINTER | CANONICALLY_ACTIVATED`.
- Canonical state hiện không đáng tin:
  - Pointer generation 33 và ledger tự nhận `COMPLETED/PASS/21/21`.
  - Closure gắn final SHA cũ `1ecb8fd...`, không phải current `d793d2c...`.
  - Ledger thừa nhận từng có 10 mục PARTIAL nhưng sau đó nâng lên PASS bằng “owner authorization”.
  - Vì CI current SHA đỏ và evidence không khớp, trạng thái đúng phải là invalid/stale terminal, không phải PASS.
- Platform source hiện có 6 host: Codex, Claude, OpenCode, Cursor, Antigravity, Grok. DeepSeek Harness và Command Code chưa tồn tại.
- Binary quan sát được, chưa live-certify:
  - Codex `0.148.0`
  - Claude Code `2.1.237`
  - OpenCode `1.18.18`
  - Cursor, Antigravity, Grok, DeepSeek Harness và Command Code: absent.
  - Trên Windows, Command Code phải dò `cmdc` hoặc `command-code`; tuyệt đối không nhận nhầm `cmd.exe`.
- Context graph cài đặt hiện có 249 node, 160.747 token ước lượng; riêng references 64.384 và integrations 36.384 token. Chưa có chứng minh model-visible subset thực tế đủ nhỏ.
- Pass review này chỉ dùng source inspection, official docs, version probes và CI logs; không chạy test theo yêu cầu.

## B. Executive assessment và reconciliation ba pass

### Kết quả kế thừa

Đã giải quyết và chỉ giữ làm regression invariant:

- Lịch sử đã gom còn 7 commit, chỉ còn `main`.
- Closure transaction đã có atomic staging, fsync/hash và replay cơ bản.
- Five-identity types và validation primitives đã tồn tại.
- `EXPORT_HANDOFF` hiện được truyền rõ ràng.
- Proof Router đã tách `planProofRoute()` và `completeProofRoute()`.
- Artifact Admission, Resource Lanes, enforcement ladder và MCP lifecycle đã có primitive.
- Generic G1–G4 và nhiều adversarial tests đã tồn tại.
- MCP schema đã phân biệt thêm `NOT_APPLICABLE`, lease và schema exposure.

### Còn lại

Phần yếu nhất không phải thiếu primitive mà là production composition:

- Public CLI vẫn có thể báo completed/exit 0 khi trusted outcome không PASS.
- Closure CLI không compose evidence thật đến attestation/deactivation/compaction.
- Proof Router, Decision Fabric, Artifact Admission, LaneController và enforcement decision chưa thực sự điều khiển production path.
- Host registry bị phân mảnh; adapter architecture bị lặp và quá phẳng.
- Static/install/live/update truth chưa gắn per-capability vào exact host/projection/session.
- Context economy và plannerless behavior chưa được đo/đảm bảo.
- DeepSeek Harness và Command Code hoàn toàn chưa được hỗ trợ.

### Kết quả ba review pass

1. **Source truth:** chỉ đưa việc còn executable gap vào plan; không replay toàn bộ P0–P8 cũ.
2. **Host-native fit:** giữ semantic core trung lập, dùng native host primitive trước; prompt prose không được coi là enforcement.
3. **Product/simplification:** không thêm Domain 14, proof framework, policy stack hay adapter framework thứ ba; hợp nhất các lớp hiện có và xóa legacy sau parity.

Maturity tổng thể hiện tại: khoảng **60%**. Trust primitives khá giàu, nhưng composition, host lifecycle, context economy và live/update certification còn yếu.

## C. Confirmed findings

Ký hiệu tác động: `T` terminality, `U` UX/toil, `C` context, `S` security.

| ID | Phân loại / mức | Domain | Vị trí nguồn | Root cause và tác động trên arbitrary consumer repo |
|---|---|---|---|---|
| F01 | NEW, P0 | A/D/M | `.agent/current.json`, ledger convergence plan, current schema | State tự nhận terminal PASS dù final SHA cũ, schema invalid và exact-SHA CI đỏ. Mọi claim release/closure dựa trên state này đều không đáng tin. `T/S` |
| F02 | CONFIRMED, P0 | A/C/D | `packages/cli/src/index.ts:211` | CLI kiểm tra top-level `outcome`, trong khi `northStarRun()` trả aggregate `{processed, remaining, results}`. PARTIAL/FAILED có thể exit 0 và render completed. `T/U` |
| F03 | PARTIAL, P0 | A/D/L | `commands/close.ts`, `closure-service.ts:428` | CLI tự tạo mọi requirement là `pending`; transaction còn cho caller truyền `terminal_outcome`; không có public composition hoàn chỉnh attest → deactivate → compact. Consumer có thể đóng một run chưa đủ bằng chứng. `T/S` |
| F04 | PARTIAL, P1 | D/J/M | `runtime.ts:989-991,1111-1113` | Proof Router tồn tại nhưng runtime/resume vẫn chạy toàn bộ verifier definitions. Adaptive minimum-proof chỉ là API/test, chưa giảm toil production. `U/C` |
| F05 | PARTIAL, P1 | E/F/H | `runtime.ts:917,949,973-975,1073` | Decision Fabric mặc định `shadow`; legacy `routeSkills()` vẫn là authority thực. Skill/context có thể được chọn bằng heuristic cũ thay vì facts. `C/S` |
| F06 | PARTIAL, P1 | G/J/L | `runner/headless-executor.ts` MCP teardown | `idle_zero_attested` đồng nhất với cleanup confirmation và receipt-write error bị nuốt. Mất receipt có thể bị hiểu như teardown thành công. `T/S` |
| F07 | PARTIAL, P1 | D/G/I/J/L | `artifact-admission.ts`, `resource-governor.ts`, `host-capabilities.ts` | Artifact Admission, LaneController và `decideEnforcement()` gần như không có production callers. Runtime vẫn ghi/chạy trực tiếp, khiến enforcement và resource policy chỉ mang tính mô tả. `U/C/S` |
| F08 | PARTIAL, P1 | D/H | `portable-plan.ts:39,286` | `compileDoD()` vẫn suy từ disposition/risk/path chứa `release|install`; PLAN_ONLY có thể thiếu depth, EXPORT luôn bị đẩy quá sâu. DoD phải bắt nguồn từ requirement/claim obligations. `T/U` |
| F09 | CONFIRMED, P0 | I/M | `platform-contracts.json`, CLI/kernel host arrays, automation | Host được hard-code nhiều nơi; certification chỉ có 5 host, runtime có 6; còn stale retired-platform references. Thêm host buộc sửa unrelated logic và dễ lệch source/install/CI. `T/U/S` |
| F10 | CONFIRMED, P1 | I/F | `platforms/*/adapter.ts`, `packages/cli/src/runtime/contracts.ts` | Có hai adapter contracts độc lập cộng thêm capability matrix. Sibling adapters bị ép về `detect/render/stage/...` và nhiều host chỉ ghi rules/capsule. `U/S` |
| F11 | PARTIAL, P0 | I/K/M | `host-capabilities.ts`, `host-adapters.ts` | Capability facts quá coarse/boolean, thiếu exact projection/config/session binding và selective staleness. Host update có thể làm enforcement biến mất nhưng receipt cũ vẫn còn giá trị. `T/S` |
| F12 | CONFIRMED, P0 | H/J/M | context graph/routing/compiler | Installed graph 160.747 token nhưng không có model-visible budget receipt; tool/MCP/subagent/skill exposure chưa được đo end-to-end. Weak worker dễ bị nhiễu và tốn context. `U/C` |
| F13 | CONFIRMED, P1 | C/H/J | `compiler.ts`, `northstar-ux.ts` | Non-trivial S1 thiếu explicit draft hoặc verifier thường bị bắt dùng strong planner. Chưa phân biệt EXPLICIT, DISCOVERABLE và semantic ambiguity. `U/C` |
| F14 | NEW, P0 | I/K | `platforms/` và registry | DeepSeek Harness và Command Code chưa có adapter, projection, lifecycle, certification hoặc fixtures. `S/C` |
| F15 | PARTIAL, P0 | M/I | `.github/workflows/certification.yml` | Self-hosted matrix có thể nằm queued ngoài job timeout; static/live truth không hội tụ hữu hạn trên exact SHA. `T/U` |
| F16 | PARTIAL, P1 | I/M | existing G1–G4 fixtures | Generic fixtures tồn tại nhưng chưa bao phủ registry-driven 8-host package/install/update path và host fingerprint evolution. `T/S` |

Mỗi fix load-bearing phải giữ causal chain:

`canonical harness semantics → capability requirement → native mapping/enforcement → package/install/migration → arbitrary consumer behavior → fresh/upgraded observation → bound proof`.

Named projects, kể cả `agent-rules` và `5fedu`, chỉ được dùng làm optional regression fixture.

## D. Xếp hạng chất lượng integration host

Rubric: native semantic mapping 20; hard enforcement 20; model-visible context 15; lifecycle 15; session/evidence/terminal 15; live/update resilience 15.

Điểm hiện tại là static assessment, không phải điểm chất lượng model.

| Host | Hiện tại | Target | Trạng thái hiện tại | Lý do chính |
|---|---:|---:|---|---|
| Claude Code | 66 | ≥90 | PARTIAL_NATIVE, installed-unverified | Native dispatch/session/worktree khá tốt; lifecycle tương đối đầy đủ; còn thiếu unified ABI, native capability coverage, context economy và current live cert. |
| OpenCode | 64 | ≥92 | PARTIAL_NATIVE, installed-unverified | Session/V2 transport mạnh; cần chuyển dứt điểm sang ordered V2 permissions, lazy skills và per-capability certification. |
| Antigravity | 43 | ≥89 | PARTIAL_NATIVE, not-live-verified | LeaseGuard hữu ích nhưng adapter chưa tận dụng plugin, scoped permissions, sandbox và worktrees hiện đại. |
| Codex | 39 | ≥88 | PARTIAL_NATIVE, installed-unverified | Có rules/agents/skill gate assets nhưng adapter vẫn chủ yếu dò home và ghi capsule; thiếu lifecycle/session/native enforcement composition. |
| Cursor | 25 | ≥86 | STATIC_KNOWN | Adapter rất mỏng so với plugin, skills, subagents và hooks hiện tại; chưa phân biệt IDE/CLI/cloud surfaces. |
| Grok Build | 22 | ≥82 | STATIC_KNOWN | Adapter generic trong khi upstream đã có headless, ACP, sessions, sandbox, rules/skills và subagents. |
| DeepSeek Harness | 0 | ≥84 | UNSUPPORTED | Chưa có projection. Target bị giới hạn bởi developer-preview/update risk. |
| Command Code | 0 | ≥86 | UNSUPPORTED | Chưa có projection. Target phải xử lý rõ experimental Mod API và fail-open hook errors. |

Target state tối thiểu là `STATIC_CONFORMED`; chỉ nâng `LIVE_CERTIFIED` khi có behavior evidence của exact binary/projection/session.

Host fit dựa trên official current surfaces:

- DeepSeek Harness hỗ trợ out-of-tree Cordis plugins, bundles và profiles; không cần patch core. [Official architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md), [profile/bundle boot](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/README.md).
- Command Code có session-scoped mods, native permissions, progressive Skills, agents, hooks và structured headless events; nhưng failing mod tool hooks bị skip, nên mod không được là hard boundary duy nhất. [Mods](https://commandcode.ai/docs/mods), [Hooks](https://commandcode.ai/docs/hooks), [CLI/headless](https://commandcode.ai/docs/reference/cli).
- OpenCode V2 dùng ordered `permissions`, `shell`, `subagent` và metadata-then-lazy skill bodies. [V2 permissions](https://opencode.ai/v2/docs/permissions), [V2 skills](https://opencode.ai/v2/docs/skills).
- Cursor hiện có plugins, scoped rules/skills/subagents và surface-specific hooks; cloud không tương đương local ở mọi lifecycle. [Plugins](https://prod.cursor.com/docs/plugins), [hooks matrix](https://prod.cursor.com/docs/hooks).
- Claude Code hỗ trợ isolated subagent context/worktrees, native permissions, hooks và skill scoping. [Subagents](https://code.claude.com/docs/en/sub-agents), [worktrees](https://code.claude.com/docs/en/worktrees).
- Codex có instruction hierarchy, native skills/subagents/sandbox/MCP surfaces; home existence không chứng minh live behavior. [AGENTS hierarchy](https://developers.openai.com/codex/guides/agents-md).
- Antigravity 2.0 có project-scoped permissions/settings và worktrees; CLI có plugin bundles và native sandbox. [Projects](https://www.antigravity.google/docs/projects), [CLI features](https://www.antigravity.google/docs/cli/features).
- Grok Build upstream có headless/ACP/session/sandbox/skills/subagents; chỉ dùng capability nào được official source/runtime xác nhận. [Official repository](https://github.com/xai-org/grok-build), [agent mode](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md).

## E. Target architecture và public contracts

### 1. Một canonical host registry

- Nâng `platforms/platform-contracts.json` thành registry v2 duy nhất.
- Registry keys là canonical HostId: `codex`, `claude`, `opencode`, `cursor`, `antigravity`, `grok`, `deepseek-harness`, `command-code`.
- Runtime dùng validated/branded `HostId`; automation, schemas, doctor, installer, docs, fixtures và CI derive từ registry.
- Xóa các host arrays độc lập như `RUNTIME_PLATFORMS`, `VALID_HOSTS`, `CERTIFICATION_REQUIRED_HOSTS`; nếu cần compile-time projection thì automation sinh artifact từ registry, không hand-edit.
- Registry chứa lifecycle adapter entrypoint, supported surfaces, certification policy và capability-to-canary dependencies; không chứa secret hay live observations.

### 2. Typed Host Capability ABI

Evolve `host-capabilities.ts`, không tạo framework mới:

```ts
type CertificationState =
  | "UNSUPPORTED"
  | "STATIC_KNOWN"
  | "STATIC_CONFORMED"
  | "INSTALLED_UNVERIFIED"
  | "LIVE_CERTIFIED"
  | "STALE_REQUIRES_RECERTIFICATION"
  | "NOT_LIVE_VERIFIED";

interface HostCapabilityFacts {
  host: HostIdentity;
  adapter: AdapterIdentity;
  projection: ProjectionIdentity;

  instruction_surface: InstructionSurface;
  context_injection: ContextSurface;
  skill_surface: SkillSurface;
  hook_surface: HookSurface;
  permission_surface: PermissionSurface;
  sandbox_surface: SandboxSurface;
  subagent_surface: SubagentSurface;
  session_surface: SessionSurface;
  worktree_surface: WorktreeSurface;
  mcp_surface: McpSurface;
  headless_surface: HeadlessSurface;
  compaction_surface: CompactionSurface;
  structured_event_surface: EventSurface;
  planning_surface: PlanningSurface;
  model_observability: ModelObservability;

  capability_fingerprint: string;
  static_contract_revision: string;
  observed_runtime_revision?: string;
  certifications: CapabilityCertification[];
}
```

- Values là semantic enums, ví dụ skill `NONE | EAGER | METADATA_THEN_LAZY_BODY | PATH_SCOPED_LAZY`; permission `PROMPT_ONLY | NATIVE_ALLOW_ASK_DENY | NATIVE_PRE_EFFECT_DENY | BROKER_ONLY`; subagent `NONE | SHARED_CONTEXT | ISOLATED_CONTEXT | ISOLATED_WORKTREE`.
- Mỗi capability certification gắn năm identity A–E, evidence refs, certified time, expiry, host/projection/config fingerprint.
- Thay đổi host version, adapter revision, projection hash hoặc relevant config fingerprint chỉ stale các capability phụ thuộc.
- TTL mặc định:
  - hard permission/sandbox/headless mutation: 30 ngày;
  - context/session/lifecycle capabilities: 90 ngày;
  - developer-preview DSH và experimental Command Mod surfaces: 14 ngày.
- Mọi fingerprint change gây re-probe ngay, không đợi TTL.

### 3. Một adapter contract duy nhất, tách lifecycle khỏi semantics

Evolve adapter hiện có thành:

```ts
interface HostAdapter {
  discover(): HostObservation;
  inspectProjection(): ProjectionObservation;
  planLifecycle(action: Install | Upgrade | Remove | Rollback): LifecyclePlan;
  applyLifecycle(plan: LifecyclePlan): LifecycleReceipt;
  observeCapabilities(): HostCapabilityFacts;
  mapRequirement(requirement: SemanticCapabilityRequirement): EnforcementPlan;
  runCanary(capability: CapabilityId): CapabilityCertificationReceipt;
}
```

- CLI runtime và `platforms/*/adapter.ts` dùng cùng contract.
- Enforcement order bắt buộc:
  `native hard permission/guard/sandbox → Agent Rules broker → isolated worktree transaction + diff validation → BLOCKED/UNSUPPORTED`.
- `UNKNOWN` không bao giờ thành allow.
- `decideEnforcement()` được gọi trước effect execution và activation, không chỉ trong tests.

### 4. Trusted runtime composition

- Mọi CLI/run/queue/close/release renderer chỉ đọc một `TrustedTerminalDecision`.
- `northStarRun()` trả aggregate có `trusted_outcome`; CLI không tự suy outcome từ shape.
- Exit 0 và từ `DONE/completed` chỉ từ trusted PASS.
- `stageClosureTransaction()` luôn derive outcome; caller không được override.
- `close` phải load real ledger, proof receipts, reconciliation và identities; pending evidence chỉ tạo PARTIAL.
- Attestation kiểm exact candidate SHA/manifest/evidence; chỉ PASS mới deactivate; compaction diễn ra sau durable attestation.
- `compileDoD()` nhận requirements, claims, proof obligations, release/migration/live scope; disposition chỉ quyết định nơi execution xảy ra.
- Proof Router chọn trước execution; runtime chỉ chạy selected verifier và lưu omitted reasons.
- Decision Fabric trở thành production authority; legacy routing bị xóa sau shadow-parity.
- Artifact Admission, Resource Lanes, MCP fail-closed receipt và host enforcement được wire tại actual write/run boundaries.

### 5. Context economy

Thêm `ContextBudgetReceipt` cho mỗi run:

- installed graph size;
- actual selected/model-visible rule, skill metadata/body, tool schema, MCP schema, subagent advertisement;
- tool result, repair, repeated và total input tokens;
- measurement source `HOST_OBSERVED | EXACT_SERIALIZED | ESTIMATED`.

Pipeline model-facing:

`stable minimal bootstrap → objective → relevant RepoFacts/TaskFacts → capability/skill metadata → selected body/reference on demand → selected proof → failure-local repair`.

Không đưa inactive plans, old receipts, cold references, unused MCP/tools/subagents vào normal context.

### 6. Plannerless intake

Thêm `IntakeDecision`:

```ts
type IntakeDeterminacy =
  | "EXPLICIT"
  | "DISCOVERABLE"
  | "SEMANTICALLY_AMBIGUOUS";
```

- `EXPLICIT`: deterministic compiler dùng raw intent + explicit scope/acceptance, không planner.
- `DISCOVERABLE`: dùng existing RepoFacts/project audit, tối đa một failing verifier probe và bounded referenced schema/version discovery; sau đó compile contract.
- `SEMANTICALLY_AMBIGUOUS`: chỉ gọi explicitly configured strong planner. Không có planner thì `NEEDS_USER/PLANNER_REQUIRED`.
- Weak worker không được tự hạ risk, chọn model khác hoặc phát minh product behavior.
- Operator luôn sở hữu model/provider choice.

## F. Implementation phases

### P0 — Reopen canonical truth và bootstrap successor

Domains A/B/D/H/L/M; Terminality Gap và Root-Cause Gap.

- Freeze raw prompt nguyên văn, requirements/claims/causal map của plan mới.
- Sửa generic closure correction trước, rồi reclassify plan cũ thành `SUPERSEDED/INACTIVE/PARTIAL`; không hard-code plan ID.
- Mở pointer generation 34 ở `BOOTSTRAP_UNCERTIFIED`, trạng thái active hợp schema.
- Sửa CLI aggregate outcome, closure evidence composition, caller override và public attest/deactivate path.
- Bắt đầu dogfood candidate harness ngay sau bootstrap: P1–P8 chạy qua candidate build/projection, không chờ cuối mới reinstall.
- Mọi phase trước final chỉ PARTIAL; không tự author PASS.

**Vì sao cần:** nếu terminal/state authority sai thì mọi host score, eval và release phía sau đều có thể xanh giả.

### P1 — Canonical registry, ABI, enforcement và remaining production wiring

Domains D/E/F/G/H/I/J/K/L; PF1/PF3/PF5.

- Registry v2 và typed Host Capability ABI.
- Hợp nhất hai adapter contracts; thêm compatibility shim có expiry.
- Per-capability fingerprint, staleness, TTL và selective canaries.
- Wire Proof Router, Decision Fabric, Artifact Admission, LaneController, MCP idle-zero và enforcement ladder vào runtime/resume/install.
- Sửa `compileDoD()` theo claims/obligations.
- Xóa stale retired-platform references và hard-coded host lists.
- Candidate dogfood receipt mỗi phase phải bind source tree, installed projection, consumer/candidate, host/session.

**Vì sao cần:** đây là đường chung nhỏ nhất để tám host không phải tự phát minh terminal/proof/policy semantics.

### P2 — DeepSeek Harness native integration

Domains F/G/I/K/L; PF3/PF5.

- Thêm `platforms/deepseek-harness/` và package/bundle `@initforge/agent-rules-dsh`.
- Cài bằng documented `dsh plugin --profile <name> add <exact package>`; không patch DSH source.
- Default tạo Agent Rules-managed web/headless profiles; optional existing-profile mode dùng DSH plugin command và CAS manifest receipt, không hand-edit user manifest.
- Native mapping:
  - bounded context qua `agent.inject`/system prompt seam;
  - hard tool policy qua monotonic `ctx.tools.guard()` và documented pre-execute waterfall;
  - event/evidence qua tool/session events;
  - native approval, sandbox, subagents, scoped tools, MCP và headless profile.
- Mỗi supervised launch verify bundle hash và `dsh --dump-config` fingerprint; missing/disabled guard phải BLOCKED.
- Consumer repo không có quyền sửa managed bundle/profile authority.
- Fresh/custom/stale/update/remove/rollback/headless/web lifecycle.
- DSH “turn completed” chỉ là host observation, không terminal PASS.

**Vì sao cần:** Cordis bundle/profile là reversible native seam; rules-file staging sẽ bỏ qua chính kiến trúc và security model của DSH.

### P3 — Command Code native integration

Domains E/F/G/I/K; PF3/PF5.

- Thêm `platforms/command-code/` và session-scoped package `@initforge/agent-rules-command-code`.
- Detect `cmd`, `cmdc`, `command-code` theo OS và verify package/version provenance; không nhận Windows `cmd.exe`.
- Launch supervised sessions với exact `--mod` path; không auto-enable mod/MCP toàn cục.
- Dùng:
  - native permission rules/modes làm hard boundary chính;
  - `beforeToolCall` mod và `PreToolUse` hooks cho supplementary interception;
  - structured events/PostToolUse cho evidence;
  - `appendSystemPrompt/transformContext` cho bounded context;
  - `--no-skills` + selected `--skill` paths cho progressive disclosure;
  - built-in isolated agents trước; namespaced custom agents chỉ materialize khi task chọn và teardown sau session.
- Vì Command Mod/hook errors có thể bị skip/fail-open:
  - capability fingerprint phải chứng minh native permission layer;
  - mod/hook error tạo terminal BLOCKED;
  - broker/worktree validation vẫn bắt buộc cho invariant không biểu diễn được native;
  - mutable unattended headless là `NOT_LIVE_VERIFIED/UNSUPPORTED` nếu chưa chứng minh hard denial.
- Không dùng `--yolo` trong certification.
- Taste không bị xóa, disable hay overwrite; controlled Taste state chỉ dùng trong RAW-vs-HARNESS eval.
- Plan mode được certify riêng vì write-time hooks không chạy ở đó.

**Vì sao cần:** native mod/skills/events giảm context và tăng observability, nhưng hard security không thể dựa vào một hook có failure semantics fail-open.

### P4 — Native convergence sáu host hiện có

Domains E/F/G/I/K; PF3.

- Claude: giữ native dispatch/session/worktree; bổ sung native permissions/hooks/Skills/MCP mapping, lazy context và exact lifecycle receipts.
- OpenCode: versioned V1 compatibility chỉ khi runtime thật sự là V1; V2 dùng ordered `permissions`, `shell`, `subagent`, lazy skill bodies, external-directory và MCP/custom-tool permissions.
- Cursor: chuyển sang native plugin/projection; facts/certification tách IDE, CLI và cloud; không coi local user hook tương đương cloud project hook.
- Antigravity: native plugin, project permissions, sandbox, worktrees, subagents, skills/hooks/MCP; LeaseGuard giữ làm fallback/diff validator sau native denial.
- Codex: minimal AGENTS bootstrap, native skills/subagents/sandbox/MCP/config; cross-platform binary detection; home existence chỉ là install hint.
- Grok: dùng official rules/skills/agent profiles, permissions/sandbox/headless/ACP/session/worktree surfaces được xác nhận; capability chưa xác nhận giữ UNKNOWN/UNSUPPORTED.
- Mỗi host hoàn thành fresh/install/update/remove/rollback và capability-specific canaries trước khi xóa legacy adapter behavior.

**Vì sao cần:** không thể claim harness-wide bằng hai adapter mạnh và bốn adapter chỉ ghi context file.

### P5 — Model-visible context/token convergence

Domains E/F/H/J/L/M; PF4.

- Stable bootstrap chỉ chứa hard invariants và route map.
- Decision Fabric chọn tối đa context cần thiết; full skill/reference chỉ load khi activated.
- Tool/MCP/subagent schemas chỉ advertise khi capability plan chọn hoặc lease active.
- Bounded tool output có digest + narrow-range retrieval.
- Repair chỉ nhận failure, affected claims, related source/proof.
- Giữ stable prefixes cho cache.
- Emit `ContextBudgetReceipt` ở actual host edge và aggregate per trusted PASS.
- So sánh paired baseline trên arbitrary S0/S1 fixtures.

**Acceptance:** model-visible context giảm ít nhất 20%; duplicate reads/tool calls giảm ít nhất 30%; trusted success không giảm; warm p50 không tăng quá 5%.

### P6 — Plannerless/weak-worker và permission-toil convergence

Domains C/H/J/M; PF4.

- Implement `IntakeDecision` và ba đường EXPLICIT/DISCOVERABLE/SEMANTICALLY_AMBIGUOUS.
- Strong planner chỉ compile/freeze contract rồi exit.
- Weak worker chạy explicit/discoverable tasks bằng small task packet.
- Compile narrow native permissions từ owned scope/capabilities; không persist grant rộng hơn contract.
- Deduplicate repeated equivalent approvals trong cùng bounded task, không globally grant.
- Thu metrics: prompts/task, repeated prompts, wait time, intervention, repair count, rediscovery, time-to-terminal.
- Human correction generalizable phải trở thành invariant/test/skill/canary; không-generalizable exception phải có explicit reason.

**Acceptance:** cases A/B/C có thể PASS bằng evidence; case D phải NEEDS_USER/PLANNER_REQUIRED; zero invented requirements và zero model override.

### P7 — Registry-driven generic eight-host/evolution matrix

Domains A–M; PF1–PF6.

- G1 fresh unrelated repo.
- G2 existing project instructions + malicious hard-policy waiver.
- G3 stale Agent Rules projection + stale closure + simulated host update.
- G4 mọi registry host với static/live states tách biệt.
- Host-update canary làm stale chỉ affected capabilities, chạy selective probes, rồi recertify/fallback/downgrade.
- Package/install path phải được dùng; kernel-only invocation không đủ E2E.
- Named projects chỉ chạy sau generic matrix như optional regression fixtures.

### P8 — Simplification, state/docs/generated/CI/Git convergence

Domains A/D/I/L/M; PF5/PF6.

- Xóa compatibility shims sau behavioral parity.
- Regenerate projections/docs/manifests qua automation; không hand-edit `generated/`.
- Reconcile source, registry, schema, package, installer, doctor, docs, fixtures và certification host set.
- Final candidate install dùng exact package artifact; rerun generic consumers và available live host canaries.
- Chỉ exact final SHA có quyền tạo final terminal attestation.

## G. Test và eval plan

### Unit/contract

- Registry schema, exact adapter coverage và không hard-coded host drift.
- Semantic capability enum validation và UNKNOWN never allow.
- Fingerprint stability, relevant selective invalidation, TTL expiry.
- CLI aggregate non-PASS never exit 0/DONE.
- Closure cannot accept pending/empty/mismatched evidence or caller-forced PASS.
- `compileDoD()` independent from disposition.
- Proof Router executes only selected proofs and records omitted reasons.
- Context receipt token accounting và stale-context exclusion.
- Intake classifier and planner authority boundaries.

### Composition/install

- Source → package → isolated Agent Rules home → host projection → consumer repo → new session → behavior → evidence.
- Fresh, upgrade, host update, Agent Rules update, rollback, remove và interrupted transaction recovery.
- Preserve AGENTS/CLAUDE/project rules, Skills, agents, MCP, Taste, hooks và unknown config.
- Remove only exact manifest-owned records; modified owned records become NEEDS_USER.
- No managed global MCP; G1 remains source-clean.

### Adversarial

General:

- Host exits 0 while trusted task PARTIAL.
- Static capability but missing live primitive.
- Stale host/projection/candidate/cross-consumer receipt replay.
- Unknown capability, malicious project waiver và stale session.
- Unused skill/tool/MCP/subagent context leak.
- Capability fingerprint changes without version change.

DeepSeek Harness:

- Host turn completes with unresolved requirement.
- Consumer attempts to unload/replace trust bundle.
- Profile layer changes after certification.
- Plugin API incompatibility.
- Headless success without terminal evidence.

Command Code:

- Mod or shell hook crash, timeout, malformed output.
- Forbidden write/destructive command/secret read.
- Plan mode missing write hook.
- Taste conflicts with hard proof.
- Stale resumed session.
- Headless high-trust mutation attempt.

Existing hosts:

- Cursor local/cloud hook equivalence mistake, scope confusion, path skill leakage.
- OpenCode V1/V2 permission mismatch, denied skill advertisement, stale subagent capability.
- Antigravity unsandboxed override, broader child authority, worktree escape.
- Codex home-only false detection and sandbox downgrade.
- Claude child permission/session/worktree escape.
- Grok always-approve/sandbox/ACP capability drift.

### Plannerless/context/toil matrix

- A strong planner + cheap worker.
- B cheap worker + explicit task.
- C cheap worker + discoverable task.
- D cheap worker + semantic ambiguity.
- RAW HOST vs HARNESS paired runs with controlled state.
- Metrics: false-DONE, intervention, context, duplicate reads, tool calls, approvals, repairs, latency, input tokens per trusted PASS.

## H. Simplification/removal

Chỉ xóa sau parity:

- Per-host duplicated `PlatformAdapter` interface.
- CLI-specific second `HostAdapter` contract.
- Generic `render/stage activation-capsule` path trên host đã có native projection.
- Independent host arrays và five-host certification constants.
- Stale retired-platform branches/assertions ngoài explicit negative tombstone tests.
- Decision Fabric shadow default và legacy `routeSkills()` authority.
- Caller-supplied closure terminal outcome.
- Hard-coded old-plan correction logic.
- Dead wrappers quanh Artifact Admission, LaneController và enforcement sau khi production runtime gọi trực tiếp.
- Eager platform/skill/reference context injection.
- Old terminal plans/evidence khỏi ordinary model-visible context; vẫn giữ archive/audit identity.

Không xóa proven legacy behavior nếu replacement chưa có behavioral/eval parity.

## I. Installation và migration

- Mỗi projection có immutable manifest: Agent Rules release/tree/package, adapter revision, host/version, projection files/records, hashes và prior-state backup.
- Apply theo `inventory → plan → stage → fsync/hash → activate atomically → probe → receipt`.
- Update dùng CAS trên observed host/projection state; input drift dừng NEEDS_USER.
- Rollback khôi phục exact prior owned state.
- Remove chỉ xóa record có matching ownership/hash; unknown hoặc user-modified state được giữ.
- DSH dùng official profile/plugin lifecycle; bundle/config fingerprint được verify trước session.
- Command Code dùng session-scoped `--mod`/`--skill`; không permanently load khi harness inactive.
- Project-owned instructions không bao giờ bị thay thế bằng harness manual; nếu cần pointer thì dùng namespaced managed block/record với collision handling.
- Secret-like files, credentials, hook environment và MCP outputs không đi vào projection/context/evidence ngoài redacted hashes.

## J. CI và certification

- Required hosted jobs:
  - Quality/build/schema/package/static adapter matrix.
  - Generic G1–G4 and update-drift fixtures.
  - Exact registry/source/generated/install parity.
- Không tạo unconditional self-hosted matrix có thể queue vô hạn.
- Live agents/runners chủ động publish signed exact-SHA attestations; hosted aggregator chỉ chờ trong bounded window.
- Host unavailable tạo `NOT_LIVE_VERIFIED`, không fake green và không làm static source build đỏ.
- Installed host chạy canary nhưng primitive thất bại là real certification failure.
- `LIVE_CERTIFIED` chỉ từ actual behavior evidence; docs, binary detection, config presence và adapter tests không đủ.
- Current environment kỳ vọng thử live cho Codex/Claude/OpenCode nếu auth/session cho phép; năm host absent giữ `NOT_LIVE_VERIFIED`.
- Release metadata chỉ quảng bá mức support đúng với latest non-stale receipts.

## K. Git/main strategy

- Làm trực tiếp trên `main`; không PR, không pushed temp branch.
- Giữ nguyên 7 commit hiện có; không root-history rewrite.
- Có thể dùng local fixups trong lúc triển khai, nhưng trước push squash thành tối đa hai coherent commits:
  1. `feat(hosts): restore trusted composition and add capability ABI with native host projections`
  2. `perf(harness): converge context, plannerless evals, lifecycle and final state`
- Final reachable count ≤9 nếu không phát hiện unique remote work mới.
- Chỉ push sau local/package/generic verification.
- Nếu cần amend commit đã push để giữ ≤9: ghi exact remote lease trước và chỉ dùng `--force-with-lease=<ref>:<sha>`; remote drift thì dừng, không overwrite.
- Final: local `main == origin/main`, không non-main branch, tags giữ nguyên, CI quan sát đúng exact final SHA.

## L. Terminal acceptance

Implementation chỉ được trusted PASS khi đồng thời:

- Canonical old false terminal được sửa và new pointer/ledger/schema hợp lệ.
- Mọi public success path dùng một TrustedTerminalDecision; zero false-DONE/reopen-after-DONE.
- Proof Router, Decision Fabric, Artifact Admission, Resource Lanes, MCP idle-zero và enforcement thực sự nằm trên production path.
- DoD xuất phát từ requirements/claims, không từ execution disposition.
- Registry là nguồn host duy nhất và đủ tám host.
- DeepSeek Harness có native Cordis bundle/profile integration, lifecycle và canaries.
- Command Code có native mod/skills/permissions/events integration, Taste preserved và hard-hook failure không mở authority.
- Sáu host cũ được re-audit/re-map; unsupported surfaces được khai báo trung thực.
- Host/projection/config drift stale đúng affected certifications và không silent-widen authority.
- G1–G4, host-update, plannerless, context, toil và adversarial corpora đạt acceptance.
- S0/S1 context giảm ≥20%, duplicate reads/tool calls giảm ≥30%, p50 không regress >5%, trusted-success không giảm.
- Permission prompts không tăng; repeated equivalent prompts trên prompt-heavy corpus giảm ≥30%; không global grant.
- Missing binaries được ghi `NOT_LIVE_VERIFIED`; detected broken primitive không bị che.
- Source, schema, generated outputs, package, install manifests, docs và certification state parity.
- Final exact SHA CI green theo static/live policy trung thực.
- Final closure/attestation bind đủ năm identity và chỉ deactive/compact sau trusted PASS.

Mặc định đã khóa: arbitrary consumer repositories là canonical acceptance target; `agent-rules` chỉ là source + dogfood; không Domain 14, không named-project hard-code, không model/provider override, không global MCP và không hand-edit generated artifacts.