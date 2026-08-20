import { useState } from 'react';
import { txt } from '@/lib/text';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Puzzle } from 'lucide-react';
import DashboardToolbar from '@/components/shared/DashboardToolbar';
import TabGroup from '@/components/ui/TabGroup';

interface ModulePlaceholderWithTabsProps {
  submenuPath: string;
  submenuTitle: string;
  moduleTitle: string;
  /** Tab id = i18n key cho label */
  tabLabelKeys: string[];
  /** Icon của submenu (hiển thị trong nội dung placeholder) */
  icon?: LucideIcon;
}

/**
 * Trang module placeholder có nhiều tab (mỗi tab là một block "Sắp ra mắt").
 * Dùng cho module chưa triển khai nhưng cần cấu trúc tab rõ ràng.
 */
const ModulePlaceholderWithTabs = ({
  submenuPath,
  moduleTitle,
  tabLabelKeys,
  icon: Icon = Puzzle,
}: ModulePlaceholderWithTabsProps) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(tabLabelKeys[0] ?? '');
  const tabs = tabLabelKeys.map((key) => ({ id: key, label: txt(key) }));

  return (
    <div className="pb-10 pt-2">
      <DashboardToolbar
        className="-mx-1.5 -mt-2 md:-mx-2 md:-mt-2 mb-4"
        onBack={() => navigate(submenuPath)}
        leadingContent={
          <TabGroup
            tabs={tabs}
            activeTab={activeTab}
            onChange={setActiveTab}
            className="shrink-0"
          />
        }
      />

      <div className="min-h-[320px] flex items-center justify-center p-6 placeholder-bg-grid bg-muted/30 rounded-xl border border-dashed border-border">
        <div className="max-w-md w-full text-center">
          <span className="inline-flex items-center rounded-full bg-primary/10 dark:bg-primary/20 px-3 py-1 text-xs font-medium text-primary border border-primary/20 mb-4">
            {txt('page.placeholder.badgeComingSoon')}
          </span>
          <div className="mb-6 relative inline-block">
            <Icon
              className="w-20 h-20 mx-auto text-primary"
              strokeWidth={1.2}
              aria-hidden
            />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">
            {txt(activeTab)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {txt('page.placeholder.descriptionWithModule', { name: moduleTitle })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ModulePlaceholderWithTabs;
