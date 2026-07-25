import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Wrench } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useIsMaxWidth } from '@/hooks/use-media-query';
import { txt } from '@/lib/text';
import { cn } from '@/lib/utils';
import NotificationDropdown from './NotificationDropdown';

interface NotificationBellProps {
  /** Khi 'top', dropdown mở phía trên (dùng trong bottom nav). */
  placement?: 'default' | 'top';
}

const NotificationBell: React.FC<NotificationBellProps> = ({ placement = 'default' }) => {
  const isMobile = useIsMaxWidth(768);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownTop, setDropdownTop] = useState(0);
  const [portalPosition, setPortalPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isOpen || placement !== 'default' || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownTop(rect.bottom + 8);
    if (!isMobile) {
      setPortalPosition({
        top: rect.bottom + 8,
        right: typeof window !== 'undefined' ? window.innerWidth - rect.right : 0,
      });
    } else {
      setPortalPosition(null);
    }
  }, [isOpen, placement, isMobile]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        const dropdown = document.querySelector('[data-notification-dropdown]');
        if (dropdown && dropdown.contains(event.target as Node)) return;
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const wrapperClass =
    placement === 'top'
      ? 'absolute right-0 bottom-full z-50 mb-2'
      : isMobile
        ? 'fixed left-4 right-4 z-50'
        : 'absolute right-0 top-full z-50 mt-2';

  const wrapperStyle =
    placement === 'default' && isMobile && isOpen ? { top: `${dropdownTop}px` } : undefined;

  const dropdownContent = isOpen ? (
    <NotificationDropdown
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      anchorRef={buttonRef}
      placement={placement}
      developing
    />
  ) : null;

  const usePortal = placement === 'default' && !isMobile && isOpen && portalPosition;

  return (
    <div className="relative" ref={buttonRef}>
      <button
        type="button"
        aria-label={txt('nav.notification')}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 h-9 w-9 md:h-10 md:w-10',
          'flex items-center justify-center rounded-xl',
          'text-muted-foreground hover:bg-muted hover:text-foreground transition-all relative active:scale-95',
          isOpen && 'bg-muted text-foreground'
        )}
      >
        <Bell size={20} strokeWidth={1.8} className="shrink-0" />
        <span
          className="absolute -top-0.5 -right-0.5 h-[18px] w-[18px] flex items-center justify-center bg-amber-500 text-white rounded-full shadow-sm ring-2 ring-card"
          aria-hidden
        >
          <Wrench size={10} strokeWidth={2.5} />
        </span>
      </button>

      {usePortal &&
        typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            <div
              data-notification-dropdown
              className="fixed z-[9999] w-[min(calc(100vw-2rem),360px)]"
              style={{
                top: portalPosition.top,
                right: portalPosition.right,
              }}
            >
              {dropdownContent}
            </div>
          </AnimatePresence>,
          document.body
        )}

      {!usePortal && (
        <AnimatePresence>
          {isOpen && (isMobile || placement === 'top' || portalPosition !== null) && (
            <div data-notification-dropdown className={wrapperClass} style={wrapperStyle}>
              {dropdownContent}
            </div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export default NotificationBell;
