
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { txt } from '@/lib/text';
import { useNavigate, useLocation } from 'react-router-dom';
import { getParentPath } from './Breadcrumbs';
import {
    Search, X, Check, Trash2, Power, Filter, LayoutTemplate,
    ArrowLeft, List, Plus,
} from 'lucide-react';
import * as m from 'framer-motion/m';
import { AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ColumnConfig } from '@/store/createGenericStore';
import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';
import ColumnManager from './ColumnManager';
import Tooltip from '@/components/ui/Tooltip';
import MobileFilterSheet from '@/components/ui/MobileFilterSheet';
import MobileActionsSheet from '@/components/ui/MobileActionsSheet';
import type { FilterGroup } from '@/components/ui/MobileFilterSheet';
import type { ActionItem } from '@/components/ui/MobileActionsSheet';

interface GenericToolbarProps {
    selectedCount: number;
    searchTerm: string;
    onSearchChange: (term: string) => void;

    // Actions
    onClearSelection: () => void;

    // Custom Render Props (desktop). filters: dùng FilterChipMultiSelect/FilterChipSingleSelect (quy chuẩn: Chọn tất cả + Xóa chọn trong dropdown)
    actions?: React.ReactNode;
    bulkActions?: React.ReactNode;
    filters?: React.ReactNode;

    // Default Bulk Actions Handlers
    onDeleteMany?: () => void;
    onStatusChangeMany?: (status: TrangThaiHoatDong) => void;

    // Column Manager
    columns?: ColumnConfig[];
    onToggleColumn?: (id: string) => void;
    onReorderColumns?: (fromIndex: number, toIndex: number) => void;
    onResetColumns?: () => void;

    // Navigation
    showBack?: boolean;
    /** Khi có: ghi đè hành vi Back. Khi không có: về trang cha theo `getParentPath` (thống nhất breadcrumb). */
    onBack?: () => void;

    // Search
    searchPlaceholder?: string;
    /** Ẩn ô tìm kiếm (desktop + mobile) khi module không dùng search */
    hideSearch?: boolean;

    /** Number of active filters to show badge */
    activeFilterCount?: number;
    /** Callback to clear all filters */
    onClearAllFilters?: () => void;

    /** Filter groups cho mobile bottom sheet */
    filterGroups?: FilterGroup[];

    /** Action items cho mobile bottom sheet (import, export, ...) */
    mobileActions?: ActionItem[];

    /** Callback khi bấm nút Thêm trên mobile */
    onAdd?: () => void;

    /** Nội dung nhỏ hiển thị bên phải ô search (desktop & mobile, khi không có selection) */
    searchTrailing?: React.ReactNode;

    /** Desktop (≥sm): nội dung sau nút Back — vd. TabGroup (chỉ render trong hàng toolbar desktop). */
    desktopStartSlot?: React.ReactNode;
}

