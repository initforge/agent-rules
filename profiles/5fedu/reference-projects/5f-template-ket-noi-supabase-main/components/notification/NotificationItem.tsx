import React from 'react';
import { txt } from '@/lib/text';
import { Link } from 'react-router-dom';
import { Info, CheckCircle, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Notification, NotificationType } from '@/types';

const typeConfig: Record<
  NotificationType,
  { icon: typeof Info; className: string }
> = {
  info: { icon: Info, className: 'text-primary bg-primary/10' },
  success: { icon: CheckCircle, className: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400' },
  warning: { icon: AlertTriangle, className: 'text-amber-600 bg-amber-500/10 dark:text-amber-400' },
  error: { icon: AlertCircle, className: 'text-rose-600 bg-rose-500/10 dark:text-rose-400' },
};

interface NotificationItemProps {
  item: Notification;
  onMarkRead: (id: string) => void;
  onRemove: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  item,
  onMarkRead,
  onRemove,
}) => {
  const config = typeConfig[item.type || 'info'];
  const Icon = config.icon;

  const content = (
    <>
      <div
        className={cn(
          'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
          config.className
        )}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn(
          'text-xs leading-tight',
          item.read
            ? 'font-medium text-foreground'
            : 'font-semibold text-primary'
        )}>
          {item.title}
        </p>
        <p className={cn(
          'text-xs mt-0.5 line-clamp-2',
          item.read ? 'text-muted-foreground' : 'text-foreground/80'
        )}>
          {item.message}
        </p>
      </div>
    </>
  );

  const handleClick = () => {
    if (!item.read) onMarkRead(item.id);
  };

  const wrapperClass = cn(
    'flex gap-3 p-3 rounded-xl transition-colors text-left w-full relative',
    item.read
      ? 'hover:bg-muted/60'
      : 'bg-primary/10 hover:bg-primary/15 border-l-[3px] border-primary'
  );

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      className="relative group"
    >
      {item.link ? (
        <Link
          to={item.link}
          className={wrapperClass}
          onClick={handleClick}
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          className={wrapperClass}
          onClick={handleClick}
        >
          {content}
        </button>
      )}
      <button
        type="button"
        aria-label={txt('notification.remove')}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(item.id);
        }}
        className="absolute top-2.5 right-2 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </motion.li>
  );
};

export default NotificationItem;
