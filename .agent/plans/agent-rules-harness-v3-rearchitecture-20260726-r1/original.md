# Harness v3 Successor — tái kiến trúc toàn diện, tinh gọn và tự kiểm chứng

## 1. Định danh và quyền ưu tiên

- `plan_id`: `agent-rules-harness-v3-rearchitecture-20260726-r1`
- Đây là successor mới, chỉ trở thành plan thực thi sau khi được owner duyệt.
- Khi thực thi, `original.md` phải được binary-copy trực tiếp từ chính `<proposed_plan>` artifact này; không copy từ prompt, summary hay Markdown được render lại.

### Lineage bắt buộc

| Artifact | SHA-256 rút gọn | Vai trò |
|---|---:|---|
| A1 | `17cb545e…` | Requirement-lineage source |
| A2 | `0afb4ab8…` | Base cũ, là exact prefix của A3 |
| A3 | `4976bcaa…` | Base bất biến quyết định contract chính |
| A4 | `773f76ce…` | Chỉ được bổ sung vào A3 |
| Successor này | Tính khi adopt | Executable lineage head sau owner approval |

Thứ tự giải quyết xung đột:

1. A3 thắng mọi nội dung xung đột với A4; A4 không được rewrite A3.
2. Ở nơi A3 không quyết định, A4 thắng A1/A2 nếu có xung đột.
3. Requirement không xung đột từ A1–A4 và requirement ledger lịch sử được carry-forward.
4. Pattern v2 đã bị supersede không được quay lại.
5. Mỗi requirement cũ phải có trạng thái `CARRIED`, `SUPERSEDED` hoặc `REJECTED_OBSOLETE`, kèm source artifact/commit và requirement đích.
6. Successor không được `APPROVED` nếu lineage reconciliation chưa `PASS`.

Những nội dung cũ bị loại rõ ràng gồm: vendored 5fedu source, JSON làm semantic plan authority, global-only ledger, tracked generated runtime, `static.yml`, live cross-host federation, backup archive, worker giả, compatibility facade v2 và workflow/branch name bị A3 thay thế.

## 2. Mục tiêu và kiến trúc đích

Harness v3 là clean break:

- Một engine/controller điều phối sub-agent theo dependency, ownership, risk tier và ngân sách.
- Main agent chỉ orchestration, kiểm tra quá trình sub-agent và đối chiếu kết quả với plan; không sửa source.
- Worker tạo thay đổi hoặc artifact thật; verifier và reviewer độc lập.
- Năm host Codex, Cursor, Antigravity, Grok và OpenCode đều có native runner thật.
- Control Plane local-only, chỉ quan sát và cấu hình; không điều khiển run.
- CI là bằng chứng cho toàn harness và chỉ có đúng hai workflow.
- 5fedu chỉ giữ context sống, không vendored source/archive/evidence.
- Generated output, script một lần và implementation trùng bị loại khỏi core.
- Trạng thái Git cuối chỉ còn branch `main`.

```text
agent-rules/
├── rules/                    # invariant và guardrail ngắn
├── behaviors/                # lifecycle và completion policy
├── skills/                   # capability workflow lazy-loaded
├── profiles/5fedu/           # context sống và capability routing
├── platforms/                # năm native host adapters
├── packages/
│   ├── engine/               # contracts, controller, router, verifier, evidence
│   ├── cli/                  # CLI mỏng gọi engine
│   └── control-plane/        # local observe/configure UI
├── integrations/
│   ├── required/
│   └── optional/
├── evals/
├── docs/
└── .github/workflows/
```

- Public contracts nằm trong `packages/engine/contracts`; không duy trì top-level schema owner cạnh tranh.
- Không để orchestration mechanism trong Markdown, workflow hoặc UI.
- Manifest typed là nguồn duy nhất cho load order, context budget, registry, dependency và routing metadata.

## 3. Artifact authority và vòng đời plan

### Source resolution

Mọi entry point `run`, `resume`, dispatch, source acquisition, host hook và Control Plane mutation phải gọi cùng một `resolveExecutionSource`.

Thứ tự:

