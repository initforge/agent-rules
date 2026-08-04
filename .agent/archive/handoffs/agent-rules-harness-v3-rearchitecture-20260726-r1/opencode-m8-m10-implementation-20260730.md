# OPENCODE IMPLEMENTATION — HÀNH TRÌNH LIÊN TỤC M8 → M9.5 → M10

Trả lời/checkpoint bằng tiếng Việt. Đây là execution authorization của owner.
Đọc scaffold artifact mới nhất trước:

`/home/linhnx/Projects/agent-rules/.agent/handoffs/agent-rules-harness-v3-rearchitecture-20260726-r1/opencode-m8-m10-context-ready.md`

Không restart từ zero. Filesystem, git worktrees, immutable plan, WorkLedger,
shadows, receipts và fresh command output là nguồn sự thật. Prompt này không
thay thế `original.md` hoặc AM-0015.

## Vai trò bắt buộc

### Main OpenCode agent

- Chỉ orchestration, DAG/critical-path scheduling, inspect diff, reconcile,
  integrate, checkpoint và milestone/terminal decision.
- Không tự author production source/test khi writer native có thể làm.
- Không review output do chính main hoặc writer vừa tạo.
- Một integration owner duy nhất.

### Native worker routing

- **Luna**: lệnh lặt vặt, mechanical edit, fixture nhỏ, command/check đơn giản.
  Nếu runtime không expose Luna, dùng model rẻ nhất khả dụng và ghi
  `routing_fallback` trong receipt; không giả Luna.
- **Sol medium**: chỉ blocker khó/critical hoặc cùng failure signature lần
  thứ hai; không dùng cho review thường.
- **Terra high**: independent reviewer/QA/reconciliation; reviewer không được
  review output của chính mình.
- Writers luôn có owned paths, branch/worktree riêng, AC và verify commands.
- Không tạo recursive uncontrolled subagent tree.

## Execution topology

Áp dụng `CLUSTERED_NATIVE_SWARM` + rolling ready queue:

- Dispatch tối đa tập conflict-free/resource-safe đang ready.
- Cluster theo subsystem/contract/rollback boundary, không chia micro-task
  vô nghĩa và không tạo mega-task không review được.
- Separate writer, reviewer, focused-test, browser/visual, security,
  full-suite và integration roles.
- Worker receipt → independent verification → reconciliation → integration.
- Rebase/integration thay đổi snapshot thì invalidate evidence cũ.
- Failure cùng signature lần 3: redesign/fresh writer/best-of-N, không lặp mù.
- Governor quan sát available RAM, swap, descendant RSS, CPU temperature,
  browser/tool count, provider limits và orphan process.

## M8 critical path — làm ngay

1. Kiểm tra original + AM-0012…AM-0015 hashes và ledger state.
2. Rescue/fingerprint mọi candidate; không xóa dirty work.
3. Đóng installer integrity:
   - trust-boundary test được CI gọi thật;
   - mọi executable script installer gọi có integrity coverage;
   - manifest hash được verify runtime trước execute;
   - Python dependencies có pin/hash và CI cài reproducibly.
4. Đóng browser verification:
   - server startup không giữ pipe;
   - timeout/process-group cleanup trong `finally`;
   - không orphan server/browser;
   - focused browser-qa chạy hai lần trên clean process tree;
   - full CP build/typecheck/test pass.
5. Sinh scorecard từ evidence thật cho đủ 18 dimensions; không hand-edit
   score 0 thành pass. Mọi dimension có score, evidence URI/hash, reviewer,
   finding và exact snapshot.
6. Sửa scorecard schema drift, parity fixture stale, docs links và ESM import
   nếu fresh verification còn báo.
7. Chạy local build, typecheck, unit/integration, schema, Python, security,
   browser/accessibility/visual và certification trên một exact candidate.
8. Chạy Terra high independent review trên stable snapshot. Repair pack phải
   bounded; review lại bằng identity khác.
9. Reconcile trực tiếp với original + approved amendments. M8 chỉ pass khi:
   - 18/18 dimensions ≥8;
   - zero Critical/High;
   - all effective requirements MATCH/SUPERSEDED;
   - fresh local + GitHub evidence;
   - installer/doctor/rollback + fixture/local smoke pass.

