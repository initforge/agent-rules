# Agent Rules Terminal Harness vNext — Final frozen one-copy implementation plan

## 1. Frozen scope invariant

Toàn bộ behavior trong 13 domain là behavior của **Agent Rules supervisory harness**, chạy bên ngoài và bọc quanh các supported coding hosts để điều khiển công việc trên **arbitrary consumer repositories**.

Bốn identity không được lẫn:

1. **Harness source identity:** source/build/release của repository `agent-rules`.
2. **Harness installation identity:** package/projection/config thực sự được cài vào host.
3. **Consumer repository identity:** repository tùy ý mà worker đang xử lý.
4. **Host runtime identity:** host, version, capabilities và session thực sự chạy task.

`agent-rules` chỉ có hai vai trò:

- canonical implementation source của harness;
- dogfood environment để chứng minh harness có thể tự quản lý việc phát triển chính nó.

Dogfood trong `agent-rules` là cần nhưng **không đủ** để chứng minh harness-wide behavior.

### Mandatory proof chain

Mọi behavior harness-wide phải được chứng minh qua đủ đường:

```text
canonical harness semantics
    → host-neutral contract
    → host-native mapping/enforcement
    → packaged build
    → install/upgrade/migration
    → arbitrary consumer repository
    → fresh/upgraded host session
    → observed behavior + evidence
```

Một source test hoặc dogfood run trong `agent-rules` chỉ chứng minh phần tương ứng của chain.

Không được:

- hard-code named consumer repo, đường dẫn, instruction, framework hoặc symptom;
- sửa file trong consumer fixture rồi claim global harness fix;
- dùng một named real project làm canonical acceptance target;
- coi generated projection hoặc installed copy là source of truth;
- claim cross-host/cross-repository success từ một dogfood run duy nhất.

Named real projects chỉ được dùng làm **optional regression fixtures** sau khi generic acceptance đã PASS. `5fedu` là một explicit optional domain pack do harness cung cấp, không phải consumer-repository architecture target.

---

## 2. Reconciliation pass trên plan trước

| Domain | Scope gap được tìm | Revision bắt buộc |
|---|---|---|
| A — Skills | Evals chưa nói rõ facts phải đến từ arbitrary consumer repo | Router/evals nhận generic RepoFacts/TaskFacts; không dùng shape của `agent-rules` làm routing oracle |
| B — Rules/policies/profiles | Chưa đủ rõ project-owned instructions là external consumer truth | Thêm precedence/enforcement tests với existing repo có project-owned instructions |
| C — MCP | Live proof có thể bị hiểu là chạy trong dogfood repo | Idle-zero/lease/teardown phải chạy trong fresh và upgraded generic consumer repos |
| D — Context/handoff | Cheap-worker test chưa bind consumer identity | Frozen contract và evidence phải bind target repository riêng với harness release |
| E — Hosts | Matrix đúng host nhưng chưa bắt full install-to-consumer proof | Mỗi adapter phải qua build → install/upgrade → generic repo → fresh session |
| F — Verification | Evidence binding mới nhấn mạnh source SHA | Receipt phải bind harness release, consumer candidate, host runtime và projection identity |
| G — Root cause | Anti-band-aid có thể vẫn chỉ scan source repo | Causal map bắt buộc đi tới installer/projection/arbitrary consumer behavior |
| H — Autonomy | Terminality chủ yếu mô tả dogfood implementation run | Worker phải hoàn tất lifecycle trong generic consumer task, không chỉ khi sửa harness |
| I — Speed | Benchmark corpus chưa khóa là generic | Speed/ablation dùng generic task corpus; dogfood metrics chỉ là một sample |
| J — Artifacts | State paths có thể bị tối ưu riêng cho repo này | Admission/compaction phải hoạt động per arbitrary worktree/repo, kể cả repo chưa có `.agent` |
| K — Security | Consumer repo chưa được nhấn mạnh là untrusted boundary | Project prose/instructions/config là untrusted input; enforcement nằm ngoài model compliance |
| L — Evals | Generic fixture set chưa được liệt kê thành release gate | Bổ sung bốn mandatory fixture classes ở §11 |
| M — Retirement | Migration chủ yếu nói installed local state | Upgrade/removal proof phải chạy trên generic repo/host có stale harness-owned projections |

### Problem-family reconciliation

| Requirement | Harness-wide interpretation |
|---|---|
| MCP idle-zero | Đúng trên arbitrary repo dù repo có hay không có Agent Rules metadata |
| Deterministic output/5fedu | Unrelated repo không bị wrapper leak; 5fedu chỉ xuất hiện khi repo bất kỳ explicit activate domain pack |
| Cross-host enforcement | Cùng core semantic được adapter map đúng theo capability host |
| Real workflow/dogfood | Dogfood sớm trong source repo, sau đó prove one-copy workflow trên unrelated repos |
| Plan/artifact/lifecycle | Per-consumer worktree state; không phụ thuộc layout đặc thù của `agent-rules` |
| Actual release completion | Package được install/upgrade rồi dùng thật trên consumer fixtures |
| META-A terminality | Generic task không được dừng ở code complete |
| META-B root cause | Fix phải nằm trong canonical harness/adapter/installer, không nằm trong named project symptom |

Không domain hoặc requirement nào bị bỏ. Không architecture/domain mới được thêm; revision chỉ siết identity binding, migration chain và generic acceptance.

---

## 3. Current source truth

| Mục | Sự thật hiện tại |
|---|---|
| Git | `main`, HEAD/local main/origin main cùng `e8481aa477aa1de25cb6c16d534e1d7cbf5db2ed` tại audit snapshot |
| Worktree | Snapshot cuối sạch; từng thấy transient uncommitted `close.ts` change. Worker phải preflight lại |
| Active authority | `.agent/current.json` generation 31 vẫn trỏ `northstar-on-demand-portable-harness`, contract `EFFECTIVE`, execution `IN_PROGRESS` |
| Ledger | Cùng plan lại là `RETIRED/CLOSED`; pointer hash không khớp ledger |
| Requirements | 31 requirement, 24 `PENDING`, 0 requirement evidence ref, 0 reconciliation |
| Closure | Receipt tuyên bố PASS và pointer retired nhưng actual pointer không rời hot retrieval |
| Evidence | Chấp nhận `verified:true`; Windows CI được ghi PRE-EXISTING mà không comparative proof |
| Runtime | Nhiều vNext primitives đã implement/test nhưng chưa wired production |
| Skills | 36 skill; TS router vẫn phrase-driven; nhiều route fields không có consumer |
| MCP | Task config/process cleanup đã có; live idle-zero attestation chưa đủ |
| Hosts | Codex/OpenCode có binary; OpenCode `1.18.18`; Antigravity desktop chạy nhưng CLI không trên PATH; Claude/Cursor/Grok absent |
| Mimocode | Còn trong 57 canonical/non-generated files và generated projections |
| Audit tests | 80 targeted tests PASS, 2 skipped; chỉ chứng minh isolated primitives |

