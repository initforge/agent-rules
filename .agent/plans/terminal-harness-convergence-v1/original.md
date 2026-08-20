# Kế hoạch hội tụ Agent Rules thành supervisory harness terminal, portable và tự vận hành

## 1. Mục tiêu và baseline đã xác minh

Triển khai liền mạch từ source hiện tại đến khi `origin/main` là trạng thái cuối đã được CI xác minh. Không dừng ở "code xong", "local green" hay "ready to push".

Baseline audit hiện tại:

- Local `main` và `origin/main` cùng ở `4594bb94dbb94de234df9a7a2f9f1c01c61b793f`; worktree sạch.
- Chỉ có branch `main` ở local và remote; không có ruleset/branch protection đang áp dụng.
- `main` có 284 commit, vi phạm yêu cầu tối đa 9 commit.
- Hai tag lịch sử nằm ngoài ancestry của `main`; giữ nguyên, không xóa.
- Workflow `Quality` của SHA trên đang FAIL trên Linux/macOS vì `correctInvalidClosure()` mở thư mục ledger bằng `r+`, gây `EISDIR`.
- Workflow `Certification` đang queued; cần bỏ tình trạng chờ vô hạn nhưng không được đổi host vắng mặt thành PASS.
- `.agent/current.json` generation 32 vẫn trỏ tới `terminal-harness-vnext` ở `IN_PROGRESS`; 21 requirements trong source đều `pending`, reconciliation rỗng và terminal attestation vẫn bind SHA `1109051…`. Báo cáo PASS cũ không phải sự thật terminal.
- OpenCode 1.18.18 hiện chạy được. Codex app được phát hiện nhưng CLI probe bị từ chối quyền nên chưa LIVE_CERTIFIED. Claude, Cursor, Grok và `agy` vắng mặt; receipt Antigravity cũ bị coi là stale.

Scope invariant:

- Agent Rules là supervisory harness bao ngoài các coding host và phục vụ arbitrary consumer repositories.
- `agent-rules` chỉ là implementation source và dogfood environment.
- Mọi claim phải đi đủ chuỗi: canonical semantics → host-neutral contract → host-native enforcement → package → install/upgrade/migration → arbitrary consumer → fresh/upgraded session → observed behavior → evidence → trusted terminal.
- Named project, kể cả `agent-rules` và `5fedu`, chỉ được dùng làm optional regression fixture sau khi generic acceptance đã đạt.

## 2. Các defect còn tồn tại và root cause

