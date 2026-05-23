---
name: frontend-ui-quality
description: Build, refine, and verify professional frontend UI/UX with art direction, real or generated visual assets, icons/logos, advanced layout, motion, 3D where useful, and visual quality gates. Use when Codex creates or changes frontend screens, web apps, dashboards, landing pages, games, product pages, branded pages, component layouts, CSS, responsive behavior, typography, spacing, imagery, animations, 3D scenes, or any user-facing interface where aesthetics, polish, alignment, overflow, usability, or layout correctness matter.
---

# Frontend UI Quality

Use this skill to ship frontend work that has real visual direction and has been visually inspected, not merely compiled. Prioritize professional composition, appropriate imagery, coherent hierarchy, stable responsive layouts, meaningful motion, and concrete browser verification.

## Core Workflow

1. Inspect the existing app before editing.
   - Identify framework, styling system, routing, component patterns, icon library, and available design tokens.
   - Preserve local conventions unless they directly cause the UI quality issue.
   - For product apps and tools, build the usable first screen rather than a marketing page.

2. Define the UI target in concrete terms.
   - Name the primary user, main workflow, viewport targets, and the information density the domain requires.
   - Decide the visual tone from the domain: operational tools should be dense and restrained; games and consumer experiences can be more expressive.
   - Choose a palette with contrast, hierarchy, and restraint; avoid a one-hue page unless the brand requires it.
   - For any design-heavy, branded, landing, product, portfolio, game, immersive, or visually open-ended request, read `references/visual-direction.md` before implementing.

3. Build the visual system before filling details.
   - Establish composition, spacing scale, typography scale, color roles, imagery style, icon treatment, and motion intent.
   - Use real brand assets, product imagery, maps, logos, icons, screenshots, or generated bitmap imagery when the subject benefits from visual specificity.
   - Add 3D, canvas, video, or motion only when it improves the experience or matches the request; verify it renders and performs.
   - Avoid generic placeholder visuals unless the user explicitly asks for wireframes.

4. Implement with layout constraints.
   - Use CSS grid/flex with explicit `minmax`, `min-width: 0`, stable aspect ratios, and predictable gaps.
   - Use real controls for the job: icon buttons for tools, tabs for views, toggles for binary settings, sliders/inputs for numeric values, menus for option sets.
   - Use existing icon libraries such as `lucide-react` when present.
   - Avoid cards inside cards, decorative gradient blobs, and oversized hero typography inside compact app panels.
   - Do not scale font size directly with viewport width.

5. Run the app and verify in a real browser.
   - Start the local dev server when the UI needs one.
   - Use Playwright or browser screenshots for at least desktop and mobile widths when feasible.
   - Inspect screenshots for alignment, clipping, text overflow, overlapping elements, awkward whitespace, broken wrapping, unreadable contrast, and unintended scrollbars.
   - Verify visual assets load, icons/logos are not distorted, motion does not cover content, and 3D/canvas scenes are non-empty and framed.
   - Check representative interaction states: hover/focus/active, empty/loading/error states, selected tabs, open menus, long labels, and data-heavy rows.

6. Iterate until the screenshot is clean and the design looks intentional.
   - Fix visible issues and re-capture the affected viewport.
   - Treat "build passes" as insufficient when visual verification is possible.
   - In the final response, state the browser/viewports checked and any residual risk if verification could not be run.

## Required Visual QA

For every UI change, read `references/visual-qa-checklist.md` before final verification. Use it as the acceptance checklist while reviewing screenshots.

Skip browser verification only when no runnable UI exists, dependencies cannot be installed or started, or the user explicitly asks for code-only output. If skipped, explain why and provide the best static checks performed.

## Implementation Rules

- Favor layout primitives over manual pixel positioning.
- Give fixed-format UI elements stable dimensions so content changes do not resize the control.
- Use `min-width: 0` and sensible wrapping/truncation inside flex/grid children.
- Ensure button and card text fits at mobile and desktop sizes.
- Keep page sections unframed unless a repeated item, modal, or tool panel genuinely needs a card.
- Use visual assets for websites and games when the subject needs to be seen.
- Prefer actual product/place/object/person imagery over abstract decoration.
- Use real icons/logos only from the repo, official packages, official brand sources, or clearly licensed asset sources. Do not invent a real company's logo.
- Use generated images when no real asset is available or when the requested subject is fictional, conceptual, or stylistic.
- Use Three.js or a proven rendering library for non-trivial 3D instead of hand-rolled low-level rendering.
- Respect `prefers-reduced-motion`; keep motion purposeful and avoid hiding primary content behind animation.
- Keep letter spacing at `0` unless matching an existing system.
- Use concise in-app copy; do not add instructional text that explains the UI itself.

## Final Response Standard

Report:

- Files changed.
- Verification commands or browser checks run.
- Viewports/screenshots inspected when applicable.
- Any verification that could not be performed.
