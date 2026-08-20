import React from 'react';
import { cn } from '@/lib/utils';

interface DetailFieldGridProps {
  children: React.ReactNode;
  cols?: 1 | 2 | 3;
  className?: string;
}

/** Lưới các DetailField: responsive 1 cột mobile → 2 cột tablet → 2-3 cột desktop */
const DetailFieldGrid: React.FC<DetailFieldGridProps> = ({ children, cols = 2, className }) => {
  const gridClass =
    cols === 1
      ? 'grid grid-cols-1 gap-y-4 w-full'
      : cols === 2
        ? 'grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 w-full'
        : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 w-full';
  return <div className={cn(gridClass, className)}>{children}</div>;
};

export default DetailFieldGrid;
