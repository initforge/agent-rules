# CONTEXT READY — OpenCode M8 → M9.5 → M10

Plan ID: `agent-rules-harness-v3-rearchitecture-20260726-r1`
Thời điểm scaffold: 2026-07-30T07:46+07:00
Phạm vi: chỉ đọc filesystem/git/ledger/shadow/receipt; không implement source, không commit/push.

---

## 0. EFFECTIVE PLAN MATRIX — original.md + AM-0001→AM-0015

**Nguyên tắc:**
- Mọi requirement từ original.md được giữ nguyên trừ khi có supersession explicit trong amendment.
- UI taste/UX, 5fedu context, parity, CI, installer và platform requirements được bảo toàn toàn bộ.
- `SUPERSEDED` ghi rõ amendment + evidence.
- AM-0004 tombstoned, không tái sử dụng.

### 0.1 Section 1: Định danh và quyền ưu tiên (REQ-001)

| # | Requirement gốc | Trạng thái | Amendment | Ghi chú |
|---|---|---|---|---|
| 1.1 | `plan_id` = `agent-rules-harness-v3-rearchitecture-20260726-r1` | CARRIED | — | Không đổi |
| 1.2 | Successor chỉ active sau owner approval | CARRIED | AM-0001 | Execution authorization |
| 1.3 | `original.md` binary-copy từ `<proposed_plan>` artifact | CARRIED | AM-0012 §2.2 | Mở rộng: classification + capture |
| 1.4 | Lineage A1–A4 precedence rules | CARRIED | — | A3 thắng A4, A4 thắng A1/A2 |
| 1.5 | Requirement cũ: CARRIED/SUPERSEDED/REJECTED_OBSOLETE | CARRIED | — | — |
| 1.6 | Loại bỏ nội dung cũ: vendored 5fedu, JSON plan, global ledger, tracked generated, static.yml, live federation, backup, worker giả, facade v2 | CARRIED | AM-0012 §1.1 | Bổ sung: loại CODEX_FEDERATED, SUPERVISED_SESSION, live-session bridge |
| 1.7 | **Model routing**: main `gpt-5.6-sol`, fallback `qwen3.8-max-preview`, writer `qwen3.7-max`, secondary `deepseek-v4-flash` | SUPERSEDED | AM-0012 §8 | Routing is runtime mapping, không phải global rule. Không alias `qwen3.8-max-preview → qwen3.7-max`. Báo MODEL_FALLBACK_UNAVAILABLE nếu chưa advertised. |

### 0.2 Section 2: Mục tiêu và kiến trúc đích (REQ-002)

| # | Requirement gốc | Trạng thái | Amendment | Ghi chú |
|---|---|---|---|---|
| 2.1 | Clean break: single engine/controller | CARRIED | AM-0012 §3 | Native-swarm scheduler bổ sung DAG + conflict graph |
| 2.2 | Main agent orchestration only | CARRIED | AM-0002, AM-0005 §A | Không sửa source, không tự khai PASS |
| 2.3 | Worker/verifier/reviewer độc lập | CARRIED | AM-0002 §2, AM-0012 §5 | Phân tầng verification, sharded review |
| 2.4 | Năm host: Codex, Cursor, Antigravity, Grok, OpenCode | CARRIED | AM-0005 §B1, AM-0011 | Claude là first-class host thứ 6 |
| 2.5 | Control Plane local-only | CARRIED | AM-0005 §C | Redesign toàn bộ UI |
| 2.6 | CI là bằng chứng, 2 workflow | CARRIED | AM-0005 §B1 | Pin SHA, matrix thật, certify 5+ hosts |
| 2.7 | 5fedu chỉ giữ context sống | CARRIED | original §P1 | Vendor cleanup, 85% reduction gate |
| 2.8 | Generated output loại khỏi core | CARRIED | original §P6 | generated/ không tracked |
| 2.9 | Cuối chỉ còn branch `main` | CARRIED | AM-0015 §6 | Main-history consolidation + rewrite |
| 2.10 | **5-file focus limit** | SUPERSEDED | AM-0014 §2 | Superseded for CLUSTERED_NATIVE_SWARM. Vẫn giữ cho hotfix/repair/weak worker |
| 2.11 | **Wave as completion barrier** | SUPERSEDED | AM-0013 §1 | Wave là reporting concept, không barrier. Rolling wavefront scheduler |
| 2.12 | **Live cross-host federation** | SUPERSEDED | AM-0012 §1.1 | Removed. Thay bằng ARTIFACT_HANDOFF |
| 2.13 | **Dual-supervisor topology** | SUPERSEDED | AM-0012 §1.1 | NATIVE_SWARM là default; adaptive concurrency |

