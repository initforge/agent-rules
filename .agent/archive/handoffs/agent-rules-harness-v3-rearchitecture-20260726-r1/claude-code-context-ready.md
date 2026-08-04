# CONTEXT READY — Harness v3 + AM-0015 delta

Plan ID: `agent-rules-harness-v3-rearchitecture-20260726-r1`

Thời điểm preflight: 2026-07-29. Phạm vi: chỉ đọc source/test; chỉ artifact này được tạo.

## 1. Xác minh hash và canonical truth

`sha256sum` đã xác minh trực tiếp:

| Artifact | SHA-256 | Kết quả |
|---|---|---|
| `original.md` | `c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31` | MATCH |
| AM-0012 | `2147aa9631fab0aab10a1e81b7339ba1b1b420d57080d2ef99bf2a88674b41a2` | MATCH |
| AM-0013 | `a8989935c5e0b188b42279b19b167ffad6458d39a17ecad5397ef29301433f0b` | MATCH |
| AM-0014 | `951fe2028c3ed6db85530979ec910ed8fc14a7a5dfb041bb829da2f5e41fa209` | MATCH |
| AM-0015 | `e6482360189a653ef2a3c5074162f75e5376f2e266062f38615fdfa34b32fbc3` | MATCH; `OWNER_APPROVED_PENDING_ACTIVATION` |

Canonical `main` sạch tại `67e7b8bb0e6c1a400bb2b43bca2fa8d15c9447d6`, khớp `origin/main`. Integration baseline: `8631ff31bac48ac357a569e2a72c234c6f9ec232` trên `integration/harness-v3-certified`.

Ledger canonical: `NEEDS_REMEDIATION`, revision 46, amendment chain hiệu lực chỉ đến AM-0011. AM-0012–AM-0015 là owner-approved pending activation. Shadow hiện tại là projection lịch sử; không được sửa tay. Không có accepted host attestation hoặc CI check cho successor hiện tại.

## 2. Candidate inventory và fingerprint

Có 13 registered worktree. Mọi candidate phải được review theo exact snapshot; test pass hoặc receipt cũ không tự tạo ACCEPT.

| Worktree | Branch | HEAD | Fingerprint / changed paths chính | Cluster |
|---|---|---|---|---|
| `/home/linhnx/Projects/agent-rules` | `main` | `67e7b8b` | sạch | baseline |
| `agent-rules-supervisor-wave` | `integration/harness-v3-certified` | `8631ff3` | 19 modified/untracked: supervisor, context cache, host attestation, OpenCode adapter/runner, telemetry, workflows/tests | C1–C3 integration candidate |
| `agent-rules-ns0-activation` | `qwen/ns0-am0012-activation` | `8631ff3` | 2 untracked: `ledger-activation.ts` + test; v13 facade | C0 |
| `agent-rules-ns0-transaction` | `qwen/ns0-transaction-modules` | `8631ff3` | 4 untracked: secure filesystem + transaction modules/tests | C0 |
| `agent-rules-ns0-semantics` | `qwen/ns0-semantics-modules` | `8631ff3` | 4 untracked: semantics + deterministic projection modules/tests; `node_modules` là dependency output | C0 |
| `agent-rules-5fedu-wave` | `codex/harness-v3-5fedu-wave` | `fa85b8a` | khoảng 60 tracked changes + untracked dependency/source/test; 5fedu router, profile, taxonomy, installer | C5 |
| `agent-rules-ci-wave` | `codex/harness-v3-ci-wave` | `fa85b8a` | 5 tracked changes; certification/quality workflow, terminal gate | C3 |
| `agent-rules-cli-wave` | `codex/harness-v3-cli-wave` | `fa85b8a` | 5 modified + 7 untracked; plan lifecycle/CLI/contracts/tests | C0/C2 overlap |
| `agent-rules-controller-wave` | `codex/harness-v3-controller-wave` | `fa85b8a` | 5 tracked changes; controller/verifier/long-task | C1/C3 |
| `agent-rules-cp-wave` | `codex/harness-v3-cp-wave` | `fa85b8a` | 8 modified + 3 untracked; Control Plane UI/schema/tests | C4 |
| `agent-rules-opencode-wave` | `codex/harness-v3-opencode-wave` | `fa85b8a` | 2 modified + 2 untracked; OpenCode/platform packaging | C2 |
| `agent-rules-qa-supervisor` | `codex/harness-v3-qa-supervisor` | `fa85b8a` | sạch; placeholder/review workspace | C3/C4 preparation |
| `agent-rules-deepseek-20260727-032602` | `deepseek/harness-v3-continuation-20260727-032602` | `fa85b8a` | legacy continuation; stale ledger/shadow context; rescue history phải giữ | rescue/review trước phân loại |

