import { useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query (max-width / prefers-color-scheme, …).
 * Uses useSyncExternalStore so we avoid setState-in-effect for matchMedia.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onStoreChange);
      return () => mq.removeEventListener('change', onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True when viewport width is at most (breakpoint - 1) px — matches Tailwind `max-width: breakpoint-1` */
export function useIsMaxWidth(breakpoint: number): boolean {
  return useMediaQuery(`(max-width: ${breakpoint - 1}px)`);
}
