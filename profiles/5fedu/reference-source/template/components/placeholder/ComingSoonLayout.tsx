import React from 'react';
import { txt } from '@/lib/text';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Puzzle, ArrowLeft } from 'lucide-react';

interface ComingSoonLayoutProps {
  /** Tiêu đề chính (vd. tên module hoặc "Module đang được phát triển") */
  title: string;
  /** Mô tả ngắn (optional, mặc định dùng i18n page.placeholder.description) */
  description?: string;
  /** Icon hiển thị (mặc định Puzzle), thường lấy từ SIDEBAR_MENU của module/submenu đó */
  icon?: LucideIcon;
  /** Nhãn nút quay lại */
  backLabel: string;
  /** Link quay lại (dùng Link) */
  backTo: string;
  /** Tên nhóm/module dùng màu primary (vd. submenu) */
  titlePrimary?: boolean;
  /** Nội dung bổ sung dưới mô tả (vd. danh sách link module) */
  children?: React.ReactNode;
}

/**
 * Layout trang placeholder "Đang phát triển":
 * nền grid, icon (tôn trọng prefers-reduced-motion), badge "Sắp ra mắt",
 * một CTA chính (Quay lại), link phụ "Làm mới trang".
 */
const ComingSoonLayout: React.FC<ComingSoonLayoutProps> = ({
  title,
  description,
  icon: Icon = Puzzle,
  backLabel,
  backTo,
  titlePrimary = false,
  children,
}) => {
  const desc = description ?? txt('page.placeholder.description');

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-120px)] p-6 placeholder-bg-grid bg-muted/30">
      <div className="max-w-2xl w-full text-center">
        {/* Badge "Sắp ra mắt" thay cho progress bar */}
        <div className="mb-6">
          <span className="inline-flex items-center rounded-full bg-primary/10 dark:bg-primary/20 px-3 py-1 text-xs font-medium text-primary border border-primary/20">
            {txt('page.placeholder.badgeComingSoon')}
          </span>
        </div>

        {/* Icon với hiệu ứng nổi + glow (giảm chuyển động khi prefers-reduced-motion) */}
        <div className="mb-10 relative inline-block">
          <div className="placeholder-float">
            <Icon
              className="w-36 h-36 md:w-48 md:h-48 mx-auto text-primary"
              strokeWidth={1.2}
              aria-hidden
            />
          </div>
          <div
            className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 md:w-36 md:h-36 bg-primary/20 dark:bg-primary/25 blur-3xl rounded-full"
            aria-hidden
          />
        </div>

        {/* Tiêu đề */}
        <h1 className={`text-3xl md:text-4xl font-bold mb-4 tracking-tight ${titlePrimary ? 'text-primary' : 'text-foreground'}`}>
          {title}
        </h1>
        <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-md mx-auto leading-relaxed">
          {desc}
        </p>

        {children && <div className="mb-8 text-left max-w-sm mx-auto">{children}</div>}

        {/* Một CTA chính: Quay lại */}
        <div className="flex flex-col items-center justify-center gap-6">
          <Link
            to={backTo}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-primary-foreground bg-primary rounded-full hover:opacity-90 transition-all duration-200 active:scale-[0.98] shadow-lg shadow-primary/25"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            {backLabel}
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            {txt('page.placeholder.refreshPage')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComingSoonLayout;
