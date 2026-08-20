import React from 'react';
import { txt } from '@/lib/text';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Puzzle } from 'lucide-react';
import SubModuleCard, { ModuleItem } from './SubModuleCard';
import ComingSoonLayout from '@/components/placeholder/ComingSoonLayout';

export interface ModuleGroup {
  groupTitle: string;
  items: ModuleItem[];
}

/**
 * Layout dashboard cho trang submenu (vd. Hệ thống).
 * Quy định UI: tên nhóm module (groupTitle) luôn dùng màu primary.
 * Khi submenu chưa có module nào (groups rỗng): hiển thị placeholder "Sắp ra mắt".
 */
interface ModuleDashboardLayoutProps {
  groups: ModuleGroup[];
  /** Đường dẫn quay lại (mặc định "/") — dùng cho placeholder khi không có module */
  backTo?: string;
  /** Tên submenu khi groups rỗng – dùng cho placeholder "Sắp ra mắt" */
  submenuTitle?: string;
  /** Icon submenu khi groups rỗng */
  submenuIcon?: LucideIcon;
}

const ModuleDashboardLayout: React.FC<ModuleDashboardLayoutProps> = ({
  groups,
  backTo = '/',
  submenuTitle,
  submenuIcon: SubmenuIcon,
}) => {
  if (groups.length === 0) {
    const title = submenuTitle ?? txt('page.placeholder.title');
    const description = submenuTitle
      ? txt('page.placeholder.descriptionWithModule', { name: submenuTitle })
      : txt('page.placeholder.description');
    return (
      <ComingSoonLayout
        title={title}
        description={description}
        icon={SubmenuIcon ?? Puzzle}
        backLabel={txt('page.placeholder.backToHome')}
        backTo={backTo}
        titlePrimary={!!submenuTitle}
      />
    );
  }

  return (
    <div className="pb-10 pt-2 shrink-0">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-6 md:space-y-8"
      >
        {groups.map((group, idx) => (
          <div key={idx} className="space-y-4 md:space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-1 h-5 rounded-full bg-primary/80" aria-hidden />
              <h3 className="text-sm font-semibold text-primary">{group.groupTitle}</h3>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {group.items.map((item, itemIdx) => (
                <SubModuleCard
                  key={item.moduleId ?? `g${idx}-i${itemIdx}`}
                  {...item}
                />
              ))}
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
};

export default ModuleDashboardLayout;