Những findings này là evidence về implementation defects trong harness source. Remediation chỉ được coi harness-wide sau generic acceptance chain.

---

## 4. Kết quả 20 hypotheses

| # | Kết luận | Source evidence |
|---|---|---|
| 1 | **CONFIRMED** | `close.ts` chấp nhận shallow schema/`verified:true` hoặc historical PASS không bind target |
| 2 | **CONFIRMED** | Empty reconciliation được coi success |
| 3 | **CONFIRMED** | Requirement lookup đọc sai ledger level |
| 4 | **CONFIRMED** | Closure residue chứa hard-coded facts và `remaining_issues: []` |
| 5 | **CONFIRMED** | Archive pointer được copy nhưng actual active pointer không đổi |
| 6 | **CONFIRMED** | Closure gates được truyền bằng booleans/hard-coded true |
| 7 | **CONFIRMED** | Evidence baseline khác final HEAD mà không metadata-delta proof |
| 8 | **CONFIRMED** | PRE-EXISTING không bắt comparative evidence |
| 9 | **CONFIRMED** | Runtime task completion tách khỏi release/terminal completion |
| 10 | **CONFIRMED** | Reinstall/live verification không nằm trong actual completion reducer |
| 11 | **CONFIRMED** | Candidate routing vẫn phụ thuộc phrase signals |
| 12 | **CONFIRMED** | Route fields tồn tại nhưng runtime không consume |
| 13 | **CONFIRMED** | Skill roles bị flatten thành primary/support |
| 14 | **CONFIRMED** | Cross-skill composition contradictions tồn tại |
| 15 | **PARTIAL** | Researcher mandates note trong một source nhưng reference cho phép chat-only |
| 16 | **CONFIRMED** | Export handoff và local execute conflated |
| 17 | **PARTIAL** | Registry `automatic` mơ hồ dù provisioning đã tách một số lớp |
| 18 | **CONFIRMED** | Governor đếm entity thay vì actual effect/cost |
| 19 | **CONFIRMED** | Host contracts stale so với current official docs |
| 20 | **CONFIRMED** | Mimocode còn reachable xuyên graph |

Không finding nào được coi solved chỉ bằng sửa reproduction fixture hoặc chạy dogfood trong `agent-rules`.

---

## 5. Domain audit đã reconcile

### A. Skills Fabric

1. **Ý nghĩa:** load đúng procedure/context cho task trên bất kỳ consumer repo nào.
2. **Hiện tại:** catalog có `target_catalog`, nhưng router production match literal phrases và flatten primary/support.
3. **Giữ:** explicit invocation, bounded context loading, project/domain scoping, integrity locks.
4. **Confirmed:** phrase routing, unused fields, no phase deactivation, semantic-role ambiguity.
5. **Cần eval:** multilingual FP/FN, marginal value và behavior trên diverse generic repo facts.
6. **Mâu thuẫn:** browser/QA, researcher/artifact admission, finish/runtime lifecycle, proof policies.
7. **Skeptical checks:** route có phụ thuộc tên/path/framework của source repo không; bỏ skill có giảm verified outcome không?
8. **End-state:** explicit packet request + target RepoFacts/TaskFacts là authority; phrase chỉ candidate hint; default no skill.
9. **Không đổi:** operator explicit activation, lazy loading, external-source integrity.
10. **Evals:** TP/TN/FP/FN, paraphrase, Việt/Anh, phase shift, WITH/WITHOUT trên fresh/existing generic fixtures.
11. **Trade-off:** metadata nhỏ phải đổi lấy giảm context/tool calls; không đạt marginal value thì shrink/retire.

### B. Rules / Skills / Policies / Profiles

1. **Ý nghĩa:** semantic ownership thống nhất trong harness nhưng vẫn tôn trọng project-owned consumer truth.
2. **Hiện tại:** invariants lặp giữa AGENTS/rules/skills/renderers/profiles/host projections.
3. **Giữ:** rule manifest, explicit profiles, central reference broker, generated-as-projection.
4. **Confirmed:** precedence còn prose-driven; policy nằm trong skills; compatibility facades chứa semantic riêng.
5. **Cần eval:** project instructions hợp lệ, conflict với core invariant và nested instruction precedence.
6. **Mâu thuẫn:** consumer instruction có thể shape model behavior nhưng không được waive hard enforcement.
7. **Skeptical checks:** harness có overwrite user instructions không; project prose có vô hiệu hóa scope/proof gate được không?
8. **End-state:** core invariant > enforceable policy > project/domain truth > task procedure; conflict được surfaced, không silently resolve.
9. **Không đổi:** project-specific business truth không được harness tự invent.
10. **Evals:** existing generic repo với owned `AGENTS.md`/equivalent, nested instructions, harmless conventions và conflicting instructions.
11. **Trade-off:** concise host projection; project instructions không bị copy vào global harness context.

### C. MCP / Capability Lifecycle

1. **Ý nghĩa:** managed MCP chỉ tồn tại khi task trong arbitrary repo thật sự lease nó.
2. **Hiện tại:** profiles, convergence, per-task config và cleanup tree đã có.
3. **Giữ:** global exposure none, explicit-only providers, per-task config, safe backup.
4. **Confirmed:** ambiguous activation, weak idle receipt, swallowed write failure, thiếu sockets/RAM/process-after proof.
5. **Cần eval:** orphan/reparent, remote sessions, cancel/crash, host startup và upgraded stale configs.
6. **Mâu thuẫn:** globally enabled projection có thể spawn dù consumer task không route MCP.
7. **Skeptical checks:** fresh unrelated repo có zero managed process không; stale upgraded projection có tái spawn không?
8. **End-state:** explicit lifecycle `REGISTERED → … → TEARDOWN`, lease bind consumer task/repo/session.
9. **Không đổi:** unknown/user-owned/app-owned configs không destructive-delete.
10. **Evals:** no-MCP, CLI-only, routed MCP, crash, concurrent generic repos và fresh/upgraded host.
11. **Trade-off:** v1 không pooling local MCP; cold-start được benchmark trước khi thêm sharing.

### D. Context / Handoff / Intent