Untracked source/test tồn tại ở C0, CLI, Control Plane và integration candidates. Dependency output gồm `node_modules`, package locks và fixture-local `.agent`; phải tách khỏi candidate source khi lập snapshot. Không cleanup worktree/branch nào an toàn trước rescue/review.

## 3. Cluster map, dependency DAG, conflict graph

| Cluster | Scope | Candidate chính | Dependency thật |
|---|---|---|---|
| C0 | immutable plan lifecycle, activation, ledger transaction, deterministic shadows | ba `ns0-*`; CLI lifecycle overlap | không; source barrier |
| C1 | native scheduler, conflict leases, containment, RAM/thermal governor | supervisor/context-cache, controller | activated C0 identity |
| C2 | execution modes, plan recognition, artifact handoff, bỏ live cross-host control | OpenCode, CLI/platform/router | activated C0 identity |
| C3 | verification shards, review/repair, integration train, CI truth | controller/verifier, CI, attestations | activated C0 identity |
| C4 | Control Plane real-data, plan visualization, accessibility, browser/visual QA | `cp-wave` | activated C0 identity |
| C5 | 5fedu migration, taxonomy, installer/runtime mirrors, docs/cleanup | `5fedu-wave` | activated C0 identity |

DAG cluster: `C0 activation` mở source dispatch cho `C1 || C2 || C3 || C4 || C5`; C1–C5 không serialize theo số. Critical path: review/reconcile ba C0 snapshot → tích hợp transaction + semantics + facade → focused verification + independent review + repair → ACCEPT → single-owner import → atomic activation AM-0012, AM-0013, AM-0014, AM-0015 → regenerate shadows → rolling ready queue C1–C5.

Semantic conflict graph:

- C0 facade ↔ transaction ↔ semantics: cùng ledger activation contract, filesystem atomicity, effective identity và shadow projection.
- C0 ↔ CLI lifecycle: public plan/ledger contracts.
- C1 supervisor ↔ C3 controller/verifier: scheduling, process lifecycle, receipt validity.
- C2 OpenCode ↔ C1 supervisor: child control, artifact handoff, process containment.
- C3 CI/terminal gate ↔ C0 ledger/attestation: certification truth schema.
- C4 Control Plane ↔ C0/C3 schemas: ledger/read-model/verification data.
- C5 router/installer ↔ C2 CLI/platform: runtime mirrors, profile recognition.

Writer lease phải loại trừ overlap path, symbol, public contract, behavior contract. “Wave chưa xong”, review lag, cluster ID và file-count không phải source barrier. Barrier thật duy nhất trước mutation ngoài C0: activated effective-plan identity.

## 4. Receipt/review map

| Receipt/review | Trạng thái fingerprint |
|---|---|
| `REV-P0-F0-001`, `REV-F1-R10-001`, `REV-P1-R3A3-001`, `REV-P1-R3B-R3-STABILIZATION-001`, `REV-P1-R3C-R1A-001`, `REV-P1-R3C-R1B-STABILIZATION-001`, `REV-P1-R3C-R2-R1-001`, `REV-P1-PARITY-V3-01-R2-001`…`04-001`, `REV-R39-LEDGER-INTEGRITY-001` | lịch sử MATCH/PASS trên snapshot được ghi; không chứng nhận candidate dirty hiện tại |
| `REV-P1-R2C-001` | stale; V2/V3 conflict, superseded bởi clean break |
| `REV-P1-PARITY-V3-05-R1-001` | stale; superseded bởi ASN06-R2 |
| `REV-P1-PARITY-V3-06-001`, `REV-P1-PARITY-V3-07-R1-001` | stale; shared validator đổi sau receipt |
| `REV-P1-PARITY-V3-08-001` | partial; còn 2 finding |
| V13 C0 facade review | interrupted/không ACCEPT; có Critical/High correctness và security findings |
| C0 transaction + semantics | missing final integrated review receipt; bị interrupt |
| `supervisor-wave` | interrupted dirty workspace; receipt cũ không fingerprint 19-path snapshot |
| legacy DeepSeek/shadows | stale workspace/revision; chỉ dùng rescue evidence |