## M8 push, squash và install

Sau khi candidate M8 được independent ACCEPT:

1. Push candidate lineage vào temporary remote ref để có CI evidence.
2. Record remote refs, candidate SHA/tree, CI URLs, worktrees và dirty rescue.
3. Tạo annotated archival tag cho old `main`/successor/candidate/effective hash.
4. Tạo Git bundle chứa pre-rewrite refs, SHA-256 bundle và restore drill.
5. Independent Terra high review history rewrite.
6. Reconstruct **chỉ lịch sử `main`** thành khoảng 4–6 semantic commits,
   không squash worker branches. Tree sau rewrite phải byte-identical candidate.
7. Cập nhật/push `main` bằng expected-old-SHA protection,
   ưu tiên `--force-with-lease=refs/heads/main:<expected-old-sha>`.
8. Vì rewrite làm evidence cũ stale, chạy lại toàn bộ local + GitHub CI,
   reconciliation, security, browser, installer/doctor trên SHA mới.
9. Install đúng artifact của rewritten `main`, verify hash/doctor/smoke fixture
   và representative local project.
10. Chỉ lúc đó ghi:

```text
MILESTONE_8_INTERNAL_READY
```

Sau marker này không dừng và không hỏi owner.

## M9.5 — tự động tiếp tục

Dùng installed M8 harness để dogfood. Mọi finding thành anchored repair slice.
Đóng tới khi mọi dimension ≥9.5:

- zero Critical/High/release-blocking Medium;
- 3 consecutive non-flaky GitHub quality/certification cycles;
- crash/cancel/timeout/resume/rollback/cache-corruption/plan-tamper/
  shadow-drift/stale-review/provider-failure/thermal tests;
- real Control Plane data, responsive/light/dark/reduced-motion/offline/error
  states, accessibility, visual and taste review;
- maintainability/giant-module/duplicate-automation closure;
- bounded parallel load with resource/token/provider telemetry;
- clean install/upgrade/rollback/reinstall.

Push rewritten `main` milestone only after fresh exact-SHA gates, then emit:

```text
MILESTONE_9_5_RELEASE_HARDENED
```

Tiếp tục M10 ngay.

## M10 — terminal

Không dừng cho tới khi:

- 18/18 dimensions =10 bằng fresh evidence;
- effective requirements chỉ MATCH/SUPERSEDED;
- zero open finding bất kỳ severity nào;
- fresh independent architecture/security/maintainability/UX/terminal reviews;
- 3 real-project dogfood runs, gồm long/resumable + injected-failure recovery;
- scheduled/repeated CI/certification burn-in xanh;
- clean-checkout deterministic release + install/doctor/rollback/reinstall;
- rewritten `main` là newest complete implementation;
- chỉ còn branch `main` local/remote;
- không orphan process, split-brain ledger, stale evidence hoặc synthetic host
  attestation.

Push final `main` sau fresh final gate và emit duy nhất:

```text
HARNESS_V3_10_OF_10_COMPLETE
```

## Stopping policy

Không kết thúc bằng phần trăm, `PARTIAL`, `CERTIFIED_READY_FOR_REVIEW`, receipt
của một worker, M8/M9.5, hoặc danh sách residual có thể tự sửa. Chỉ dừng vì
credential/account/hardware/protected-branch/external service thật sự không thể
self-provision, hoặc owner intent mâu thuẫn repo truth và cần amendment.

Trước khi báo blocker phải:

- hoàn thành mọi task độc lập;
- persist checkpoint/shadows qua engine;
- ghi finding/evidence exact;
- không giả pass để vượt gate.

## Required final report

```text
HARNESS_V3_10_OF_10_COMPLETE
Final main HEAD: <sha>
Original: c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31
Effective: <sha>
Fitness: 18/18 dimensions = 10
Requirements: MATCH/SUPERSEDED only
Open findings: 0
GitHub CI/certification: fresh same-HEAD URLs
Installed artifact: hash + doctor + rollback + reinstall
Dogfood: >=3 projects + long/resume + injected recovery
History archive: tag + bundle SHA-256 + restore proof
Branches/worktrees: main only
Resource/orphan/thermal check: PASS
```