const GenericToolbar: React.FC<GenericToolbarProps> = ({
    selectedCount,
    searchTerm, onSearchChange, onClearSelection,
    actions, bulkActions, filters,
    onDeleteMany, onStatusChangeMany,
    columns, onToggleColumn, onReorderColumns, onResetColumns,
    showBack = false,
    onBack,
    searchPlaceholder,
    hideSearch = false,
    activeFilterCount = 0,
    onClearAllFilters,
    filterGroups,
    mobileActions,
    onAdd,
    searchTrailing,
    desktopStartSlot,
}) => {
    const resolvedSearchPlaceholder = searchPlaceholder ?? txt('common.searchPlaceholder');
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [showMobileActions, setShowMobileActions] = useState(false);
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const hasSelection = selectedCount > 0;
    const navigate = useNavigate();
    const location = useLocation();
    const handleBack = useCallback(() => {
        if (onBack) {
            onBack();
            return;
        }
        const parent = getParentPath(location.pathname, txt);
        navigate(parent ?? '/');
    }, [onBack, location.pathname, navigate]);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const mobileSearchInputRef = useRef<HTMLInputElement>(null);
    const columnMenuRef = useRef<HTMLDivElement>(null);

    const focusSearchInput = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (window.matchMedia('(min-width: 640px)').matches) {
            searchInputRef.current?.focus();
        } else {
            mobileSearchInputRef.current?.focus();
        }
    }, []);

    const scrollSearchIntoView = useCallback((el: HTMLInputElement) => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        requestAnimationFrame(() => {
            el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
        });
    }, []);

    // Keyboard shortcut: "/" to focus search (chỉ khi có search) — mobile + desktop
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (hideSearch) return;
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                focusSearchInput();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [hideSearch, focusSearchInput]);

    // Close column menu on click outside
    useEffect(() => {
        if (!showColumnMenu) return;
        const handler = (e: MouseEvent) => {
            if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
                setShowColumnMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showColumnMenu]);

    const hasColumnManager = columns && onToggleColumn;
    /** Mobile sheet chỉ cần `filterGroups`; desktop chips dùng `filters` riêng. */
    const hasMobileFilterSheet = !!(filterGroups && filterGroups.length > 0);
    const hasMobileActions = mobileActions && mobileActions.length > 0;

    return (
        <div className="sticky top-0 z-30 bg-card border-b border-border/40 px-3 sm:px-4 py-2 space-y-2 shrink-0 [touch-action:manipulation]">

            {/* ======================================================== */}
            {/* MOBILE TOOLBAR (< sm): 1 hàng duy nhất                   */}
            {/* ======================================================== */}
            <div className="sm:hidden">
                <AnimatePresence mode="wait">
                    {hasSelection ? (
                        /* ---- Mobile: Chế độ chọn nhiều ---- */
                        <m.div
                            key="mobile-bulk"
                            initial={{ opacity: 0, x: -15 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -15 }}
                            className="flex items-center gap-1.5"
                        >
                            <div className="bg-primary text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm shadow-primary/20 flex items-center gap-1.5 tabular-nums">
                                <Check size={12} className="stroke-[3px]" />
                                <span>{selectedCount}</span>
                            </div>
                            <button
                                onClick={onClearSelection}
                                className="text-muted-foreground hover:text-destructive p-1.5 rounded-lg hover:bg-destructive/10 transition-all active:scale-90"
                            >
                                <X size={14} className="stroke-[2.5px]" />
                            </button>

                            <div className="flex-1" />

                            {onStatusChangeMany && (
                                <>
                                    <button
                                        onClick={() => onStatusChangeMany('Đang hoạt động')}
                                        className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-8 w-8 flex items-center justify-center text-primary bg-primary/10 rounded-lg border border-primary/20 active:scale-95"
                                    >
                                        <Check size={14} className="stroke-[2.5px]" />
                                    </button>
                                    <button
                                        onClick={() => onStatusChangeMany('Ngừng hoạt động')}
                                        className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-8 w-8 flex items-center justify-center text-muted-foreground bg-muted/50 rounded-lg border border-border active:scale-95"
                                    >
                                        <Power size={14} className="stroke-[2.5px]" />
                                    </button>
                                </>
                            )}
                            {onDeleteMany && (
                                <button
                                    onClick={onDeleteMany}
                                    className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-8 w-8 flex items-center justify-center text-white bg-destructive rounded-lg shadow-sm active:scale-95"
                                >
                                    <Trash2 size={14} className="stroke-[2.5px]" />
                                </button>
                            )}
                            {bulkActions}
                        </m.div>
                    ) : (
                        /* ---- Mobile: Chế độ bình thường – 1 hàng ---- */
                        <m.div
                            key="mobile-normal"
                            initial={{ opacity: 0, x: -15 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -15 }}
                            className="flex items-center gap-1.5"
                        >
                            {/* Back */}
                            {showBack && (
                                <button
                                    onClick={handleBack}
                                    className="shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground active:scale-95 transition-all"
                                >
                                    <ArrowLeft size={14} strokeWidth={2.25} />
                                </button>
                            )}

                            {/* Search */}
                            {!hideSearch ? (
                                <div className="relative flex-1 min-w-0 max-w-[21rem]">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                    <input
                                        ref={mobileSearchInputRef}
                                        type="search"
                                        value={searchTerm}
                                        onChange={(e) => onSearchChange(e.target.value)}
                                        placeholder={resolvedSearchPlaceholder}
                                        inputMode="search"
                                        enterKeyHint="search"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        onFocus={(e) => scrollSearchIntoView(e.currentTarget)}
                                        className="w-full h-11 min-h-[44px] pl-8 pr-7 bg-muted/40 border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                                    />
                                    {searchTerm && (
                                        <button
                                            onClick={() => onSearchChange('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground p-0.5 rounded-full"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex-1 min-w-0" />
                            )}

                            {searchTrailing}

                            {/* Bộ lọc */}
                            {hasMobileFilterSheet && (
                                <button
                                    onClick={() => setShowMobileFilters(true)}
                                    className={cn(
                                        "shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-8 w-8 flex items-center justify-center rounded-lg border transition-all active:scale-95 relative",
                                        activeFilterCount > 0
                                            ? 'bg-primary/5 border-primary/40 text-primary'
                                            : 'bg-background border-border text-muted-foreground'
                                    )}
                                >
                                    <Filter size={14} strokeWidth={2.25} />
                                    {activeFilterCount > 0 && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-primary text-white text-xs font-bold rounded-full tabular-nums">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                </button>
                            )}

                            {/* Thao tác */}
                            {hasMobileActions && (
                                <button
                                    type="button"
                                    aria-label={txt('shared.mobileActions.title')}
                                    onClick={() => setShowMobileActions(true)}
                                    className="shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-all active:scale-95"
                                >
                                    <List size={14} strokeWidth={2.25} />
                                </button>
                            )}

                            {/* Thêm */}
                            {onAdd && (
                                <button
                                    onClick={onAdd}
                                    className="shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-white shadow-sm active:scale-95 transition-all"
                                >
                                    <Plus size={14} strokeWidth={2.25} />
                                </button>
                            )}
                        </m.div>
                    )}
                </AnimatePresence>
            </div>

            {/* MOBILE ROW 2: Nút xóa bộ lọc */}
            {!hasSelection && activeFilterCount > 0 && onClearAllFilters && (
                <div className="sm:hidden pt-1">
                    <button
                        onClick={onClearAllFilters}
                        className="h-7 px-2.5 flex items-center gap-1 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-all border border-destructive/20 active:scale-95"
                    >
                        <X size={12} className="stroke-[2.5px]" />
                        {txt('common.clearFilters', { count: activeFilterCount })}
                    </button>
                </div>
            )}

            {/* ======================================================== */}
            {/* DESKTOP (>= sm): trái Back + search + filters; phải cột + actions */}
            {/* ======================================================== */}
            <div className="hidden sm:flex items-center gap-3">
                <AnimatePresence mode="wait">
                    {hasSelection ? (
                        <m.div
                            key="bulk-bar"
                            initial={{ opacity: 0, x: -15 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -15 }}
                            className="flex-1 flex items-center gap-2"
                        >
                            <div className="bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm shadow-primary/20 flex items-center gap-2 tabular-nums">
                                <Check size={13} className="stroke-[3px]" />
                                <span>{selectedCount}</span>
                                <span className="opacity-70">{txt('common.selected')}</span>
                            </div>
                            <Tooltip content={txt('common.deselectAll')}>
                                <button
                                    onClick={onClearSelection}
                                    className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center text-muted-foreground hover:text-destructive p-1.5 rounded-lg hover:bg-destructive/10 transition-all active:scale-90"
                                >
                                    <X size={15} className="stroke-[2.5px]" />
                                </button>
                            </Tooltip>
                        </m.div>
                    ) : (
                        <m.div
                            key="search-bar"
                            initial={{ opacity: 0, x: -15 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -15 }}
                            className="flex-1 flex items-center gap-2 min-w-0 flex-wrap"
                        >
                            {showBack && (
                                <button
                                    onClick={handleBack}
                                    className="shrink-0 h-8 px-2 -ml-1 flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-95"
                                >
                                    <ArrowLeft size={14} strokeWidth={2.25} />
                                    <span className="text-xs font-medium">{txt('common.back')}</span>
                                </button>
                            )}

                            {!hideSearch && (
                                <div className="relative w-64 max-w-[21rem] min-w-[10rem] shrink-0 group">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                                    <input
                                        ref={searchInputRef}
                                        type="search"
                                        value={searchTerm}
                                        onChange={(e) => onSearchChange(e.target.value)}
                                        placeholder={resolvedSearchPlaceholder}
                                        inputMode="search"
                                        enterKeyHint="search"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        className="w-full h-8 pl-10 pr-8 bg-muted/40 hover:bg-muted/60 border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 focus:bg-background transition-all"
                                    />
                                    {searchTerm && (
                                        <button
                                            type="button"
                                            onClick={() => onSearchChange('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted transition-all"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            )}

                            {searchTrailing}

                            {desktopStartSlot}

                            {filters && (
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    {filters}
                                </div>
                            )}

                            {activeFilterCount > 0 && onClearAllFilters && (
                                <button
                                    onClick={onClearAllFilters}
                                    className="shrink-0 h-7 px-2 flex items-center gap-1 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-all border border-destructive/20 hover:border-destructive/30 active:scale-95"
                                >
                                    <X size={11} className="stroke-[2.5px]" />
                                    {txt('common.clearFilters', { count: activeFilterCount })}
                                </button>
                            )}
                        </m.div>
                    )}
                </AnimatePresence>

                {/* Desktop Right Side */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <AnimatePresence mode="wait">
                        {hasSelection ? (
                            <m.div
                                key="bulk-actions"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="flex items-center gap-1.5"
                            >
                                {onStatusChangeMany && (
                                    <>
                                        <button
                                            onClick={() => onStatusChangeMany('Đang hoạt động')}
                                            className="h-8 px-3 flex items-center gap-1.5 text-primary bg-primary/10 hover:bg-primary/15 rounded-lg transition-all border border-primary/20 active:scale-95"
                                        >
                                            <Check size={14} className="stroke-[2.5px] shrink-0" />
                                            <span className="text-xs font-medium">{txt('common.activate')}</span>
                                        </button>
                                        <button
                                            onClick={() => onStatusChangeMany('Ngừng hoạt động')}
                                            className="h-8 px-3 flex items-center gap-1.5 text-muted-foreground bg-muted/50 hover:bg-muted rounded-lg transition-all border border-border active:scale-95"
                                        >
                                            <Power size={14} className="stroke-[2.5px] shrink-0" />
                                            <span className="text-xs font-medium">{txt('common.deactivate')}</span>
                                        </button>
                                    </>
                                )}
                                {onDeleteMany && (
                                    <button
                                        onClick={onDeleteMany}
                                        className="h-8 px-3 flex items-center gap-1.5 text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-all shadow-sm active:scale-95"
                                    >
                                        <Trash2 size={14} className="stroke-[2.5px] shrink-0" />
                                        <span className="text-xs font-medium">{txt('common.delete')}</span>
                                    </button>
                                )}
                                {bulkActions}
                            </m.div>
                        ) : (
                            <m.div
                                key="primary-actions"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="flex items-center gap-1"
                            >
                                {/* Column Manager (desktop) */}
                                {hasColumnManager && (
                                    <div className="relative" ref={columnMenuRef}>
                                        <Tooltip content={txt('common.columnOptions')} placement="bottom" disabled={showColumnMenu}>
                                            <button
                                                onClick={() => setShowColumnMenu(!showColumnMenu)}
                                                className={cn(
                                                    "min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-8 w-8 flex items-center justify-center border rounded-lg transition-all",
                                                    showColumnMenu
                                                        ? 'bg-primary text-white border-primary shadow-sm'
                                                        : 'bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                                                )}
                                            >
                                                <LayoutTemplate size={15} />
                                            </button>
                                        </Tooltip>

                                        <AnimatePresence>
                                            {showColumnMenu && (
                                                <m.div
                                                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                                    className="absolute right-0 top-full mt-2 bg-card backdrop-blur-xl rounded-xl shadow-xl border border-border z-[41] overflow-hidden"
                                                >
                                                    <ColumnManager
                                                        columns={columns!}
                                                        onToggleColumn={onToggleColumn!}
                                                        onReorderColumns={onReorderColumns || (() => {})}
                                                        onResetColumns={onResetColumns || (() => {})}
                                                    />
                                                </m.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {actions}
                            </m.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* ===== Mobile Bottom Sheets (portal) ===== */}
            {hasMobileFilterSheet && (
                <MobileFilterSheet
                    open={showMobileFilters}
                    onClose={() => setShowMobileFilters(false)}
                    groups={filterGroups!}
                    onClearAll={onClearAllFilters}
                />
            )}
            {hasMobileActions && (
                <MobileActionsSheet
                    open={showMobileActions}
                    onClose={() => setShowMobileActions(false)}
                    items={mobileActions!}
                />
            )}
        </div>
    );
};

export default GenericToolbar;
