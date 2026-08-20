import type { AppResource } from '@/lib/permissions';
import { SYSTEM_MODULE_NAV_GROUPS } from '@/lib/module-nav-config';

/**
 * Các mục điều hướng nhanh cho Command Palette (Cmd/Ctrl+K).
 * `nameKey` tra qua `txt()` — giữ đồng bộ với nhãn sidebar / dashboard.
 */
export interface CommandPaletteEntry {
  path: string;
  nameKey: string;
  /** Key nhóm (hiển thị section trong palette) — `nav.commandPalette.group*` */
  groupKey: string;
  /** Khi set — lọc theo canAccessModule (bỏ qua nếu undefined). */
  resource?: AppResource;
}

const SYSTEM_PALETTE_ENTRIES: CommandPaletteEntry[] = SYSTEM_MODULE_NAV_GROUPS.flatMap(
  (group) =>
    group.items.map((item) => ({
      path: item.path,
      nameKey: item.titleKey,
      groupKey: 'nav.commandPalette.groupSystem',
      resource: item.resource,
    }))
);

export const COMMAND_PALETTE_ENTRIES: readonly CommandPaletteEntry[] = [
  { path: '/', nameKey: 'nav.home', groupKey: 'nav.commandPalette.groupGeneral' },
  { path: '/thong-tin-ban-quyen', nameKey: 'nav.licenseInfo', groupKey: 'nav.commandPalette.groupGeneral' },
  { path: '/he-thong', nameKey: 'nav.system', groupKey: 'nav.commandPalette.groupSystem' },
  ...SYSTEM_PALETTE_ENTRIES,
  { path: '/ho-so', nameKey: 'nav.profile', groupKey: 'nav.commandPalette.groupAccount' },
  { path: '/thong-bao', nameKey: 'nav.notification', groupKey: 'nav.commandPalette.groupAccount' },
] as const;
