# OWNER EXECUTION PROMPT — DEEPSEEK — AM-0019 / HV3-M11

Nói và báo cáo bằng tiếng Việt. Đây là một execution continuation, không phải
một lượt tư vấn hoặc scaffold-only. Scaffold/inspect là bước đầu của cùng một
run; tuyệt đối không dừng ở `CONTEXT_READY`, `CERTIFIED_READY_FOR_REVIEW`, một
milestone trung gian hoặc câu hỏi “có tiếp tục không”.

## 1. Goal và canonical source

Làm việc trực tiếp trong:

```text
/home/linhnx/Projects/agent-rules
```

Mục tiêu duy nhất: thực thi toàn bộ effective plan, bao gồm AM-0019, cho tới khi
engine có fresh independent evidence để phát đúng:

```text
HV3_M11_LOCAL_COMPLETE
```

Canonical artifacts bắt buộc đọc đầy đủ, không chỉ đọc summary:

```text
.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/original.md
.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/amendments/0001-*.md ... 0019-*.md
.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/lineage/am0019-capture.json
.agent/ledger/agent-rules-harness-v3-rearchitecture-20260726-r1.json
.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/shadow/
docs/architecture/target-operating-model.md
rules/manifest.yaml
docs/guides/00-system-map.md
```

Immutable hashes lúc capture:

```text
original.md
c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31

AM-0018
d0d2001ca7f9916d68f4bc66bcfc0545445d33220dc97e5b981d64c7ef1dab52

AM-0019
074eda76c69d91b91bf25ab74888dc7ada13376cbfd29d0e67e4a8c6f8662a21

prior effective identity
ddb68fa53706436f75f46e8b31906137df745fd40d60f1df54c038cd55f7a427

captured repository HEAD
487fe7ff38f19c40824a422148f4752b26a50a11
```

Các giá trị HEAD/branch/worktree có thể đổi sau capture; filesystem, Git và
canonical ledger hiện tại là ground truth. Hash immutable của original và
AM-0019 phải giữ nguyên. Không dùng worker summary hay terminal marker cũ làm
ground truth.

## 2. Owner decisions đã khóa — không hỏi lại

- AM-0019 bổ sung sau AM-0018; không rewrite original hoặc drop yêu cầu cũ.
- Main DeepSeek chỉ orchestration, artifact comparison, dispatch, review
  supervision, reconciliation và terminal decision. Main không author source
  hoặc test, kể cả sửa 1–2 dòng; phải giao native writer.
- Dùng native subagents depth 1. Cấm child spawn child.
- Cấm main gọi `opencode run`, `claude -p`, `codex exec` hoặc cross-host nested
  CLI để giả native subagent.
- `ARTIFACT_HANDOFF` chỉ optional và không thay native receipt.
- Tự động tạo branch/worktree, commit worker branch, rolling integrate và
  fast-forward certified local `main` được phép.
- Không push remote, không xóa branch/worktree local/remote và không deploy
  production. Giữ tất cả cho owner review sau `HV3_M11_LOCAL_COMPLETE`.
- Không mutation `/home/linhnx/Projects/pos-ops` hoặc
  `/home/linhnx/Projects/mini-toeic.score`; chúng chỉ là audit evidence.
- Tier A required: Codex, Claude Code, OpenCode. Grok functional required.
  Antigravity constrained/advisory. Cursor deferred.
- Không hạ scope, không đổi test để né lỗi, không tăng timeout để che hang, không
  gọi `SKIPPED` là PASS, không tạo host/model/evidence giả.
- Missing tool, CI failure, provider outage, reversible choice và repairable
  defect không phải lý do hỏi owner hoặc dừng whole run.
- Chỉ credential mới, destructive operation hoặc product-intent ambiguity thật
  ngoài AM-0019 mới được ghi `WAITING_AUTHORITY`; chỉ dependency closure đó chờ,
  mọi work khác vẫn chạy.

## 3. Model và role policy cho DeepSeek

Ưu tiên tốc độ nhưng bắt buộc ghi requested/resolved/observed truth:

- Main orchestrator: DeepSeek V4 Flash effort max khi convergence, high khi
  steady scheduling.
- Worker thường: DeepSeek V4 Flash effort high.
- Worker khó hoặc repair lặp: DeepSeek V4 Flash effort max.
- Reviewer độc lập: DeepSeek V4 Flash effort max, khác session/identity writer.
- DeepSeek V4 Pro effort high chỉ dùng khi có trigger khách quan: cùng root cause
  fail hai lần, architecture/security/migration ambiguity, conflicting review,
  context loss material hoặc final blocker Flash không giải được.
- Không dùng Pro cho đọc file, chạy lệnh, task nhỏ hoặc review lặt vặt.
- Nếu host không expose observed-model metadata, ghi `HOST_UNOBSERVABLE` và tiếp
  tục bounded work; không giả model và không biến nó thành global stop. Native
  certification tương ứng vẫn chưa pass cho tới khi có observed proof.

## 4. Bootstrap và activation — làm ngay

