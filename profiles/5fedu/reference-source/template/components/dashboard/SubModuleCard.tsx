import React from 'react';
import { txt } from '@/lib/text';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, HelpCircle, Star } from 'lucide-react';
import { usePrimaryColor } from '@/lib/theme-utils';
import { useFavoriteModules } from '@/hooks/use-favorite-modules';

export interface ModuleItem {
  title: string;
  description: string;
  icon: React.ElementType;
  /** Tailwind bg class OR 'bg-primary' to use the system primary color */
  color: string;
  action: () => void;
  /** Id duy nhất để ghim module yêu thích (vd. path: /hanh-chinh/cham-cong). Có thì mới hiện nút star. */
  moduleId?: string;
}

// Map bg-* class to icon color (hex) and background (rgba) – ensures icons are always visible, no Tailwind purge
const COLOR_MAP: Record<string, { icon: string; bg: string }> = {
  'bg-blue-500':    { icon: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)' },
  'bg-indigo-500': { icon: '#4f46e5', bg: 'rgba(79, 70, 229, 0.12)' },
  'bg-purple-500': { icon: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)' },
  'bg-violet-500': { icon: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)' },
  'bg-teal-500':   { icon: '#0d9488', bg: 'rgba(13, 148, 136, 0.12)' },
  'bg-cyan-500':   { icon: '#0891b2', bg: 'rgba(8, 145, 178, 0.12)' },
  'bg-emerald-500': { icon: '#059669', bg: 'rgba(5, 150, 105, 0.12)' },
  'bg-rose-500':   { icon: '#e11d48', bg: 'rgba(225, 29, 72, 0.12)' },
  'bg-pink-500':   { icon: '#db2777', bg: 'rgba(219, 39, 119, 0.12)' },
  'bg-amber-500':  { icon: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  'bg-orange-500': { icon: '#ea580c', bg: 'rgba(234, 88, 12, 0.12)' },
  'bg-red-500':    { icon: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)' },
  'bg-slate-500':  { icon: '#475569', bg: 'rgba(71, 85, 105, 0.12)' },
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getColors(colorClass: string, primaryHex?: string) {
  if (colorClass === 'bg-primary' && primaryHex) {
    return { icon: primaryHex, bg: hexToRgba(primaryHex, 0.12) };
  }
  return COLOR_MAP[colorClass] ?? { icon: '#475569', bg: 'rgba(71, 85, 105, 0.12)' };
}

const SubModuleCard: React.FC<ModuleItem> = ({ title, description, icon: Icon, color, action, moduleId }) => {
  const { hex: primaryHex } = usePrimaryColor();
  const { icon: iconColor, bg: bgColor } = getColors(color, primaryHex);
  const { isFavorite, toggleFavorite } = useFavoriteModules();
  const isPinned = moduleId ? isFavorite(moduleId) : false;
  const guidePath = moduleId ? `${moduleId}/huong-dan` : undefined;

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (moduleId) toggleFavorite(moduleId);
  };

  const handleGuideClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.15)' }}
      whileTap={{ scale: 0.98 }}
      onClick={action}
      className="group relative bg-card rounded-xl p-4 md:p-5 border border-border hover:border-primary/30 shadow-soft transition-all cursor-pointer flex items-start gap-3 md:gap-4"
    >
      {moduleId && (
        <button
          type="button"
          onClick={handleStarClick}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label={isPinned ? 'Bỏ ghim module' : 'Ghim module yêu thích'}
          title={isPinned ? 'Bỏ ghim' : 'Ghim module'}
        >
          <Star
            size={18}
            className={isPinned ? 'fill-amber-500 text-amber-500' : ''}
            strokeWidth={2}
          />
        </button>
      )}
      <div
        className="shrink-0 rounded-xl transition-transform duration-300 group-hover:scale-105 flex items-center justify-center w-11 h-11 md:w-12 md:h-12"
        style={{ backgroundColor: bgColor }}
      >
        <Icon
          className="flex-shrink-0"
          size={24}
          strokeWidth={2.25}
          style={{ color: iconColor }}
          aria-hidden
        />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm mb-0.5 md:mb-1 truncate">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{description}</p>
      </div>
      {guidePath && (
        <Link
          to={guidePath}
          onClick={handleGuideClick}
          className="absolute bottom-3 right-3 z-10 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label={txt('guide.buttonTitle')}
          title={txt('guide.buttonTitle')}
        >
          <HelpCircle size={16} strokeWidth={2} aria-hidden />
        </Link>
      )}
      <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all self-center hidden sm:block" />
    </motion.div>
  );
};

export default SubModuleCard;
