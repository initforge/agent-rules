import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  FileKey,
  LayoutDashboard,
  Users,
  Network,
  Briefcase,
  Landmark,
  Shield,
  UserCircle,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { txt } from '@/lib/text';
import { COMMAND_PALETTE_ENTRIES, type CommandPaletteEntry } from '@/lib/command-palette-entries';
import { useCanAccessModuleChecker } from '@/hooks/use-can-access-module-checker';
import { hasAnySystemModuleAccess } from '@/lib/module-nav-config';
import { cn } from '@/lib/utils';

const PATH_ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/thong-tin-ban-quyen': FileKey,
  '/he-thong': LayoutDashboard,
  '/he-thong/nhan-vien': Users,
  '/he-thong/phong-ban': Network,
  '/he-thong/chuc-vu': Briefcase,
  '/he-thong/thong-tin-cong-ty': Landmark,
  '/he-thong/phan-quyen': Shield,
  '/ho-so': UserCircle,
  '/thong-bao': Bell,
};

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const canAccess = useCanAccessModuleChecker();
  const showSystemDashboard = hasAnySystemModuleAccess(canAccess);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const permissionFiltered = useMemo(
    () =>
      COMMAND_PALETTE_ENTRIES.filter((entry) => {
        if (entry.path === '/he-thong') return showSystemDashboard;
        if (entry.resource) return canAccess(entry.resource);
        return true;
      }),
    [canAccess, showSystemDashboard]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return permissionFiltered;
    return permissionFiltered.filter((e) => {
      const label = txt(e.nameKey).toLowerCase();
      const group = txt(e.groupKey).toLowerCase();
      return (
        label.includes(needle) ||
        group.includes(needle) ||
        e.path.toLowerCase().includes(needle)
      );
    });
  }, [query, permissionFiltered]);

  const groups = useMemo(() => {
    const map = new Map<string, CommandPaletteEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.groupKey);
      if (list) list.push(e);
      else map.set(e.groupKey, [e]);
    }
    return [...map.entries()];
  }, [filtered]);

  const safeActive =
    filtered.length === 0 ? 0 : Math.min(Math.max(0, active), filtered.length - 1);

  useLayoutEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const go = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose]
  );

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && filtered[safeActive]) {
        e.preventDefault();
        go(filtered[safeActive].path);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, filtered, safeActive, onClose, go]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh] md:pt-[15vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 dark:bg-black/60"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-palette-title"
            initial={{ scale: 0.98, opacity: 0, y: -6 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border/40 bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border/50 px-3 py-3">
              <h2 id="command-palette-title" className="sr-only">
                {txt('nav.commandPalette.title')}
              </h2>
              <input
                ref={inputRef}
                type="search"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder={txt('nav.commandPalette.placeholder')}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
              />
              <p className="mt-2 text-[10px] text-muted-foreground">{txt('nav.commandPalette.hint')}</p>
            </div>
            <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">{txt('nav.commandPalette.empty')}</p>
              ) : (
                <div className="space-y-3">
                  {groups.map(([groupKey, items]) => (
                    <div key={groupKey}>
                      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {txt(groupKey)}
                      </div>
                      <ul className="space-y-0.5">
                        {items.map((e) => {
                          const flatIdx = filtered.indexOf(e);
                          const Icon = PATH_ICONS[e.path] ?? LayoutDashboard;
                          const isActiveRow = flatIdx === safeActive;
                          return (
                            <li key={e.path}>
                              <button
                                type="button"
                                onClick={() => go(e.path)}
                                onMouseEnter={() => setActive(flatIdx)}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                                  isActiveRow ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/80 text-foreground'
                                )}
                              >
                                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                <span className="min-w-0 flex-1 truncate font-medium">{txt(e.nameKey)}</span>
                                <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{e.path}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
