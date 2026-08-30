import type { Department } from '@/features/he-thong/phong-ban/core/types';
import type { PositionPermission } from '../core/types';
import { txt } from '@/lib/text';

export const DEPT_FILTER_OTHER = '__other__';

export interface DeptFilterGroupItem {
  value: string;
  label: string;
  isGroup: boolean;
}

export interface DeptFilterGroup {
  rootId: string;
  rootLabel: string;
  rootOrder: number;
  items: DeptFilterGroupItem[];
}

function findRootDepartment(
  deptId: string,
  byId: Map<string, Department>,
): Department | null {
  let current = byId.get(deptId);
  if (!current) return null;
  while (current.cha_id) {
    const parent = byId.get(current.cha_id);
    if (!parent) break;
    current = parent;
  }
  return current;
}

export function buildDeptFilterGroups(
  departments: Department[],
  roles: PositionPermission[],
): DeptFilterGroup[] {
  const byId = new Map(departments.map((d) => [d.id, d]));
  const otherLabel = txt('permission.matrix.otherDept');

  type ItemAcc = { label: string; order: number; isGroup: boolean };
  const rootBuckets = new Map<string, Map<string, ItemAcc>>();
  const rootMeta = new Map<string, { label: string; order: number }>();
  let hasOther = false;

  for (const role of roles) {
    const deptId = role.phong_ban_id;
    if (!deptId) {
      hasOther = true;
      continue;
    }

    const node = byId.get(deptId);
    if (!node) {
      hasOther = true;
      continue;
    }

    const root = findRootDepartment(deptId, byId);
    if (!root) {
      hasOther = true;
      continue;
    }

    if (!rootMeta.has(root.id)) {
      rootMeta.set(root.id, { label: root.ten_phong_ban, order: root.thu_tu ?? 0 });
    }

    let bucket = rootBuckets.get(root.id);
    if (!bucket) {
      bucket = new Map();
      rootBuckets.set(root.id, bucket);
    }

    const isGroup = node.cap_do >= 2;
    const existing = bucket.get(deptId);
    if (!existing) {
      bucket.set(deptId, {
        label: node.ten_phong_ban,
        order: node.thu_tu ?? 0,
        isGroup,
      });
    }
  }

  const groups: DeptFilterGroup[] = Array.from(rootBuckets.entries())
    .map(([rootId, bucket]) => {
      const meta = rootMeta.get(rootId)!;
      const items = Array.from(bucket.entries())
        .map(([value, acc]) => ({
          value,
          label: acc.label,
          isGroup: acc.isGroup,
          order: acc.order,
        }))
        .sort((a, b) => a.order - b.order)
        .map(({ value, label, isGroup }) => ({ value, label, isGroup }));

      return {
        rootId,
        rootLabel: meta.label,
        rootOrder: meta.order,
        items,
      };
    })
    .sort((a, b) => a.rootOrder - b.rootOrder);

  if (hasOther) {
    groups.push({
      rootId: DEPT_FILTER_OTHER,
      rootLabel: otherLabel,
      rootOrder: 99999,
      items: [{ value: DEPT_FILTER_OTHER, label: otherLabel, isGroup: false }],
    });
  }

  return groups;
}

export function labelForDeptFilterId(
  filterId: string | null,
  groups: DeptFilterGroup[],
  departments: Department[],
): string {
  if (filterId === null) return txt('permission.matrix.filterByDeptAll');
  if (filterId === DEPT_FILTER_OTHER) return txt('permission.matrix.otherDept');

  for (const group of groups) {
    const item = group.items.find((i) => i.value === filterId);
    if (item) return item.label;
  }

  const dept = departments.find((d) => d.id === filterId);
  return dept?.ten_phong_ban ?? filterId;
}
