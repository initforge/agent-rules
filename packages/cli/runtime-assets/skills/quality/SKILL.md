---
name: quality
description: 'Quality gate combining clean-code lint (pre/post-execution) and deep maintainability review. Use for clean-code
  smell scan, hard-block validation, strict code-quality audit, "code judo" restructuring, or any "refactor code", "dọn dẹp
  code", "viết code đẹp", "tối ưu code" request. Do NOT use for pure Q&A or an obvious one-file fix without a quality concern.

  '
metadata:
  signals: "clean code, dọn dẹp code, refactor code, viết code đẹp, tối ưu code, smell scan, hard-block, deep code quality audit, strict maintainability review, spaghetti, code judo"
  excludes: "pure q&a, ordinary comparison, obvious fix"
  priority: "55"
  platform_scope: "all"
  source: ROUTE.json migrated

---

# Quality — Code Cleanliness & Maintainability Review

Quality subsumes the former `clean-code` and `code-review` skills. It runs as a
two-phase gate (pre-plan smell detect / post-plan strict review) and supports
deep maintainability audits with "code judo" restructuring ambition.

## Skill directory contents

This skill absorbed the former `clean-code` and `code-review` skills, both of which
had been marked deprecated while still carrying routing metadata and consuming
routing budget. Their reference material lives at `references/`.

## 1. Triage Lanes

- **`tiny` (1 file only):** hard-block check only — no full smell detect.
- **`medium`:** hard-block at finish; smell detect optional.
- **`high-risk`:** smell detect pre-plan; hard-block at finish; security/perf assessment.

Only run in workflow mode `execution` — skip in plan-only mode.

## 2. Profile Override Guard

If a project-specific style override exists in the active profile context,
prefer it. Profile conventions override general clean-code guidance.

## 3. Hard-block validation (always run at finish)

Apply the full hard-block list from [references/clean-code-checklist.md](references/clean-code-checklist.md).

## 4. Deep maintainability review (when triggered or high-risk)

When a deep review is active, apply the following standards:

### 4.1 Be ambitious about structural simplification
- Look for "code judo" moves: restructurings that preserve behavior while
  making the implementation dramatically simpler, smaller, more direct.
- Prefer the solution that makes the code feel inevitable.
- If you see a path to delete complexity rather than rearrange it, push hard.

### 4.2 File-size boundary
- Do not let a PR push a file from under 1k lines to over 1k lines without a
  very strong reason.
- Flag files crossing 1000 lines due to the diff.

### 4.3 No spaghetti growth
- Be highly suspicious of new ad-hoc conditionals or one-off branches inserted
  into unrelated flows.
- Prefer pushing logic into a dedicated abstraction, helper, state machine, or
  separate module.

### 4.4 Bias toward cleaner design
- If behavior stays the same while structure becomes meaningfully cleaner, push
  for the cleaner version.
- Prefer simplifications that remove moving pieces over refactors that spread
  complexity around.

### 4.5 Prefer direct, boring, maintainable code
- Treat brittle, ad-hoc, or "magic" behavior as a code-quality problem.
- Flag thin wrappers or pass-through helpers that add indirection without clarity.

### 4.6 Type and boundary cleanliness
- Question unnecessary optionality, `unknown`, `any`, or cast-heavy code.
- Prefer explicit typed models over loosely-shaped ad-hoc objects.

### 4.7 Keep logic in the canonical layer
- Call out feature logic leaking into shared paths.
- Prefer existing canonical utilities over bespoke one-offs.

### 4.8 Sequential orchestration and non-atomic updates
- Flag sequential work that could run in parallel.
- Push for atomic structure when partial state would be brittle.

## 5. Review ordering

1. Structural code-quality regressions
2. Missed code-judo opportunities
3. Spaghetti / branching complexity increases
4. Boundary / abstraction / type-contract problems
5. File-size and decomposition concerns
6. Modularity and abstraction issues
7. Legibility and maintainability

## 6. Approval bar

Do not approve merely because behavior seems correct. Presumptive blockers:
- preserving incidental complexity when a code-judo move would delete it
- pushing a file past 1000 lines
- adding ad-hoc branching that tangles existing flow
- scattering feature checks across shared code
- unnecessary abstraction, wrapper, or cast-heavy contract
- duplicating an existing helper or wrong-layer logic

## References

- [references/clean-code-checklist.md](references/clean-code-checklist.md) — hard-block list
