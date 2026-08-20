# Persistent MCP session binding research

Research date: 2026-08-15 (Asia/Ho_Chi_Minh)

## Summary

The requested behavior is feasible on Linux/X11, but it is not achieved by
remembering a virtual-desktop number or a single X11 window id. The durable
association must be modeled as a lease from a logical agent/chat session to a
provider instance and, separately, to the provider's browser or desktop-app
resource.

Moving a provider window to another virtual desktop must update its observed
location without changing its provider identity or breaking the MCP transport.
The initial target desktop is a launch-placement fact, not the permanent
identity key.

The implementation needs a local session broker/registry that can allocate,
resolve, heartbeat, reconcile, reattach, migrate, and close provider leases.
It must support exclusive leases by default. Sharing a browser or MCP process
between chats is unsafe unless the provider has an explicit multiplexing and
authorization contract.

## Identity model

Keep these identities separate:

* logical session/chat id;
* host session id and host process/window identity;
* MCP provider instance id and transport connection id;
* browser/app resource id (profile, CDP endpoint, app process);
* X11 window fingerprint and current workspace.

The X11 workspace and window id are observations. They are not stable
session identity. Window reuse, provider restart, browser multi-process
launch, manual relocation, and host restart require PID start time, executable
fingerprint, profile/endpoint identity, and session token validation.

## Host facts

OpenCode already exposes useful session-oriented driver/runtime seams and can
be adapted for per-session provider leases. Its standalone interactive mode
still needs a launcher/session registration path.

DeepSeek Harness is a developer-preview host with process-wide Cordis
composition, per-session agent presets, and an MCP client. Its documented
MCP/profile configuration does not establish per-session X11 desktop binding.
The first safe DSH GUI mode is one pinned DSH process/profile per project
desktop. Multi-session Web requires a session-aware DSH plugin or an external
session bridge that can identify the DSH chat/session.

OpenAI documentation states that the ChatGPT desktop app, Codex CLI, and IDE
extension share MCP configuration, and that local MCP supports stdio and
Streamable HTTP. Shared configuration is not shared chat identity or shared
provider-process identity. The Codex desktop app therefore needs a host
adapter/session token hook for true per-chat binding; otherwise its honest
granularity is host-window/app-session or project scope. A separate process or
profile per chat is a possible fallback, but must be explicit.

## Transport consequence

Do not share one stdio byte stream between multiple host chats. For exclusive
leases, launch one provider connection per logical session. For intentional
shared resources, use a broker/proxy or Streamable HTTP with per-client MCP
sessions, ACLs, and provider-specific isolation. The browser resource may be
reused through a CDP endpoint only when cross-chat contamination is explicitly
allowed and proven.

## Risks

* Treating workspace numbers as identity breaks after manual relocation or
  desktop-layout changes.
* Treating one DSH Web process or one Codex config as per-chat binding causes
  cross-session provider reuse.
* A static MCP config cannot express lifecycle attach/detach/reconnect.
* Browser and design apps can spawn multiple windows/processes; PID alone is
  insufficient attribution.
* A provider crash must not silently create a new browser and claim continuity.
* A generic workspace guardian must allow intentional operator relocation and
  must not drag a provider back to its original desktop.

## Recommendation

Implement an additive persistent MCP session broker and a common host adapter
contract. Integrate OpenCode first, then DSH native/session bridge, then Codex
CLI/desktop surfaces according to observed host capability. Keep agent-rules
as policy, routing, evidence, and acceptance authority. Use capability levels
(`chat`, `host-session`, `host-window`, `project`, `unsupported`) and certify
the actual level per host instead of promising universal chat-level binding.

## Hand to Plan Architect

* Add a new owner-authorized phase for persistent MCP session leases and host
  adapters; do not amend or run concurrently with unrelated phases.
* Decide whether the first implementation includes exclusive leases only or
  also an explicit shared-resource mode.
* Decide whether Codex desktop app requires a separate process/profile per chat
  until a public per-chat hook is available.
* Certify X11/Cinnamon first; do not claim pure Wayland support.
* Certify OpenCode, DSH Web/headless, Codex CLI, and Codex desktop separately.