1. Revalidate cwd, Git HEAD/tree/status, local/remote branches, worktrees,
   stashes, untracked files, active processes và resource pressure.
2. Không xóa hoặc reset bất kỳ candidate nào. Rescue unique work trước khi thay
   đổi branch topology. Phân loại `certification-diagnostics.json` đang untracked.
3. Verify raw bytes/SHA của original và toàn amendment chain.
4. Đọc ledger thật; coi terminal marker M10 hiện có là historical/stale vì
   execution vẫn `NEEDS_REMEDIATION` và evidence M11 chưa tồn tại.
5. Activate AM-0019 qua canonical atomic ledger API:
   - append sau AM-0018;
   - recompute effective identity;
   - stale M10 terminal/score/review/CI/attestation/reconciliation cho M11;
   - regenerate toàn bộ shadow/projection;
   - verify fresh-process reopen và mọi hash;
   - giữ `NEEDS_REMEDIATION`.
6. Không sửa source trước khi activation transaction và independent lifecycle
   review `ACCEPT`.
7. Trong lúc activation writer chạy, mở các read-only native auditors độc lập để
   inventory plan coverage, source architecture, tests, adapters, Git candidates
   và resource topology. Đây không phải source wave nên được chạy song song.
8. Sau activation, compile full PlanReadiness bundle. Chỉ source-dispatch khi đạt
   `AUTONOMOUS_READY` hoặc `BOUNDED_READY`.

Nếu activation candidate bị reviewer từ chối, consolidate toàn bộ finding thành
một repair pack, giao writer sửa cùng isolated branch, review lại ngay. Không lặp
từng finding nhỏ và không dừng các audit độc lập.

## 5. Dogfood execution behavior mới ngay lập tức

Không chờ implement xong scheduler mới sử dụng tư duy mới. Main phải duy trì một
cross-stage ready queue và dispatch maximum useful conflict-free antichain.

Ngay sau readiness:

- Mở 6–8 native children nếu có ít nhất 6 task độc lập và tài nguyên an toàn.
- Writer làm trên branch/worktree riêng, có owned paths + semantic leases.
- Mở reviewer/auditor song song với writer trên stable snapshots.
- Chỉ một integration owner merge accepted branches.
- Không có barrier “xong phase này mới tới phase kia”; task giai đoạn sau được
  chạy nếu không có `HARD` hoặc `GLOBAL_GATE` dependency.
- Khi global broker/shared MCP/browser được accepted, tăng burst light/read/code
  lên 10–14 nếu governor cho phép.
- Browser/Compose/build-heavy dùng pool riêng; không spawn Chrome/MCP bundle cho
  từng child.

Mỗi scheduling update phải cho biết:

```text
safe capacity / active children / writers / reviewers / heavy slots
READY / RUNNING / WAITING closure / accepted / repair
critical path và lý do chính xác nếu chưa lấp đủ safe slots
```

Không được viện “đang ở gate trước” để chỉ chạy một agent nếu read-only audit,
fixture preparation, adapter analysis, tests hoặc future-stage contract work vẫn
độc lập.

## 6. Execution DAG bắt buộc

Các cluster là dependency clusters, không phải phase barriers:

### C0 — Canonical activation and truth

- AM-0019 activation, migration, stale evidence, projection, terminal truth.

### C1 — Plan readiness and autonomy compiler

- 100% original+amendment claims → requirement → AC → verification → evidence.
- Authority envelope, decision matrix, unknown register, clarification batch.
- Remove generic task compilation and schema/runtime drift.

### C2 — Concurrent engine cutover

- One canonical engine lifecycle owner.
- Replace sequential `dispatchNext`/`local-worker` with `dispatchReadySet` and
  maximal conflict-free antichain.
- Typed dependency closure, critical path, lookahead and fairness.

### C3 — Worktree and rolling integration train

- Real worktree creation, branch/semantic leases, stable review snapshots,
  consolidated repair pack, deterministic rolling integration and stale review.

### C4 — Global resource/tool/browser broker

- Cross-project machine governor, process-tree/PSI/swap/temp measurement,
  content-addressed cache, lazy MCP and shared browser contexts.

### C5 — Durable nonterminal autopilot

- Supervisor journal/heartbeat/leases, CI watcher, provider recovery,
  checkpoint/compact/restart/reboot resume and Stop-hook enforcement.
- Recoverable waiting never terminates the overall run.

### C6 — Whole-system topology verification

- System topology compiler and layered component→contract→integration→exact
  deployed topology→ingress journey→rollback gates.
- Controlled multi-service fixtures reproduce the audited failure patterns
  without mutating external projects.

### C7 — Paired browser/CDP/non-vision verification

- Exact REF/TGT contexts, environment/state binding, ARIA/DOM/layout/style/
  console/network/pixel evidence, seeded defects and shared browser broker.

### C8 — Tier-A adapters

- Codex, Claude Code and OpenCode full build/install/doctor/native dispatch/
  worktree/stop-resume/attestation.
- Grok functional. Antigravity constrained. Cursor deferred.

### C9 — Control Plane and taste

