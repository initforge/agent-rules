# Persistent MCP Session Broker & Guardian

## 1. Định danh và quyền ưu tiên
- `plan_id`: `persistent-mcp-session-broker`
- Owner-authorized phase plan (owner authorization, không dừng ở diagnosis).
- Kế thừa authority: AGENTS.md, north-star-v2/, rules/, skills/, integrations/registry.json,
  evidence-ledger, các repository invariant và legacy behavior đã proven.
- Không chạy concurrent với plan khác trên cùng worktree (plan trước đã CLOSED + archived).

## 2. Mục tiêu
Xây persistent MCP session binding: mỗi logical chat/agent session acquire và sử dụng ổn định
một MCP provider instance cùng browser/desktop-app resource của nó.

Ví dụ bắt buộc hoạt động: session A yêu cầu browser QA → harness lazy-start Playwright MCP qua
mcp-guardian → resource được bind vào session A → session A tái sử dụng đúng browser → owner kéo
browser từ virtual desktop 2 sang 5 → harness không kéo về, không coi là lỗi → session A vẫn dùng
đúng resource → session B không thấy/điều khiển resource A nếu chưa có explicit shared policy →
MCP process chết nhưng resource sống thì reconnect → resource chết thật thì tạo mới và ghi
`resource_recreated`, không giả vờ continuity.

## 3. Nguyên tắc bắt buộc
- Identity: `logical_session_id`, `host_session_id`, `host_instance_id`, `mcp_lease_id`,
  `provider_instance_id`, `mcp_connection_id`, `resource_id`, `source_window_fingerprint`,
  `provider_window_fingerprint`, `initial_workspace`, `current_workspace` — mỗi khái niệm một
  thuật ngữ, không dùng chung chữ "session".
- Broker runtime state nằm ngoài source authority (user runtime dir, 0600, SQLite WAL hoặc state
  store có transaction/CAS/crash recovery/schema versioning/migration/stale cleanup). Không JSON
  append tùy tiện.
- Exclusive lease là mặc định; shared phải explicit policy.
- Guardian: lazy-start, không auto-move sau READY, không switch desktop, không focus/activate,
  không hidden/minimize/Xvfb fallback trong visible mode; operator move/close là operator event.
- Process/window identity: PID + /proc start time + exe + cmdline hash; window id + WM_CLASS +
  _NET_WM_PID + start time; không PID-only, không first-window heuristic, không workspace-number-
  only identity.
- MCP transport: STDIO một connection cho một logical session (không nối hai client vào cùng
  stream); share resource qua broker/proxy hoặc Streamable HTTP có lease token ACL.
- Host adapters: OpenCode, DeepSeek Harness (DSH), Codex CLI, Codex desktop/IDE — mỗi adapter báo
  granularity thật (`chat`/`host-session`/`host-window`/`project`/`unsupported`), không suy identity
  từ config filename, không bypass guardian, không @latest, không secret trong repo/receipt.
- DSH: không sửa source/fork; chỉ adapter phía ngoài + projection; `SKILL.md`/`ROUTE.json` canonical
  vẫn authoritative; nếu không có session-scoped MCP seam thì báo granularity thật.
- Codex desktop: shared config không phải bằng chứng per-chat identity; nếu không có host hook thì
  certify đúng granularity hoặc unsupported; ChatGPT web là surface riêng, không claim.
- X11/Cinnamon certified đầu tiên (x11-ewmh); pure Wayland không claim; XWayland live-test riêng.

## 4. Phạm vi phase
- Phase 0 — authority and contract: plan/CAS/ledger, schemas, host capability matrix, exclusive
  default, X11-only initial certification, Codex granularity decision.
- Phase 1 — broker/registry: runtime state, lease API, CAS/locking, lifecycle/reconcile/doctor,
  schema/fixtures.
- Phase 2 — provider manager: guardian launch, process/window/resource attribution, reconnect,
  relocation observation, no-focus/no-unrelated-window proof.
- Phase 3 — OpenCode: native API session binding, interactive launcher binding, per-session MCP
  projection, live proof.
- Phase 4 — DeepSeek Harness: host detection/pin, headless adapter, rules/skills projection,
  non-GUI MCP projection, session-aware Web bridge (hoặc granularity thật), live proof.
- Phase 5 — Codex: CLI adapter, desktop/IDE config projection, Streamable HTTP broker, honest
  granularity, live proof (hoặc unsupported boundary rõ).
- Phase 6 — acceptance: multi-host concurrency, restart/reconnect, manual relocation, stale/
  ambiguous binding, validators + regression suite, live acceptance receipts.

Không dừng sau Phase 0. Host nào thiếu public session hook thì implement các host khác, classify
host đó ở granularity thật và ghi rõ capability gap còn lại.

## 5. Ràng buộc cấm (forbidden shortcuts)
Không: direct project-level MCP override, guardian disable, allowUnbound cho local visible GUI,
@latest, first-window heuristic, all-window fallback, workspace-number-only identity, PID-only
identity, static DSH profile claim là per-chat binding, shared Codex config claim là per-chat
identity, một STDIO stream share giữa nhiều chat, auto browser replacement không receipt,
auto provider relocation sau READY, desktop switching/focus activation, hidden/minimized/headless
fallback trong visible mode, kill theo process group, claim COMPLETE không có live host-specific
evidence, DSH source fork/edits core loop khi chưa có upstream-integration decision riêng.

## 6. Tiêu chí hoàn tất
Test matrix 30 case (schema/unit/integration/fake-WM/live), live acceptance receipts cho từng host
(OpenCode headless/interactive, DSH headless/Web multi-session/process-per-project, Codex CLI,
Codex desktop, non-GUI MCP, browser GUI MCP, design desktop MCP, mobile/device MCP), cert chạy được
và ghi trung thực, không có bypass guardian, mọi lease transition có receipt + reason.