### 0.3 Section 3: Artifact authority và vòng đời plan (REQ-003)

| # | Requirement gốc | Trạng thái | Amendment | Ghi chú |
|---|---|---|---|---|
| 3.1 | `resolveExecutionSource` thống nhất | CARRIED | AM-0012 §2 | Bổ sung prebuilt bundle + paste workflow |
| 3.2 | Run tồn tại dùng artifact đã anchor | CARRIED | — | — |
| 3.3 | New run dùng successor mới nhất | CARRIED | AM-0012 §2.1–2.2 | Validation và authorization gates |
| 3.4 | Explicit selector chỉ lineage head | CARRIED | — | — |
| 3.5 | Competing head → PLAN_AMBIGUOUS | CARRIED | — | — |
| 3.6 | Prompt fallback → DRAFT | CARRIED | — | — |
| 3.7 | Error codes fail-closed | CARRIED | — | — |
| 3.8 | `.agent/` bundle structure | CARRIED | AM-0012 §2.1 | Validation của prebuilt bundle |
| 3.9 | WorkLedger JSON canonical | CARRIED | AM-0002 §6 | Engine dần sở hữu bookkeeping |
| 3.10 | Shadow drift detection | CARRIED | — | — |
| 3.11 | Plan lifecycle DRAFT→APPROVED→ADOPTED→SUPERSEDED/ACTIVE | CARRIED | AM-0005 §A | Terminal gate bổ sung NEEDS_REMEDIATION |
| 3.12 | needs-remediation bắt buộc khi lệch | CARRIED | AM-0005 §A2 | Engine tự tạo repair slice |
| 3.13 | Orphan side-effect quarantine | CARRIED | AM-0015 §4 | M8 gate yêu cầu rescue/reject worktree candidates |

### 0.4 Section 4: Public contracts và interfaces (REQ-004)

| # | Requirement gốc | Trạng thái | Amendment | Ghi chú |
|---|---|---|---|---|
| 4.1 | PortablePlan: `plan_id`, `original_sha256`, schema... | CARRIED | — | — |
| 4.2 | PlanArtifactRef + PlanLineage | CARRIED | — | — |
| 4.3 | PlanAnchor | CARRIED | AM-0012 §12 | AC-01..20 gắn anchor |
| 4.4 | TaskAssignment | CARRIED | AM-0012 §3 | Mở rộng: leases, worktree isolation |
| 4.5 | WorkerReceipt | CARRIED | — | — |
| 4.6 | VerificationClaim + reducer chain | CARRIED | AM-0002 §1 | Phân tầng: edit→slice→batch→stabilization→certification |
| 4.7 | HostAttestation + capability status | CARRIED | AM-0005 §B1 | Năm host attestation thật, không mock/emulation |
| 4.8 | HarnessManifestV3 | CARRIED | — | — |
| 4.9 | WorkLedger mở rộng | CARRIED | AM-0012 §9 | Fitness audit fields |
| 4.10 | **Execution modes**: NATIVE_SWARM, ARTIFACT_HANDOFF, SINGLE_AGENT | ADDED | AM-0012 §1.3 | Thay thế legacy live-session modes |
| 4.11 | **Scorecard evidence schema (18 dimensions)** | ADDED | AM-0015 §3 | M8≥8, M9.5≥9.5, M10=10 mọi dimension |
| 4.12 | **Milestone contracts**: MILESTONE_8_INTERNAL_READY, MILESTONE_9_5_RELEASE_HARDENED, HARNESS_V3_10_OF_10_COMPLETE | ADDED | AM-0015 §1.2 | Không set COMPLETED sớm |

### 0.5 Section 5: Giao thức thực thi và dogfooding (REQ-005)