1. **Ý nghĩa:** một frozen contract đủ để cheap worker xử lý arbitrary repo mà không research lại.
2. **Hiện tại:** plan hashing/audit tốt; append-only correction chưa wired; no disposition.
3. **Giữ:** plan/prompt same semantic hash, immutable original + amendments.
4. **Confirmed:** export/local execute conflation và corrections không production-wired.
5. **Cần eval:** compaction, rejected-decision resurrection và portability sang unrelated repo.
6. **Mâu thuẫn:** support-pack assumptions làm output phụ thuộc source-repo files.
7. **Skeptical checks:** worker có thể chạy khi không có `agent-rules` checkout không; target identity có tách harness identity không?
8. **End-state:** one-copy contract chứa target discovery policy và disposition; supporting state generated per consumer runtime.
9. **Không đổi:** strong planner research/plan/handoff only; model do operator chọn.
10. **Evals:** copied artifact vào fresh generic repo với cheap worker và empty prior chat context.
11. **Trade-off:** artifact tự chứa thay thế multiple support files/research turns.

### E. Host Adapters

1. **Ý nghĩa:** core semantics được map sang primitive native của từng supported host cho mọi consumer repo.
2. **Hiện tại:** adapter boundary tốt nhưng static contracts stale; Mimocode còn sâu trong graph.
3. **Giữ:** provider-neutral semantics và honest fallback.
4. **Confirmed:** Grok/OpenCode/Codex mismatches; Mimocode 57 files.
5. **Cần eval:** version/reload semantics và local availability.
6. **Mâu thuẫn:** projection build bị lẫn với live certification.
7. **Skeptical checks:** adapter có chỉ hoạt động khi cwd là `agent-rules` không; installed global/project entrypoint có resolve arbitrary cwd không?
8. **End-state:** versioned adapter → packaged projection → install/upgrade → generic consumer proof.
9. **Không đổi:** không force feature parity; absent binary không fake PASS.
10. **Evals:** fresh unrelated repo, existing instructions, stale upgraded projection và hosts có enforcement capability khác nhau.
11. **Trade-off:** version probes/provenance tăng nhỏ; loại bỏ host emulation sai.

### F. Verification / Evidence / Acceptance

1. **Ý nghĩa:** PASS bind đúng harness release và đúng consumer candidate.
2. **Hiện tại:** evidence ledger/hash chain tốt; proof router chưa wired; closure paths phân mảnh.
3. **Giữ:** worker cannot author PASS, independent channels, freshness/spec binding.
4. **Confirmed:** closure không consume canonical evidence; PRE-EXISTING weak; receipt schemas phân tán.
5. **Cần eval:** target-repo mismatch, projection mismatch, verifier mutation và stale host evidence.
6. **Mâu thuẫn:** source build proof bị dùng thay consumer runtime proof.
7. **Skeptical checks:** receipt chứng minh harness build hay target behavior; consumer SHA/worktree nào được test?
8. **End-state:** evidence envelope bind harness release, installation/projection, host runtime và consumer candidate identity.
9. **Không đổi:** live claims require live proof; self-review chỉ signal.
10. **Evals:** replay receipt trên wrong repo/host/projection phải reject.
11. **Trade-off:** thêm identity hashes nhỏ nhưng ngăn evidence cross-contamination.

### G. Root-cause Planning Discipline

1. **Ý nghĩa:** sửa canonical harness mechanism gây class lỗi trên consumer repos.
2. **Hiện tại:** dependency concepts có nhưng causal map chưa bắt buộc.
3. **Giữ:** source provenance, bounded discovery, selective invalidation.
4. **Confirmed:** local file patch có thể bị nâng sai thành global remediation.
5. **Cần eval:** project/global/generated/installed producers.
6. **Mâu thuẫn:** symptom trong one consumer project có thể dẫn plan tới project-local edit.
7. **Skeptical checks:** symptom có tái hiện trong synthetic generic repo không; fix point nằm trong harness source/adapter/installer không?
8. **End-state:** causal map đi xuyên canonical source → host projection → installation → consumer behavior.
9. **Không đổi:** local consumer fix chỉ claim local nếu owner scope thực sự local.
10. **Evals:** two-producer, stale projection, project-vs-global instructions và fresh unrelated repo.
11. **Trade-off:** discovery bắt buộc chỉ cho cross-cutting/S2/S3.

### H. Worker Autonomy / Finish-to-completion

1. **Ý nghĩa:** approved plan chạy tới terminal result trong arbitrary consumer repo.
2. **Hiện tại:** facade nói continue nhưng runtime kết thúc ở task proof.
3. **Giữ:** bounded repair, dependency-ready continuation, precise blockers.
4. **Confirmed:** worker có thể dừng trước install/live/CI/cleanup.
5. **Cần eval:** long-running CI/resume và external capability waits.
6. **Mâu thuẫn:** dogfood implementation complete không đồng nghĩa consumer workflow release complete.
7. **Skeptical checks:** sau khi cài package, unrelated user task có thực sự hoàn tất không?
8. **End-state:** compiled CODE/BEHAVIOR/RELEASE/TERMINAL stages apply to every target contract.
9. **Không đổi:** code-only scope không bị ép release stage.
10. **Evals:** generic full-lifecycle task phải fail nếu worker dừng sau tests.
11. **Trade-off:** giảm operator interventions; stage graph vẫn adaptive.

### I. Execution Speed / Resource Governor

1. **Ý nghĩa:** tăng verified throughput trên representative consumer workloads.
2. **Hiện tại:** count budgets và telemetry primitives đã có; scheduler chưa use cost/effect end-to-end.
3. **Giữ:** bounded concurrency, zero-default subagents, targeted proof.
4. **Confirmed:** one global cap không mô hình hóa lanes.
5. **Cần eval:** diverse repo size/language, Windows process metrics và CI wait.
6. **Mâu thuẫn:** benchmark trong source repo có thể ưu ái cached dependencies/layout.
7. **Skeptical checks:** gain có còn khi repo fresh và unrelated không?
8. **End-state:** lane scheduler và tree-digest caches scoped per consumer repo.
9. **Không đổi:** one writer per owned worktree.
10. **Evals:** generic corpus, cold/warm installs và current/raw/vNext comparisons.
11. **Trade-off:** telemetry bounded; không persist raw consumer content.

### J. Artifact / Support State / Closure Compaction

1. **Ý nghĩa:** minimal state per consumer worktree, kể cả repo chưa biết Agent Rules.
2. **Hiện tại:** artifact admission implemented nhưng unused; runtime luôn ghi nhiều files.
3. **Giữ:** immutable intent, pointer artifacts, cold archive và redaction.
4. **Confirmed:** mandatory writes/support files và researcher notes.
5. **Cần eval:** first-run repo, multi-worktree repo và upgraded state.
6. **Mâu thuẫn:** tracked lifecycle state dễ làm dirty arbitrary consumer repos.
7. **Skeptical checks:** harness có thay đổi consumer source chỉ để bookkeeping không?
8. **End-state:** operational state ignored/out-of-source; tracked consumer files chỉ khi owner contract yêu cầu.
9. **Không đổi:** audit/reopen vẫn có content-addressed cold evidence.
10. **Evals:** fresh repo remains source-clean; crash/resume; upgrade stale state; reopen from residue.
11. **Trade-off:** cold-history rehydrate explicit; hot context/file count giảm.

