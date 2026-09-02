---
name: backend-change-boundaries
description: "Backend procedures for framework/API/auth/payment: stack facts pick the smallest procedure."
metadata:
  signals: "backend framework, api interface, api endpoint, endpoint, authentication endpoint, auth provider, authorization, stripe, payment provider integration, webhook, transaction boundary"
  excludes: "frontend, design"
  priority: "45"
  requires: "verification-router"
  platform_scope: "all"

---
# backend-composition

## Discovery

Inspect the request path, controller/handler, service boundary, validation,
auth middleware, persistence adapter, direct callers and affected tests. Use
the existing framework and error conventions; discover files and symbols from
the repository rather than assuming a layout.

## Locked boundaries

Do not change a public API, authentication or authorization policy, payment
side effect, transaction ownership, idempotency behavior, validation contract,
or error semantics unless the accepted plan explicitly changes it. Keep
irreversible work in the server boundary and preserve retry/recovery behavior.

## Implement

Choose the smallest dependency-ready seam. You may reorganize local code,
extract helpers and select internal types when the observable contract remains
unchanged. Preserve existing request validation before side effects and keep
external provider calls behind a recoverable boundary.

## Focused proof and stop

Run the narrowest typecheck, affected unit/integration test or API contract
proof. Add live or disposable provider proof only when the claim needs it. Stop
or ask before changing a locked boundary, requiring credentials, or triggering
a real payment, production mutation, or other destructive side effect.