| # | Requirement gốc | Trạng thái | Amendment | Ghi chú |
|---|---|---|---|---|
| 5.1 | Mỗi slice 1 subsystem, ≤5 file, ≤8 AC | SUPERSEDED (cho cluster) | AM-0014 §2 | Cluster > micro-slice. Micro-slice vẫn áp dụng cho hotfix/repair |
| 5.2 | Repo build-green trước slice kế tiếp | CARRIED | AM-0013 | Rolling wavefront: dispatch ngay khi dependency ready |
| 5.3 | Batch song song khi ownership disjoint | CARRIED | AM-0012 §5 | Sharded tests, verification, review |
| 5.4 | Dependency serialize | CARRIED | AM-0012 §4 | Conflict graph + leases |
| 5.5 | Release default maxDepth=1 | CARRIED | AM-0012 §3 | Native subagents depth 1, trừ khi approved |
| 5.6 | Model tier theo risk | CARRIED | AM-0002 §8, AM-0012 §8 | 3-tier: cheap/medium/strong |
| 5.7 | Remediation loop | CARRIED | AM-0005 §A | Engine tự tạo bounded repair slice |
| 5.8 | **Chuỗi PASS bắt buộc** | CARRIED | — | Requirement → AC → Profile → Probe → Artifact → Reducer |
| 5.9 | **Commit + push + dogfood tại M8** | ADDED | AM-0015 §1.3, §4 | Install exact artifact, dogfood findings → anchored repair |
| 5.10 | **Automatic continuation qua M8→M9.5→M10** | ADDED | AM-0015 §1.1, §9 | Không hỏi owner, checkpoint trước compaction/install/rewrite |
| 5.11 | **Stopping policy** | ADDED | AM-0015 §9 | Chỉ dừng vì credential/account/hardware/external blocker |

### 0.6 Section 6: Các batch triển khai (REQ-006)

| Batch | Requirement gốc | Trạng thái | Amendment | Ghi chú |
|---|---|---|---|---|
| **P-1** | Adopt successor + cài ui-taste | CARRIED | — | Taste routing rules giữ nguyên |
| **P0** | Baseline, hygiene, Git cleanup | CARRIED | AM-0005 §B3 | Thêm xóa `.obsolete` workflows, generated cleanup |
| **P1** | Tinh gọn 5fedu (≤1500 token, 85% reduction) | CARRIED | — | 5fedu context preserved. Parity V3 schema migration đang tiến hành |
| **P2** | Taxonomy, skills, context router | CARRIED | — | Core skill portfolio preserved |
| **P3** | Engine, controller, worker thật | CARRIED | AM-0012 §3–§5 | Native-swarm DAG scheduler, sharded assurance |
| **P4** | Portable contracts, CLI, 5 host adapters | CARRIED | AM-0011, AM-0012 §1 | Claude first-class host, OpenCode artifact-handoff |
| **P5** | Apple-inspired Control Plane | CARRIED | AM-0005 §C | Redesign toàn bộ: Plan workspace, DAG, evidence, motion system |
| **P6** | Script, generated output, 2 CI workflows | CARRIED | AM-0005 §B1 | Pin SHA, quality matrix thật, cert 5+ hosts |
| **P7** | Integrations, telemetry, evals, docs | CARRIED | — | — |
| **P8** | Immutable plan, shadow tracking, reconciliation | CARRIED | AM-0012 §12 | 20 ACs mới (AC-01..20) |
| **P9** | Adversarial review và cleanup cuối | CARRIED | AM-0015 §6 | Main-history consolidation + rewrite gate |
| **NS0** | Activate AM-0012 safely | ADDED | AM-0012 §11, AM-0015 §12 | C0 activation: transactional, crash-safe |
| **NS1** | Mode + schema migration | ADDED | AM-0012 §11.1 | NATIVE_SWARM, ARTIFACT_HANDOFF, SINGLE_AGENT |
| **NS2** | Remove cross-host OpenCode session | ADDED | AM-0012 §11.2 | Preserve artifact import/export |
| **NS3** | Plan recognition + auto adoption | ADDED | AM-0012 §11.3 | Prebuilt bundle + pasted plan |
| **NS4** | Native DAG + conflict scheduler | ADDED | AM-0012 §11.4 | Leases, worktrees, adaptive concurrency |
| **NS5** | Sharded assurance + repair | ADDED | AM-0012 §11.5 | Shard tests, verification, review |
| **NS6** | Integration train | ADDED | AM-0012 §11.6 | Single-owner accepted-candidate integration |
| **NS7** | Routing, cache, resource governor | ADDED | AM-0012 §11.7 | Capability-discovered routing, backpressure |
| **NS8** | Micro-fitness closure | ADDED | AM-0012 §11.8 | Execute audit backlog, close findings |
| **NS9** | Terminal release | ADDED | AM-0012 §11.9, AM-0015 §6 | Main rewrite, re-certify, cleanup |

### 0.7 Section 7: Test và Definition of Done (REQ-007)

