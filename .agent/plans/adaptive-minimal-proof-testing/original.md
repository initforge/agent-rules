# Adaptive Minimal-Proof Testing — Global Harness Behavior

## 1. Định danh và quyền ưu tiên
- `plan_id`: `adaptive-minimal-proof-testing`
- Owner-authorized phase plan (one-shot execution, không dừng ở diagnosis).
- Branch: `adaptive-minimal-proof-testing`, base = pushed
  `integration/persistent-mcp-session-broker` (d6f435c).
- KHÔNG amend/reopen plan `persistent-mcp-session-broker` hay bất kỳ plan cũ.
- KHÔNG đụng residual owner-managed `Documents/ChatGPT/ZaloAI-Ecommerce`.
- KHÔNG sửa source ZaloAI-Ecommerce / pos-ops ngoài read-only audit.
- Kế thừa authority: AGENTS.md, rules/, packages/kernel/src/northstar/,
  packages/engine/src/northstar/, schemas/, automation validators, evidence-ledger,
  North-Star runtime (kernel canonical, engine facade), verify:all.

## 2. Mục tiêu
Đưa `adaptive-minimal-proof-testing` thành **behavior always-on toàn cục** của
harness agent-rules: mọi repository, mọi task, mọi host, mọi MCP provider, mọi
integration, mọi platform. Behavior phải nằm trong canonical behavior +
verification layers (rules/, kernel/engine northstar, verification-router,
proof/evidence contracts, schemas/, automation validators, platform
projections/mirrors, documentation) — không phải prompt-only, không phải
batch-local, không phải optional skill.

Nguyên tắc cốt lõi: **minimal sufficient proof** — không chạy mọi test một cách
máy móc, không tối thiểu nỗ lực, không tối đa số test. Mỗi claim phải được
chứng minh bằng tập proof nhỏ nhất đủ mạnh; proof bị bỏ phải ghi lý do; không
bao giờ im lặng bỏ qua proof bắt buộc; không bao giờ claim PASS từ evidence yếu
hơn claim yêu cầu.

## 3. Nguyên tắc bắt buộc
- Trigger dựa trên scope/claim/risk/thay đổi dependency/runtime surface/project
  test architecture/host capability/evidence fidelity — KHÔNG chỉ keyword.
- Proof selection: deterministic trước, escalate fidelity khi claim yêu cầu;
  không silent downgrade.
- Live claim ⇒ live proof (browser/desktop/MCP/handshake/process/window/virtual
  desktop/focus/headed/session/reconnect/resource/network/host/auth/data-state).
  Unit/fake chỉ hỗ trợ, không thay thế live proof cho live claim.
- Failure semantics chính xác một trong:
  PASS | PARTIAL | BLOCKED | UNSUPPORTED | PRE-EXISTING | NEEDS_USER.
  Không biến BLOCKED/UNSUPPORTED thành PASS; không giấu failure bằng xóa test;
  không claim cả task PASS khi còn claim bắt buộc chưa giải quyết.
- Test refactor: audit trước, coverage mapping trước khi sửa; giữ/improve distinct
  coverage; ghi mọi test removed/merged/rewritten/downgraded; cấm xóa test để CI
  xanh, cấm yếu assertion, cấm đổi live→fake không đổi claim, cấm skip flaky
  thầm lặng, cấm giấu failure sau retry.
- Receipt phải ghi: task identity, repository, changed scope, claims, risks,
  proof profile, selected tests, omitted tests + reasons, escalation decisions,
  environment, results, evidence refs, final status.
- Không hard-code giả định project-specific thành global behavior.
- Router hoạt động qua CLI, North-Star runtime, verification-router,
  plan/review/implementation, handoff/resume, MCP/provider flows, platform
  adapters.

## 4. Phạm vi phase
- Phase 0 — authority and contract: plan/CAS/ledger, schemas, behavior contract,
  trigger/activation contract, proof profile schema, claim-to-proof mapping,
  risk-to-proof escalation, omission reason schema, proof receipt schema, test
  refactor matrix schema.
- Phase 1 — kernel implementation: trigger derivation (scope/claim/risk),
  proof profile catalog (A–K categories + 8 default profiles), selection engine
  (minimal-sufficient), live-proof rules, failure semantics, receipt emission.
- Phase 2 — engine facade + verification-router integration + CLI surface.
- Phase 3 — automation validators: schema validators, positive/negative
  fixtures, route parity fixtures, proof-selection eval cases (16 cases).
- Phase 4 — platform projections/mirrors: reconcile rules/route/schema into
  generated runtime build + installed mirrors; NATIVE_UNVERIFIED honest.
- Phase 5 — project audit (read-only): agent-rules, ZaloAI-Ecommerce, pos-ops.
- Phase 6 — documentation: rules/ rule file + manifest contract, AGENTS.md,
  docs; acceptance: validators green, eval cases pass, branch pushed.

## 5. Ràng buộc cấm (forbidden shortcuts)
Không: prompt-only behavior, batch-local rule, keyword-only trigger, chạy mọi
test không chọn lọc như proof, bỏ proof im lặng, PASS từ evidence yếu, đổi
BLOCKED/UNSUPPORTED thành PASS, xóa test không coverage map, yếu assertion,
live→fake không đổi claim, skip flaky thầm lặng, retry che failure, hard-code
project-specific, amend plan cũ, đụng residual Documents, sửa ZaloAI/pos-ops
source, force push, overwrite main, claim COMPLETE trước acceptance.

## 6. Tiêu chí hoàn tất
Behavior hiện diện trong canonical rules/runtime (không chỉ docs); always-on
cho mọi repository/task; trigger scope/claim/risk-based; đủ mọi test category;
selection minimal-but-sufficient; live claim ⇒ live proof; refactor có coverage
mapping; không thể giấu failure; semantics 6 trạng thái enforced; receipts ghi
selected+omitted; route/schema/negative validators pass; platform mirrors
reconciled; project audit 3 repos; documentation định nghĩa global behavior;
dedicated branch committed + pushed; residual owner-managed không bị đụng.
