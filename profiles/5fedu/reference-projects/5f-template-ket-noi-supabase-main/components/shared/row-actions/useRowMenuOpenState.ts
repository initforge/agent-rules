import { useState, useCallback } from 'react';

export function useRowMenuOpenState() {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const isOpen = useCallback((id: string) => menuOpenId === id, [menuOpenId]);

  const open = useCallback((id: string) => {
    setMenuOpenId(id);
  }, []);

  const close = useCallback(() => {
    setMenuOpenId(null);
  }, []);

  const toggle = useCallback((id: string) => {
    setMenuOpenId((prev) => (prev === id ? null : id));
  }, []);

  return {
    menuOpenId,
    setMenuOpenId,
    isOpen,
    open,
    close,
    toggle,
  };
}