| # | Requirement gốc | Trạng thái | Amendment | Ghi chú |
|---|---|---|---|---|
| 7.1 | Inventory A1–A4, hashes | CARRIED | — | — |
| 7.2 | A2 exact prefix of A3 | CARRIED | — | — |
| 7.3–7.26 | Toàn bộ 24 test requirements (line 771–796) | CARRIED | AM-0005 §A, AM-0015 §4 | Bổ sung terminal gate tests, M8 gates, milestone tests |
| 7.27 | **DoD mới**: M8 Internal Ready, M9.5 Release Hardened, M10 Complete | ADDED | AM-0015 §4.2, §7, §8 | 15/15, 10/10, 6 gates |
| 7.28 | **Scorecard evidence**: 18 dimensions, evidence-backed | ADDED | AM-0015 §3 | Mọi dimension ≥8/≥9.5/≥10 |
| 7.29 | **No average hiding**: từng dimension riêng | ADDED | AM-0015 §2, §3 | Critical/High caps dimension <8 |

### 0.8 Section 8: Giả định đã khóa (REQ-008)

| # | Giả định | Trạng thái | Amendment | Ghi chú |
|---|---|---|---|---|
| 8.1–8.16 | Toàn bộ 16 giả định (line 809–824) | CARRIED | — | Successor thay A3, A3 thắng A4, clean break, v.v. |
| 8.17 | **OpenCode không phải required controller** | ADDED | AM-0012 §1.2 | Artifact-handoff host, không live session |
| 8.18 | **M8 install/dogfood + continue** | ADDED | AM-0015 §1.3 | Không dừng ở milestone |
| 8.19 | **Main-history consolidation** | ADDED | AM-0015 §6 | Rewrite thành 4–6 semantic commits |
| 8.20 | **Score ≠ average** | ADDED | AM-0015 §2 | Evidence projection, không sentiment |

### 0.9 Tổng hợp amendment effect

| Amendment | Effect chính | Supersedes original | Bảo toàn |
|---|---|---|---|
| AM-0001 | Execution authorization | — | Toàn bộ original |
| AM-0002 | Verification layers, model tiers, bookkeeping, threat matrix | — | Toàn bộ original |
| AM-0003 | Owner closure decisions | — | Toàn bộ original |
| AM-0004 | TOMBSTONED | — | — |
| AM-0005 | Terminal gate, CP redesign, CI fix, accessibility | — | Toàn bộ capability, contracts, routes |
| AM-0006 | Three-mode orchestration + federation | — | Toàn bộ (live session phần bị AM-0012 supersede) |
| AM-0007 | DeepSeek routing + release convergence | — | Toàn bộ |
| AM-0008 | Parallel supervision + speed | — | Live session phần bị AM-0012 supersede |
| AM-0009 | Session-scoped pool + cache | — | Live session phần bị AM-0012 supersede |
| AM-0010 | Dual-supervisor concurrency | — | Live session phần bị AM-0012 supersede |
| AM-0011 | Claude first-class host + convergence | — | Live session phần bị AM-0012 supersede |
| AM-0012 | Native swarm, artifact handoff, sharded assurance, 20 ACs | §1.7 (model routing thành runtime mapping), §5 (execution modes mới) | Toàn bộ durable execution lessons |
| AM-0013 | Rolling wavefront, ready queue | §2.11 (wave-as-barrier) | Verification/review/security gates |
| AM-0014 | Clusters, resource safety | §0.11/§5.1 (5-file limit cho cluster mode) | Micro-slice cho hotfix/repair |
| AM-0015 | M8→M9.5→M10 progressive release, main rewrite | §7 (DoD mở rộng) | Toàn bộ UI taste/UX, 5fedu, parity, CI, installer, platform |

---

## 1. Xác minh hash immutable artifact

`sha256sum` đã xác minh trực tiếp filesystem:

