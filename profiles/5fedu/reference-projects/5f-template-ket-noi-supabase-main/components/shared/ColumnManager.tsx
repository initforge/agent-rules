import React, { useState, useRef } from 'react';
import { txt } from '@/lib/text';
import { Check, RotateCcw, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnConfig } from '@/store/createGenericStore';
import Tooltip from '@/components/ui/Tooltip';

interface ColumnManagerProps {
  columns: ColumnConfig[];
  onToggleColumn: (id: string) => void;
  onReorderColumns: (fromIndex: number, toIndex: number) => void;
  onResetColumns: () => void;
}

const ColumnManager: React.FC<ColumnManagerProps> = ({
  columns, onToggleColumn, onReorderColumns, onResetColumns
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const visibleCount = sorted.filter(c => c.visible).length;

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    dragNode.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image slightly transparent
    setTimeout(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnter = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = '1';
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      onReorderColumns(dragIndex, dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
    dragNode.current = null;
  };

  return (
    <div className="w-64 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">{txt('common.columnDisplay')}</h4>
          <span className="text-xs tabular-nums text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-full font-medium">
            {visibleCount}/{sorted.length}
          </span>
        </div>
        <Tooltip content={txt('common.reset')} placement="bottom">
          <button
            onClick={onResetColumns}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <RotateCcw size={12} />
          </button>
        </Tooltip>
      </div>

      {/* Column List */}
      <div className="p-1.5 max-h-[320px] overflow-y-auto custom-scrollbar">
        {sorted.map((col, index) => (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- HTML5 drag-and-drop row
          <div
            key={col.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-all group",
              dragOverIndex === index && "bg-primary/10 border border-primary/20 border-dashed",
              dragIndex === index ? "opacity-40" : "hover:bg-muted/50"
            )}
          >
            {/* Drag handle */}
            <GripVertical size={12} className="text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />

            {/* Visibility checkbox */}
            <button
              type="button"
              aria-pressed={col.visible}
              onClick={(e) => {
                e.stopPropagation();
                onToggleColumn(col.id);
              }}
              className={cn(
                "w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 cursor-pointer",
                col.visible ? 'bg-primary border-primary text-white' : 'border-border bg-background group-hover:border-primary/50'
              )}
            >
              {col.visible && <Check size={10} className="stroke-[3px]" />}
            </button>

            {/* Label */}
            <span className={cn(
              "text-xs flex-1 truncate",
              col.visible ? 'text-foreground font-medium' : 'text-muted-foreground'
            )}>
              {col.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ColumnManager;
