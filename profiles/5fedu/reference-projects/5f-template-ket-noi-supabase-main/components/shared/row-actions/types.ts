import type { ReactNode } from 'react';

export type RowOverflowMenuItemVariant = 'default' | 'destructive';

export interface RowOverflowMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: RowOverflowMenuItemVariant;
}