| Nhóm | Defect xác nhận | Root cause và đường public liên quan |
|---|---|---|
| Terminal Authority | `north-star run` có thể in "completed" và exit 0 cho PARTIAL/FAILED; queue summary làm mất `trusted_outcome`. | `packages/cli/src/index.ts`, `northstar-ux.ts`, runtime finalizer và các lệnh close/certify đang tự diễn giải success riêng. |
| Closure | `close` tạo mọi requirement với `evidence_status=pending`, vẫn stage/commit và trả Success; chưa compose attest → deactivate → compact. | CLI không lấy evidence ledger/proof receipt thật; Closure Service chỉ được gọi như primitive filesystem. `close` còn hard-code correction cho một plan cũ. |
| Closure transaction | Linux/macOS CI lỗi `EISDIR`; replay chưa bind đầy đủ input/evidence/identity drift. | Tự fsync thư mục bằng `openSync(dir, "r+")` thay vì helper cross-platform hiện có; replay chỉ so plan/effective contract. |
| Disposition/DoD | `PLAN_ONLY` và `EXPORT_HANDOFF` bị hạ Definition of Done; `handoff` còn rơi về mặc định `LOCAL_EXECUTE`. | `compileDoD()` suy depth-of-done từ "ai thực thi", thay vì claims/risk/release/live obligations. |
| Proof Router | Adaptive Proof Router tồn tại nhưng production runtime vẫn chạy toàn bộ verifier mapping. | `runtime.ts` dựng `VerificationProfile.steps` trực tiếp; router hiện gộp selection và result nên chưa nằm trước execution. |
| Skills | Decision Fabric mặc định shadow; legacy `routeSkills()` và literal phrase vẫn là authority thực tế. | Typed RepoFacts/TaskFacts chưa thay thế đường compatibility; multilingual intent có thể kích hoạt sai domain/skill. |
| Host convergence | Capability contracts có phần stale và enforcement decision chưa được runtime/installer gọi xuyên suốt. | Static docs, adapter metadata, installed projection và live receipt chưa thành một chain có identity. |
| Artifact admission | Primitive tồn tại nhưng không chặn các operational write; `evidence_required` đẩy quá nhiều task thành `AUDITED`. | Runtime/planner/handoff vẫn `mkdir/write` trực tiếp; support state, durable evidence và audit state chưa phân loại riêng. |
| Resource lanes | Bảy lane chỉ là declaration; runtime chỉ dùng global concurrency. | Chưa có admission/semaphore tối thiểu nối lane budget với runner, verifier, browser, MCP và heavy process. |
| MCP idle-zero | `idle=true` chỉ dựa process/socket; CPU/RSS không có attribution; runner có thể nuốt lỗi ghi receipt. | Schema và predicate không cùng semantics; cleanup receipt chưa fail closed. |
| Composition/evals | Primitive tests mạnh nhưng public composition yếu; G1–G4 chủ yếu gọi kernel trực tiếp. | Chưa test actual CLI/package/install/host path và chưa có adversarial oracle chống false DONE/replay/stale identity. |
| Canonical state/history/CI | `.agent` mâu thuẫn executable truth; 284 commit; Quality đỏ; Certification chờ. | Progress receipts từng được coi mạnh hơn source/evidence và chưa có final remote convergence protocol. |

Root-Cause Gap được xử lý bằng causal map bắt buộc cho mọi defect load-bearing: symptom → canonical authority → host-neutral semantics → host mapping → install/migration → consumer observation → proof. Fix project-local không được phép claim harness-wide.

Terminality Gap được xử lý tại authority duy nhất; không được vá riêng renderer hoặc exit code mà bỏ qua closure/release/attestation/deactivation.

## 3. Semantics và public contract sẽ hội tụ

### Một terminal authority

Hội tụ reducer hiện có trong Evidence Ledger, acceptance audit, convergence và Closure Service thành một authority duy nhất; reducer cũ chỉ được xóa hoặc delegate, không giữ semantic riêng.

Public type canonical:

- `TrustedTerminalOutcome = PASS | PARTIAL | BLOCKED | FAILED | UNSUPPORTED | NEEDS_USER`.
- `PRE-EXISTING` chỉ là proof/evidence status, không phải terminal outcome.
- `TrustedTerminalDecision` chứa outcome, unresolved requirements, reason codes, bound evidence, và các quyền `release_eligible`, `closure_eligible`, `attestation_eligible`, `deactivation_eligible`, `compaction_eligible`.
- Thứ tự fail-closed: FAILED → NEEDS_USER → BLOCKED → UNSUPPORTED → PARTIAL → PASS.
- PASS chỉ khi mọi mandatory requirement có evidence hiện hành và đúng identity, reconciliation bắt buộc đều đạt, Proof Router xác nhận sufficient, acceptance/audit/convergence đạt, không có scope/policy violation và attestation đã đạt nếu contract yêu cầu.
- Terminal CLI exit 0 và từ "DONE/completed" chỉ được sinh từ PASS. Diagnostic/status/prepare có thể thực thi thành công nhưng phải dùng từ "PREPARED/STATUS", không claim task complete.

`north-star run`, queue runner, `close`, `closeout`, `certify`, release automation và result renderer đều nhận cùng `TrustedTerminalDecision`.

### Identity và trust

Mọi proof/closure/install receipt bind năm identity riêng:

1. Harness release/tree/package.
2. Installed projection.
3. Consumer repository.
4. Consumer candidate.
5. Host runtime/session/capability.

