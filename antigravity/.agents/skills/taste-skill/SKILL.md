---
name: design-taste-frontend
description: Senior UI/UX Engineer. Architect digital interfaces overriding default LLM biases. Enforces metric-based rules, strict component architecture, CSS hardware acceleration, and balanced design engineering.
---

# High-Agency Frontend Skill

## 1. ACTIVE BASELINE CONFIGURATION
* DESIGN_VARIANCE: 8 (1=Perfect Symmetry, 10=Artsy Chaos)
* MOTION_INTENSITY: 6 (1=Static/No movement, 10=Cinematic/Magic Physics)
* VISUAL_DENSITY: 4 (1=Art Gallery/Airy, 10=Pilot Cockpit/Packed Data)

**AI Instruction:** The standard baseline for all generations is strictly set to these values (8, 6, 4). Do not ask the user to edit this file. Otherwise, ALWAYS listen to the user: adapt these values dynamically based on what they explicitly request in their chat prompts. Use these baseline (or user-overridden) values as your global variables to drive the specific logic in the sections below.

---

## 2. ABSOLUTE NEGATIVE CONSTRAINTS (Banned Elements)
If your generated code includes ANY of the following, the design instantly fails:
* **Banned Fonts:** Inter, Roboto, Arial, Open Sans, Helvetica. (Assume premium fonts like `Geist`, `Satoshi`, `Cabinet Grotesk`, `Outfit`, or `Instrument Serif` are available).
* **Banned Icons:** Standard thick-stroked Lucide, FontAwesome, or Material Icons. Use only ultra-light or precise line weights (e.g., Phosphor Light/Fill, Radix, Phosphor stroke-1.5).
* **Banned Borders & Shadows:** Generic 1px solid gray borders. Harsh, dark drop shadows (`shadow-md`, `rgba(0,0,0,0.3)`). Shadows must be ambient, ultra-diffuse, and low opacity (< 0.04).
* **Banned Backgrounds:** Primary colored backgrounds for large elements or sections (no bright blue, green, or red hero sections).
* **Banned Colors:** The "AI Purple/Blue" aesthetic is strictly BANNED. No purple button glows, no neon gradients. Use absolute neutral bases (Zinc/Slate) with high-contrast, singular accents.
* **Banned Layouts:** Edge-to-edge sticky navbars glued to the top. Symmetrical, boring 3-column Bootstrap-style card rows.
* **Banned Content Emojis:** NEVER use emojis in code, markup, text content, or alt text. Replace symbols with high-quality icons or clean SVG primitives.
* **Banned Text Clichés:** Avoid generic startup copy clichés: "Elevate", "Seamless", "Unleash", "Next-Gen", "Game-changer", "Delve". Use concrete, specific verbs.
* **Banned Placeholders:** Do not use placeholder names like "John Doe", "Acme Corp", or "Lorem Ipsum". Use realistic, organic, contextual data.

---

## 3. THE CREATIVE DESIGN ARCHETYPES

Before writing code, select ONE combination from the following archetypes to drive the visual direction:

### A. Vibe & Texture Archetypes
1. **Ethereal Glass (SaaS / AI / Tech):** Deepest OLED black (`#050505`), radial mesh gradients (subtle glowing emerald/indigo orbs) in background. Vantablack cards with heavy `backdrop-blur-2xl` and pure white/10 outer hairlines. Wide geometric Grotesk typography.
2. **Editorial Luxury (Lifestyle / Real Estate / Agency / Portfolios):** Warm creams (`#FDFBF7`), warm bone/off-white (`#F7F6F3`), muted sage, or deep espresso tones. High-contrast Variable Serif fonts for massive headings. Subtle CSS film-grain overlay (`opacity-[0.03]`) for a physical paper feel.
3. **Soft Structuralism (Consumer / Health / Dashboard):** Silver-grey or completely white backgrounds. Massive bold Grotesk typography. Airy, floating components with Ambient Shadows (`shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)]`).

### B. Layout Archetypes
1. **The Asymmetrical Bento:** A masonry-like CSS Grid of varying card sizes (e.g., `col-span-8 row-span-2` next to stacked `col-span-4` cards).
2. **The Z-Axis Cascade:** Elements stacked like physical cards, slightly overlapping each other with varying depths of field, occasionally tilted slightly (`-1deg` or `1deg` rotation) to break digital stiffness.
3. **The Editorial Split:** Massive typography on the left half (`w-1/2`), with interactive horizontal image pills or staggered interactive cards on the right.

* **Mobile Override (Universal):** Any asymmetrical layout or rotation above `md:` MUST aggressively fall back to a strict single-column layout (`w-full`, `px-4`, `py-8`) on viewports below `768px` to prevent horizontal overflow and touch target conflicts.

---

## 4. TYPOGRAPHY & COLOR PALETTES

### A. Deterministic Typography
* **Display/Headlines:** Default to `text-4xl md:text-6xl tracking-tighter leading-none`.
  * **Headlines Pairings:** Serif display fonts (`Instrument Serif`, `Newsreader`) pair beautifully with geometric sans-serif body text (`Geist Sans`, `Switzer`) in creative/editorial contexts.
  * **UI Pairings:** Serif fonts are strictly BANNED for Dashboard/Software UIs. Use exclusively high-end Sans-Serif pairings (`Geist Sans` + `Geist Mono` or `Satoshi` + `JetBrains Mono`).
* **Body/Paragraphs:** Default to `text-base text-gray-600 leading-relaxed max-w-[65ch]`. Body text must never be absolute black (`#000000`). Use charcoal `#111111` or `#2F3437`.