| Artifact | SHA-256 kỳ vọng | SHA-256 thực tế | Kết quả |
|---|---|---|---|
| `original.md` | `c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31` | `c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31` | ✅ MATCH |
| `amendments/0012-native-swarm-artifact-handoff-and-fitness-closure.md` (AM-0012) | `2147aa9631fab0aab10a1e81b7339ba1b1b420d57080d2ef99bf2a88674b41a2` | `2147aa9631fab0aab10a1e81b7339ba1b1b420d57080d2ef99bf2a88674b41a2` | ✅ MATCH |
| `amendments/0013-rolling-wavefront-critical-path-pipeline.md` (AM-0013) | `a8989935c5e0b188b42279b19b167ffad6458d39a17ecad5397ef29301433f0b` | `a8989935c5e0b188b42279b19b167ffad6458d39a17ecad5397ef29301433f0b` | ✅ MATCH |
| `amendments/0014-clustered-native-swarm-and-resource-safety.md` (AM-0014) | `951fe2028c3ed6db85530979ec910ed8fc14a7a5dfb041bb829da2f5e41fa209` | `951fe2028c3ed6db85530979ec910ed8fc14a7a5dfb041bb829da2f5e41fa209` | ✅ MATCH |
| `amendments/0015-progressive-quality-release-and-main-history-consolidation.md` (AM-0015) | `e6482360189a653ef2a3c5074162f75e5376f2e266062f38615fdfa34b32fbc3` | `e6482360189a653ef2a3c5074162f75e5376f2e266062f38615fdfa34b32fbc3` | ✅ MATCH |

Tất cả 5 artifact immutable đều khớp hash. Capture JSON (am0012-capture → am0015-capture) có hash khác; chúng là dẫn xuất, không phải artifact chính.

---

## 2. Git worktree, branch, HEAD, dirty paths, remote refs

### Main repo: `/home/linhnx/Projects/agent-rules`
| Thuộc tính | Giá trị |
|---|---|
| Branch | `fix/opencode-bypass-permissions` |
| HEAD | `67e7b8bb0e6c1a400bb2b43bca2fa8d15c9447d6` |
| Dirty | 11 modified + 4 untracked |
| Remote | `origin → https://github.com/initforge/agent-rules.git` |
| Remote branches | `main`, `deepseek-implement` |

### Active integration worktree: `/home/linhnx/Projects/agent-rules-supervisor-wave`
| Thuộc tính | Giá trị |
|---|---|
| Branch | `integration/harness-v3-certified` ✅ (khớp scaffold) |
| HEAD | `8631ff31bac48ac357a569e2a72c234c6f9ec232` ✅ (khớp scaffold baseline) |
| Dirty (modified) | ~60 files: engine, control-plane, CLI, docs, platforms, automation, schemas, evals |
| Dirty (untracked) | ~45 files: host-attestation, scorecard, installer tests, engine activation modules, supervisor, OpenCode adapter |
| Remote origin | `https://github.com/initforge/agent-rules.git` (cùng repo) |
| Remote `integration/harness-v3-certified` | ❌ KHÔNG tồn tại trên remote |
| Stash | 2 stashes: (0) RESCUE integration supervisor/cache/opencode-runner in-flight 20260729; (1) RESCUE half-applied main→lean transformation |
| Base commit | `fa85b8af8fcbf30400cbfd056d8faee3686111a0` (merge-base với main) |

### Worktree inventory (13 total)
| Worktree | Branch | HEAD | Trạng thái |
|---|---|---|---|
| `agent-rules` (main) | `fix/opencode-bypass-permissions` | `67e7b8b` | 15 dirty |
| `agent-rules-supervisor-wave` | `integration/harness-v3-certified` | `8631ff3` | ~105 dirty **(INTEGRATION)** |
| `agent-rules-ns0-activation` | `qwen/ns0-am0012-activation` | `8631ff3` | 2 untracked |
| `agent-rules-ns0-semantics` | `qwen/ns0-semantics-modules` | `8631ff3` | 4 untracked |
| `agent-rules-ns0-transaction` | `qwen/ns0-transaction-modules` | `8631ff3` | 4 untracked |
| `agent-rules-5fedu-wave` | `codex/harness-v3-5fedu-wave` | `fa85b8a` | ~60 dirty |
| `agent-rules-ci-wave` | `codex/harness-v3-ci-wave` | `fa85b8a` | 5 dirty |
| `agent-rules-cli-wave` | `codex/harness-v3-cli-wave` | `fa85b8a` | 12 dirty |
| `agent-rules-controller-wave` | `codex/harness-v3-controller-wave` | `fa85b8a` | 5 dirty |
| `agent-rules-cp-wave` | `codex/harness-v3-cp-wave` | `fa85b8a` | 11 dirty |
| `agent-rules-opencode-wave` | `codex/harness-v3-opencode-wave` | `fa85b8a` | 4 dirty |
| `agent-rules-qa-supervisor` | `codex/harness-v3-qa-supervisor` | `fa85b8a` | SẠCH |
| `agent-rules-deepseek-20260727-032602` | `deepseek/harness-v3-continuation-20260727-032602` | `fa85b8a` | legacy/stale |

