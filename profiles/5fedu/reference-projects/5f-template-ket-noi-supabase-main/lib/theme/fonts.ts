/**
 * Typography — single source of truth for UI font stacks.
 *
 * - CSS default + runtime: `--font-sans` / `--font-mono` (see `index.css` @theme + ThemeSynchronizer).
 * - `buildSansStackCss()` must stay aligned with the `@theme --font-sans` default when primary is Inter.
 * - Google Fonts params for lazy `loadFont()` — keep keys in sync with `store/useStore` ThemeState.fontFamily.
 */

export type AppFontFamily =
  | 'Inter'
  | 'Be Vietnam Pro'
  | 'Lexend'
  | 'Nunito'
  | 'Source Sans 3'
  | 'Merriweather';

/** Fallback after the primary face (Latin + system + emoji). */
export const SANS_FALLBACK = `'Noto Sans', ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'`;

/** Monospace stack for codes / IDs — matches Tailwind `font-mono` default intent. */
export const MONO_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

/**
 * `family=` value for Google Fonts CSS2; empty = already loaded in index.html.
 * Must stay in sync with the inline boot script in `index.html` (early font + link injection).
 */
export const GOOGLE_FONT_CSS2_MAP: Record<AppFontFamily, string> = {
  Inter: '',
  'Be Vietnam Pro': 'Be+Vietnam+Pro:wght@400;500;600;700',
  Lexend: 'Lexend:wght@400;500;600;700',
  Nunito: 'Nunito:wght@400;600;700',
  'Source Sans 3': 'Source+Sans+3:wght@400;500;600;700',
  Merriweather: 'Merriweather:wght@400;700',
};

export function quoteFontFamilyName(name: string): string {
  return name.trim().includes(' ') ? `'${name.trim()}'` : name.trim();
}

/** Full value for `document.documentElement.style.setProperty('--font-sans', …)`. */
export function buildSansStackCss(primaryFont: string): string {
  return `${quoteFontFamilyName(primaryFont)}, ${SANS_FALLBACK}`;
}
