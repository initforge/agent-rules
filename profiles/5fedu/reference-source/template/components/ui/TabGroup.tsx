import React from 'react';
import { cn } from '@/lib/utils';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ElementType;
}

interface TabGroupProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

const TabGroup: React.FC<TabGroupProps> = ({ tabs, activeTab, onChange, className }) => {
  return (
    <div className={cn("flex gap-0.5 p-0.5 bg-muted/50 rounded-lg border border-border/50 w-fit", className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all select-none",
              isActive
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon && <Icon size={14} />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default TabGroup;
