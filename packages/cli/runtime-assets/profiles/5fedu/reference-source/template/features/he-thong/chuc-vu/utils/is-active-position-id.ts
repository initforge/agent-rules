import type { Position } from '../core/types';

/** True when `positionId` is in the active positions list (picker / auth prefetch gate). */
export function isActivePositionId(positions: Position[], positionId: string): boolean {
  if (!positionId) return false;
  return positions.some((p) => p.id === positionId);
}