Cross-repo, cross-package, stale projection hoặc stale candidate replay phải fail. Consumer instructions được giữ nguyên làm business truth nhưng không thể vô hiệu core invariant, scope, permission, secret, evidence hay terminal policy.

### ExecutionDisposition và Definition of Done

- `ExecutionDisposition` chỉ quyết định `PLAN_ONLY | EXPORT_HANDOFF | LOCAL_EXECUTE`.
- `CompiledDoD` được compile độc lập từ claims, risk, release/install/migration/live scope và terminal obligations.
- `EXPORT_HANDOFF` giữ nguyên toàn bộ CODE/BEHAVIOR/RELEASE/TERMINAL cần thiết.
- FAST/NORMAL/HIGH-ASSURANCE là policy trong cùng runtime, không phải ba pipeline.
- Reviewer chỉ được kích hoạt khi deterministic proof thực sự không đủ.
- Giữ budget hiện hành: subagent mặc định 0, tối đa 2 và không recursion; repair tối đa 2 lần; timeout tối đa 1 giờ trừ contract hẹp hơn.

### Proof, skill, persistence và resources

- Tách Proof Router thành bước plan và complete trong cùng primitive hiện có: route trước execution, execute selected proofs, rồi đóng receipt gồm selected và omitted-with-reason.
- Full suite chỉ chạy khi architecture/dependency/security/migration/release risk hoặc final-candidate gate yêu cầu.
- Live claim bắt buộc live-fidelity proof.
- Skill authority: explicit request + RepoFacts + TaskFacts + phase + claim class + impact + risk + observed diff. Phrase chỉ là hint; mặc định không skill.
- Artifact class không còn bị quyết định chỉ bởi `evidence_required`. Durable evidence tối thiểu có thể tồn tại cho EPHEMERAL task mà không biến toàn bộ support state thành AUDITED.
- Lane controller tối thiểu dùng semaphore/lease: `read_search`, `research`, `writer`, `browser`, `verifier`, `mcp`, `heavy_process`; writer luôn serialize, expensive lane giảm trước khi có pressure.
- MCP idle-zero nghĩa là không còn harness-owned process, socket, lease, advertised provider, orphan hoặc schema exposure. CPU/RSS chỉ ghi khi có PID attribution; khi không có process thì ghi `NOT_APPLICABLE`, không bịa số 0.

### UX

Normal PASS:

```text
DONE

Changed:
- ...

Verified:
- ...

Remaining:
- none
```

Exception:

```text
NEEDS_USER

Decision required:
- đúng một quyết định/authority còn thiếu

Safe state:
- trạng thái đã bảo toàn và phần chưa mutate
```

Receipt IDs, 13-domain matrix và lifecycle internals chỉ hiện trong diagnostic mode.

## 4. Kế hoạch triển khai 9 phase

### P0 — Freeze successor contract và causal map

- Tạo plan canonical `terminal-harness-convergence-v1`, lưu nguyên văn prompt, requirement traceability và mapping đủ 13 domain, PF1–PF6, Terminality Gap và Root-Cause Gap.
- Classify plan hiện tại là superseded-compatible nhưng terminally invalid; dùng correction path để chuyển `terminal-harness-vnext` thành `SUPERSEDED/INACTIVE/PARTIAL`, không sửa thành PASS.
- CAS current pointer từ generation 32 lên 33; chỉ plan mới active.
- Ghi lại `EXPECTED_REMOTE_MAIN_SHA`; nếu remote đã đổi thì absorb/re-audit trước mọi mutation.
- Mỗi defect có causal map; cấm named-repo special case.

### P1 — Terminal authority, closure composition và portable transaction