### K. Security / Trust Boundaries

1. **Ý nghĩa:** arbitrary consumer repo là untrusted input.
2. **Hiện tại:** scope/integrity/tamper primitives đã có nhưng chưa unified.
3. **Giữ:** deny-first, exact ownership, process-tree cleanup và secret scanners.
4. **Confirmed:** trust-root manifest thiếu; worker có thể sửa oracle; redaction không phủ toàn graph.
5. **Cần eval:** malicious repository prose, nested instructions, MCP output, symlink và credentials.
6. **Mâu thuẫn:** project instructions cần được preserve nhưng không được thành enforcement authority.
7. **Skeptical checks:** cloned repo có thể làm harness đọc home secrets hoặc disable proof không?
8. **End-state:** project content remains model context/data; bad effects bị host/harness boundary chặn.
9. **Không đổi:** no secret/home/browser-cookie access without explicit contract/permission.
10. **Evals:** malicious generic repos, not named real projects.
11. **Trade-off:** stronger checks chỉ khi effect/trust risk trigger.

### L. Evals / Telemetry / Ablation

1. **Ý nghĩa:** prove thesis trên generic consumer workloads.
2. **Hiện tại:** eval-lab metrics tốt nhưng mandatory cross-repo e2e thiếu.
3. **Giữ:** same-model ablation và trustworthy throughput.
4. **Confirmed:** isolated unit PASS không ngăn false closure.
5. **Cần eval:** cheap-worker and raw-host corpus.
6. **Mâu thuẫn:** dogfood success dễ overfit repo/tool caches.
7. **Skeptical checks:** candidate thắng trên unrelated cold repo không?
8. **End-state:** unit/domain/composition/e2e với generic fixture matrix bắt buộc.
9. **Không đổi:** live claim cannot be replaced by static fixture.
10. **Evals:** §11 và §12.
11. **Trade-off:** release/nightly full corpus; iteration focused subsets.

### M. Retirement / Simplification

1. **Ý nghĩa:** remove complexity khỏi source, installation và upgraded consumer environments.
2. **Hiện tại:** dispositions tồn tại nhưng no unified retirement workflow.
3. **Giữ:** parity-before-delete và migration receipts.
4. **Confirmed:** Mimocode, three closure paths, dead selector, facades và stale plans.
5. **Cần eval:** old configs/projections in real upgrade shapes.
6. **Mâu thuẫn:** xóa canonical file nhưng installed copy có thể sống.
7. **Skeptical checks:** fresh install và upgrade đều hết component chưa?
8. **End-state:** removal graph bao gồm source/generated/package/installed/config/cache/docs/tests.
9. **Không đổi:** unknown user state is preserved/unmanaged.
10. **Evals:** stale upgraded generic environment và regeneration.
11. **Trade-off:** bounded compatibility reader rồi xóa.

---

## 6. Cross-domain root-cause map

```text
Intent/events chưa wired
    → no explicit disposition/DoD
    → worker early-stops
    → consumer repo còn install/live/closure leftovers

Declared-but-unwired primitives
    → proof/admission/enforcement bypassed
    → shallow booleans reach closure
    → false PASS in dogfood and consumer repos

Phrase routing + duplicated policy
    → wrong context/proof procedure
    → overhead and behavior dependent on prompt/repo wording

Ambiguous MCP state + stale host projection
    → globally enabled tooling
    → arbitrary repo consumes idle resources

No causal map
    → named-project/local patch
    → canonical/generated/installed producer survives
    → fresh unrelated repo rediscovers bug

Tracked lifecycle metadata + self-SHA
    → closure cycle/dirty consumer repo
    → relaxed binding
    → non-deterministic terminal truth

Dogfood-only evidence
    → harness source appears green
    → package/adapter/installer/arbitrary-repo chain unproven
```

---

## 7. Keep / Refine / Merge / Promote / Retire

| Disposition | Components |
|---|---|
| **KEEP** | WorkRequest/WorkSpec/TaskPacket, PortablePlan hashing/audit, evidence ledger, integrity snapshots, context resolver, 5fedu reference broker, plan identity, eval-lab |
| **REFINE/WIRE** | Pointer CAS, relation classifier, TaskExecutionPolicy, artifact admission, trajectory supervisor, resource governor, host probes, MCP receipts, proof router |
| **MERGE** | `close/closeout/certify`; proof status schemas; routing + decision fabric; readiness/acceptance reducers |
| **PROMOTE** | Finish-to-completion, compiled DoD, parity/QA/quality policy, causal maps, artifact-persistence policy |
| **RETIRE** | Mimocode, provider selector, phrase-only authority, mandatory researcher notes, hard-coded closure v1, hot old plans |
| **COMPATIBILITY-ONLY** | Context/finish/plan facades until production consumers and generic parity migrate |

### All 36 skills

| Nhóm | Skills | Hành động |
|---|---|---|
| Core procedures/lenses | `best-of-n`, `browser-qa`, `docs-style`, `frontend-architect`, `master-image-generation`, `researcher`, `frontend-design-contract`, `mobile-composition`, `backend-composition`, `database-stack`, `schema-migration`, `infra-devops-composition`, `security-review`, `claim-test-strategy`, `external-skill-governance` | Giữ, thêm role/phase, generic repo eval; researcher không always-persist |
| Core policy/facade | `parity-verification`, `qa-skills`, `quality`, `verification-router`, `context-evolution-protocol`, `finish-to-completion`, `plan-and-handoff` | Promote/merge vào core; facade retire sau parity |
| Explicit profiles | `ui-taste`, `5fedu-module-parity`, `5fedu-project` | Chỉ explicit project/domain activation |
| External packs | `anthropic-frontend-design`, `vercel-agent-skills`, `expo-skills`, `prisma-skills`, `supabase-agent-skills`, `hashicorp-agent-skills`, `impeccable`, `vercel-react-best-practices`, `vercel-web-design-guidelines`, `callstack-react-native-best-practices`, `trail-of-bits-security` | Freeze growth; pin/integrity; no production auto-route until generic WITH/WITHOUT eval |

---

## 8. Host capability matrix

