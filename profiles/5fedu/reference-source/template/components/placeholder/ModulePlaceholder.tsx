import { txt } from '@/lib/text';
import { useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import ComingSoonLayout from './ComingSoonLayout';

interface ModulePlaceholderProps {
  submenuPath: string;
  submenuTitle: string;
  /** Tên module (mặc định lấy từ URL param) */
  moduleTitle?: string;
  /** Icon của submenu cha (cùng icon trên Trang chủ) */
  icon?: LucideIcon;
}

/**
 * Trang placeholder cho module (chức năng con trong submenu).
 * Dùng layout "Đang phát triển" với nút "Quay lại [Submenu]".
 */
const ModulePlaceholder = ({
  submenuPath,
  submenuTitle,
  moduleTitle: moduleTitleProp,
  icon,
}: ModulePlaceholderProps) => {
  const params = useParams<{ moduleId?: string }>();
  const moduleTitle =
    moduleTitleProp ??
    (params.moduleId ? decodeURIComponent(params.moduleId) : txt('page.placeholder.title'));
  const description = txt('page.placeholder.descriptionWithModule', { name: moduleTitle });

  return (
    <ComingSoonLayout
      title={moduleTitle}
      description={description}
      icon={icon}
      backLabel={`${txt('page.placeholder.backToSubmenu')} ${submenuTitle}`}
      backTo={submenuPath}
    />
  );
};

export default ModulePlaceholder;