1. Run đã tồn tại luôn dùng artifact/hash đã anchor trong ledger.
2. New run dùng successor mới nhất đã được owner duyệt và có lineage reconciliation `PASS`.
3. Explicit selector chỉ được thực thi nếu trỏ tới lineage head hiện hành; artifact cũ trả `PLAN_SUPERSEDED`.
4. Nếu có các head cạnh tranh chưa reconcile, trả `PLAN_AMBIGUOUS`.
5. Chỉ khi không tồn tại matching plan artifact mới được dùng prompt fallback.
6. Prompt fallback phải tạo một `DRAFT` plan artifact, được duyệt và adopt trước mutation; không chạy trực tiếp từ prompt.
7. Không chọn artifact chỉ bằng timestamp hoặc nội dung nhìn giống nhau.

Lỗi fail-closed:

```text
PLAN_REQUIRED
PLAN_AMBIGUOUS
PLAN_SELECTOR_CONFLICT
PLAN_SUPERSEDED
PLAN_REJECTED
PLAN_LINEAGE_GAP
PLAN_TAMPERED
PROMPT_FALLBACK_FORBIDDEN
ORIGINAL_COPY_MISMATCH
SHADOW_DRIFT
PRE_ADOPTION_SIDE_EFFECT
ORPHAN_SIDE_EFFECT
REVIEW_STALE
```

### Bundle runtime

```text
.agent/
├── plans/<plan-id>/
│   ├── original.md
│   ├── projection.plan.yaml
│   ├── lineage/
│   │   ├── artifacts.json
│   │   └── reconciliation.md
│   ├── amendments/
│   │   └── <amendment-id>.md
│   ├── shadow/
│   │   ├── tasks.md
│   │   ├── progress.md
│   │   ├── amendments.md
│   │   ├── reconciliation.md
│   │   └── batches/<batch-id>/
│   │       ├── tasks.md
│   │       ├── progress.md
│   │       └── reconciliation.md
│   └── exports/
└── ledger/<plan-id>.json
```

- `.agent/` gitignored và local-first.
- `original.md` là semantic authority bất biến.
- `projection.plan.yaml` là projection máy đọc được, bind vào raw original hash và không được thay đổi intent.
- `WorkLedger` JSON là canonical runtime state; Markdown chỉ là shadow projection.
- Batch state nằm trong cùng WorkLedger, không tạo ledger cạnh tranh.
- Manual shadow edit tạo `SHADOW_DRIFT`; engine tái sinh projection và ghi audit event.
- Export tạo deterministic bundle cùng manifest SHA-256, loại secrets, raw prompt, raw source không cần thiết và nội dung telemetry chưa opt-in.
- Control Plane cung cấp read-only bundle/hash export.

### Plan lifecycle và run lifecycle

Plan lifecycle:

```text
DRAFT → APPROVED → ADOPTED → SUPERSEDED | ACTIVE
```

Run lifecycle giữ contract A3:

```text
DISCOVERING → PLANNED → VALIDATED → DISPATCHING
→ EXECUTING → VERIFYING → REVIEWING
→ COMPLETED | PARTIAL | BLOCKED | FAILED | CANCELLED
```

`needs-remediation` là trạng thái ledger bắt buộc khi review phát hiện lệch; `PARTIAL` không phải trạng thái kết thúc hợp lệ vì hết thời gian hoặc context.

Không mutation capability nào được cấp trước `ADOPTED`. Quy định này bao gồm source fetch, cache creation, install, generated build, worker dispatch và file write.

Taste cache đã tải trước adoption hiện tại phải được ghi nhận là `ORPHAN_SIDE_EFFECT`, quarantine khỏi runtime/export, rồi re-fetch hoặc revalidate trong batch có PlanAnchor.

## 4. Public contracts và interfaces

### `PortablePlan`

Cặp `<plan>.md` và `<plan>.plan.yaml` dùng chung:

- `plan_id`
- raw `original_sha256`
- schema/version
- objective
- `scope.in` và `scope.out`
- requirements và source anchors
- decisions, rationale và trade-offs
- assumptions và known unknowns
- task DAG
- owned/forbidden paths
- acceptance/evidence profile
- rollback
- handoff