Kết luận: chưa có receipt hợp lệ để ACCEPT ba C0 candidates hoặc integrated current snapshot. Cần fingerprint mới theo HEAD + tracked diff + untracked source/test + dependency exclusion.

## 5. Resource preflight

Live read-only preflight, refreshed for AM-0015:

- RAM: 15 GiB total; 4.9 GiB available, khoảng 32%; trên ngưỡng 25% nhưng không còn nhiều headroom.
- Swap: 15 GiB total; 1.7 GiB used; có memory pressure cần theo dõi.
- CPU package: 88°C; thuộc 85–89°C, cấm scale-up và ưu tiên read-only work.
- Không dispatch heavy test/browser; giảm pool cho tới khi có hai mẫu dưới 80°C và swap ổn định.
- Audit lịch sử: từng đạt khoảng 100°C do native agents × concurrent tests × Vitest fan-out × orphan descendants. Governor candidate hiện chưa bao phủ descendant RSS, available RAM, swap, package temperature, pool độc lập, process-group cleanup.

Ceiling ban đầu AM-0014: 8 native agents; 4 source writers; 3 read-only reviewers; 2 focused-test runners; 1 full-suite; 1 browser/visual; 1 integration owner. Đây là trần, không phải quota cần lấp đầy.

Backpressure: RAM available <25% ngừng scale-up; <15% pause writer/heavy. 85–89°C không scale-up; 90–94°C pause heavy tests/browser; 95–97°C checkpoint và pause writer/heavy; ≥98°C dừng heavy process groups. Resume dần sau hai mẫu <80°C. Mỗi assignment cần process group riêng; orphan/truncated descendants làm receipt invalid.

## 6. Exact first dispatch

### C0 source-capable dispatch

1. Ba reviewer read-only fingerprint exact snapshots song song:
   - `C0-FACADE-REVIEW`: `/home/linhnx/Projects/agent-rules-ns0-activation`.
   - `C0-TRANSACTION-REVIEW`: `/home/linhnx/Projects/agent-rules-ns0-transaction`.
   - `C0-SEMANTICS-REVIEW`: `/home/linhnx/Projects/agent-rules-ns0-semantics`.
2. Sau reconciliation, một fresh writer `C0-INTEGRATE` sở hữu facade branch, nhập phần accepted transaction + semantics; không chia sẻ path/symbol lease.
3. Hai focused-test slots chạy tách process group; sau đó engine suite + typecheck trên một exact snapshot.
4. Review song song theo correctness, security/path safety, transaction/crash recovery, deterministic projection/test quality.
5. Một consolidated repair pack; lặp repair/review đến ACCEPT.
6. Một integration owner import C0.
7. Engine-owned atomic activation: append AM-0012 → AM-0013 → AM-0014 → AM-0015, recompute identity, invalidate stale evidence, regenerate shadows, persist `NEEDS_REMEDIATION`.

### Read-only preparation ngoài C0

- `C1-PREP`: scheduler/lease/process-group/resource governor contract, overlap và test design.
- `C2-PREP`: execution-mode/artifact-handoff/OpenCode overlap map; xác nhận bỏ live child control.
- `C3-PREP`: verification shard, receipt fingerprint, terminal gate/CI truth contract.
- `C4-PREP`: real-data schema, accessibility/browser/visual QA plan; không sửa UI.
- `C5-PREP`: 5fedu taxonomy/router/installer mirror inventory và rescue classification.

Không source mutation C1–C5 trước activation C0.

## 7. AM-0015 — scorecard baseline 18 dimension

Điểm là projection evidence; không lấy trung bình để che dimension yếu. M8 yêu cầu từng dimension ≥8; M9.5 ≥9.5; M10 =10. Critical/High cap dimension dưới 8.

