OWNER-APPROVED AM-0005 — TERMINAL CONVERGENCE + CONTROL PLANE EXPERIENCE REDESIGN

Đây là owner decision có hiệu lực ngay, bổ sung vào active Harness v3 successor. Không rewrite original.md, AM-0001, AM-0002 hoặc AM-0003. AM-0004 đã tombstone và không được tái sử dụng.

Capture nguyên instruction này thành:
.agent/plans/<active-plan-id>/amendments/0005-terminal-convergence-control-plane-redesign.md

Sau đó recompute effective-plan hash, update lineage và tiếp tục active run. Đây không phải plan mới, không tạo competing ledger.

KHÔNG hỏi owner “có muốn fix tiếp không”.
KHÔNG phát final response sau một batch.
KHÔNG coi PARTIAL là terminal.
KHÔNG phát CERTIFIED_READY_FOR_REVIEW nếu còn bất kỳ PARTIAL, MISSING, DEVIATED, EXTRA, stale review, missing evidence hoặc missing attestation nào.

Current observed HEAD trước instruction: f6da6857605090e850589036af3fff4c40957595.
Phải resolve lại HEAD thực tế trước khi làm.

## A. Thu hồi false certification và sửa terminal behavior

Current CERTIFIED_READY_FOR_REVIEW claim bị owner thu hồi vì có 3 PARTIAL và canonical state không chứng minh completion.

Audit đã xác nhận:

- Canonical WorkLedger vẫn status ADOPTED.
- Ledger không chứa canonical plan requirements đúng contract.
- verificationClaims = 0.
- attestations = 0.
- Shadow reconciliation còn 3 PARTIAL.
- certification.yml chỉ có opencode, grok, codex.
- ci:quality và ci:certify chỉ alias build/check/test.
- generated/ còn khoảng 300 tracked files.
- evaluation.yml.obsolete, native-smoke.yml.obsolete và static.yml.obsolete vẫn tracked.
- Plan & Evidence page chưa hiển thị immutable plan, lineage, requirement coverage, repairs hoặc evidence thật.

Đầu tiên phải implement terminal gate trong engine, không chỉ thêm wording vào skill/rule:

1. `CERTIFIED_READY_FOR_REVIEW` chỉ hợp lệ khi:
   - mọi effective requirement là MATCH hoặc SUPERSEDED hợp lệ;
   - không có PARTIAL/MISSING/DEVIATED/EXTRA;
   - mọi AC có fresh independent PASS claim;
   - latest reconciliation bind đúng original, amendment set, effective hash, final diff và shadow revision;
   - không finding mở;
   - không review stale;
   - đủ năm native host attestations bind đúng final HEAD;
   - ci:quality và ci:certify PASS trên cùng final HEAD.

2. Khi còn bất kỳ non-terminal status:
   - engine chuyển run thành `needs-remediation`;
   - tự tạo bounded repair slice;
   - tự dispatch dependency-ready work;
   - tiếp tục verify → review → reconcile;
   - không hỏi owner có muốn tiếp tục.

3. Thêm deterministic regression tests:
   - 17 MATCH + 1 SUPERSEDED + 3 PARTIAL phải bị từ chối certification;
   - zero verification claim phải bị từ chối;
   - zero/four/stale host attestations phải bị từ chối;
   - stale diff/review phải bị từ chối;
   - mọi requirement MATCH/SUPERSEDED với fresh evidence mới được pass;
   - batch boundary không được tạo user-relay question;
   - self-solvable technical residual không được phân loại owner decision.

4. Dogfood terminal gate mới ngay trong active run. Từ thời điểm này chat prose không được làm canonical completion state.

Main agent chỉ:
- dispatch;
- kiểm tra owned paths;
- đọc integrated diff và evidence;
- reject/accept receipts;
- reconcile và mở repair.

Main agent không sửa source. Dùng worker tier vừa đủ; reviewer/verifier độc lập. Mỗi slice tối đa năm focus files và tám AC.

