import React from 'react';
import { Layers } from 'lucide-react';
import type { BadgeConfig } from '@/components/ui/EnumBadge';
import { txt } from '@/lib/text';

const MAX_LEVEL = 16;

/** Config EnumBadge cho cột cấp (cap_do); màu theo tầng giống getLevelBadgeStyleDefault. */
export function buildDepartmentLevelBadgeConfig(): BadgeConfig<number> {
  const c: BadgeConfig<number> = {};
  for (let i = 1; i <= MAX_LEVEL; i++) {
    const color =
      i === 1 ? 'primary' : i === 2 ? 'sky' : i === 3 ? 'amber' : 'slate';
    c[i] = {
      label: txt('department.levelBadge', { level: i }),
      color,
      icon: <Layers size={10} className="shrink-0" />,
    };
  }
  return c;
}

/** Config EnumBadge cho trạng thái hoạt động (TrangThaiHoatDong). */
export function departmentTrangThaiBadgeConfig(): BadgeConfig<string> {
  return {
    'Đang hoạt động': { label: txt('department.active'), color: 'primary' },
    'Ngừng hoạt động': { label: txt('department.inactive'), color: 'slate' },
  };
}