- Trích authority canonical từ reducer hiện có; cập nhật runtime, CLI, lifecycle, release và renderer dùng cùng decision.
- Sửa `northStarRun` trả aggregate terminal decision; PARTIAL/FAILED/BLOCKED/NEEDS_USER/UNSUPPORTED đều không exit success hoặc hiện "completed".
- `close` phải load requirements/evidence/reconciliation/proof identities thật; bỏ `pending` synthesis và hard-coded old-plan correction.
- Compose đầy đủ candidate evaluation → stage → atomic commit → external attestation khi cần → CAS deactivate → compact/archive → final decision.
- Candidate đủ evidence nhưng chưa attested vẫn là PARTIAL với `attestation_eligible=true`.
- `closeout` và `certify` trở thành compatibility entrypoints gọi service canonical, không có reducer riêng.
- Dùng cross-platform atomic/fsync helper trong `secure-fs.ts`; replay bind hash của toàn bộ input, evidence và năm identities.
- Test Linux/macOS/Windows cho stage/commit/correction/crash/replay/input drift.

Sau P1, build/package candidate vào isolated harness home và dùng chính candidate này để điều khiển proof/admission cho P2–P8. Mỗi phase phải rebuild/reinstall exact package hash trước khi dogfood; không đợi cuối mới cài lại.

### P2 — Root-cause planning, autonomy, disposition và one-copy handoff

- Refactor `compileDoD()` để không nhận disposition làm nguồn depth.
- Sửa handoff luôn ghi `EXPORT_HANDOFF`, raw intent/hash, causal map, scope/invariants, forbidden effects, CompiledDoD, proof/live/install/cleanup obligations, repair budget và stop conditions.
- Empty-context worker không phải rediscover research đã freeze nhưng vẫn tự chọn implementation detail.
- Worker tự repair/retest impacted proof trong budget; hết authority/budget trả đúng NEEDS_USER/BLOCKED/UNSUPPORTED.
- Tạo fixture early-stop: worker dừng sau code/test nhưng thiếu install/live/closure phải fail.

### P3 — Wire Adaptive Proof Router và fact-driven Skills

- Tách `planProofRoute()` và `completeProofRoute()` trong Proof Router hiện tại; giữ `routeProofs()` làm composition helper.
- Runtime, resume, CLI `proof-plan`, handoff và provider flows đều dùng cùng route plan.
- Chỉ selected verifier được chạy; omitted proof có reason và invalidation condition.
- Failure chỉ reopen affected claims/proofs, trừ khi scope/risk mới buộc mở rộng.
- Chuyển Decision Fabric sang active default; legacy `routeSkills()` chỉ cung cấp candidate hints rồi đi qua typed facts/policy.
- Test cùng intent Việt/Anh cho kết quả semantic tương đương; phrase không được tự cấp dangerous/domain authority.
- Đo marginal value của skill; alias/facade chỉ xóa sau parity.

### P4 — Host-native mapping, package/install/migration và security

- Refresh capability contracts từ tài liệu chính thức hiện hành: Codex AGENTS, Codex subagents, Codex configuration, Codex MCP, OpenCode skills, OpenCode permissions, Claude hooks, Claude permissions, Cursor rules, Cursor permissions, Antigravity, Grok Build.
- Mỗi host contract ghi doc version/access date, native capability, fallback enforcement và live evidence riêng.
- Enforcement order: native permission/hook/sandbox → harness broker → isolated worktree transaction → BLOCKED.
- Prompt-layer rules không được coi là hard enforcement.
- Runtime installer phải chứng minh adapter → projection → package hash → install/upgrade → isolated host home → generic consumer session.
- G2 bảo toàn project-owned instructions/config; conflict với hard policy được surface chứ không overwrite.
- Secret redaction và path/effect policy áp dụng cho `.env`, credentials, host config, MCP output, logs và persisted artifacts.
- Live test hiện tại ưu tiên OpenCode. Codex chỉ LIVE_CERTIFIED nếu có current-session receipt hợp lệ; các host vắng mặt giữ static/NOT_LIVE_VERIFIED.

### P5 — Artifact boundary, resource lanes và MCP idle-zero

