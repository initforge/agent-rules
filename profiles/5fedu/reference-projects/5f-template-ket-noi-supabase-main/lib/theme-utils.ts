import { useUIStore } from '@/store/useStore';

/**
 * Shared color map – single source of truth for primary color HSL values.
 * Used by ThemeSynchronizer, index.html inline script, and usePrimaryColor hook.
 */
export const PRIMARY_COLOR_MAP: Record<string, string> = {
  blue: '221.2 83.2% 53.3%',
  violet: '262.1 83.3% 57.8%',
  emerald: '142.1 76.2% 36.3%',
  rose: '346.8 77.2% 49.8%',
  amber: '37.7 92.1% 50.2%',
  orange: '24.6 95% 53.1%',
  cyan: '188.7 94.5% 42.7%',
  slate: '215.4 16.3% 46.9%',
};

/* ------------------------------------------------------------------ */
/*  HSL ↔ Hex conversion helpers                                      */
/* ------------------------------------------------------------------ */

/** Parse an HSL string like "221.2 83.2% 53.3%" into { h, s, l } (all numbers). */
function parseHSL(hslStr: string): { h: number; s: number; l: number } {
  const parts = hslStr.replace(/%/g, '').split(/\s+/).map(Number);
  return { h: parts[0], s: parts[1], l: parts[2] };
}

/** Convert individual H, S, L values (h in 0-360, s/l in 0-100) to a hex string. */
function hslToHexRaw(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Convert an HSL string ("221.2 83.2% 53.3%") to a hex color ("#3b82f6"). */
export function hslToHex(hslStr: string): string {
  const { h, s, l } = parseHSL(hslStr);
  return hslToHexRaw(h, s, l);
}

/**
 * Generate a lighter variant of an HSL string by mixing towards white.
 * @param hslStr  e.g. "221.2 83.2% 53.3%"
 * @param amount  0-1, how far to push towards white (0.9 → very light, 0.1 → barely lighter)
 */
export function lightenHSL(hslStr: string, amount: number): string {
  const { h, s, l } = parseHSL(hslStr);
  const newL = l + (100 - l) * amount;
  return `${h} ${s}% ${Math.min(newL, 100).toFixed(1)}%`;
}

/**
 * Generate a darker variant of an HSL string.
 */
export function darkenHSL(hslStr: string, amount: number): string {
  const { h, s, l } = parseHSL(hslStr);
  const newL = l * (1 - amount);
  return `${h} ${s}% ${Math.max(newL, 0).toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/*  React hook                                                         */
/* ------------------------------------------------------------------ */

export interface PrimaryColorInfo {
  /** HSL string without hsl() wrapper, e.g. "221.2 83.2% 53.3%" */
  hsl: string;
  /** Hex string, e.g. "#3b82f6" */
  hex: string;
  /** Full CSS hsl() string, e.g. "hsl(221.2 83.2% 53.3%)" */
  cssHsl: string;
}

/**
 * Hook that returns the current primary color in multiple formats.
 * Useful for SVGs, Recharts, and other places that require hex/hsl strings.
 */
export function usePrimaryColor(): PrimaryColorInfo {
  const primaryColor = useUIStore((s) => s.primaryColor);
  const hsl = PRIMARY_COLOR_MAP[primaryColor] ?? PRIMARY_COLOR_MAP.blue;
  return {
    hsl,
    hex: hslToHex(hsl),
    cssHsl: `hsl(${hsl})`,
  };
}