### `PlanArtifactRef` và `PlanLineage`

- Artifact ID, raw path/ref, byte length, SHA-256.
- Host, task, session và repository identity.
- Author/owner approval event.
- `supersedes`, `supplements` và `derived_from`.
- Requirement-resolution matrix.
- Lineage reconciliation hash và result.

### `PlanAnchor`

```text
plan_sha256
section_heading
line_start
line_end
anchor_text_sha256
requirement_id
```

Mọi task và acceptance criterion phải map tới PlanAnchor hoặc approved amendment.

### `TaskAssignment`

- Task/requirement IDs.
- Dependencies.
- Source-of-truth paths.
- Owned và forbidden paths.
- Allowed tools.
- Model/risk tier và token/time/cost budget.
- Acceptance criteria.
- Structured verification commands.
- Escalation conditions.
- Receipt contract.

### `WorkerReceipt`

- Integrated diff hoặc artifact.
- Files touched.
- Commands và structured argv.
- Exit codes, timestamps và logs.
- Tests/evidence paths cùng hashes.
- Worker/host/model identity.
- Không được tự khai PASS thay verifier.

### `VerificationClaim`

- Claim và verification profile.
- Executed probe, exit status và duration.
- Host/platform/version.
- Artifact/evidence URI và hashes.
- Verifier identity.
- Reducer result: `PASS | FAIL | BLOCKED | UNVERIFIED`.

Chuỗi PASS bắt buộc:

```text
Requirement
→ Acceptance Criterion
→ Verification Profile
→ Executed Probe
→ Artifact + SHA-256
→ Independent Reducer
```

### `HostAttestation`

- Host/version.
- Commit SHA.
- Contract/capability set.
- Requested/resolved/observed model.
- Evidence hashes.
- Issued/expiry time.
- Native runner identity.

Capability status:

```text
HOST_NATIVE
ADAPTER_ENFORCED
EMULATED
UNSUPPORTED
UNVERIFIED
```

Static config hoặc emulation không thể tạo native attestation.

### `HarnessManifestV3`

- Subsystems và canonical owners.
- Skill/behavior/profile registry.
- Capability dependency graph.
- Context budgets.
- Model classes và approved routing.
- Required evidence.
- Platform support.
- Source integrity metadata.

### `WorkLedger`

Bổ sung:

- Original plan identity.
- Artifact lineage và requirement resolutions.
- Plan anchors.
- Approved amendments.
- Shadow revision/hashes.
- Batches và repair slices.
- Assignments, receipts và evidence.
- Reconciliations và review freshness.
- Source-acquisition receipts.
- Orphan side-effect findings.
- Status `needs-remediation`.

## 5. Giao thức thực thi và dogfooding

- Mỗi slice chỉ thuộc một subsystem, tối đa năm file trọng tâm và tối đa tám acceptance criteria.
- Repo phải trở về build-green trước slice phụ thuộc tiếp theo.
- Batch độc lập chỉ chạy song song khi ownership không giao nhau và có workspace/worktree isolation.
- Dependency dày hoặc cùng ownership phải serialize.
- Release default: `maxDepth = 1`; controller cưỡng chế `maxWorkers`, token, cost và time budget.
- Main agent không dùng công cụ sửa file; chỉ dispatch, kiểm tra diff/evidence, reconcile và mở repair slice.
- Model worker được chọn ở tier vừa đủ; planner/reviewer tier tăng theo ambiguity và risk.
- Hai lần remediation cùng lỗi bắt buộc tăng model hoặc reviewer tier.
- Mọi thay đổi sau review làm review cũ stale.
- Subsystem mới hoàn thành được dùng ngay cho batch sau: resolver mới dùng resolver mới, verifier mới dùng verifier mới, Control Plane mới đọc ledger thật.
- Không dùng checklist thủ công làm bằng chứng khi đã có verifier tương ứng.

Remediation loop:

