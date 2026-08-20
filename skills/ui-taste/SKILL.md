---
name: ui-taste
description: "Use as a brief-led UI/UX taste and anti-generic-design lens for frontend, product UI, landing pages, portfolios, redesigns, and Control Plane surfaces. Select a design direction from the brief and existing design system; preserve accessibility and product constraints. For 5fedu ERP modules, 5fedu-module-parity remains authoritative and ui-taste is only an explicitly requested review lens."
routing: {"signals":["ui/ux","giao diện đẹp","frontend ui","landing","portfolio","redesign","design system","Apple-inspired","control plane"],"excludes":["5fedu ERP module parity without explicit taste review","pure backend","unit/api only"],"priority":55,"loads":["skill:ui-taste"],"supports":["frontend-architect","5fedu-module-parity"],"project_scope":"","platform_scope":"all","max_route_tokens":1800,"default":false}
---

# UI Taste

Use this capability to make a deliberate design read before changing a frontend surface. It is a lens, not a framework mandate.

## Operating contract

1. State a one-line design read: surface, audience, intended tone, and suitable design-system/aesthetic family.
2. Follow the user brief and existing product design system first; choose a real design system when one is already required.
3. Set only the needed variance, motion, and density direction. Respect accessibility, reduced motion, performance, and responsive constraints.
4. Avoid generic AI visual defaults: decorative gradients without purpose, repeated equal cards, indiscriminate glass effects, ungrounded animation, and arbitrary typography.
5. Verify hierarchy, task completion, keyboard/focus behavior, contrast, loading/error/empty states, and small-screen behavior.

## Routing precedence

- **Control Plane:** Apple-inspired product-UI contract is authoritative; use this skill as an anti-slop and visual-review lens.
- **5fedu ERP:** `5fedu-module-parity`, module mapping, and the project shell are authoritative. Do not replace their information architecture, interaction contract, or reference shell. Load this skill only when an explicit taste review is requested.
- **Landing, portfolio, or redesign:** infer direction from the brief; use the pinned upstream reference pack selectively.
- **Image-first deliverables:** route image generation only when the requested output needs a visual asset or reference image.

## Reference pack

The upstream Leonxlnx/taste-skill source pack is pinned by `references/upstream-lock.json`. It is reference-only: do not auto-discover or auto-load its individual skills, and do not execute upstream scripts. Read only the file that matches the selected design direction.

## Evidence

Record the design read, relevant constraints, selected upstream reference path(s), and verification result in the task receipt. A taste assertion never substitutes for accessibility, product, parity, or independent verification evidence.