## B. Đóng toàn bộ residual thật, không chỉ ba item được báo

### B1 — CI và workflow

- Chạy quality matrix thật trên GitHub Actions: Linux, Windows, macOS.
- Thêm `workflow_dispatch` để certify branch deepseek-implement mà không merge.
- Giữ trigger PR và push main theo original plan.
- certification.yml phải có PR, push main, schedule, release và workflow_dispatch.
- Certification phải bao phủ đủ Codex, Cursor, Antigravity, Grok và OpenCode.
- Pin GitHub Actions bằng immutable full commit SHA, không dùng `@v4`.
- Một aggregate required check; missing/skipped/stale/unknown đều fail.
- `ci:quality` và `ci:certify` phải gọi canonical engine/CLI suites thật, không chỉ cùng alias build/check/test.
- Hai workflow phải pass trên cùng exact final HEAD.
- Không dùng mock, emulation, installed flag hoặc JSON tự khai làm native attestation.

### B2 — Accessibility residual

Fix tận gốc, không tăng timeout hoặc tolerance:

- `/models-routes`: mọi scrollable region có keyboard access, accessible name và focus indication phù hợp.
- `/skills`: sửa color contrast theo WCAG 2.2 AA trong cả light/dark và mọi interactive state.
- Tìm nguyên nhân timing instability: route readiness, fonts, hydration, animation hoặc test fixture.
- Tạo deterministic readiness contract trước khi axe/screenshot capture.
- Chạy axe lặp nhiều lần để chứng minh không flaky.
- Zero serious/critical và không còn hai timing-dependent residual.
- Re-run keyboard, 200% zoom, reduced motion, responsive, console và network QA.

### B3 — Cleanup và false gap sweep

- Xóa đúng ba `.obsolete` workflow sau khi coverage đã chuyển hoàn chỉnh.
- `generated/` không còn tracked source; build tạo deterministic artifact.
- Xóa dead scripts, temporary outputs, stale backup/test side effects và compatibility facade.
- Chạy `git diff --check`.
- Re-audit every P-1/P0–P9 requirement trực tiếp từ original + AM-0001..AM-0003 + AM-0005.
- Không tin danh sách “chỉ còn ba residual”.
- Mọi gap mới phát hiện phải tự mở repair slice và xử lý.

## C. Owner-approved full Control Plane redesign

Owner cho phép đập bỏ và xây lại hoàn toàn frontend Control Plane nếu cần.

Có thể:
- thay toàn bộ layout shell;
- thay navigation;
- thay component structure;
- thay CSS architecture;
- xóa UI code cũ sau khi feature/contract mapping hoàn tất;
- thiết kế lại mọi screen.

Không cần giữ visual compatibility với UI hiện tại.

Phải giữ:
- toàn bộ capability;
- typed API contracts;
- security/local-only constraints;
- immutable plan semantics;
- auditability;
- required routes và deep linking;
- loading/empty/error/stale/offline states;
- accessibility và responsive behavior.

### Design read bắt buộc

Surface: local Harness Control Plane dành cho technical operator.
Tone: calm, luminous, precise, premium, spatial và trustworthy.
Direction: Apple-inspired professional product UI, không sao chép trade dress.
Taste lens: ui-taste bắt buộc, chống generic admin dashboard và AI slop.

Trước first UI edit:
1. Load canonical `skills/ui-taste/SKILL.md`.
2. Ghi design read và selected reference lens vào receipt.
3. Inventory feature/API/route hiện tại để không mất capability.
4. Lập feature-preservation matrix.
5. Chỉ sau đó mới thay UI.

Không được dùng:
- hàng loạt card chữ nhật giống nhau;
- dashboard grid hổ lốn;
- raw tables/raw JSON làm presentation chính;
- gradient/glass/shadow trang trí vô nghĩa;
- typography ngẫu nhiên;
- motion không mang thông tin;
- icon emoji làm visual system;
- dồn toàn bộ UI vào một App.tsx/styles.css khổng lồ.