```text
ADOPT ORIGINAL
→ EXECUTE + SHADOW TRACKING
→ VERIFY
→ INDEPENDENT REVIEW
→ RECONCILE ORIGINAL + AMENDMENTS
   ├─ toàn bộ MATCH/SUPERSEDED hợp lệ → FINALIZE
   └─ PARTIAL/MISSING/DEVIATED/EXTRA
      → reopen AC
      → bounded repair slice
      → implement
      → verify
      → review và reconcile lại
```

- `EXTRA` phải rollback hoặc thành owner-approved amendment.
- Repo truth làm plan không thể thực thi tạo `needs-replan`; agent không tự sửa intent.
- Loop chỉ kết thúc ở `PASS` hoặc blocker thật sự cần owner/external dependency.

## 6. Các batch triển khai

### P-1 — Adopt successor và cài `ui-taste`

- Capture raw successor artifact trước lần edit đầu tiên.
- Xác minh lineage A1–A4 và tạo requirement-resolution matrix.
- Ghi baseline commit, branch, workspace status và orphan roots.
- Quarantine Taste cache đã tạo sớm.
- Re-fetch hoặc revalidate `Leonxlnx/taste-skill` tại commit `e988add20dab0fa97d7a76781c48961c8184288e`, MIT license.
- Pin repository, commit, tree/content hashes và license dưới canonical `skills/ui-taste/`.
- Materialize đầy đủ source pack dưới reference path ẩn khỏi public skill discovery; không chạy script upstream khi import.
- Chỉ expose một public capability `ui-taste`; upstream variants là reference modes.
- Release bundle phải cài được offline, không phụ thuộc GitHub.
- Từ batch UI đầu tiên, sử dụng `ui-taste` như review lens.

Taste routing:

- Landing/portfolio: frontend taste.
- Existing app/site: redesign-existing-project lens.
- Minimalist, high-end hoặc brutalist chỉ khi brief yêu cầu.
- Control Plane: Apple product-UI contract làm chủ; Taste là anti-slop/review lens.
- 5fedu ERP: parity và nghiệp vụ làm chủ; Taste không được thay shell, IA hoặc interaction contract.
- Image-first chỉ route khi deliverable cần visual reference hoặc user yêu cầu.
- Ưu tiên: user brief → design system/profile parity → accessibility/product constraints → Taste heuristics.
- Không ép React, Tailwind, GSAP, dual theme, ảnh hoặc random style nếu repo/brief không yêu cầu.

**Gate:** successor được adopt đúng raw hash; lineage `PASS`; Taste source có provenance hợp lệ; không còn orphan artifact được runtime sử dụng.

### P0 — Baseline, hygiene và Git

- Lập semantic claim ledger trước mọi delete/move.
- Ghi baseline failures, generated drift, host capabilities và security state.
- Sửa generated manifest hash và Windows traversal.
- Xác minh rồi xóa `.backup-harness/`, không tạo backup thay thế.
- Sau khi đã trích requirement/evidence cần thiết, xóa mọi local/remote branch cũ ngoài `main`, gồm:
  - `fix/harness-v2-convergence`
  - `refactor/final-harness-convergence`
  - `fix/truthful-harness-release`
- Tạo branch tạm `codex/harness-v3-rearchitecture`.
- Sau merge/review cuối, xóa branch tạm để chỉ còn `main`.

**Gate:** baseline xanh Linux, Windows và macOS; mọi semantic claim sống có owner; branch target đã được kiểm tra chính xác.

### P1 — Tinh gọn 5fedu không mất context sống

```text
profiles/5fedu/
├── profile.yaml
├── README.md
├── rules/
├── behaviors/
└── module-mapping/
    ├── modules.yaml
    └── ui-contracts.md

skills/
├── 5fedu-project/
└── 5fedu-module-parity/
```

Migration:

- `projects/domains/*` là nguồn chính.
- `domains/*` chỉ bổ sung claim duy nhất chưa có.
- `projects/parity/*` thành reference của `5fedu-module-parity`.
- Tah-app/Nostime overlays thành product conditions trong rules/module mapping.
- `organization/*` chuyển claim sống sang rule/behavior rồi xóa.
- `known-repos.md` bỏ absolute path; URL, verified commit và module mapping vào `modules.yaml`.
- Xóa archive, evidence, migration script, vendored project/source-lock cũ.
- Không giữ full hoặc selected vendored source.
- Always-loaded context tối đa 1.500 tokens; route context tối đa 8.000 tokens.
- Mỗi claim sống là `migrated` hoặc `deduplicated`, không có `dropped`.
- Giảm tối thiểu 85% file và dung lượng profile.

5fedu proof profile kiểm tra bốn chiều:

- Structural parity.
- Visual parity.
- Behavioral parity.
- Architectural parity.

Evidence gồm browser, accessibility, console, network, trace, responsive states, keyboard/touch, reduced motion, permission/state matrix và revision-bound independent verification.

**Gate:** router, installer và parity fixtures chứng minh không mất capability, domain rule, permission, UI contract hoặc module mapping.

### P2 — Taxonomy, skills và context router

Canonical ownership:

- `rules`: invariant/gate ngắn.
- `behaviors`: lifecycle và default operating policy.
- `skills`: capability workflow lazy-loaded.
- `packages/engine`: mechanism, strategy và proof enforcement.
- `profiles`: organization/project context.
- `platforms`: native rendering/activation.

Core public skill portfolio:

- `plan-and-handoff`.
- `finish-to-completion` dưới dạng thin engine façade.
- `context-evolution-protocol` dưới dạng thin governance façade.
- `researcher`.
- `docs-style`.
- `ui-taste`.
- Một unified QA capability.

Hai skill 5fedu chỉ xuất hiện khi profile 5fedu active.

Refactor:

- `implementation-discovery` thành engine-backed discovery behavior.
- Hợp nhất `clean-code` và `code-review` thành quality policy với smell, strict và independent-review modes.
- `browser-qa` thành browser tool adapter.
- `parity-verification` thành proof profile.
- `best-of-n` thành engine strategy bắt buộc isolation.
- Image asset workflow là optional capability/lens, không tạo trigger cạnh tranh.
- Xóa alias, pointer rule và skill không còn canonical owner.
- `plan-and-handoff` bắt buộc inventory/reconcile plan artifacts cũ trước khi xuất successor.
- `finish-to-completion` không được tự dựng plan mới khi artifact hiện hành tồn tại.

Router trả:

- Một mode: `plan | execute | review | research`.
- Không hoặc nhiều lenses.
- Profile/context packs.
- Tool/integration dependencies.
- Dependency closure và lý do selected/suppressed.

Router phải phát hiện compound intent, cycle, duplicate ID, ambiguity, conflict và missing capability; không silently drop skill.

**Gate:** duplicate audit bằng không; compound fixtures load đủ nội dung skill; negative fixtures ngăn `ui-taste`/frontend workflow ghi đè 5fedu parity.

### P3 — Engine, controller và worker thật

Run state sử dụng contract A3; plan lifecycle là state machine riêng.

Controller:

- Dispatch task chỉ khi dependency đã reconciled.
- Validate cycle, missing dependency, ownership overlap và uncovered requirement.
- Persist checkpoint/resume.
- Enforce owned/forbidden paths.
- Bounded retry/escalation.
- Không code path nào gán `COMPLETED` nếu thiếu verification và reconciliation.

Worker adapter:

```text
detect()
health()
submit()
cancel()
collectReceipt()
```

- Worker phải tạo diff hoặc artifact thật.
- Xóa local-worker giả.
- Structured argv thay `shell=True`.
- Worker không được sửa ngoài ownership.
- Không real provider/runner thì `BLOCKED`, không giả PASS.

Verifier/reviewer:

- Không tin worker receipt tự khai.
- Blank, stub, comment-only và fake remediation đều bị từ chối.
- Long-task fixture phải dispatch worker, sửa fixture repository và được verifier độc lập xác nhận.
- Main-agent direct edit bị phát hiện và chặn.

Model routing:

- Provider-neutral role/risk tiers.
- Model catalog discover từ host.
- Canary/eval trước khi route model mới.
- UI hiển thị requested/resolved/observed model và effort.
- Route mặc định chỉ đổi sau owner approval.

