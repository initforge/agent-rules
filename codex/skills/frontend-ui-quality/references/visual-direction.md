# Visual Direction

Use this reference before implementing visually open-ended frontend work: landing pages, product pages, portfolios, games, branded sites, immersive interfaces, editorial pages, marketing surfaces, and any request asking for "beautiful", "premium", "professional", "modern", "animated", "3D", "rich", or "high-end" UI.

## Art Direction First

Define these before coding the final screen:

- Subject: what object, brand, product, venue, data, or workflow must be visually obvious in the first viewport.
- Audience: buyer, operator, player, creator, analyst, visitor, developer, or executive.
- Tone: utilitarian, luxury, playful, cinematic, editorial, technical, educational, tactile, futuristic, or calm.
- Visual anchor: real photo, generated hero image, product screenshot, dashboard data, map, 3D model, canvas scene, video-like motion, or dense app surface.
- Composition: full-bleed hero, split workspace, layered editorial grid, dashboard shell, map-first surface, game canvas, 3D scene, or tool layout.

Do not start with generic cards and gradients when the request calls for a designed experience.

Use established visual-design principles as a practical critique lens:

- Scale: make the most important thing visibly dominant; avoid too many competing sizes.
- Hierarchy: guide the eye through importance, not decoration.
- Balance: distribute visual weight intentionally, including asymmetrical layouts.
- Contrast: make differences meaningful across color, size, density, depth, and motion.
- Gestalt grouping: align, space, and group related elements so the structure is obvious at a glance.

## Asset Strategy

Choose the strongest available asset path:

1. Existing repo assets: use brand-approved images, icons, logos, fonts, screenshots, and design tokens already present.
2. Official or real-world assets: use official logos, product images, maps, screenshots, venue photos, or trusted icon packages when the UI references real entities and licensing/availability permits.
3. Stock imagery: use concrete search terms for real environments, people, objects, places, or materials.
4. Generated imagery: create bitmap images for fictional brands, conceptual scenes, custom textures, backgrounds, hero art, game sprites, and non-real products.
5. Code-native visuals: use SVG, CSS, canvas, WebGL, or Three.js for interface-native graphics, diagrams, games, particles, procedural scenes, and interactive 3D.

Avoid abstract placeholder art when the user needs to inspect a product, place, person, game state, or workflow.

Reserve layout space for all images, videos, iframes, canvas, and 3D surfaces before they load. Use explicit dimensions, `aspect-ratio`, skeletons, or stable containers so visual richness does not create layout shift.

## Real Brands, Logos, and Icons

- Prefer existing repo assets first.
- For real companies, products, venues, or technologies, use official brand assets or established icon packages when available.
- Do not draw an inaccurate fake logo for a real brand.
- Keep logos undistorted, uncropped, and padded.
- Use `lucide-react`, `react-icons`, Radix icons, Material icons, or the repo's existing icon system for generic UI commands.
- Match icon stroke weight, size, and alignment across the surface.
- Add text labels where an icon alone is ambiguous.

## Imagery

- Make the primary image reveal the actual subject.
- Use full-bleed or large editorial imagery for landing and branded pages when appropriate.
- For apps and dashboards, use screenshots, charts, maps, thumbnails, avatars, or object photos only when they improve scanning or recognition.
- Avoid dark blurred backgrounds unless text readability and subject recognition remain strong.
- Use consistent crop ratios and image treatment across repeated cards.
- Verify images load in the browser, are not stretched, and do not hide key content.
- Use responsive image techniques when images are central to the UI: appropriate dimensions, `srcset`/`sizes` or framework image components when available, and modern formats when supported.
- Optimize generated images before shipping when file size is large.

## Advanced Layout

Use composition intentionally:

- Layered hero: full-bleed media, foreground type, subtle navigation, and a visible next section.
- Editorial grid: asymmetric columns, strong image scale contrast, disciplined gutters, and readable text blocks.
- Product surface: screenshot or object as first-viewport signal, with supporting details arranged around it.
- Dashboard shell: sidebar/topbar/content regions, dense tables/cards/charts, restrained hierarchy, no marketing hero.
- Immersive tool/game: canvas or 3D scene as the main surface, controls docked predictably.
- Mobile adaptation: reorder by task priority, not by desktop visual order alone.

Use CSS grid for macro composition and flex for local alignment. Prefer `clamp()` only for spacing or container sizing, not direct viewport-scaled font sizes.

## Motion

Use motion to clarify state, focus, navigation, and spatial relationships:

- Microinteractions: hover, press, selected, expanded, loading, success.
- Page entrance: subtle stagger or reveal for editorial/landing pages.
- Data transitions: chart/table updates that preserve orientation.
- 3D/canvas: slow ambient motion only when it does not distract from controls.

Rules:

- Respect `prefers-reduced-motion`.
- Keep durations short for tools and dashboards.
- Avoid animations that block reading or move primary controls unexpectedly.
- Verify motion does not create overlap at start, midpoint, or end states.
- Prefer transform/opacity motion for routine UI transitions.
- Avoid scrolljacking and large panning/zooming effects unless the experience is intentionally immersive and still accessible.

## 3D and Canvas

Use Three.js or an existing rendering/game library for non-trivial 3D, physics, camera, lighting, models, or interaction.

For 3D scenes:

- Make the 3D subject large enough to inspect.
- Use lighting, shadows, camera framing, and materials deliberately.
- Keep the scene full-bleed or integrated as a primary surface, not trapped in a decorative card.
- Provide clear controls or ambient interaction when useful.
- Verify via screenshot and pixel checks that the canvas is non-blank.
- Test desktop and mobile framing.
- Resize the renderer from the canvas display size, and cap internal pixel count or pixel ratio when needed to avoid excessive GPU load.
- Do not let 3D interaction trap keyboard or pointer users away from the rest of the interface.

For games:

- Use custom SVG/canvas/WebGL assets when specific gameplay readability matters.
- Keep HUD, controls, and game area stable across viewport sizes.
- Verify gameplay state is visible and not covered by UI overlays.

## Professional Polish Bar

Before finalizing, ask whether the screen would look credible next to a strong commercial product in the same category. If not, improve one of:

- Stronger visual anchor.
- Better image or generated asset.
- More disciplined spacing and alignment.
- Clearer hierarchy.
- More specific iconography.
- More intentional typography.
- More realistic data/content.
- Subtle motion or interaction feedback.
- Better responsive composition.
