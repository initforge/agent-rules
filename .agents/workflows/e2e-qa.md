# e2e-qa Skill

0. Turn-0: `Skill scan:` → match e2e/test/playwright/spec → read `SKILL.md` + `references/completeness-harness.md`.
1. **Completeness > speed:** blast radius → required dimensions (D1–D8) → run level. Unknown scope is not L1.
2. Matrix with **test data contract** (seed, role, cleanup, time-sensitive).
3. Conditional non-functional gates if diff touches a11y/perf/security/export.
4. Run **L0–L4 ladder** — deep/full only at release gate or user request.
5. Classify outcomes: PASS / FAIL / FLAKE / BLOCKED — retry pass needs retry count in evidence.
6. **Done definition** (7 steps in reference) before PASS.
7. Report blast radius, dimensions, matrix ticks, commands, `Skill activated: e2e-qa`, Status.