- Đưa admission vào các operational-write entrypoint của runtime/planner/handoff/evidence, không ép mọi filesystem write qua abstraction.
- EPHEMERAL task chỉ giữ terminal evidence tối thiểu; checkpoint/coordination/audit state xuất hiện khi có lý do hợp lệ.
- Operational state nằm ngoài tracked consumer source hoặc dưới ignored harness state; fresh repo không để lại "rừng" file.
- Thêm lane controller nhỏ với acquire/release trong `finally`, bounded queue và cancellation. Memory pressure giảm browser/heavy/MCP/verifier trước; Windows load unknown không bị coi là idle.
- Nối lane admission vào runner, verifier, browser, MCP và build/full-suite process.
- Sửa MCP receipt schema/predicate; lỗi tạo cleanup receipt phải fail closed.
- Test fresh, stale upgrade, crash, cancel, orphan/reparent, concurrent repos và no-MCP.

### P6 — Public composition, generic fixtures, adversarial tests và UX ablation

Bốn fixture canonical:

- G1: fresh unrelated repo, isolated host home, fresh package install, không có `.agent`; thực thi task nhỏ đến terminal và chứng minh source-clean/minimal residue.
- G2: existing repo có AGENTS/project config, gồm cả instruction cố waive verification; giữ business truth nhưng hard enforcement vẫn thắng.
- G3: stale harness-owned state/projection/MCP/ledger; upgrade và migration idempotent, archive residue cũ, rollback được.
- G4: sáu host với capability/enforcement khác nhau; tách static capability khỏi live certification.

Mandatory adversarial cases:

- PARTIAL không giống DONE; FAILED không exit 0; BLOCKED không hiện completed.
- Pending evidence không tạo PASS.
- EXPORT_HANDOFF giữ full DoD.
- Proof Router thật sự giảm verifier an toàn.
- Fake proof không thỏa live claim.
- Artifact admission không bị bypass.
- Cross-repo/cross-package/stale-candidate replay bị từ chối.
- Project instruction không tắt hard enforcement.
- Host unavailable không fake live certification.
- Closure crash/replay không deactive sai.
- Exact package/install identity phải khớp consumer proof.

One-copy test dùng frozen artifact với worker không có prior context. Nếu không có cheap provider thật, dùng closest fixture và ghi rõ empirical gap, không ghi LIVE PASS.

Mở rộng Eval Lab bằng intervention minutes, reopen-after-DONE, false-DONE, verification/useful-execution time, instruction/task tokens, duplicate proof và no-action turns. Chạy RAW HOST vs current harness vs candidate trên generic corpus; dogfood chỉ là sample.

Gate hiệu quả:

- False-DONE và reopen-after-DONE bằng 0 trên acceptance corpus.
- Verified/trustworthy success không giảm.
- Human intervention count/minutes không tăng.
- Giữ mục tiêu hiện có: duplicate reads/tool calls giảm 30%, S0/S1 context giảm 20%, không có p50 regression ngoài measurement noise.
- Subsystem tăng đáng kể latency/context/tool calls mà không thêm correctness/trust phải được đơn giản hóa hoặc retire.

### P7 — Simplification, generated parity, docs và canonical reconciliation

- Xóa/delegate duplicate terminal reducers, shadow skill authority, direct write bypass và compatibility code không còn caller.
- Không xóa legacy behavior trước behavioral/eval parity.
- Regenerate `generated/`, package projections, source-integrity manifests và host catalogs bằng canonical automation; không hand-edit.
- Đồng bộ schemas, CLI help, AGENTS/rules/docs với executable source.
- Chạy dedicated simplification review: duplicate authority, redundant proof/reviewer, host emulation có native equivalent, stale artifact/docs.
- Chỉ sau executable proof mới reconcile requirements, ledger, closure và pointer. Không requirement nào được đổi PASS bằng prose.
- Final state: plan inactive/terminal khi PASS; không stale ACTIVE/IN_PROGRESS, closure idempotent và exact identity-bound.

### P8 — Final verification, history rewrite, safe push và CI convergence