| Host | Native semantic surfaces | Isolation/execution | MCP/config | Required proof |
|---|---|---|---|---|
| **Codex** | Hierarchical `AGENTS.md`, skills, command hooks including PreToolUse/UserPromptSubmit/Stop, granular approval/sandbox. [Docs](https://learn.chatgpt.com/docs/config-file/config-reference) | Native subagents/worktree-capable | Shared/project `config.toml`, enabled/tool restrictions. [MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) | Package install into isolated Codex home, fresh unrelated repo/session, native enforcement/live idle-zero |
| **Claude Code** | `CLAUDE.md`, rules, skills, rich hooks, deny-first permissions, sandbox. [Docs](https://code.claude.com/docs/en/hooks) | Subagents + worktree isolation | Local/project/user MCP scopes. [MCP](https://code.claude.com/docs/en/mcp) | Static conformance if absent; live generic repo only with binary |
| **OpenCode** | `AGENTS.md`, skills, agents, permissions/plugins; v1/v2 version-specific. [Docs](https://opencode.ai/v2/docs/permissions) | Native subagents; harness worktree/effect boundary required where OS sandbox absent | v1 schema for local `1.18.18`; V2 `mcp.servers`. [MCP](https://opencode.ai/v2/docs/mcp-servers) | Version-aware install, fresh unrelated repo, permission/plugin enforcement and MCP lifecycle |
| **Cursor** | `.cursor/rules`, root AGENTS/CLAUDE, CLI permissions/hooks by version. [Docs](https://docs.cursor.com/en/cli/using) | Local/background/cloud branches/VMs | Shared `mcp.json` | Static if absent; live only with binary/version probe |
| **Antigravity** | GEMINI/global rules, `.agents/rules`, workflows, JSON hooks, project permissions/sandbox. [Docs](https://antigravity.google/docs/rules-workflows?app=antigravity) | Projects/worktrees/subagents | Native MCP customization/UI | Desktop presence alone không đủ; live only after native handshake |
| **Grok Build** | AGENTS, `.grok/skills`, plugins/hooks, permissions/sandbox. [Docs](https://docs.x.ai/build/features/skills-plugins-marketplaces) | Native subagents/worktrees | `~/.grok/config.toml`, mcp list/doctor. [MCP](https://docs.x.ai/build/features/mcp-servers) | Rebuilt static adapter; live only with binary |

Evidence levels:

`DOC_SUPPORTED → STATIC_CONFORMED → PROJECTION_BUILT → LIVE_CERTIFIED`, với `STALE` khi version/doc/projection hết hạn.

Adapter acceptance luôn bind generic consumer fixture; running adapter tests inside `agent-rules` alone không đủ.

---

## 9. Public interfaces/types

Không tạo subsystem mới. Chỉ mở rộng existing contracts để giữ scope identities và terminal semantics.

1. `ExecutionDisposition`:

   `PLAN_ONLY | EXPORT_HANDOFF | LOCAL_EXECUTE`.

2. `PlanRelation`:

   `CONTINUATION | COMPATIBLE_AMENDMENT | SUPERSESSION | CONFLICT | INDEPENDENT`, với compatibility mapping từ taxonomy hiện tại.

3. Lifecycle tách:

   - activity/retrieval state;
   - terminal outcome.

   `SUPERSEDED/INACTIVE` không tự tạo PASS.

4. `CompiledDoD`:

   Required subsets của `CODE | BEHAVIOR | RELEASE | TERMINAL`.

5. Existing task/evidence envelopes thêm:

   - `harness_release_identity`;
   - `installation_projection_identity`;
   - `consumer_repository_identity`;
   - `consumer_candidate_identity`;
   - `host_runtime_identity`.

6. `.agent/current.json` giữ path semantics nhưng trở thành ignored operational state per consumer worktree; tracked legacy ledgers là cold/history.

7. `ClosureManifest`, `MetadataDeltaManifest`, `TerminalAttestation` dùng chung cho one closure service.

8. Comparative PRE-EXISTING envelope bind baseline/candidate của **consumer repo**, cùng harness/host/tool environment.

9. Causal map thêm canonical source, projections, installer/migration và consumer live surfaces.

10. Skill metadata thêm tối thiểu `semantic_role` và `applicable_phases`.

11. MCP lease bind consumer repo/worktree/task/session.

12. Host capability evidence thêm version/provenance/expiry.

13. Resource budgets thêm cost/effect lanes.

Schemas có version/migrations; generated/installed projections không được parse ngược thành canonical truth.

---

## 10. Target workflow

```text
strong-model discussion/research
    → frozen effective contract
    → one-copy PLAN/PROMPT
    → cheap worker
    → target consumer repo discovery
    → adaptive ephemeral support state
    → root-cause trace
    → bounded implementation
    → targeted proof/repair
    → package/install/upgrade if harness work
    → fresh/upgraded arbitrary repo proof
    → exact-SHA CI/release evidence
    → terminal reducer
    → atomic deactivation/closure
    → minimal residue
```

Khi task là phát triển `agent-rules`, workflow chạy hai vòng:

1. dogfood source-development loop;
2. installed-package generic-consumer loop.

Chỉ vòng thứ hai chứng minh harness-wide acceptance.

---

## 11. Mandatory generic fixture matrix

### G1 — Fresh unrelated repository

- Generated in a disposable temp/worktree root.
- Không copy code/instructions từ `agent-rules`.
- Không có `.agent`, domain pack hoặc harness projection sẵn.
- Run installation/init, one-copy task, proof, cleanup và terminal closure.
- Prove default no-skill/no-MCP behavior, source cleanliness và ordinary output.

### G2 — Existing repository with project-owned instructions

- Có project-owned `AGENTS.md`/host-equivalent với harmless build/style rules.
- Có nested instructions và một controlled conflict fixture.
- Upgrade/install không overwrite/remove user-owned content.
- Harmless project truth được preserve.
- Conflict với hard core enforcement được surfaced/blocked, không silently accepted.
- No named real project content.

### G3 — Upgraded environment with stale harness-owned state

- Seeded from versioned legacy fixture containing old pointer/ledger, generated projection, MCP block và host config.
- Có cả exact harness-owned blocks và adjacent user-owned blocks.
- Upgrade migrates/removes only owned stale state.
- User-owned state preserved.
- Fresh post-upgrade session proves stale behavior không quay lại.

### G4 — Representative host enforcement classes

Tối thiểu:

1. Native hooks/sandbox/permissions class — live Codex nếu available.
2. Permission/plugin + harness worktree fallback class — live OpenCode nếu available.
3. Static adapter conformance cho một absent host; không nâng thành live proof.

Nếu Antigravity native handshake available, thêm live desktop class; nếu không, record `NOT_LIVE_VERIFIED`.

### G5 — Optional named-project regressions

- Chỉ chạy sau G1–G4.
- Không xuất hiện trong production constants, routes, acceptance schemas hoặc architecture.
- Failure chỉ là regression signal; fix vẫn phải trace về canonical harness mechanism.
- Optional regression failure không được "sửa" bằng project-local hard-code.

Fixture repositories là test data, không phải fix points. Production source không được chứa fixture path/name.

---

## 12. Implementation phases

### Phase 0 — Freeze successor contract và bootstrap trust island

**Problem:** current plan/closure state không đủ trust.

**Root confidence:** `PROVEN`.

**Actions:**

- Revalidate Git, current pointer, installed projections và transient user changes.
- Create isolated branch/worktree.
- Persist exact plan hash và bootstrap envelope.
- Record separate harness-source and future consumer-target identities.
- Không dùng current close/certify/closeout.
- Bootstrap envelope luôn `BOOTSTRAP_UNCERTIFIED`.

**Proof:** source snapshot, scope, contract coverage và worktree isolation.

**Terminal gate:** first slice chỉ trust-root; no PASS claim.

**Rollback:** remove exact isolated worktree/branch if no retained work.

---

### Phase 1 — Authority, lifecycle và closure trust root

**Problem:** false PASS, stale pointer, non-atomic closure và SHA recursion.

**Root confidence:** `PROVEN`.

**Reuse:** pointer CAS, plan identity, evidence ledger, durable-store primitives.

**Actions:**

- Separate activity/retrieval from terminal outcome.
- Migrate active pointer/ledger/journal/checkpoint into ignored operational state per worktree.
- Implement prepare/stage/fsync/single-commit-point transaction and idempotent replay.
- Consolidate close/closeout/certify.
- Reject empty requirements/reconciliation.
- Derive residue from effective contract/evidence/diff.
- Correct old closure as invalid; old plan becomes inactive/superseded with terminal partial truth.
- Carry unresolved requirements; explicitly supersede Mimocode requirement.
- Activate successor through new CAS transaction.
- Implement behavioral baseline `B`, allowlisted metadata commit `C`, exact-SHA external terminal attestation.

**Dogfood:** build candidate into isolated tool home and cut over immediately after independent trust-root verification.

**Generic scope:** transaction/state code must work when invoked in G1–G3, not rely on historical `.agent` layout.

**Proof:** failpoints, double close, stale generation, first-run no-state repo, upgraded-state repo.

**Terminal gate:** current false closure no longer accepted; G1 fresh closure and G3 upgraded recovery behave deterministically.

---

### Phase 2 — Effective intent, disposition và executable DoD

**Problem:** one-copy handoff và full lifecycle chưa được compile.

**Actions:**

- Wire append-only corrections/events.
- Classify new requests against one active authority.
- Add disposition and adaptive required stages.
- Render one self-contained plan/prompt.
- Bind target consumer repository separately from harness release.
- Runtime only returns PASS when final required stage passes.

**Migration:** old plans get compatibility defaults without auto-executing standalone artifacts.

**Proof:** code-only vs full-lifecycle contracts; correction/compaction; G1 one-copy cheap-worker run.

**Terminal gate:** worker does not require `agent-rules` checkout/support files to implement consumer task.

---

### Phase 3 — Causal planning, Skills Fabric và artifact admission

**Problem:** phrase routing, local symptom patch và mandatory artifact writes.

**Actions:**

- Require causal map for S2/S3/cross-cutting work.
- Unknown root cause creates discovery task.
- Route from explicit request + consumer RepoFacts/TaskFacts + explicit profile.
- Consume or delete dead route metadata.
- Add skill role/phase applicability and unload on phase exit.
- Wire artifact admission before writes.
- Remove researcher always-persist.
- Freeze catalog additions.
- Preserve 5fedu explicit-only activation.
- Add ordinary-output negative tests.

**Generic scope:** no router facts/constants derived from `agent-rules`; fixtures span G1/G2/G3.

**Proof:** multilingual, phase-shift, WITH/WITHOUT, two-producer and stale-install regressions.

**Terminal gate:** root fix survives fresh unrelated and upgraded generic repos.

---

### Phase 4 — MCP lifecycle and idle-zero

**Problem:** install/availability/attachment/lease conflated.

**Actions:**

- Introduce explicit MCP lifecycle states and legacy mapper.
- No globally advertised enabled managed MCP by default.
- Generate per-task isolated host configuration.
- Bind lease to consumer repo/worktree/task/session.
- Record process tree, CPU/RAM, sockets, schema tokens, invocation and teardown.
- Receipt failure blocks live claim.
- Handle cancel/timeout/crash/fallback.
- Preserve app/user-owned entries.
- CLI-only Playwright task must not attach browser MCP.

**Migration:** G3 contains stale owned and user-owned MCP config; dry-run then exact convergence.

**Proof:** G1 no-MCP, G2 unrelated instructions, G3 stale projection and two concurrent generic repos.

**Terminal gate:** zero managed process/socket/schema exposure after no-MCP task and teardown on live hosts.

---

### Phase 5 — Host adapters and Mimocode removal

**Problem:** stale contracts and unwanted Mimocode reachability.

**Actions:**

- Remove Mimocode across types/contracts/adapters/installers/nativeHosts/schemas/tests/evals/docs/control-plane/generated outputs.
- Rebuild projections only from canonical source.
- Keep unknown legacy config unmanaged.
- Add doc/version provenance and probes for six supported hosts.
- Implement version-aware OpenCode v1/v2 mapping.
- Use current Codex hooks and corrected Grok/Antigravity paths.
- Remove provider/model selection logic; operator remains authority.

**Generic scope:** each adapter projection must install into isolated host home and operate in G1/G2/G3.

**Proof:** canonical/generated absence scan, migration fixtures, static adapter conformance and live generic sessions where binaries exist.

**Terminal gate:** Mimocode unreachable after fresh install and upgrade; no generic host behavior lost.

---

### Phase 6 — Unified proof, PRE-EXISTING và trust boundaries

**Problem:** proof router bypass, weak status/binding và mutable oracle.

**Actions:**

- Route every runtime proof through adaptive proof router.
- Converge public statuses to six-status vocabulary.
- Bind evidence to harness release, installed projection, host runtime and consumer candidate.
- Require comparative PRE-EXISTING evidence.
- Keep final-green requirements blocking.
- Introduce trust-root manifest and evidence epoch invalidation.
- Apply secret redaction and external-content trust boundaries.
- Enforce network/effect policy.
- Trace acceptance back to original effective intent.

**Generic scope:** wrong consumer repo/projection/host replay must fail.

**Proof:** cross-repo receipt replay, modified verifier/test, stale host version, malicious G2 instructions and comparative PRE-EXISTING.

**Terminal gate:** no evidence generated for one repo can close another.

---

### Phase 7 — Resource lanes and verification scheduling

**Problem:** entity counts and repeated expensive work.

**Actions:**

- Add read/search, research, writer, browser, verifier, MCP and heavy-process lanes.
- Default zero subagents; max two independent/no recursion.
- One writer per worktree.
- Wire trajectory supervisor and duplicate-failure/read/tool signals.
- Targeted proof during iteration; one final full suite per stable candidate epoch.
- Diff-bound evidence invalidation.
- Async CI monitoring with dependency-ready progress.

**Generic scope:** cache keys include consumer tree identity; no cross-repo context/evidence cache leakage.

**Proof:** G1 cold repo, G2 existing repo, G3 upgrade and concurrent unrelated repositories.

**Terminal gate:** performance budget holds on generic corpus, not only dogfood repo.

---

### Phase 8 — Generic evals and ablation

**Problem:** isolated source tests cannot prove supervisory harness behavior.

**Actions:**

- Add unit/domain/composition/e2e suites.
- Make G1–G4 mandatory release gates.
- Run RAW HOST vs current harness vs vNext with same task/model.
- Run cheap-worker one-copy eval.
- Run internal adversarial review for false PASS, early stop, local patch, stale projection, babysitting, duplicate context/tests and complexity without value.
- Run optional named regressions only after generic gates.
- Shrink/retire mechanisms failing ablation.

**Terminal gate:** generic fixture matrix, reliability gates and speed budget all PASS.

---

### Phase 9 — Package, install, generic live proof và terminal closure

**Exact order:**

1. Freeze behavioral candidate `B`.
2. Run targeted source/dogfood proofs.
3. Build package and generated projections.
4. Create closure metadata commit `C`, parent `B`, status pending.
5. Install exact `C` package into isolated Codex/OpenCode homes.
6. Run G1 fresh unrelated repository end-to-end.
7. Run G2 existing instructions end-to-end.
8. Run G3 stale upgraded environment end-to-end.
9. Run G4 representative enforcement classes.
10. Optionally run named regressions.
11. Run fresh host sessions and MCP idle-zero measurements.
12. Run `npm ci`, build, check/typecheck, tests and `verify:all` on exact `C`.
13. Push non-protected implementation branch; monitor exact-SHA CI.
14. CI emits terminal attestation bound to `C` and generic fixture receipts.
15. Resolver atomically deactivates successor operational pointer.
16. Compact hot state; retain minimal residue and cold evidence pointers.
17. Remove exact temporary fixture repos, worktrees, processes and expired backups.
18. Keep one delivery branch until normal owner/merge workflow consumes it.

**Failure behavior:** any generic fixture failure is a harness release blocker. Fix must occur in canonical harness/adapter/installer unless causal map proves fixture itself invalid.

**Terminal gate:** source dogfood and generic installed-package acceptance both PASS; worktree clean; exact-SHA CI green; closure idempotent.

---

## 13. Test and acceptance scenarios

1. Terminality plan with code/install/fresh runtime/CI/cleanup.
2. User rediscovery in a new G1 repository.
3. Anti-band-aid symptom from project/global/generated/installed producers.
4. "Cho phép closure" does not waive proof.
5. PRE-EXISTING requires baseline/candidate comparison.
6. Supersession leaves old work inactive but terminal partial.
7. Crash before/after every closure transaction boundary.
8. Double-close idempotency.
9. Skill TP/TN/FP/FN, Việt/Anh, phase shift and WITH/WITHOUT.
10. MCP no-route/CLI-only/invoke/crash/concurrency/upgrade.
11. Official semantics vs generated/installed host adapter.
12. 5fedu explicit activation in a temporary generic repo; no leakage in G1/G2.
13. Cheap worker with only one copied artifact.
14. RAW/current/vNext ablation over generic corpus.
15. Malicious project instructions, MCP output, secret and path escapes.
16. Mimocode removal after fresh install and stale upgrade.
17. Evidence from consumer A replayed against consumer B must reject.
18. Harness package A evidence replayed with package B must reject.
19. Existing user instructions/config survive upgrade byte-for-byte outside owned blocks.
20. Agent-rules-only PASS while any G1–G4 gate fails must result in overall non-PASS.

---

## 14. Requirement coverage

| Requirement | Phases | Harness-wide terminal evidence |
|---|---|---|
| PF1 MCP idle-zero | P4, P5, P9 | G1/G3 live process/RAM/CPU/socket/schema receipts |
| PF2 Deterministic output/5fedu | P3, P8, P9 | G1/G2 negative output + explicit 5fedu temp fixture |
| PF3 Cross-host enforcement | P5, P6, P9 | G4 adapter/install/live evidence |
| PF4 Workflow/dogfood | P0–P3, P8–P9 | Early dogfood plus G1 cheap-worker one-copy |
| PF5 Lifecycle/artifacts | P1–P3, P7, P9 | First-run and upgraded generic state |
| PF6 Release completion | P2, P6, P9 | Exact package install, generic live proof, CI and closure |
| META-A | P1, P2, P8, P9 | Generic worker early-stop eval fails |
| META-B | P3, P5, P8 | Multi-producer/install/fresh-repo causal proof |
| A Skills | P3, P8 | Generic routing/composition/ablation |
| B Ownership | P3, P6, P8 | G2 project-owned instruction precedence |
| C MCP | P4, P9 | G1/G3 lifecycle receipts |
| D Intent/handoff | P2, P8 | Fresh unrelated one-copy worker |
| E Hosts | P5, P9 | Build/install/upgrade/generic-session chain |
| F Evidence | P1, P6, P9 | Multi-identity evidence binding |
| G Root cause | P3, P8 | Canonical-to-consumer causal map |
| H Autonomy | P2, P7–P9 | Generic terminal workflow |
| I Speed | P7–P9 | Generic benchmark corpus |
| J Artifacts | P1, P3, P9 | Source-clean fresh repo and upgraded compaction |
| K Security | P6, P8 | Malicious generic consumer fixtures |
| L Evals | P8 | Mandatory G1–G4 |
| M Retirement | P5, P8–P9 | Fresh + stale-upgrade removal proof |

---

## 15. Speed budget

| Metric | Gate |
|---|---|
| Operator interventions | 0 cho unblocked generic e2e |
| Reopen after PASS | 0 trong fresh-repo rediscovery |
| Managed MCP idle | 0 process/socket and effectively 0 task-attributed CPU/RAM |
| Full suite | Tối đa 1 mỗi stable candidate epoch |
| Small-task artifacts | No support pack/checkpoint/research note by default |
| Duplicate reads/tool calls | Giảm ≥30% so với current harness trên generic corpus |
| S0/S1 context | Giảm ≥20% trên generic corpus |
| S2/S3 context | Không tăng >10% nếu verified success không tăng ≥10 percentage points |
| Terminal p50 | Không tệ hơn current harness |
| Terminal p95 | Không tăng >10% nếu không có material reliability gain |
| False DONE/scope violations | 0 |
| Subagents | 0 default; max 2 independent/no recursion |
| Cold install overhead | Measured separately; không che bằng warm dogfood cache |
| Fixture cleanup | 100% exact-owned temp repos/processes removed after receipts |

Mechanism chỉ thắng trong `agent-rules` nhưng không thắng generic corpus phải bị shrink/retire.

---

## 16. Risk analysis

| Risk | Mức | Mitigation |
|---|---|---|
| Dogfood-only false generalization | Critical | G1–G4 mandatory; source tests cannot close release alone |
| Named-project hard-code | Critical | No production fixture names/paths; optional regressions after generic gates |
| Harness/consumer identity conflation | Critical | Evidence binds four separate identities |
| Project-local symptom fix | High | Causal map must terminate at canonical harness mechanism |
| False PASS | Critical | Nonempty requirements, independent reducer, external attestation |
| Closure self-SHA recursion | Critical | Pending metadata commit + exact-SHA external attestation |
| Bootstrap self-certification | Critical | Bootstrap uncertified; independent trust-root proof before cutover |
| Stale host contract | High | Versioned docs/probes/expiry |
| Upgrade destroys user state | Critical | Exact ownership markers, dry-run/backups and G3 byte-preservation |
| Project instructions override enforcement | Critical | Hard policy outside model context; conflict surfaced |
| Skill misrouting | High | Consumer facts authority, phase unload and generic eval |
| PRE-EXISTING escape | High | Comparative envelope; final-green remains blocking |
| Verifier/test weakening | Critical | Trust-root manifest and epoch invalidation |
| Secret leakage | Critical | Consumer repo untrusted; admission/redaction/effect boundary |
| Destructive cleanup | High | Exact-owned targets only |
| Complexity growth | High | Catalog freeze, ablation and explicit retirement |

---

## 17. Final one-copy execution contract

### Objective

Implement Agent Rules Terminal Harness vNext as a supervisory harness for arbitrary consumer repositories, dogfood it early while developing `agent-rules`, then prove the packaged/installed result on mandatory generic fixtures before terminal closure.

### Scope and authority

- May modify canonical harness source, schemas, rules, skills, profiles, adapters, installers, tests, evals, automation and required state migrations.
- May create isolated worktrees/feature branch, commit and push a non-protected branch for CI.
- May create disposable generic fixture repositories and isolated host homes.
- Must not merge protected branches, deploy production or publish packages without separate authority.
- Must not modify named real consumer projects as implementation targets.
- Must not hard-code fixture/project names, paths, instructions or symptoms in production.
- Must not hand-edit generated output.
- Must preserve user/concurrent changes.

### Execution order

1. Preflight and hash this contract.
2. Bootstrap only the trust-root slice.
3. Verify trust root independently.
4. Install candidate harness into isolated tool home.
5. Activate successor with new lifecycle transaction.
6. Use vNext for all remaining phases.
7. Run targeted proofs and automatic bounded repair.
8. Build/package/install/upgrade.
9. Execute G1–G4.
10. Run fresh-session/live-host/MCP proof.
11. Run exact-SHA full CI.
12. Obtain terminal attestation.
13. Atomically deactivate/compact/cleanup.
14. Return concise terminal receipt.

### Non-negotiable behavior

- Agent Rules behavior is harness-wide, not repo-local.
- `agent-rules` dogfood PASS is necessary but insufficient.
- Generic fixtures are evidence targets, not fix points.
- Named projects are optional regression fixtures only.
- Workers never author PASS.
- Owner authority does not waive evidence.
- No empty reconciliation/requirements PASS.
- No PRE-EXISTING without comparative proof.
- No code-complete response while required release/terminal stages remain.
- No superseded unfinished plan is successful closure.
- Unknown root cause triggers discovery.
- Missing binary means no live certification.
- Model selection remains operator-owned.
- No persistent artifact without lifecycle consumer.
- No subagent by default; max two independent, no recursion.
- Preserve proven legacy behavior until generic parity exists.

### Stop conditions

Stop early only for:

- `NEEDS_USER`: real owner decision/authority.
- `BLOCKED`: unavailable external capability/credential/independent trust reviewer after all independent work.
- `UNSUPPORTED`: officially unsupported semantic seam.
- Destructive action outside approved scope.

A blocker receipt must contain completed work, evidence hashes and one exact resume condition.

### PASS conditions

Final PASS requires:

- all mandatory requirements and compiled DoD stages PASS;
- dogfood source development PASS;
- packaged harness installed from exact candidate;
- G1 fresh unrelated repo PASS;
- G2 existing instructions repo PASS;
- G3 stale upgraded environment PASS;
- G4 representative host enforcement PASS at honest evidence levels;
- Mimocode unreachable after fresh install and upgrade;
- MCP idle-zero live-proven where hosts are available;
- evidence binds harness, installation, consumer and host identities;
- exact final SHA CI green;
- old plan no longer hot;
- successor closure idempotent and atomically deactivated;
- tracked source clean;
- minimal residue and cold evidence pointers retained;
- no unresolved issue hidden or hard-coded empty.

### Final receipt fields

- public terminal status;
- effective-contract hash;
- harness release SHA;
- installation/projection hashes;
- generic fixture receipt hashes;
- live/static host evidence levels;
- consumer target/candidate identities;
- exact-SHA CI attestation;
- MCP idle metrics;
- requirement coverage;
- residue hash/path;
- retained delivery branch;
- known issues/blockers.

---

## 18. Frozen assumptions/defaults

- Source baseline must be revalidated from current workspace before work.
- This plan is the owner-authorized successor and resolves Mimocode removal.
- Delivery ends on a non-protected branch with exact-SHA CI; merge/deploy remain outside scope.
- Codex/OpenCode are expected live host candidates; Antigravity only if native handshake works; absent hosts remain static-only.
- Generic G1–G4 fixtures are mandatory and disposable.
- Named consumer projects cannot be canonical acceptance dependencies.
- 5fedu remains an optional explicit domain pack and is tested through temporary generic repos.
- Operational harness state must not dirty arbitrary consumer source by default.
- No new skill/provider catalogue/parallel framework is introduced.
- Existing primitives are reused wherever they can express the required semantics.
- Official host behavior and live probes override stale local assumptions.
- Strong planner stops here; implementation begins only when this complete artifact is handed to the worker.