| # | Dimension | Baseline | Gap chính tới M8 |
|---:|---|---:|---|
| 1 | Vision and target architecture | 8.5 | giữ freshness và bind exact identity |
| 2 | Repository hygiene | 8.5 | rescue candidate; bỏ residual tracked artifacts |
| 3 | 5fedu context preservation | 8.5 | review semantic mapping/runtime mirrors |
| 4 | Plan lifecycle | 6.5 | C0 transaction/activation/projection ACCEPT |
| 5 | Engine/controller/verifier | 6.5 | hoàn tất enforcement + integrated evidence |
| 6 | Native swarm orchestration | 3.5 | productize AM-0012–0014 scheduler/governor |
| 7 | Platform adapters | 4.0 | truthful installed/native evidence |
| 8 | Test engineering | 6.0 | portability/lifecycle/browser closure |
| 9 | GitHub CI | 2.0 | Linux/Windows/macOS Quality xanh trên exact SHA |
| 10 | Certification | 1.5 | bỏ synthetic host labels; installed evidence |
| 11 | Security | 4.5 | Critical/High = 0; lock actions/dependencies |
| 12 | Maintainability | 4.5 | giant modules, duplicate automation review |
| 13 | Control Plane engineering | 6.0 | production states, browser/a11y/visual gates |
| 14 | Control Plane data truth | 2.5 | ledger/CI/attestation-backed health only |
| 15 | Control Plane taste and UX | 3.5 | hierarchy, visualization, motion, independent UX ≥8 |
| 16 | Documentation | 6.5 | claims/mirrors/generated truth align exact release |
| 17 | Install and release convergence | 2.0 | rewritten-main exact install/rollback/doctor/smoke |
| 18 | Resource and speed control | 3.5 | RAM/swap/thermal/descendant/tool-pool enforcement |

Baseline weighted projection 50–55%; release readiness 20–25%. Đây là raw evidence, không milestone claim.

## 8. Gate graph M8 → M9.5 → M10

```text
C0 ACCEPT
  → atomic activation AM-0012 → AM-0013 → AM-0014 → AM-0015
  → invalidate stale evidence + regenerate shadows + NEEDS_REMEDIATION
  → rescue/reconcile candidates
  → rolling C1 || C2 || C3 || C4 || C5
  → every dimension ≥8; Critical/High=0; exact candidate local+remote gates
  → candidate push + real CI
  → archive tag + hashed bundle + restore drill + independent rewrite review
  → reconstruct main ~4–6 semantic commits; tree equality
  → protected expected-old-SHA update
  → all evidence stale; fresh CI/cert/reconciliation/security/browser/install
  → exact rewritten artifact install + doctor + fixture/local smoke
  → MILESTONE_8_INTERNAL_READY
  → dogfood exact M8; anchored repairs; every dimension ≥9.5
  → three consecutive non-flaky gate cycles + adversarial/recovery closure
  → MILESTONE_9_5_RELEASE_HARDENED
  → three real-project runs + burn-in + zero findings + every dimension 10
  → final same-SHA reviews/reconciliation/release/install; only main remains
  → HARNESS_V3_10_OF_10_COMPLETE
```

M8, M9.5 chỉ là durable checkpoint notifications; không set global `COMPLETED`, không hỏi owner. Sau M8 cài/dogfood exact artifact rồi tự động dispatch M9.5. Sau M9.5 tự động dispatch M10. Dogfood Critical/High mở lại M8 AC; Medium vào M9.5 critical path; Low/polish vẫn được anchor M9.5/M10.

## 9. M8 critical path và first source dispatch sau C0 activation

Critical path tới M8: `C0 → ACTIVATE-0012-0015 → C3 CI/cert truth + C1 governor/orchestration → C2 adapter/install truth → C4 Control Plane truth/UX → C5 context/runtime mirrors → M8-RECONCILE → CANDIDATE-CI → MAIN-REWRITE-SAFETY → MAIN-REWRITE → FRESH-RECERT → INSTALL-DOGFOOD`.

Exact first source dispatch sau C0 activation, theo maximum resource-safe conflict-free set:

- `C1-GOVERNOR`: descendant RSS, available RAM, swap, CPU package thermal+hysteresis, process groups/orphans, separate tool pools.
- `C2-EXECUTION-HANDOFF`: execution modes, plan recognition, artifact handoff, truthful platform/native capability; bỏ live cross-host child control.
- `C3-CI-TRUTH`: portable Quality/Certification, immutable action/dependency pins, truthful host evidence, rewritten-SHA freshness.
- `C4-DATA-TRUTH`: canonical ledger root, evidence-backed health/platform state, loading/empty/error/stale/offline semantics.
- `C5-RESCUE-MIRRORS`: 5fedu/context/router/installer/runtime mirror rescue và canonical parity.