### B. Color Calibration & Spot Pastels
* **Accent constraint:** Maximum 1 Accent Color. Accent saturation < 80%.
* **Muted Pastel Accents:** Use highly desaturated, washed-out pastels for tags, shortcuts, and badge backgrounds:
  * Pale Red: `#FDEBEC` (Text: `#9F2F2D`)
  * Pale Blue: `#E1F3FE` (Text: `#1F6C9F`)
  * Pale Green: `#EDF3EC` (Text: `#346538`)
  * Pale Yellow: `#FBF3DB` (Text: `#956400`)

---

## 5. COMPONENT SPECIFICATIONS & MICRO-AESTHETICS

### A. The "Double-Bezel" (Doppelrand) Architecture
Never place a card or container flatly on the background. Use concentric enclosures to simulate physical machined hardware:
* **Outer Shell:** A wrapper `div` with a subtle background (`bg-black/5` or `bg-white/5`), a hairline outer border (`ring-1 ring-black/5` or `border border-white/10`), outer padding (`p-1.5` or `p-2`), and a large outer radius (`rounded-[2rem]`).
* **Inner Core:** The actual content container inside the outer shell. It has its own distinct background color, its own inner highlight (`shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]`), and a concentric smaller radius (`rounded-[calc(2rem-0.5rem)]`).

### B. Nested CTA & "Island" Button Architecture
* **CTA Pill Shape:** Primary interactive buttons must be fully rounded pills (`rounded-full`) with generous padding (`px-6 py-3`).
* **Button-in-Button Trailing Icon:** If a button has an arrow (`↗`), it must be nested inside its own distinct circular wrapper (`w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center`) placed completely flush with the main button's right inner padding.

### C. Utilitarian Micro-UIs
* **Minimalist Accordions:** Strip all card containers. Separate accordion items only with a simple `border-bottom: 1px solid #EAEAEA` or `border-slate-200/50`. Use a clean, sharp `+` and `-` toggle.
* **Keystroke Badges:** Render shortcuts as physical keys using `<kbd>` tags: `border: 1px solid #EAEAEA`, `border-radius: 4px`, `background: #F7F6F3`, using a Monospace font stack.
* **Faux-OS Window Chrome:** Wrap screenshots or software demonstrations in a container with a clean top bar containing three small, light gray circles (macOS window controls).

---

## 6. SUBTLE MOTION & PERFORMANCE GUARDRAILS

### A. Spring Physics & Entry Animations
* **Linear Ban:** No linear easing. Apply premium Spring Physics (`type: "spring", stiffness: 100, damping: 20`) to all interactive elements.
* **Scroll Entry:** Elements must fade and slide up gently as they enter the viewport (`translateY(12px) opacity-0` resolving to `translateY(0) opacity-100` over `600ms` using `cubic-bezier(0.16, 1, 0.3, 1)`).
* **Viewport Stability:** NEVER use `h-screen` for hero sections. ALWAYS use `min-h-[100dvh]` to prevent viewport jumping on mobile.

### B. Performance Constraints
* **GPU-Safe Animation:** Animate exclusively via `transform` and `opacity`. NEVER animate layout-triggering properties (`top`, `left`, `width`, `height`).
* **Grain/Noise & Blurs:** Apply noise filters exclusively to fixed, `pointer-events-none` pseudo-elements. Apply `backdrop-blur` only to fixed/sticky navbars and overlays. Never attach blur filters to scrolling containers.
* **Interactive Leaf Components:** Isolate dynamic interactive components (motion, GSAP, stateful menus) into leaf components marked `'use client'`. Server Components (`RSC`) must exclusively render static layouts.

---

## 7. AI TELLS (Forbidden Patterns)
* **NO Neon/Outer Glows:** Avoid generic drop shadow glows. Use nested borders.
* **NO Pure Black:** Never use `#000000` for text or backgrounds. Use off-blacks/zinc-950.
* **NO 3-Column Card Rows:** Use asymmetrical grids, staggered lists, or horizontal galleries instead.
* **NO Generic Numbers:** Avoid predictable ratios (`99%`, `50%`, `1234567`). Use organic data (`47.2%`, `+1 (312) 847-1928`).
* **NO Custom Mouse Cursors:** They degrade performance and hurt accessibility.

---

## 8. THE CREATIVE ARSENAL (High-End Inspiration)
* **Mac OS Dock Magnification:** Nav-bar items that scale fluidly on hover.
* **Magnetic Button:** Buttons that physically pull toward the cursor coordinates.
* **Dynamic Island:** Pill-shaped UI component that morphs to show status/alerts.
* **Curtain Reveal:** A hero section parting down the middle on scroll.
* **Holographic Foil Card:** Iridescent, rainbow light reflections shifting on hover.

---

## 9. THE "MOTION-ENGINE" BENTO PARADIGM
When generating modern dashboards or bento grids, utilize these configurations:
* **Grid Ratios:** Standard layout is Row 1: 3 columns | Row 2: 2 columns (split 70/30).
* **Labels Outside:** Place card titles and descriptions **outside and below** the cards to maintain a gallery-style presentation.
* **Perpetual Loops:** If `MOTION_INTENSITY > 5`, cards must contain isolated, microscopic infinite loops (Breathing Status Dot, Typewriter commands, infinite marquee data cards) to make the dashboard feel alive.

---

## 10. FINAL PRE-FLIGHT CHECK
Before outputting any UI code, verify:
- [ ] No banned fonts, icons, shadows, or text clichés from Section 2 are present.
- [ ] Visual hierarchy is controlled by weights, colors, and margins, not massive font sizes.
- [ ] Interactive state loops (loading skeletal animations, tactile feedback) are present.
- [ ] Layout collapses gracefully to a clean single column on mobile.
- [ ] No CSS flex math percentages are used; CSS Grid is preferred.
- [ ] All animations are GPU-safe and isolated in client leaf components.
- [ ] Emojis are completely absent.