**Gate:** state propagation, crash recovery, resume, retry, escalation, ownership isolation và repair loop đều pass.

### P4 — Portable contracts, CLI và năm host adapter

Canonical CLI:

```text
harness plan inventory
harness plan adopt
harness plan status
harness plan checkpoint
harness plan lineage
harness plan reconcile
harness plan repair
harness plan export
harness plan finalize

harness run
harness status
harness resume
harness verify
harness doctor
harness dashboard
harness runtime install
harness runtime update
harness runtime rollback
harness runtime uninstall
harness models refresh
harness skills doctor
harness eval run
```

- Một compiler, validator và runtime consumer.
- Plan MD là authority; YAML là projection.
- Runtime mirror chỉ build/install từ canonical source.
- Hash hai chiều chặn split-brain.

Mỗi platform adapter có:

```text
detect
render
stage
activate
probe
update
uninstall
rollback
```

- Native runners cho Codex, Cursor, Antigravity, Grok và OpenCode.
- CLI/headless API nếu host hỗ trợ; desktop-native runner nếu không.
- OpenCode dùng schema native hiện hành, không dùng legacy `mcpServers`.
- Credentials/tokens của host không được truyền sang host khác.
- Thin wrappers giữ đúng exit code, JSON, quoting, Unicode, paths và failure semantics.
- Installer staging + validation + atomic swap.
- Sentinel/user-owned files không bị xóa.
- Failpoint không để half-installed runtime.
- Uninstall chỉ xóa file có ownership marker.
- Portable bundle handoff giữa host; không live federation trong cùng run.

**Gate:** clean/update/failure rollback trên ba OS; năm native attestation; missing/stale/emulated runner làm certification fail.

### P5 — Apple-inspired Control Plane

Information architecture:

- Monitor: Overview, Runs, Evaluations.
- Harness: Architecture, Models, Platforms, Capabilities, Profiles.
- History: Audit.

Routes:

```text
/overview
/runs/:runId/:tab
/evaluations
/architecture/:view
/configuration/:section
/profiles/:profileId
/audit/:eventId?
```

Runs dùng master-detail với Summary, Workflow, Evidence, Timeline và Plan.

Plan tab:

- Original plan read-only.
- Artifact lineage và requirement-resolution matrix.
- Original/amendment comparison.
- Batch/task/progress timeline.
- Requirement-to-AC coverage.
- Reconciliation và repair history.
- Plan anchor cạnh diff/evidence.
- Export bundle/hash.
- Không cho sửa original hoặc dùng arbitrary file mutation.

Design:

- Apple-inspired nhưng không copy trade dress hoặc phụ thuộc SF Symbols.
- System/light-first; dark mode first-class và parity đầy đủ.
- Một accent color, hierarchy mạnh, whitespace, progressive disclosure.
- System font stack, CSS variables/modules; xóa inline-style architecture.
- Không raw JSON mặc định.
- Tối đa một primary action mỗi màn hình.
- Taste chọn theo brief, không random.
- Loading, empty, error, stale và offline states.
- WCAG 2.2 AA, reduced motion, 200% zoom, focus rõ và status không phụ thuộc màu.
- Architecture DAG có keyboard outline/table fallback.

Security/config:

- Bind `127.0.0.1`.
- Kiểm tra host/origin.
- Typed schema validation.
- `validate → semantic diff → confirm → apply → audit`.
- Rollback snapshot/hash.
- Không có start/stop/retry/cancel run API.

Typed APIs gồm health, effective config, registries, platforms, runs/evidence, plans/lineage, evaluations và audit; config mutation chỉ preview/apply/rollback.

**Gate:** không serious/critical accessibility violation, console/network error, silent catch hoặc inaccessible graph; visual regression pass ở bốn viewport đã khóa.

### P6 — Script, generated output và đúng hai CI workflow

Root scripts chỉ còn:

```text
build
test
check
ci:quality
ci:certify
```

