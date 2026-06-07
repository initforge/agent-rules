---
name: frontend-ui-quality
description: Build, refine, and verify professional frontend UI/UX with art direction, real or generated visual assets, icons/logos, advanced layout, motion, 3D where useful, and visual quality gates. Use when Codex creates or changes frontend screens, web apps, dashboards, landing pages, games, product pages, branded pages, component layouts, CSS, responsive behavior, typography, spacing, imagery, animations, 3D scenes, or any user-facing interface where aesthetics, polish, alignment, overflow, usability, or layout correctness matter.
---

# Master UI/UX Engineering Skill (Awwwards-Tier & Corporate Grade)

## 1. ACTIVE BASELINE CONFIGURATION & CORE DIRECTIVE
* **DESIGN_VARIANCE:** 8 (1 = Perfect Symmetry/Rigid, 10 = Artsy Chaos/Asymmetry)
* **MOTION_INTENSITY:** 6 (1 = Static/No movement, 10 = Cinematic/Magic Physics)
* **VISUAL_DENSITY:** 4 (1 = Art Gallery/Airy, 10 = Pilot Cockpit/Packed Data)

**AI Directive:** Use these baseline values as global variables to drive layout, motion, and visual weight. Dynamically adjust these variables if the user explicitly requests changes in their prompts (e.g., "make it cleaner" -> decrease visual density; "make it highly dynamic" -> increase motion intensity).

---

## 2. ABSOLUTE NEGATIVE CONSTRAINTS (Banned Elements)
If your generated code contains ANY of the following, the design instantly fails:
* **Banned Fonts:** Inter, Roboto, Arial, Open Sans, Helvetica. (Assume premium fonts like `Geist`, `Satoshi`, `Cabinet Grotesk`, `Outfit`, `Instrument Serif`, or `Plus Jakarta Sans` are available).
* **Banned Icons:** Standard thick-stroked Lucide, FontAwesome, or Material Icons. Use only ultra-light or precise line weights (e.g., Phosphor Light/Fill, Radix, Phosphor stroke-1.5, Remix Line).
* **Banned Borders & Shadows:** Generic 1px solid gray borders. Harsh, dark drop shadows (`shadow-md`, `rgba(0,0,0,0.3)`). Shadows must be ambient, ultra-diffuse, and low opacity (< 0.04).
* **Banned Backgrounds:** Primary colored backgrounds for large elements or sections (no bright blue, green, or red hero sections).
* **Banned Colors:** The "AI Purple/Blue" aesthetic is strictly BANNED. No purple button glows, no neon gradients. Use absolute neutral bases (Zinc/Slate) with high-contrast, singular accents.
* **Banned Layouts:** Edge-to-edge sticky navbars glued to the top. Symmetrical, boring 3-column Bootstrap-style card rows.
* **Banned Content Emojis:** NEVER use emojis in code, markup, text content, or alt text. Replace symbols with high-quality icons or clean SVG primitives.
* **Banned Text Clichés:** Avoid generic copy clichés: "Elevate", "Seamless", "Unleash", "Next-Gen", "Game-changer", "Delve", "Tapestry". Use concrete, specific verbs.
* **Banned Placeholders:** Do not use placeholder names like "John Doe", "Acme Corp", or "Lorem Ipsum". Use realistic, organic, contextual data.

---

## 3. CORPORATE & GOVERNMENT-LEVEL UX (High-Complexity Systems)
When designing for large organizations, corporations, and government portals, you must balance premium aesthetics with severe usability constraints:
* **Extreme Legibility & High Contrast:** Ensure font scale, weight, and contrast ratios meet Web Content Accessibility Guidelines (WCAG). Text should never be pure black (`#000000`) but rather deep charcoal (`#111111` or `#1E2022`) on warm ivory (`#FDFBF7`), soft paper grey (`#F7F9FA`), or clean white background.
* **Clean Data Density:** Avoid over-packing tables and lists, but do not waste space with empty galleries. Use structured layouts (e.g., collapsible panels, top filter bars, segment controls) to let users scan large datasets quickly.
* **Custom SVG Icons & Maps:** Prefer creating or using custom SVG icons and assets rather than generic stock packs. For structural diagrams, flowcharts, or spatial indicators, use precise inline SVGs that scale gracefully.
* **Friendly & Trustworthy Tone:** The UI must feel welcoming, highly professional, secure, and respectful. Avoid flashy gaming layouts or neon glowing edges. Instead, use clean margins, soft borders, and premium neutral tones.

---

## 4. CREATIVE DESIGN ARCHETYPES

Before writing code, select ONE combination of archetypes based on prompt context:

### A. Vibe & Texture Archetypes
1. **Ethereal Glass (SaaS / Tech / Modern Portal):** Deepest OLED black (`#050505`), radial mesh gradients (subtle glowing emerald/indigo orbs) in the background. Vantablack cards with heavy `backdrop-blur-2xl` and pure white/10 outer hairlines. Wide geometric Grotesk typography.
2. **Editorial Luxury (Corporate / Agency / Lifestyle / Report):** Warm creams (`#FDFBF7`), warm bone/off-white (`#F7F6F3`), muted sage, or deep espresso tones. High-contrast Variable Serif fonts for massive headings. Subtle CSS film-grain overlay (`opacity-[0.03]`) for a physical paper feel.
3. **Soft Structuralism (Consumer / Health / Complex Dashboard):** Silver-grey or completely white backgrounds. Massive bold Grotesk typography. Airy, floating components with Ambient Shadows (`shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)]`).