- Chạy targeted tests sau từng phase; full suite chỉ ở stable milestone và final candidate.
- Final local gates:
  - `npm run build`
  - `npm run check`
  - kernel, engine và CLI workspace tests
  - `npm test`
  - `npm run test:e2e`
  - package/runtime smoke, install/upgrade/doctor trong isolated homes
  - G1–G4, adversarial/composition và ablation
  - `npm run verify:all`
- Repo không có lint command canonical; không dựng thêm lint framework chỉ để tick box. Báo `lint: NOT_CONFIGURED`, còn static/type gates là `npm run check` và validators trong `verify:all`.

## 5. Coverage đủ 13 domain và 6 problem families

| Domain | Proof chính |
|---|---|
| A. Plan lifecycle & terminality | P0/P1/P7; pointer, ledger, closure và public decision đồng nhất |
| B. Root-cause planning | P0/P2; causal map và no symptom-only fix |
| C. Worker autonomy | P2/P6; one-copy, repair budget, early-stop rejection |
| D. Verification/evidence/closure | P1/P3/P6; bound evidence và terminal composition |
| E. Skills Fabric | P3/P6; typed facts, multilingual, default no skill |
| F. Rules/Skills/Policies/Profiles | P3/P4; precedence và explicit domain packs |
| G. MCP & capabilities | P5/G1/G3/G4; lease lifecycle và idle-zero |
| H. Context/intent/handoff | P0/P2; raw intent traceability và frozen handoff |
| I. Host adapters | P4/G4; native mapping, install và static/live split |
| J. Resource & speed | P5/P6; executable lanes và harness-tax ablation |
| K. Security/trust | P1/P4/G2; identities, secret/effect/scope enforcement |
| L. Artifact/compaction/GC | P1/P5/P7; admission, crash/resume, compact/archive |
| M. Evals/telemetry/retirement | P6/P7; generic corpus, ablation và removal parity |

Problem families:

- PF1 MCP idle-zero: P5 + G1/G3/concurrency/crash.
- PF2 deterministic output/domain leakage: G1/G2 negative checks và một fixture `5fedu` explicit activation.
- PF3 cross-host enforcement: P4 + G4, representative native/broker/worktree/unsupported paths.
- PF4 dogfood/one-copy workflow: candidate harness được dùng từ P1, generic empty-context worker ở P6.
- PF5 lifecycle/artifacts: P1/P5 + fresh/stale/resume/reopen proofs.
- PF6 release completion: exact package/install/live/closure/local/remote CI ở P7/P8.
- Terminality Gap: authority P1, DoD P2, adversarial public tests P6.
- Root-Cause Gap: causal map P0/P2 và chain proof qua arbitrary consumer trong P4/P6.

## 6. History rewrite và remote convergence

Do lịch sử 284 commit quá interleaved, dùng deterministic `git commit-tree`, không root interactive rebase và không tạo branch.

Trước rewrite:

- Record `PRE_REWRITE_REMOTE_SHA` và `FINAL_VERIFIED_TREE_SHA`.
- Tạo bundle phục hồi ở thư mục tạm ngoài repo, gồm `main` và tags; không push bundle.
- Dùng bảy audited chronological milestone tree:
  1. `e623f2b…` — portable harness foundation.
  2. `6ed279b…` — executable truth reset và durable runtime.
  3. `043a57b…` — Decision Fabric/context/routing.
  4. `4d7c862…` — adaptive proof/runtime lifecycle.
  5. `caab654…` — host/package/install/MCP convergence.
  6. `1109051…` — generic fixture và vNext acceptance foundation.
  7. `FINAL_VERIFIED_TREE_SHA` — terminal authority, closure, UX, eval/state convergence.