- Business logic chuyển vào TypeScript engine/CLI.
- Chỉ giữ thin shell/PowerShell bootstrap khi Node chưa có.
- Xóa PowerShell/Python/TypeScript wrappers trùng chức năng.
- Xóa regex-only validators, always-pass summary, fake benchmark launcher và one-time migration scripts.
- `generated/` không còn tracked source; build tạo deterministic artifact và CI upload.
- CI fail nếu generated artifact không khớp canonical source.

Chỉ còn:

1. `quality.yml`
   - PR và push `main`.
   - Linux, Windows, macOS.
   - Build, typecheck, unit/integration, schema, lineage, router, skill, profile, installer dry-run, docs, security/path và deterministic eval.
   - Một aggregate required check.
   - Missing, skipped, stale hoặc unknown đều fail.

2. `certification.yml`
   - PR, push `main`, schedule và release.
   - Matrix năm native host.
   - Worker/verifier E2E, plan adoption, repair loop, long-task, UI smoke, controlled eval và host attestation.
   - Release chỉ dùng attestation bind đúng commit/artifact SHA.

Không `continue-on-error`, advisory summary hoặc path filter làm required job false-green.

**Gate:** hai workflow xanh trên cùng commit và toàn bộ false-PASS/skipped-check canary bị bắt.

### P7 — Integrations, telemetry, evals và docs

Integrations:

```text
required:
  codebase-memory
  playwright
  chrome-devtools

optional:
  caveman
```

- Xóa `recommended`, Context7 và registry YAML trùng.
- JSON canonical registry.
- Version/integrity pin cụ thể; không dùng `latest`.
- Không tự xóa user-owned config.
- Required integration/capability thiếu tạo `BLOCKED`.

Telemetry mặc định:

- Host/model/provider/effort.
- Requested/resolved/observed model.
- Token, latency, cost.
- State transition, retry và tool count.
- Evidence hash và failure taxonomy.

Event hierarchy:

```text
run → agent → task → model turn → tool call
→ handoff → verification → review
```

- Raw prompt/output/source/secret chỉ thu khi opt-in.
- Có redaction, retention, namespace isolation, delete/export.
- Credential hoặc content của profile này không rò sang profile/host khác.

Evaluation:

- Requirement/AC coverage.
- Quality, latency và cost.
- Retry/intervention/resume.
- False-positive verification.
- Out-of-scope changes.
- Maintainer acceptance.
- Quality-per-cost và quality-per-time.
- Không xem benchmark pass là đủ để merge.

Docs:

- README EN/VI đồng bộ facts, commands, schemas, host support và CI.
- Deep technical docs tiếng Việt.
- Specification, operations, failure model, threat model và ADR.
- Giải thích taxonomy, lifecycle, evidence, failure paths, install/update/uninstall/rollback, recovery, privacy và migration v2→v3.
- Facts sinh hoặc kiểm tra từ manifest/schema.
- Screenshot lấy từ build đã visual-QA, không dùng mock.

### P8 — Immutable plan, shadow tracking và reconciliation hoàn chỉnh

- Thay bootstrap shim bằng engine chính thức nhưng giữ nguyên plan ID, hash, batch IDs và lịch sử.
- Filesystem locking ngăn hai runner mutate cùng batch.
- Approved amendment không sửa original.
- Import/export giữ original hash và receipts.
- Host mới chỉ bổ sung attestation.
- Missing file, checksum mismatch, tamper, schema mismatch và unsupported version đều fail.
- Reconciliation statuses:
  - `MATCH`
  - `PARTIAL`
  - `MISSING`
  - `DEVIATED`
  - `EXTRA`
  - `SUPERSEDED`
- Review receipt bind original hash, approved-amendment hash, effective-plan hash, diff fingerprint, evidence hashes, verifier identity, proof epoch và shadow revision.
- Code/evidence thay đổi sau review làm review stale.
- CLI và Control Plane phải cho cùng ledger truth.
- Chính plan này là controlled long-task fixture đầu tiên.

**Gate:** `finalize` chỉ pass khi latest reconciliation còn fresh, lineage `PASS`, không finding mở và mọi requirement có implementation link, AC result, verifier claim cùng evidence hash.

