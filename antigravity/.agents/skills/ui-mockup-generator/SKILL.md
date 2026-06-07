---
name: ui-mockup-generator
description: Master image generation skill for creating premium, high-fidelity user interface references for both web and mobile platforms. Optimized for generating clean layouts, authentic typography, correct device mockups, and cohesive color schemes that developers can easily translate to code.
---

# UI Mockup Generator (Master Image Direction Skill)

Use this skill to generate high-end, premium website layouts, landing page designs, and mobile app interface mockups. This is an image-generation-only skill. Do not write code or describe code. Focus purely on visual direction and prompt construction.

---

## 1. ACTIVE BASELINE CONFIGURATION
* **DESIGN_VARIANCE:** 8 (1 = rigid/symmetrical, 10 = highly creative/asymmetrical)
* **VISUAL_DENSITY:** 3 (1 = airy/calm, 10 = packed/information dense)
* **IMPLEMENTATION_CLARITY:** 9 (1 = loose moodboard, 10 = pixel-perfect, easy to code)
* **NON_GENERICITY:** 10 (1 = generic template style, 10 = distinct, original concept)

---

## SECTION A: WEB & LANDING PAGE MOCKUPS

### 1. THE HORIZONTAL SECTION RULE (CRITICAL)
**Generate exactly one separate horizontal image (16:9 or 21:9) per section. Never compile or collapse multiple sections into a single vertical image.**
* 1 section requested -> 1 horizontal image.
* 4 sections requested -> 4 horizontal images.
* "landing page" or "website template" (no count specified) -> default to 6 sections -> 6 horizontal images.
Output them sequentially in your response, labeling each one ("Section 1 of N: Hero", "Section 2 of N: Features", etc.).

### 2. HERO COMPOSITION AND ANCHORS
Avoid defaulting to the overused "left-text / right-image" layout. Select from these premium alternatives:
* **Cinematic Centered:** Text centered in the lower 40%, sitting over a full-bleed dark or warm-graded background image.
* **Asymmetric Split:** Text offset to the left with an overlapping, beautifully framed visual element on the right (editorial margin bleed).
* **Stacked Center:** Logo, headline, concise subtext, and a single high-contrast primary CTA all stacked in a narrow, elegant centered column with generous negative space.
* **Image-as-Canvas:** A large, art-directed photo acts as the entire background/canvas, with light, high-contrast typography placed in a designated safe area (e.g., top-left or bottom-right).

### 3. BACKGROUND MODES & TEXTURES
Vary the backgrounds across sections to create a premium scroll rhythm:
* **Tactile Material:** Subtle paper texture, micro-noise, or light cardboard grain.
* **Cinematic Tonal Gradients:** Muted, low-chroma gradients (e.g., charcoal to graphite, warm cream to soft gray). Banish all neon purple/blue mesh gradients.
* **Duotone Treatments:** Apply single-color or duotone filters to background photography to lock it into the brand's palette.
* **Color-Blocked Diptych:** Split flat fields of contrasting brand colors meeting in a sharp vertical or horizontal line.

---

## SECTION B: MOBILE APP MOCKUPS

### 1. PLATFORM MODES & DEVICE FRAMES
By default, always present mobile screens inside a clean, premium device mockup frame (centered, with even margins on all sides):
* **iOS-Native Premium:** Clean, minimalist top area (notch/island-aware), refined tab bars, elegant bottom sheets, and native-feeling card shapes.
* **Android-Native Premium:** Clean app bars, explicit Material-style bottom navigation, sheet docking logic, and firm component container bounds.
* **Cross-Platform Premium:** Universal mobile navigation patterns, safe-area awareness, clean margins, and minimal device branding.

### 2. SCREEN COUNT AND FLOW LOGIC
Generate enough screens to present a believable flow. Do not collapse onboarding or checkout steps into a single generic mockup:
* **Logical Flow:** Ensure screens progress logically (e.g., Onboarding screen 1 -> Onboarding screen 2 -> Sign In -> Home Dashboard -> Detail View).
* **Consistency:** Maintain identical device frame styles, device scale, color palettes, font pairings, and button styles across all screens in the flow.
* **No Old Crops:** Never crop or zoom into a previously generated larger image. If a detail view is needed, generate a fresh standalone screen focusing on that UI component.

### 3. TEXT READABILITY & VISUAL DENSITY
* Keep text comfortable to read at normal viewing size. Avoid tiny, simulated unreadable text lines.
* Maintain a clean, flat hierarchy. Do not nest boxes inside boxes inside boxes. Use spacing and typographic weights instead of boxes to define groups.
* Ensure clear contrast: dark background = white text, light background = dark text. Never output low-contrast, invisible button labels.

---

## SECTION C: ANTI-AI-SLOP RULES (FOR ALL GENERATIONS)

### 1. Banned Visual Patterns
* **NO Purple/Blue AI Gradients:** The default glow-effect mesh gradients are strictly banned.
* **NO Floating Neon Spheres/Orbs:** Do not clutter background canvases with meaningless glowing blobs.
* **NO Cloned Sections:** Every section must have a unique layout, density, and image-to-text ratio.
* **NO Generic Dashboard Card Spam:** Avoid mockups filled with random widgets, fake line charts, and pointless bar graphs.

### 2. Copy & Brand Constraints
* **Banned Copy:** "Unleash", "Elevate", "Seamless", "Revolutionize", "Next-Gen", "Smarter than ever". Use short, simple, specific verbs.
* **Banned Brand Names:** "Acme", "Nexus", "Flowbit", "Quantix", "VeloPay". Use contextual, realistic, and highly specific names.