### B. Layout Archetypes
1. **The Asymmetrical Bento:** A masonry-like CSS Grid of varying card sizes (e.g., `col-span-8 row-span-2` next to stacked `col-span-4` cards). Use `grid-flow-dense` to ensure zero empty/dead spaces.
   * *Mobile Collapse:* Fall back to a strict single-column layout (`w-full`, `px-4`, `py-8`) below `768px`. Reset all `col-span` overrides.
2. **The Z-Axis Cascade:** Elements stacked like physical cards, slightly overlapping with varying depths of field, occasionally tilted slightly (`-1deg` or `1deg` rotation) to break digital stiffness.
   * *Mobile Collapse:* Remove all rotations and negative-margin overlaps below `768px` to prevent touch target conflicts.
3. **The Editorial Split:** Massive typography on the left half (`w-1/2`), with interactive horizontal image pills or staggered interactive cards on the right.
   * *Mobile Collapse:* Convert to full-width vertical stack (`w-full`).

---

## 5. TYPOGRAPHY & COLOR PALETTES

### A. Deterministic Typography
* **Display/Headlines:** Default to `text-4xl md:text-6xl tracking-tighter leading-none`.
  * **Headlines Pairings:** Serif display fonts (`Instrument Serif`, `Newsreader`, `PP Editorial New`) pair beautifully with geometric sans-serif body text (`Geist Sans`, `Switzer`) in creative/editorial contexts.
  * **UI Pairings:** Serif fonts are strictly BANNED for Dashboard/Software UIs. Use exclusively high-end Sans-Serif pairings (`Geist Sans` + `Geist Mono` or `Satoshi` + `JetBrains Mono`).
* **Body/Paragraphs:** Default to `text-base text-gray-600 leading-relaxed max-w-[65ch]`. Body text must never be absolute black (`#000000`). Use charcoal `#111111` or `#2F3437`.
* **The 2-Line Hero Iron Rule:** The Hero H1 headline must never exceed 2 to 3 lines. Use ultra-wide containers (`max-w-5xl` or `max-w-6xl`) and clamp font sizes (`clamp(3rem, 5vw, 5.5rem)`) to guarantee horizontal flow.

### B. Color Calibration & Spot Pastels
* **Accent constraint:** Maximum 1 Accent Color. Accent saturation < 80%.
* **Muted Pastel Accents:** Use highly desaturated, washed-out pastels for tags, shortcuts, and badge backgrounds:
  * Pale Red: `#FDEBEC` (Text: `#9F2F2D`)
  * Pale Blue: `#E1F3FE` (Text: `#1F6C9F`)
  * Pale Green: `#EDF3EC` (Text: `#346538`)
  * Pale Yellow: `#FBF3DB` (Text: `#956400`)

---

## 6. COMPONENT SPECIFICATIONS & MICRO-AESTHETICS

### A. The "Double-Bezel" (Doppelrand) Architecture
Never place a card or container flatly on the background. Use concentric enclosures to simulate physical machined hardware:
* **Outer Shell:** A wrapper `div` with a subtle background (`bg-black/5` or `bg-white/5`), a hairline outer border (`ring-1 ring-black/5` or `border border-white/10`), outer padding (`p-1.5` or `p-2`), and a large outer radius (`rounded-[2rem]`).
* **Inner Core:** The actual content container inside the outer shell. It has its own distinct background color, its own inner highlight (`shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]`), and a concentric smaller radius (`rounded-[calc(2rem-0.5rem)]`).

### B. Nested CTA & "Island" Button Architecture
* **CTA Pill Shape:** Primary interactive buttons must be fully rounded pills (`rounded-full`) with generous padding (`px-6 py-3`).
* **Button-in-Button Trailing Icon:** If a button has an arrow (`↗`), it must be nested inside its own distinct circular wrapper (`w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center`) placed completely flush with the main button's right inner padding.
* **Hover Physics:** Scale the entire button down slightly (`active:scale-[0.98]`) to simulate physical pressing. The nested inner icon circle should translate diagonally (`group-hover:translate-x-1 group-hover:-translate-y-[1px]`) and scale up slightly (`scale-105`), creating internal kinetic tension.

### C. Utilitarian Micro-UIs
* **Minimalist Accordions:** Strip all card containers. Separate accordion items only with a simple `border-bottom: 1px solid #EAEAEA` or `border-slate-200/50`. Use a clean, sharp `+` and `-` toggle.
* **Keystroke Badges:** Render shortcuts as physical keys using `<kbd>` tags: `border: 1px solid #EAEAEA`, `border-radius: 4px`, `background: #F7F6F3`, using a Monospace font stack.
* **Faux-OS Window Chrome:** Wrap screenshots or software demonstrations in a container with a clean top bar containing three small, light gray circles (macOS window controls).
* **Inline Typography Images:** Embed small, pill-shaped images/graphics directly INSIDE headings. Example: `We build <span className="inline-block w-24 h-10 rounded-full align-middle bg-cover bg-center mx-2" style={{backgroundImage: "url(...)"}}></span> digital spaces.`

