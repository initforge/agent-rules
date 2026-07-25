import React from 'react';
import { cn } from '@/lib/utils';

export interface DetailToolbarAction {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'warning' | 'info' | 'violet';
    disabled?: boolean;
}

interface DetailToolbarProps {
    actions: DetailToolbarAction[];
    /** Số cột: 2 cho sidebar hẹp, mặc định 3 (mobile) / 6 (desktop) */
    columns?: 2 | 3 | 6;
    className?: string;
}

/**
 * Toolbar hiển thị các hành động trong màn detail
 * Action được thiết kế hình tròn với text ở dưới
 */
const DetailToolbar: React.FC<DetailToolbarProps> = ({ actions, columns, className }) => {
    if (!actions || actions.length === 0) return null;

    const gridColsClass =
        columns === 2 ? "grid-cols-2" :
        columns === 6 ? "grid-cols-3 sm:grid-cols-6" :
        "grid-cols-3 sm:grid-cols-6";

    return (
        <div className={cn("grid gap-3 p-3.5 min-w-0", gridColsClass, className)}>
            {actions.map((action, index) => (
                <button
                    key={index}
                    type="button"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={cn(
                        "flex flex-col items-center gap-1.5 transition-[transform,colors] duration-150 outline-none min-w-0 w-full",
                        action.disabled ? "opacity-40 cursor-not-allowed" : "hover:-translate-y-0.5 active:scale-95"
                    )}
                >
                    <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-[transform,colors,background-color,border-color] duration-150 shadow-sm border",
                        action.variant === 'primary' ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary hover:text-white" :
                            action.variant === 'danger' ? "bg-rose-50 dark:bg-rose-950/30 text-rose-500 border-rose-100 dark:border-rose-900 hover:bg-rose-500 hover:text-white" :
                                action.variant === 'success' ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border-emerald-100 dark:border-emerald-900 hover:bg-emerald-500 hover:text-white" :
                                    action.variant === 'warning' ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 border-amber-100 dark:border-amber-900 hover:bg-amber-500 hover:text-white" :
                                        action.variant === 'info' ? "bg-sky-50 dark:bg-sky-950/30 text-sky-600 border-sky-100 dark:border-sky-900 hover:bg-sky-500 hover:text-white" :
                                            action.variant === 'violet' ? "bg-violet-50 dark:bg-violet-950/30 text-violet-600 border-violet-100 dark:border-violet-900 hover:bg-violet-500 hover:text-white" :
                                                action.variant === 'secondary' ? "bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700" :
                                                    action.variant === 'ghost' ? "bg-transparent text-muted-foreground border-transparent hover:bg-muted" :
                                                        "bg-muted/80 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                    )}>
                        {React.cloneElement(action.icon as React.ReactElement, { size: 16, strokeWidth: 2 })}
                    </div>
                    <span className={cn(
                        "text-xs font-medium text-center transition-colors break-words w-full px-1 leading-tight",
                        action.variant === 'primary' ? "text-primary" :
                            action.variant === 'danger' ? "text-rose-600 dark:text-rose-400" :
                                action.variant === 'success' ? "text-emerald-600 dark:text-emerald-400" :
                                    action.variant === 'warning' ? "text-amber-600 dark:text-amber-400" :
                                        action.variant === 'info' ? "text-sky-600 dark:text-sky-400" :
                                            action.variant === 'violet' ? "text-violet-600 dark:text-violet-400" :
                                                action.variant === 'secondary' ? "text-slate-600 dark:text-slate-400" :
                                                    "text-muted-foreground"
                    )}>
                        {action.label}
                    </span>
                </button>
            ))}
        </div>
    );
};

export default DetailToolbar;