---

## 3. Ledger và shadow

### WorkLedger: `.agent/ledger/agent-rules-harness-v3-rearchitecture-20260726-r1.json`
| Trường | Giá trị | Khớp scaffold? |
|---|---|---|
| `execution_state` | `NEEDS_REMEDIATION` | ✅ |
| `status` | `ADOPTED` | ✅ |
| `mutation_gate` | `ADOPTED` | — |
| `repository_baseline.commit` | `67e7b8bb0e6c1a400bb2b43bca2fa8d15c9447d6` | — |
| `shadow_revision` | 48 | ✅ |
| Artifact lineage reconciliation | `PASS_ARTIFACT_AUTHORITY_ONLY` | — |
| NS0-ACTIVATION batch | `NEEDS_REMEDIATION` | — |
| NS1-NS9 batch | `BLOCKED` | — |

### Shadow revision 48 state (từ shadow/tasks.md):
- **AM0012-NS0**: NEEDS_REMEDIATION
- **AM0012-NS1 → NS9**: BLOCKED
- **P1-PARITY-V3-DEVIATION-MAPS**: NEEDS_REMEDIATION
- **P1-PARITY-V3-DEVIATION-ARCHITECTURE-EXAMPLE-REPAIR**: READY
- **P1-PARITY-V3-DEVIATION-ENGINE-FIXTURE-REPAIR**: READY
- **P1-PARITY-V3-PROOF-MAPS → ENGINE-CUTOVER**: PENDING_DEPENDENCY
- Các ASN-PARITY-V3 còn lại: CLOSED_MATCH

### Reconciliation status:
```
Status: NEEDS_REMEDIATION
P1-R2-PARITY-ASSET-MIGRATION: FAIL
P1-PARITY-V3-ARCHITECTURE: TERMINAL_REVIEWED_NEEDS_REMEDIATION
P1-LEAN-INSTALLER: TERMINAL_REVIEWED_NEEDS_REMEDIATION
```

### Open findings (WorkLedger):
- `FIND-AM0002-LEGACY-EXECUTION-CONTRACT-SPLIT-001`
- `FIND-AM0002-LOCAL-WORKER-FALSE-COMPLETION-002`

### Amendment chain (từ shadow/amendments.md):
| ID | Status | SHA | Effect |
|---|---|---|---|
| AM-0001 | OWNER_APPROVED_EFFECTIVE | 90b5f0e4 | EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION |
| AM-0002 | OWNER_APPROVED_EFFECTIVE | c68c3cba | EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION |
| AM-0003 | OWNER_APPROVED_EFFECTIVE | 9637aa2f | EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION |
| AM-0005 | OWNER_APPROVED_EFFECTIVE | 5a23ce82 | EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION |
| AM-0006 | OWNER_APPROVED_EFFECTIVE | 65f550d5 | EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION |
| AM-0007 | OWNER_APPROVED_EFFECTIVE | 66905c86 | EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION |
| AM-0008 | OWNER_APPROVED_EFFECTIVE | 13d458df | EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION |
| AM-0009 | OWNER_APPROVED_EFFECTIVE | 7a4569e0 | EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION |
| AM-0010 | OWNER_APPROVED_EFFECTIVE | c9bce772 | EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION |
| AM-0011 | OWNER_APPROVED_EFFECTIVE | d295ba00 | EFFECTIVE_POLICY_PENDING_IMPLEMENTATION |
| AM-0012 | OWNER_APPROVED_EFFECTIVE | 2147aa96 | EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION |
| AM-0013 | OWNER_APPROVED_EFFECTIVE | a8989935 | EFFECTIVE |
| AM-0014 | OWNER_APPROVED_EFFECTIVE | 951fe202 | EFFECTIVE |
| AM-0015 | OWNER_APPROVED_EFFECTIVE | e6482360 | EFFECTIVE |

---

## 4. Receipt / review / evidence truth

### Receipts hợp lệ (trên snapshot cũ, không chứng nhận dirty hiện tại):
- `REV-P0-F0-001`, `REV-F1-R10-001`, `REV-P1-R3A3-001`
- `REV-P1-R3B-R3-STABILIZATION-001`, `REV-P1-R3C-R1A-001`
- `REV-P1-R3C-R1B-STABILIZATION-001`, `REV-P1-R3C-R2-R1-001`
- `REV-P1-PARITY-V3-01-R2-001`…`04-001`, `REV-R39-LEDGER-INTEGRITY-001`
- Các ASN-PARITY-V3-* CLOSED_MATCH receipts

