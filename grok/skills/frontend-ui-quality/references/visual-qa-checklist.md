# Visual QA Checklist

Use this checklist after the UI renders in a browser. Prefer screenshot evidence over intuition.

## Viewports

Check at least:

- Mobile: 375 x 812 or similar.
- Tablet or narrow desktop: 768 x 1024 when layout changes around this width.
- Desktop: 1280 x 720 or wider.
- Wide desktop: 1440+ when hero or dashboard composition matters.

## Layout

- No text overlaps adjacent controls, cards, charts, images, nav, or headers.
- No unexpected horizontal scrolling.
- No clipped labels, icons, badges, counters, chart legends, form fields, or table cells.
- Flex/grid children that contain text have enough width handling: `min-width: 0`, wrapping, truncation, or smaller copy.
- Repeated items align consistently across rows and columns.
- Primary actions are visually findable without dominating the whole screen.
- Dense tools keep useful information above the fold instead of using marketing-style empty space.
- Hero sections, when appropriate, reveal a hint of the next section on mobile and desktop.

## Dense Mobile App Gate

Apply this gate to dashboards, agent consoles, command centers, kanban views, CRM tools, trading desks, admin apps, bottom-tab apps, and any mobile/narrow viewport with many controls above the fold.

Release-blocking failures:

- A top status/header strip contains more items than it can comfortably hold; labels, icons, counters, prices, or pause/kill controls touch, overlap, or become hard to read.
- Brand marks, logos, and status dots are squeezed into unreadable clusters.
- Metric text such as "today", counts, costs, percentages, dates, or statuses wraps awkwardly or collides with neighboring controls.
- Circular or pill controls shrink below a comfortable tap target, clip their text, or dominate the header while other content is cramped.
- Tabs and filters render as raw browser buttons, broken table-like cells, uneven chip rows, or controls with inconsistent heights.
- Kanban/card titles run into counts, for example "Draft3" or "Ready1"; counts need spacing, badges, or separate alignment.
- Cards extend under sticky bottom navigation, workspace toggles, or floating toolbars.
- Bottom navigation labels/icons overlap page content, have insufficient safe-area padding, or hide the focused card.
- Dense chips wrap into too many rows without clear grouping, causing the main workflow to start too low or become visually noisy.
- Any control row requires pinch-zoom to read or tap accurately on a 375px wide viewport.

Preferred fixes:

- Collapse secondary metrics into a menu, popover, detail drawer, or second line with intentional hierarchy.
- Use grid areas or wrapping groups instead of one long flex row.
- Give compact controls fixed min sizes, `min-width: 0`, `flex-wrap`, and explicit gaps.
- Convert crowded text buttons into icon buttons with accessible labels when the icon is familiar.
- Separate labels and counts with badges, right-aligned metadata, or clear spacing.
- Add bottom padding equal to sticky navigation height plus safe area.
- Re-test at 375px width after every fix.

## Typography

- Heading sizes match the surface: large only for true heroes, smaller inside dashboards, panels, cards, and sidebars.
- Text has readable contrast against its background and images.
- Button labels fit without cramped padding.
- Long words, user names, prices, paths, dates, and status labels do not break the layout.
- Letter spacing is not negative and is normally `0`.

## Visual Design

- The palette is not dominated by near-identical shades of one hue unless required by an existing brand.
- Avoid default-looking gray boxes when a subtle border, background, spacing, or hierarchy adjustment would clarify the surface.
- Use icons for compact tool commands when a recognizable icon exists.
- Avoid nested cards and decorative blobs/orbs.
- Images reveal the actual subject; avoid dark, blurred, generic stock-like crops when inspection matters.
- Visual hierarchy is obvious: the primary subject/action is dominant, secondary content is quieter, and the eye path is intentional.
- Scale, contrast, balance, and grouping are used deliberately rather than relying on decoration.

## Accessibility

- Text contrast meets WCAG expectations for normal and large text wherever practical.
- Non-text UI indicators such as focus rings, icon buttons, selected states, and form boundaries have sufficient contrast.
- Touch/click targets are comfortably usable; do not make primary controls tiny for visual neatness.
- Layout reflows without horizontal scrolling at mobile widths, except for content types that genuinely require two-dimensional scrolling such as maps, large data tables, games, diagrams, and editing canvases.
- Every meaningful image has useful alt text or is correctly decorative.
- Focus states are visible and not clipped.
- Motion respects `prefers-reduced-motion`.

## Interaction States

Check states that exist in the app:

- Hover and focus states.
- Active/selected tab or navigation item.
- Disabled controls.
- Empty, loading, error, and success states.
- Open dropdowns, popovers, dialogs, sidebars, and menus.
- Long dynamic content in cards, rows, buttons, filters, and form fields.

## Browser Checks

Use Playwright or equivalent browser automation when possible:

- Capture screenshots at the target viewports.
- Evaluate `document.documentElement.scrollWidth > document.documentElement.clientWidth` to catch horizontal overflow.
- Inspect obvious layout warnings in the browser console.
- Check for visible cumulative layout shift after images, fonts, and async content load.
- Verify image/video/canvas containers keep stable dimensions while loading.
- For canvas or 3D work, verify non-empty pixels and that the scene is framed inside the viewport.

## Acceptance Bar

Do not finish while any of these remain visible:

- Text cut off in normal content.
- Elements overlapping in a way that obscures meaning.
- Controls moving or resizing unexpectedly on hover.
- Mobile layout requiring horizontal scroll.
- Primary workflow hidden below decorative content.
- A screenshot that looks materially worse than the surrounding app style.
- Rich media causing visible layout jumps after load.
- Motion that prevents reading, targeting controls, or understanding state.
