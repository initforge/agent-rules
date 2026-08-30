import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'app-favorite-modules';

/** Tham chiếu cố định cho trường hợp rỗng – bắt buộc với useSyncExternalStore để tránh infinite loop */
const EMPTY_FAVORITES: string[] = [];

let cachedRaw: string | null = null;
let cachedSnapshot: string[] = EMPTY_FAVORITES;

function getSnapshot(): string[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return EMPTY_FAVORITES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === '') {
      cachedRaw = null;
      cachedSnapshot = EMPTY_FAVORITES;
      return EMPTY_FAVORITES;
    }
    if (raw === cachedRaw) return cachedSnapshot;
    const parsed = JSON.parse(raw) as unknown;
    const arr =
      Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') ? (parsed as string[]) : [];
    cachedRaw = raw;
    cachedSnapshot = arr;
    return arr;
  } catch {
    cachedRaw = null;
    cachedSnapshot = EMPTY_FAVORITES;
    return EMPTY_FAVORITES;
  }
}

const listeners = new Set<() => void>();
function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function notify() {
  listeners.forEach((cb) => cb());
}

/** Hook lưu/đọc danh sách module yêu thích (ghim) từ localStorage. */
export function useFavoriteModules() {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setIds = useCallback((next: string[] | ((prev: string[]) => string[])) => {
    const nextIds = typeof next === 'function' ? next(getSnapshot()) : next;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextIds));
      notify();
    } catch {
      // ignore
    }
  }, []);

  const toggleFavorite = useCallback(
    (moduleId: string) => {
      setIds((prev) => {
        const set = new Set(prev);
        if (set.has(moduleId)) set.delete(moduleId);
        else set.add(moduleId);
        return [...set];
      });
    },
    [setIds]
  );

  const isFavorite = useCallback(
    (moduleId: string) => ids.includes(moduleId),
    [ids]
  );

  return { favoriteIds: ids, toggleFavorite, isFavorite };
}
