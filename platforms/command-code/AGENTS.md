# Command Code runtime

- Canonical source: `__AGENT_RULES_ROOT__`.
- Install: `npm i -g command-code` (v1.28.4+).
- Binary detection: `command-code` everywhere; `cmdc` on Windows. NEVER `cmd.exe`.
- Projection: session-scoped `--mod` / `--skill`; no permanent global load while
  the harness is inactive.
- Hard boundary: native permission rules/modes. Mods and hooks are supplementary.
- Mod/hook failure -> terminal BLOCKED. `--yolo` never used for certification.
- Taste is never deleted, disabled or overwritten.
- Plan mode is certified separately (write-time hooks do not run there).
- Report `PASS`, `PARTIAL`, or `BLOCKED` with verification evidence.