---

## 7. MOTION CHOREOGRAPHY & PERFORMANCE

### A. Spring Physics & Entry Animations
* **Linear Ban:** No linear or standard `ease-in-out` transitions. Apply premium Spring Physics (`type: "spring", stiffness: 100, damping: 20` or CSS cubic-bezier: `transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]`) to all interactive elements.
* **Scroll Entry:** Elements must fade and slide up gently as they enter the viewport (`translateY(12px) opacity-0` resolving to `translateY(0) opacity-100` over `600ms` using `cubic-bezier(0.16, 1, 0.3, 1)`).
* **Viewport Stability:** NEVER use `h-screen` for hero sections. ALWAYS use `min-h-[100dvh]` to prevent viewport jumping on mobile.

### B. GSAP Advanced Motion & ScrollTrigger
* **Scroll Pinning (GSAP Split):** Pin a section title on the left (`ScrollTrigger pin: true`) while a gallery of elements scrolls upwards on the right side.
* **Image Scale & Fade Scroll:** Images start small (`scale: 0.8`). As they scroll into view, they grow to `scale: 1.0`. As they scroll out of view, they smoothly darken and fade out (`opacity: 0.2`).
* **Scrubbing Text Reveals:** Opacity of central paragraph words starts at 0.1 and scrubs to 1.0 sequentially as the user scrolls.
* **Card Stacking:** Cards overlap and stack on top of each other dynamically from the bottom as the user scrolls down.

### C. Performance Constraints
* **GPU-Safe Animation:** Animate exclusively via `transform` and `opacity`. NEVER animate layout-triggering properties (`top`, `left`, `width`, `height`).
* **Grain/Noise & Blurs:** Apply noise filters exclusively to fixed, `pointer-events-none` pseudo-elements. Apply `backdrop-blur` only to fixed/sticky navbars and overlays. Never attach blur filters to scrolling containers.
* **Interactive Leaf Components:** Isolate dynamic interactive components (motion, GSAP, stateful menus) into leaf components marked `'use client'`. Server Components (`RSC`) must exclusively render static layouts.

---

## 8. DESIGN AUDIT & REDESIGN CHECKLIST
When auditing and upgrading existing codebases, verify and resolve these design defects:

### Typography Audit
- [ ] Swap default fonts (Inter/Roboto) for premium families (`Geist`, `Satoshi`, `Outfit`, `Cabinet Grotesk`).
- [ ] Headlines lack presence: decrease line-height, tighten letter-spacing, increase scale.
- [ ] Body text width: limit paragraphs to ~65 characters (`max-w-[65ch]`), increase line-height for readability.
- [ ] Use sentence case instead of title case for a cleaner, modern look.
- [ ] Enable tabular figures (`font-variant-numeric: tabular-nums`) for numeric data-heavy interfaces.
- [ ] Eliminate orphaned words using `text-wrap: balance` or `text-wrap: pretty`.

### Layout & Surface Audit
- [ ] Swap pure `#000000` for an off-black base (`#050505`, `#0a0a0a`, or `#121212`).
- [ ] Ensure all grays are tinted with a consistent hue (warm cream/grey or cool zinc/slate, never mix them).
- [ ] Audit all drop shadows to ensure they suggest a single, consistent light source.
- [ ] Remove 3-column Bootstrap-style card grids. Replace with asymmetric bento grids or horizontal galleries.
- [ ] Ensure buttons are aligned horizontally at the bottom of card groups regardless of content lengths above.
- [ ] Add container constraints (`max-w-7xl mx-auto px-6`) so layout doesn't break on wide screens.

### Interactivity Audit
- [ ] Ensure all hover states have responsive animations (scale, color shift) with a transition duration.
- [ ] Add active/pressed feedback (`active:scale-[0.98]`).
- [ ] Replace default circular spinners with custom layout-shaped skeleton loaders.
- [ ] Add a visible focus ring for keyboard accessibility on all interactive elements.

---

## 9. MANDATORY PRE-FLIGHT DESIGN PLAN
Before outputting any UI/UX code, you MUST output a `<design_plan>` block verifying:
1. **Archetype Choices:** State the selected Vibe and Layout archetypes from Section 4.
2. **Negative Constraint Sweep:** Confirm no banned fonts, icons, shadows, emojis, or clichés are used.
3. **Hero Math Verification:** Confirm the H1 container width and line-wrap limits (max 2-3 lines).
4. **Bento Interlocking Check:** Confirm that grid layout column/row spans leave zero empty space and `grid-flow-dense` is applied.
5. **Legibility & Contrast Check:** Verify contrast accessibility, custom SVG icons selection, and dynamic table keys localization mapping (e.g. `tai_xe` -> `Tài xế`).