- Tạo chain mới bằng tree object thật, không invent source; commit cuối phải có tree hash đúng tuyệt đối.
- Update `refs/heads/main` atomically bằng expected old local SHA.
- Verify `git rev-list --count main == 7`, final tree equality, clean worktree và chỉ có branch main.
- Dành commit 8 cho CI-only correction nếu thật sự cần; mặc định squash vào commit 7. Commit 9 giữ trống.
- Giữ nguyên hai annotated tags lịch sử và báo rõ chúng vẫn giữ object cũ reachable ngoài `refs/heads/main`.

Safe push:

1. Refetch/query `refs/heads/main` ngay trước push.
2. So với `EXPECTED_REMOTE_MAIN_SHA`; nếu khác, dừng push, inspect/absorb thay đổi mới, rerun acceptance và thiết lập expected SHA mới.
3. Chỉ push `main:main` với lease chính xác:
   `--force-with-lease=refs/heads/main:<EXPECTED_REMOTE_MAIN_SHA>`.
4. Không dùng `--force`, multi-ref push, branch tạm hoặc PR.
5. Nếu xuất hiện remote branch mới, inspect unique commits, absorb nếu cần rồi mới xóa; không làm mất user work.

CI final:

- `Quality` là required và phải green trên exact remote SHA; P1 xử lý lỗi `EISDIR`.
- `Certification` phải kết thúc hữu hạn. Hosted job chỉ schedule self-hosted live matrix cho runner được phát hiện online; host/runner thiếu sinh `NOT_LIVE_VERIFIED`, không PASS. Host được phát hiện nhưng probe lỗi làm workflow fail.
- Record `REMOTE_FINAL_SHA`, chờ toàn bộ required checks của đúng SHA đến terminal.
- Code/config failure phải root-cause và sửa; transient retry chỉ khi có evidence.
- Sau CI fix: rerun targeted + full local gates, giữ history ≤9, refetch lease mới và force-with-lease lại.
- Hoàn tất khi local main SHA = remote main SHA, remote chỉ có main, exact-SHA Quality/Certification policy đạt và không còn pending required check.

## 7. Những thay đổi không được thực hiện

- Không thêm domain 14, lifecycle/proof/reviewer/policy framework mới.
- Không hard-code `agent-rules`, `5fedu` hoặc named consumer làm canonical target.
- Không để harness chọn/override provider hoặc model của operator.
- Không weaken/skip/delete verification để làm green.
- Không biến static documentation thành live certification.
- Không overwrite project-owned business instructions hoặc user-owned host/MCP config.
- Không global-enable managed MCP.
- Không hand-edit `generated/`.
- Không tạo branch, PR, backup ref hay push trung gian.
- Không xóa tags hoặc unique remote work nếu chưa chứng minh an toàn.
- Không yêu cầu operator làm routine reinstall, repair scheduling, closure, history cleanup hoặc CI triage mà harness có thể tự làm.

## 8. Terminal acceptance và báo cáo cuối

Chỉ DONE khi đồng thời đạt:

- Một terminal authority điều khiển CLI, DONE, release, closure, attestation, deactivation và compaction.
- Closure composition thật sự terminal và cross-platform.
- Export handoff giữ full DoD; generic worker hoàn tất hoặc trả precise blocker.
- Adaptive Proof Router và fact-driven Skills chạy trên production path.
- Host semantics đi qua package/install/migration tới arbitrary consumer.
- Artifact admission, lanes và MCP lifecycle có executable effect.
- G1–G4, one-copy, adversarial/composition và 13-domain audit đều đạt.
- Không có false PASS, stale active plan hoặc identity replay.
- UX gọn, operator toil không tăng và không có harness-tax regression rõ ràng.
- Local canonical verification green.
- `main` có 7 commit mặc định, tuyệt đối không quá 9; final tree bằng verified tree.
- Remote chỉ có `main`; local/remote SHA bằng nhau.
- CI required của exact rewritten SHA terminal và green theo static/live policy trung thực.

Báo cáo cuối chỉ gồm STATUS, final SHA, remote equality, commit list, major changes, UX improvement, local/generic/cross-host/adversarial verification, exact-SHA CI, host chưa live-verified và residual risk/blocker thực tế.
