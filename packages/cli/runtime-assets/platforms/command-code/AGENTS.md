# Command Code runtime

- Canonical source: `__AGENT_RULES_ROOT__`.
- Install: `npm i -g command-code` (v1.28.4+).
- Binary detection: `command-code` everywhere; `cmdc` on Windows. NEVER `cmd.exe`.
- Projection: a self-contained static native mod plus native skills; no callback
  to agent-rules after installation.
- Hard boundary: native permission rules/modes. The static mod is instructions only.
- `--yolo` is never used for certification.
- Taste is never deleted, disabled or overwritten.
- Plan mode is certified separately and remains host-owned.
- Report `PASS`, `PARTIAL`, or `BLOCKED` with verification evidence.