### Receipts stale/superseded:
- `REV-P1-R2C-001`: V2/V3 conflict, superseded
- `REV-P1-PARITY-V3-05-R1-001`: superseded
- `REV-P1-PARITY-V3-06-001`, `REV-P1-PARITY-V3-07-R1-001`: shared validator changed
- `REV-P1-PARITY-V3-08-001`: partial, còn 2 findings

### Chưa có receipt hợp lệ để ACCEPT:
- C0 facade review: interrupted, không ACCEPT
- C0 transaction + semantics: missing final integrated review
- supervisor-wave dirty workspace: receipt cũ không fingerprint snapshot hiện tại
- legacy DeepSeek workspace: stale

---

## 5. Browser processes

⚠️ **Phát hiện browser processes (07:46):**
- 5 active browser-related processes:
  - `chrome-devtools-mcp` (PID 619564) + watchdog (PID 619751) — started 07:42
  - `playwright-mcp` (PID 619578) — started 07:42
  - `npm exec chrome-devtools-mcp` (PID 619413), `npm exec playwright-mcp` (PID 619415)
- Đây là processes của session hiện tại, không orphan như phiên trước
- `chrome_crashpad_handler` (PID 540512) — Codex Desktop crash handler (06:32)
- Port 3099: node process (PID 562791) — có thể là control plane cũ
- Port 5175: python3 process (PID 539788)

**Kết luận:** Không còn orphan playwright-mcp/chrome-devtools-mcp hàng loạt. Các process hiện tại là của session đang chạy.

---

## 6. Provider routing và model config

### OpenCode session:
```
model: "deepseek/deepseek-v4-flash" (primary)
small_model: "deepseek/deepseek-v4-flash"
```
- `supervisor-main`: `deepseek/deepseek-v4-flash`
- `worker-deepseek-primary`: `deepseek/deepseek-v4-flash`
- `worker-deepseek-secondary`: `deepseek/deepseek-v4-flash`

❗ **Discrepancy:** Scaffold ghi "đã route qua `qwencoder/deepseek-v4-flash`" nhưng thực tế config dùng `deepseek/deepseek-v4-flash` trực tiếp, không qua qwencoder. Cần kiểm tra lại — có thể config chưa áp dụng qwencoder routing.

---

## 7. Resource state

| Metric | Giá trị |
|---|---|
| RAM total | 15 GiB |
| RAM used | 5.3 GiB |
| RAM available | 9.9 GiB (~66%) |
| Swap total | 15 GiB (zram) |
| Swap used | 2.7 GiB (18%) |
| Load average | 2.64, 2.66, 2.63 |
| CPU | 12th Gen i7-12700H, temp ~59–61°C |

Resource state cải thiện so với đầu phiên: swap giảm từ 7.1G xuống 2.7G. Memory pressure thấp.

---

## 8. Scorecard evidence và source integrity

### `automation/scorecard-evidence.json`
- **File tồn tại:** ✅ (3647 bytes)
- **SHA-256:** `362e7a60e86e2777091cea7e57df31a7745eb53c2e72a454c5b2e42c75a2ab81`
- **Trạng thái:** ❌ **PLACEHOLDER / ALL-ZERO**
- `updated_at: 2026-01-01T00:00:00Z` (fake date)
- Tất cả 18 dimension: `score=0`, `status=fail`, `evidence_items=[]`, `findings=["placeholder: unpopulated"]`
- **Đây KHÔNG phải scorecard M8 từ evidence thật**

### `automation/source-integrity.json`
- **Tồn tại:** ✅
- `generated_at: 2026-07-30T00:00:00Z`
- Chứa SHA-256 cho 13 file

---

## 9. Installer integrity

Các file test installer mới trong integration worktree (untracked):
- `automation/test-installer-staging.py` (13815 bytes)
- `automation/test-installer-trust-boundary.py` (9854 bytes)
- `automation/host-attestation.ts` (19997 bytes)
- `automation/host-attestation.test.ts` (28633 bytes)

Chưa được review độc lập. P1-LEAN-INSTALLER: `TERMINAL_REVIEWED_NEEDS_REMEDIATION`.

---

## 10. Blocker / finding theo evidence thật

### M8 blockers (evidence-backed):