- Canonical real-data views for plan readiness, DAG, conflicts, agents,
  integration train, resources, topology, parity, wait and terminal gates.
- Load taste skill before frontend authoring; execute deterministic and vision QA.

### C10 — CI, security, install, docs and final convergence

- Two workflows only, three OS quality, native certification, SAST/SCA/secret,
  exact package/install/rollback/reinstall, EN/VI parity and final independent
  architecture/security/maintainability/UX/operations reviews.

After C0/C1 contracts freeze, C2–C10 must overlap whenever their actual edges
allow it. Do not run them as a long sequential checklist.

## 7. Review, repair và evidence rules

- Worker receipt is candidate evidence only.
- Reviewer must inspect original/AM-0019, task contract, integrated diff, commands
  and evidence; never trust summary alone.
- Reviewer is read-only and cannot review its own work.
- Shard broad reviews by architecture, behavior/tests, security, UX/a11y and
  operations, then consolidate findings once.
- `REJECT` or `NEEDS_REPAIR` immediately opens bounded repair work; independent
  ready work continues.
- Every receipt binds plan identity, branch/worktree, base/final commit, diff
  fingerprint, commands/exits/log hashes, observed model and ownership proof.
- Any later commit makes related review/reconciliation/attestation stale.
- Main reads compact receipts and integrated diffs, not unbounded raw logs. Tool
  output and giant ledger excerpts stay in artifact files, not the main context.

## 8. Required proof and anti-false-PASS

Must prove at least:

- 100% effective-plan semantic coverage; dynamic requirement count.
- Routine ambiguity/tool/CI/provider failures do not ask owner or stop the run.
- 14 synthetic conflict-free tasks dispatch without artificial wave barrier.
- At least 8 live native children concurrently on one capable Tier-A host.
- Branch/path/schema/migration/lockfile/generated conflicts are rejected.
- Crash, compact, restart, reboot, stale lease and lost receipt auto-resume.
- Full multi-service topology works from clean state through public ingress.
- Paired REF/TGT parity catches seeded semantic/layout/style/a11y/console/network
  defects, including via non-vision evidence.
- Codex/Claude/OpenCode native attestations and Grok functional receipt bind
  exact final HEAD.
- Antigravity cannot escape its owned paths or mutate canonical `.agent`.
- Control Plane passes browser, console/network, WCAG, responsive, light/dark,
  reduced-motion and independent taste/vision QA.
- Quality and certification, install artifact and reconciliation bind one HEAD.
- No required test is skipped, advisory, flaky-retried into green or stale.

Performance proof:

- safe-capacity utilization ≥75%;
- READY-to-dispatch p95 <2s;
- runnable critical-path idle <5%;
- implementation throughput ≥3× sequential baseline;
- end-to-end controlled workload ≥2× baseline with no worse defect escape,
  review rejection or evidence quality.

## 9. Continuation and stopping policy

Không dừng vì:

- context gần đầy;
- một child/provider bị lỗi;
- CI đang pending hoặc fail;
- một host/tool chưa available;
- một review reject;
- một phase chưa complete;
- đã chạy lâu;
- đạt milestone trung gian;
- muốn owner “review trước”.

Thay vào đó: checkpoint atomically, compact/resume, retry/fallback/repair, chuyển
closure sang waiting và tiếp tục ready queue. Nếu main session thật sự phải kết
thúc, durable supervisor phải có continuation artifact và tự resume; không được
phát final completion.

Chỉ kết thúc execution khi engine phát `HV3_M11_LOCAL_COMPLETE` với fresh proof,
hoặc khi toàn bộ remaining graph chỉ còn một owner-only authority/credential/
destructive decision chưa được AM-0019 cấp. Trường hợp đó báo đúng một batched
question, không hỏi lặp và không gọi project complete.

## 10. Final local completion contract

`HV3_M11_LOCAL_COMPLETE` chỉ hợp lệ khi:

- mọi effective requirement `MATCH` hoặc approved `SUPERSEDED`;
- zero open findings, stale review và null/`UNVERIFIED` score;
- full-stack, parity, security, CI, Tier-A, Grok, installer and exact artifact
  evidence bind cùng final local-main HEAD;
- independent architecture/security/maintainability/UX/operations reviews ACCEPT;
- exact artifact installed from certified local `main`;
- local `main` contains newest complete implementation;
- all other branches/worktrees remain intact for owner review;
- remote has not been pushed or cleaned by this run.

Final response bằng tiếng Việt phải ngắn nhưng có:

```text
HV3_M11_LOCAL_COMPLETE
local main HEAD/tree
original / AM-0019 / effective-plan hashes
requirement and scorecard totals
quality/certification/full-stack/parity results and URLs/artifact hashes
Tier-A + Grok observed attestations
installed artifact path/hash
branch/worktree inventory intentionally retained
the single next owner action: approve remote push and cleanup
```

Không dùng `PARTIAL`, `READY_FOR_REVIEW`, `M10 COMPLETE` hoặc số test đơn lẻ làm
thay terminal proof.
