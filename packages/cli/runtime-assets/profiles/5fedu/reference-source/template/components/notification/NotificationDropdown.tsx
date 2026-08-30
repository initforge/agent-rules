import React, { useState, useEffect } from 'react';
import { txt } from '@/lib/text';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, Trash2, ChevronRight, ChevronUp, Wrench } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import NotificationItem from './NotificationItem';
import { cn } from '@/lib/utils';

const PREVIEW_LIMIT = 5;

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  className?: string;
  /** Khi 'top', panel mở phía trên anchor (dùng trong bottom nav). */
  placement?: 'default' | 'top';
  /** Hiển thị trạng thái tính năng đang phát triển thay vì danh sách thông báo. */
  developing?: boolean;
}

const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  isOpen,
  onClose,
  anchorRef: _anchorRef,
  className,
  placement = 'default',
  developing = false,
}) => {
  const [expanded, setExpanded] = useState(false);

  const {
    notifications,
    markAsRead,
    markAllAsRead,
    remove,
    clearAll,
    unreadCount,
  } = useNotifications();

  useEffect(() => {
    if (!isOpen) queueMicrotask(() => setExpanded(false));
  }, [isOpen]);

  const unread = unreadCount;
  const hasItems = notifications.length > 0;
  const previewList = notifications.slice(0, PREVIEW_LIMIT);
  const hasMore = notifications.length > PREVIEW_LIMIT;
  const displayList = expanded ? notifications : previewList;

  if (!isOpen) return null;

  const isOpenUp = placement === 'top';

  return (
    <motion.div
      initial={{ opacity: 0, y: isOpenUp ? -8 : 8, scale: 0.96 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        maxHeight: developing ? 280 : expanded ? 560 : 420,
      }}
      exit={{ opacity: 0, y: isOpenUp ? -8 : 8, scale: 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'absolute right-0 w-[min(100vw-2rem,360px)] max-w-full',
        isOpenUp ? 'bottom-full mb-2' : 'top-full mt-2',
        'bg-card rounded-xl shadow-xl border border-border overflow-hidden z-50',
        'flex flex-col',
        className
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {txt('notification.title')}
          </h3>
          {!developing && unread > 0 && (
            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {unread}
            </span>
          )}
        </div>
        {!developing && (
          <div className="flex items-center gap-1">
            {hasItems && unread > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                title={txt('notification.markAllRead')}
              >
                <CheckCheck size={16} />
              </button>
            )}
            {hasItems && (
              <button
                type="button"
                onClick={() => {
                  clearAll();
                  onClose();
                }}
                className="p-2 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                title={txt('notification.clearAll')}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* List – khi expanded cuộn từng phần */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar">
        {developing ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3">
              <Wrench size={24} className="text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {txt('notification.developing')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {txt('notification.developingHint')}
            </p>
          </div>
        ) : hasItems ? (
          <>
            <ul className="p-2 space-y-0.5">
              <AnimatePresence mode="popLayout">
                {displayList.map((item) => (
                  <NotificationItem
                    key={item.id}
                    item={item}
                    onMarkRead={markAsRead}
                    onRemove={remove}
                  />
                ))}
              </AnimatePresence>
            </ul>
            <div className="shrink-0 border-t border-border p-2">
              {hasMore || expanded ? (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
                >
                  {expanded ? txt('notification.collapse') : txt('notification.viewAll')}
                  {expanded ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
              <Bell size={24} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {txt('notification.empty')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {txt('notification.emptyHint')}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default NotificationDropdown;