### P9 — Adversarial review và cleanup cuối

Chạy độc lập:

- Strict maintainability review.
- Security, SAST, SCA và secret scan.
- Platform adapter/credential isolation review.
- Docs/facts review.
- Browser QA và visual review.
- Long-task repeated holdout với human-review sample.
- Migration/cleanup audit.
- Runtime/generated parity audit.
- Main-agent over-implementation audit.
- Orphan side-effect audit.
- Artifact-lineage completeness audit.

Sau khi tất cả pass:

- Merge theo governance đã duyệt.
- Xóa branch tạm.
- Xóa mọi branch local/remote ngoài `main`.
- Xác minh không archive, evidence cũ, vendored source, tracked generated output, dead script hoặc compatibility facade còn lại.

## 7. Test và Definition of Done

Bắt buộc:

- Inventory nhận đúng A1–A4, message/source identity và raw hashes.
- A2 được chứng minh là exact prefix của A3.
- A4 chỉ supplement A3.
- A4 thắng A1/A2 ở nơi A3 không quyết định.
- Xóa một requirement cũ chưa supersede làm successor fail `PLAN_LINEAGE_GAP`.
- Pasted prompt chứa cùng Markdown vẫn resolve về plan artifact, không dùng prompt bytes.
- LF, CRLF, BOM, Unicode và file artifact được binary-copy đúng hash trên ba OS.
- Prompt fallback chỉ tạo `DRAFT`.
- Tamper original fail closed.
- Shadow drift được phát hiện và tái sinh.
- Amendment không đổi original.
- Orphan cache/source/install bị quarantine.
- Plan/compiler/runtime round-trip không mất requirement.
- Cycle, missing dependency, overlap ownership và uncovered requirement bị chặn.
- Worker thật, verifier độc lập và fake proof bị từ chối.
- Repair loop reopen đúng AC và giữ PlanAnchor.
- Review stale sau diff/evidence change.
- 5fedu semantic ledger không còn claim sống unmapped.
- Router compound intent/context budget/profile isolation pass.
- Installer clean/update/uninstall/rollback/failpoint pass trên ba OS.
- Cả năm host capture đúng original trước edit và không thể báo `COMPLETED` trước reconciliation.
- UI accessibility, keyboard, responsive, console/network, performance và visual regression pass.
- README EN/VI facts parity pass.
- `ci:quality` và `ci:certify` xanh trên cùng commit.
- Năm native attestation còn hiệu lực và bind đúng commit.
- Repository cuối chỉ còn branch `main`.

Harness v3 chỉ `COMPLETED` khi:

- Latest successor artifact đã owner-approved và lineage reconciliation `PASS`.
- Mọi requirement của successor là `MATCH` hoặc `SUPERSEDED` hợp lệ.
- Không open finding, orphan side effect hoặc stale review.
- Không claim vượt quá independent evidence.
- Không task `COMPLETED` nếu thiếu verification.
- Không kết thúc ở `PARTIAL` do hết token, thời gian hoặc context.

## 8. Giả định đã khóa

- Successor này thay A3 làm executable artifact sau khi được owner duyệt; A3 vẫn được lưu trong lineage.
- A3 thắng xung đột trực tiếp với A4.
- A4 thắng A1/A2 ở nơi A3 không quyết định.
- Tất cả requirement không xung đột được carry-forward.
- Engine/backend là canonical enforcement owner.
- Main agent không sửa source trong execution.
- Skills được tinh gọn mạnh; lifecycle mechanism chuyển vào engine.
- `.agent/` gitignored, local-first, exportable bằng bundle/hash và xem được trên Control Plane.
- Taste source pack được pin, chỉ expose `ui-taste` và được dùng theo brief.
- 5fedu không giữ vendored source.
- System/light-first, dark mode first-class, Apple-inspired.
- Portable handoff thuộc v3; live cross-host federation không thuộc v3.
- Thiếu bất kỳ native host runner nào làm certification fail.
- `.backup-harness/` bị xóa không backup.
- Branch cleanup không backup.
- Clean break; không compatibility facade v2.