### Information architecture

Monitor:
- Overview
- Runs
- Evaluations

Harness:
- Architecture
- Models
- Platforms
- Capabilities
- Profiles

History:
- Audit

Routes thật, không chỉ hash-page giả:

- `/overview`
- `/runs/:runId/:tab`
- `/evaluations`
- `/architecture/:view`
- `/configuration/:section`
- `/profiles/:profileId`
- `/audit/:eventId?`

Back/Forward và deep links phải hoạt động.

### Plan experience — ưu tiên cao nhất

Xây Plan workspace thành trung tâm quan sát execution, không phải trang schema tĩnh.

Desktop:
- adaptive three-pane workspace;
- trái: plan/requirement navigator;
- giữa: visual execution canvas;
- phải: contextual inspector/evidence.

Tablet/mobile:
- pane chuyển thành drill-down/sheet hợp lý;
- không thu nhỏ desktop layout một cách máy móc.

Phải hiển thị:

1. Plan identity header:
   - immutable original badge;
   - plan ID;
   - original/effective hashes;
   - baseline/final HEAD;
   - reconciliation state;
   - stale/tamper state.

2. Artifact lineage:
   - original → amendments → effective plan;
   - precedence và supersession;
   - interactive graph;
   - keyboard-accessible outline/table fallback.

3. Requirement coverage:
   - requirement → AC → assignment → receipt → verification → review;
   - filter theo MATCH/PARTIAL/MISSING/DEVIATED/EXTRA/SUPERSEDED;
   - không dùng màu làm tín hiệu duy nhất.

4. Execution visualization:
   - dependency DAG;
   - batch swimlanes;
   - current/critical path;
   - worker/verifier ownership;
   - checkpoint timeline;
   - retry/escalation events.

5. Reconciliation matrix:
   - requirement rows;
   - implementation/evidence/reviewer columns;
   - concise status glyph + text;
   - drill-down thay vì raw JSON.

6. Repair history:
   - finding → reopened AC → repair slice → re-verification → closure;
   - before/after evidence;
   - stale review relationships.

7. Plan anchor workspace:
   - original anchor read-only;
   - corresponding integrated diff;
   - evidence and verifier receipt;
   - side-by-side hoặc focus mode;
   - không sửa original từ UI.

8. Evidence visualization:
   - evidence provenance;
   - hashes;
   - freshness;
   - host/model identity;
   - screenshot/diff preview khi phù hợp;
   - console/network/accessibility summary.

9. Export:
   - bundle/hash export;
   - semantic status;
   - no arbitrary mutation.

### Layout và visual system

- System/light-first; dark parity đầy đủ.
- Một restrained accent color.
- System font stack.
- Strong hierarchy và generous spatial rhythm.
- Layered surfaces với depth tinh tế, không lạm dụng glass.
- Contextual toolbar thay vì button wall.
- Một primary action tối đa mỗi screen.
- Progressive disclosure cho evidence nặng.
- Data density thích nghi theo viewport.
- Graphs và timeline có skeleton/loading/empty/error/stale states.
- Visualizations phải giúp hiểu state/dependency, không trang trí.

### Motion system

Dùng motion nâng cao nhưng có mục đích:

- route/view transitions nhẹ;
- panel expansion/collapse có continuity;
- shared-context transition khi mở requirement/evidence;
- DAG/timeline update thể hiện state transition;
- filter/sort không làm layout giật;
- hover/focus/press feedback tinh tế;
- duration/easing thống nhất qua motion tokens;
- animation không chặn input;
- `prefers-reduced-motion` thay thế bằng instant hoặc low-motion transition;
- không cinematic intro, looping decoration hoặc motion chỉ để khoe.

Motion phải được browser/performance QA; không gây layout shift hoặc input lag.

### Các màn hình còn lại