1. **C0 chưa ACCEPT**: NS0-ACTIVATION = NEEDS_REMEDIATION, NS1-NS9 = BLOCKED. Không có receipt hợp lệ cho C0 activation.
2. **scorecard-evidence.json là placeholder**: Cả 18 dimension = 0/7-10. Không thể đánh giá M8 (yêu cầu mọi dimension ≥8). Cần sinh từ evidence thật.
3. **Integration branch chưa push lên remote**: `integration/harness-v3-certified` không tồn tại trên origin. Không có CI xanh cho candidate hiện tại.
4. **P1-LEAN-INSTALLER chưa pass**: TERMINAL_REVIEWED_NEEDS_REMEDIATION.
5. **P1-PARITY-V3-ARCHITECTURE chưa pass**: TERMINAL_REVIEWED_NEEDS_REMEDIATION (ASN-PARITY-V3-08-DEVIATION-MAPS còn NEEDS_REMEDIATION, các ASN 09-11 PENDING_DEPENDENCY).
6. **Open findings chưa đóng**: FIND-AM0002-LEGACY-EXECUTION-CONTRACT-SPLIT-001, FIND-AM0002-LOCAL-WORKER-FALSE-COMPLETION-002. V2/V3 schema conflict còn residual.
7. **Provider routing discrepancy**: Scaffold ghi `qwencoder/` prefix nhưng thực tế config dùng `deepseek/` trực tiếp.
8. **AM-0012 chưa thực sự activated**: Mặc dù ledger ghi effective, NS0-ACTIVATION = NEEDS_REMEDIATION. C0 activation chưa hoàn tất.
9. **P1-PARITY-V3-09..11 (Proof Maps, Doc Contract, Engine Cutover)**: PENDING_DEPENDENCY, chưa implement.
10. **Dirty workspace không được certified**: ~105 dirty/untracked files trong integration worktree, không receipt nào fingerprint snapshot hiện tại.

---

## 11. Safety confirmation

- ✅ Source/test mutation: KHÔNG
- ✅ Full test/browser: KHÔNG chạy
- ✅ Commit/merge/push: KHÔNG
- ✅ Branch/worktree cleanup: KHÔNG
- ✅ Install/history rewrite: KHÔNG
- ✅ Mutation duy nhất: artifact context-ready này
- ✅ Tất cả hash immutable artifact: VERIFIED

---

## 12. Delta so với phiên scaffold trước (07:38)

| Khoản mục | 07:38 (cũ) | 07:46 (mới) |
|---|---|---|
| Thời điểm | 07:34+07:00 | 07:46+07:00 |
| Effective Plan matrix | KHÔNG | CÓ (14 amendments mapped) |
| Swap used | 7.1 GiB ⚠️ | 2.7 GiB ✅ (cải thiện) |
| RAM used | 7.1 GiB | 5.3 GiB |
| Browser processes | ~38 orphan instances | 5 active (session hiện tại) |
| Blocker count | 10 blockers | 10 blockers (cập nhật evidence) |
| Provider check | `deepseek/deepseek-v4-flash` direct | Giữ nguyên — xác nhận discrepancy |

---

```text
CONTEXT_READY_OPENCODE_M8_M10
Artifact: /home/linhnx/Projects/agent-rules/.agent/handoffs/agent-rules-harness-v3-rearchitecture-20260726-r1/opencode-m8-m10-context-ready.md
Original: c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31
AM0015: e6482360189a653ef2a3c5074162f75e5376f2e266062f38615fdfa34b32fbc3
Execution state: NEEDS_REMEDIATION
M8 blockers: (1) C0 chưa ACCEPT — NS0=NEEDS_REMEDIATION, NS1-NS9=BLOCKED; (2) scorecard-evidence.json placeholder/all-zero, không evidence thật; (3) integration/harness-v3-certified chưa trên remote; (4) P1-LEAN-INSTALLER=TERMINAL_REVIEWED_NEEDS_REMEDIATION; (5) P1-PARITY-V3-ARCHITECTURE=TERMINAL_REVIEWED_NEEDS_REMEDIATION (ASN-PARITY-V3-08 còn NEEDS_REMEDIATION, ASN 09-11 PENDING_DEPENDENCY); (6) 2 open findings FIND-AM0002-* + V2/V3 conflict; (7) provider routing discrepancy (scaffold: qwencoder/, thực tế: deepseek/ trực tiếp); (8) AM-0012 chưa activated đúng C0 contract; (9) P1-PARITY-V3-09..11 PENDING_DEPENDENCY; (10) dirty workspace ~105 files không receipt fingerprint
Source mutation: NONE
```