Leases semantic/path quyết định concurrency. C1↔C3, C2↔C1, C4↔C0/C3, C5↔C2 overlap phải serialize tại shared contract; phần không overlap chạy song song. Một integration owner duy nhất.

## 10. Full-main-history consolidation preflight và rollback

Chỉ preflight; chưa rewrite:

1. Push full candidate lineage vào temporary remote integration ref; CI thật phải chạy trên exact candidate SHA.
2. Capture remote refs, commit/tree hashes, worktrees, dirty candidates, PR/run URLs.
3. Tạo annotated archival tag bind old `main` (`67e7b8b...` hiện tại), successor tip, effective-plan hash, candidate SHA.
4. Tạo Git bundle chứa toàn bộ pre-rewrite refs; tính SHA-256; lưu lineage/release evidence.
5. Restore drill trong temporary clone/isolated repo; xác minh refs, commits, trees và checkout.
6. Independent read-only history-rewrite review phải ACCEPT.
7. Reconstruct khoảng 4–6 semantic commits; preferred 5: architecture/contracts; context/adapters; engine/orchestration/evidence; Control Plane; CI/release/install/docs.
8. Final rewritten tree hash phải bằng accepted candidate tree hash.
9. Update/push `main` bằng exact expected-old SHA/force-with-lease equivalent; không rewrite worker branches.
10. Mọi CI/review/attestation/reconciliation/install cũ stale. Chạy lại tất cả trên rewritten SHA.
11. Failure: restore archival tag+bundle hoặc repair rewritten `main`; tuyệt đối không dùng pre-rewrite evidence claim M8.
12. Chỉ cleanup branch/worktree sau rewritten `main` qua fresh M8 gates, exact install, candidate rescue/rejection recorded.

Hiện chưa có archival AM-0015 tag/bundle/restore drill. Existing tags chỉ gồm `harness-v2-rc-20260725T081756Z`, `pre-harness-v2-20260725T080716Z`; không thỏa rewrite gate mới.

## 11. Fresh delta: remote, CI, worktree, resource

- Local/remote `main`: `67e7b8bb0e6c1a400bb2b43bca2fa8d15c9447d6`.
- Remote `deepseek-implement`: `fa85b8af8fcbf30400cbfd056d8faee3686111a0`, 21 commits trước `main`; remote chỉ có hai branch này.
- Integration/C0 HEAD vẫn `8631ff31bac48ac357a569e2a72c234c6f9ec232`; inventory 13 worktree không đổi; dirty/untracked candidate và stash rescue `3f95209` vẫn phải giữ.
- CI delta: 10 run gần nhất hiển thị đều failure. Latest successor Quality PR `30324304995`, Quality push `30324302561`, Certification `30324304922` đều đỏ. Không SHA successor nào có fresh passing required GitHub evidence.
- Failure truth: macOS browser server/case-fold; generated runtime build ordering; thiếu Playwright binaries; synthetic Ubuntu host labels; floating action majors; duplicated quality work.
- Resource live: 15 GiB RAM, 4.9 GiB available (~32%, vẫn trên 25% nhưng giảm từ 6.2 GiB); swap 1.7 GiB used, có pressure; CPU package 88°C, thuộc 85–89°C no-scale-up/read-only preference; fans ~4.6–4.8k RPM. Không dispatch heavy/browser; giảm pool cho tới hai mẫu <80°C và swap ổn định.

## 12. Safety confirmation

- Source/test mutation: không.
- Full test/browser: không chạy.
- Commit/merge/push: không.
- Branch/worktree cleanup: không.
- Install/history rewrite/cleanup: không.
- Mutation duy nhất: atomic update artifact context này tại canonical `.agent`.

CONTEXT_READY_AM0015
Artifact: /home/linhnx/Projects/agent-rules/.agent/handoffs/agent-rules-harness-v3-rearchitecture-20260726-r1/claude-code-context-ready.md
Original: c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31
Pending chain: AM-0012 → AM-0013 → AM-0014 → AM-0015
M8 critical path: C0 → ACTIVATE-0012-0015 → C1/C2/C3/C4/C5 → M8-RECONCILE → CANDIDATE-CI → MAIN-REWRITE-SAFETY → MAIN-REWRITE → FRESH-RECERT → INSTALL-DOGFOOD
Automatic continuation: M8 → M9.5 → M10
Main rewrite: PREFLIGHT_ONLY
Source mutation: NONE