Redesign đồng bộ toàn Control Plane:
- Overview: readiness từ CI/evidence thật.
- Runs: master-detail Summary/Workflow/Evidence/Timeline/Plan.
- Evaluations: quality/cost/latency/retry/false-positive trends.
- Architecture: dependency/subsystem DAG + accessible fallback.
- Models: requested/resolved/observed rõ ràng.
- Platforms: native capability và attestation freshness.
- Capabilities/Profiles: activation/dependency/context routing.
- Audit: chronological, filterable, evidence-linked history.

Không được chỉ làm đẹp Plan page rồi để các màn hình khác dùng visual language cũ.

## D. UI implementation và verification strategy

Chia redesign thành bounded slices, mỗi slice build-green:

1. Design tokens + application shell + routing.
2. Shared layout primitives + navigation.
3. Plan data adapters and typed view models.
4. Plan identity/lineage/coverage.
5. DAG/timeline/reconciliation.
6. Evidence inspector/anchor split-view/repair history.
7. Remaining screen redesign.
8. Responsive/mobile behavior.
9. Motion/reduced-motion.
10. Accessibility/browser/visual stabilization.

Không nhét tất cả vào một giant component hoặc giant stylesheet.

Visual QA:
- 1440×900 light;
- 1280×800 dark;
- 768×1024;
- 390×844.

Mọi route × required state × viewport:
- Playwright interaction;
- axe;
- keyboard;
- focus;
- 200% zoom;
- reduced motion;
- console/network;
- screenshot regression;
- structured layout/geometry detectors.

DeepSeek không tự khai semantic visual PASS.
Nếu có approved SUPPORTED vision model, route coherent UI boundary và final Control Plane review sang model đó.
Nếu thực sự không có vision capability, semantic verdict là NOT_APPLICABLE_NO_VISION_CAPABILITY; runtime và structured visual conformance vẫn bắt buộc.

Không auto-rebaseline.
Không tăng screenshot tolerance để che defect.
Mọi visual finding quay lại worker và loop tới closure.

## E. Final convergence

Sau mỗi UI/infrastructure batch:
- update canonical ledger qua engine;
- regenerate shadows atomically;
- verify original hash không đổi;
- mark prior review stale;
- independently review integrated diff;
- reopen và repair mọi finding.

Sau candidate commit cuối:
- reinstall/update successor runtime;
- run doctor;
- certify năm native host;
- invalidate mọi attestation bind commit cũ;
- push chỉ `deepseek-implement`;
- không merge;
- không force-push;
- remote chỉ còn main và deepseek-implement.

Terminal gate cuối:

Chỉ phát `CERTIFIED_READY_FOR_REVIEW` khi:
- requirement counts: PARTIAL=0, MISSING=0, DEVIATED=0, EXTRA=0;
- mọi effective requirement MATCH hoặc SUPERSEDED hợp lệ;
- open findings=0;
- verification claims đầy đủ và fresh;
- latest independent reconciliation PASS;
- WorkLedger không còn ADOPTED/needs-remediation;
- UI redesign feature-preservation matrix PASS;
- all Control Plane routes pass browser/accessibility/visual QA;
- quality matrix thật pass Linux/Windows/macOS;
- certification đủ năm host;
- ci:quality và ci:certify pass cùng final HEAD;
- generated tracked count theo v3 policy bằng 0;
- obsolete workflow count bằng 0;
- doctor runtime PASS.

Nếu một gate fail:
- không trả final;
- tạo repair slice;
- tiếp tục thực thi.

Chỉ hỏi owner nếu xuất hiện credential mới, dịch vụ trả phí, destructive authority chưa được cấp hoặc xung đột product intent thật sự. Các residual hiện tại và toàn bộ redesign này đã được owner quyết định, không được hỏi lại.

Bắt đầu ngay bằng capture AM-0005 và terminal-gate repair. Không dừng ở plan/amendment writing; tiếp tục implementation toàn bộ.
