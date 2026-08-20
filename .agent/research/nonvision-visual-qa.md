# Non-vision visual QA

## Summary

Model không có vision vẫn có thể thực hiện phần lớn visual conformance nếu harness biên dịch runtime và ảnh thành structured evidence. Không được đồng nhất structured conformance với semantic taste review: typography mood, visual hierarchy, balance và cảm giác “đẹp” vẫn cần vision-capable oracle hoặc human.

## Evidence

- Playwright MCP cung cấp accessibility snapshot dạng text, stable element references và bounding boxes.
- Playwright Test tạo expected/actual/diff artifacts bằng `toHaveScreenshot()` và kiểm cấu trúc bằng ARIA snapshots.
- Chrome DevTools Protocol `DOMSnapshot.captureSnapshot` trả flattened DOM, layout rectangles, paint order và allowlisted computed styles.
- axe-core trả violations, impact, selectors và incomplete cases; automated accessibility không bao phủ toàn bộ manual WCAG review.
- Repo đã có `no-vision-worker-contract.md`, parity claim packet và evidence pipeline; thiếu compiler/reducer thống nhất cho structured visual evidence.

Primary sources:

- https://github.com/microsoft/playwright-mcp
- https://playwright.dev/docs/test-snapshots
- https://playwright.dev/docs/aria-snapshots
- https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/
- https://github.com/dequelabs/axe-core

## Recommendation

### Three proof layers

1. `RUNTIME_CONFORMANCE`: behavior, states, console, network, keyboard, ARIA and axe.
2. `STRUCTURED_VISUAL_CONFORMANCE`: pixel/region diff plus DOM/layout/style invariants.
3. `SEMANTIC_VISUAL_REVIEW`: taste, hierarchy, balance and brand fit by a vision-capable oracle when available.

Do not let layer 1 or 2 self-certify layer 3.

### Visual Evidence Bundle

For each route, state and viewport, produce one deterministic bundle:

- browser/font/locale/timezone/DPR/data-fixture identity;
- expected/current/diff screenshot paths and hashes;
- global and per-region pixel-diff metrics;
- accessibility/ARIA snapshot;
- DOM snapshot with selector, text, bounding box, paint order and computed styles;
- axe violations/incomplete nodes;
- console/network failures;
- layout findings anchored to selector and source/component mapping;
- baseline identity and accepted-deviation IDs.

### Deterministic detectors

- overlap, clipping, off-screen and unintended scroll;
- text overflow, ellipsis and line-count drift;
- target-size and spacing-token violations;
- grid/edge alignment and normalized reference-vs-target geometry;
- font family, size, weight, line height, color, radius, shadow and background drift;
- contrast, focus visibility and status-only-by-color;
- responsive reflow, element loss and breakpoint-state mismatch;
- layout shift and unstable/flaky screenshots.

### Repair loop

1. Non-vision worker receives visual contract plus structured bundle, not raw screenshot alone.
2. Worker repairs findings by selector/component and runs focused proof.
3. Reducer regenerates the bundle and compares the same regions.
4. Vision-capable model, when available, reviews only the compact screenshot/diff bundle at coherent UI boundaries.
5. Findings return as structured selector/region issues; loop until relevant layers pass.

### Capability policy

- `vision_input=SUPPORTED`: semantic visual review is mandatory for UI boundaries.
- `vision_input=UNSUPPORTED`: structured visual proof is mandatory; the model cannot claim semantic visual PASS.
- `vision_input=UNKNOWN`: run capability canary; never silently skip.
- If any approved vision model exists, route semantic review to it even when the implementer lacks vision.

### Optional tool-mediated vision

A local or remote vision service can expose image analysis as a tool and return structured JSON. The main model remains non-vision, but the system gains a vision oracle. Treat its output as an independent receipt with model/version/input hashes, not as deterministic truth.

## Risks

- Pixel diffs are sensitive to fonts, browser, OS, animation and dynamic data; pin the environment and detect flakes.
- Automatic baseline updates can normalize regressions; require explicit owner approval.
- Geometry and CSS metrics can satisfy rules while still looking generic or unbalanced.
- OCR/CV extraction from reference-only images is approximate and must not invent hidden interaction behavior.
- A vision model can still hallucinate; bind every finding to screenshot region and current artifact hash.

## Unknowns

- Exact global/per-region diff thresholds by surface.
- Which baselines are owner-approved and how baseline changes are signed.
- Component/source-map format for selector-to-file repair hints.
- Whether semantic visual review is final-blocking when no approved vision oracle exists.

## Hand to Plan Architect

- Add `VisualEvidenceBundle` and `VisionCapabilityAttestation` contracts.
- Add a compiler/reducer in engine/backend, not in skills.
- Extend platform model discovery with tri-state vision capability and canary receipts.
- Keep no-vision workflow in the existing parity/browser QA owners; do not create a competing visual-QA skill.
- Separate structured and semantic visual verdicts in reconciliation and Control Plane.
