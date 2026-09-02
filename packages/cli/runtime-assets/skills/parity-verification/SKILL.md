---
name: parity-verification
description: "Prove visual, responsive, behavioral, a11y, console, network or data-state parity vs a live reference."
metadata:
  signals: "parity proof, parity verification, verify parity, visual parity, responsive parity, behavioral parity, cross-state parity"
  excludes: "unit/api-only, static source diff only"
  supports: "browser-qa, qa-skills"
  priority: "85"
  platform_scope: "all"
---

# Parity Verification

Define the observable claim before testing, then collect only the browser
evidence needed for that claim.

For each claim record:

- expected observable behavior;
- reference and target state;
- relevant viewport or interaction state;
- actual observation;
- required screenshot, accessibility, console, network, or interaction proof;
- verdict: `PASS`, `FAIL`, `UNVERIFIED`, or `FLAKY`.

Use Playwright for deterministic interaction and screenshots. Add Chrome
DevTools only for console, network, performance, or CDP diagnostics. Add a QA
matrix only when multiple states, permissions, or edge cases materially affect
the claim.

Do not infer behavioral parity from a screenshot or build, auto-update a failed
baseline, or rerun unchanged proof until it passes. One consistent recheck is
enough to distinguish a repair from a flaky observation.

Keep transient screenshots and traces in the browser/test tool's temporary
output. Persist a baseline or report only when the user requests it or the
project already owns an explicit test-results location.
