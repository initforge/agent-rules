/**
 * Tree utilities for flat list ↔ hierarchy (parent/child) data.
 * Reusable across modules: Phòng ban, danh mục, đơn vị, v.v.
 */

export interface TreeItemLike {
  id: string;
  id_cha?: string | null;
  [key: string]: unknown;
}

export type GetIdFn<T> = (item: T) => string;
export type GetParentIdFn<T> = (item: T) => string | null | undefined;
export type GetOrderFn<T> = (item: T) => number;

export interface FlattenTreeOptions<T> {
  /** Lấy id của item */
  getId: GetIdFn<T>;
  /** Lấy id cha (null/undefined = root) */
  getParentId: GetParentIdFn<T>;
  /** Thứ tự trong cùng cấp (số nhỏ lên trước) */
  getOrder?: GetOrderFn<T>;
  /** Nếu true, các item không nằm trong cây (orphan) vẫn được thêm vào cuối danh sách */
  includeOrphans?: boolean;
}

/**
 * Chuyển danh sách dạng cây (có id_cha) thành danh sách phẳng theo thứ tự DFS,
 * anh em sắp xếp theo getOrder.
 */
export function flattenTreeToSortedList<T>(
  items: T[],
  options: FlattenTreeOptions<T>
): T[] {
  const { getId, getParentId, getOrder = () => 0, includeOrphans = true } = options;
  if (!items?.length) return [];

  const childrenMap = new Map<string | null, T[]>();
  items.forEach((item) => {
    const parentId = getParentId(item) ?? null;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId)!.push(item);
  });

  childrenMap.forEach((siblings) => {
    siblings.sort((a, b) => (getOrder(a) - getOrder(b)));
  });

  const result: T[] = [];
  const traverse = (parentId: string | null) => {
    const children = childrenMap.get(parentId);
    if (children) {
      children.forEach((child) => {
        result.push(child);
        traverse(getId(child));
      });
    }
  };
  traverse(null);

  if (includeOrphans) {
    const visitedIds = new Set(result.map(getId));
    const orphans = items.filter((item) => !visitedIds.has(getId(item)));
    result.push(...orphans);
  }

  return result;
}

/**
 * Đếm số node trong cây con của một node (bao gồm chính nó).
 */
export function countNodesInSubtree<T>(
  rootId: string,
  items: T[],
  options: Pick<FlattenTreeOptions<T>, 'getId' | 'getParentId'>
): number {
  const { getId, getParentId } = options;
  const visible = new Set<string>();
  let current = new Set<string>([rootId]);
  while (current.size > 0) {
    current.forEach((id) => visible.add(id));
    const next = new Set<string>();
    items.forEach((item) => {
      const parentId = getParentId(item);
      if (parentId != null && current.has(parentId)) next.add(getId(item));
    });
    current = next;
  }
  return visible.size;
}

/**
 * Lấy tập id của mọi con cháu của một node (không bao gồm chính nó).
 */
export function getDescendantIds<T>(
  rootId: string,
  items: T[],
  options: Pick<FlattenTreeOptions<T>, 'getId' | 'getParentId'>
): Set<string> {
  const { getId, getParentId } = options;
  const descendantIds = new Set<string>();
  let current = new Set<string>([rootId]);
  while (current.size > 0) {
    const next = new Set<string>();
    items.forEach((item) => {
      const parentId = getParentId(item);
      if (parentId != null && current.has(parentId)) {
        const id = getId(item);
        descendantIds.add(id);
        next.add(id);
      }
    });
    current = next;
  }
  return descendantIds;
}

/**
 * Lấy danh sách node gốc (không có cha hoặc cha null).
 */
export function getRootItems<T>(
  items: T[],
  options: Pick<FlattenTreeOptions<T>, 'getParentId' | 'getOrder'>
): T[] {
  const { getParentId, getOrder = () => 0 } = options;
  return items
    .filter((item) => getParentId(item) == null || getParentId(item) === '')
    .slice()
    .sort((a, b) => getOrder(a) - getOrder(b));
}

/** Style class cho badge level (dùng chung UI hierarchy). */
export function getLevelBadgeStyleDefault(level: number): string {
  switch (level) {
    case 1:
      return 'bg-primary/15 text-primary border-primary/25 shadow-sm';
    case 2:
      return 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-900';
    case 3:
      return 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

/** Style class cho tên theo level. */
export function getNameStyleDefault(level: number): string {
  if (level === 1) return 'text-sm font-bold text-foreground';
  if (level === 2) return 'text-sm font-semibold text-foreground';
  return 'text-sm font-medium text-muted-foreground';
}
