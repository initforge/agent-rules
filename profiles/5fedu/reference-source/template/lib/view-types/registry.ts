import type { ViewTypeDefinition, ViewTypeId } from './types';

/**
 * Đăng ký tập trung: view type → mô tả + file tham chiếu + trạng thái triển khai.
 */
export const VIEW_TYPE_REGISTRY: Record<ViewTypeId, ViewTypeDefinition> = {
  table: {
    id: 'table',
    labelVi: 'Table View (bảng dữ liệu)',
    descriptionVi:
      'Danh sách lớn trên desktop: sort, phân trang, filter, export/import, bulk action.',
    implementationStatus: 'ready',
    primaryComponentPaths: [
      'components/shared/GenericTable.tsx',
      'components/shared/GenericToolbar.tsx',
      'components/shared/TablePaginationFooter.tsx',
      'components/shared/ColumnManager.tsx',
      'components/shared/ExportDialog.tsx',
      'components/shared/ImportDialog.tsx',
      'lib/factories/create-feature-module.tsx',
    ],
  },
  detail: {
    id: 'detail',
    labelVi: 'Detail View (chi tiết bản ghi)',
    descriptionVi:
      'Xem một đối tượng trong drawer: section, field grid, toolbar hành động.',
    implementationStatus: 'ready',
    primaryComponentPaths: [
      'components/shared/GenericDrawer.tsx',
      'components/shared/DetailSection.tsx',
      'components/shared/DetailField.tsx',
      'components/shared/DetailFieldGrid.tsx',
      'components/shared/DetailToolbar.tsx',
    ],
  },
  form: {
    id: 'form',
    labelVi: 'Form View (biểu mẫu)',
    descriptionVi:
      'Nhập liệu trong drawer: FormGrid, DataField/RhfDataField; form nhiều bước dùng FormStepper.',
    implementationStatus: 'ready',
    primaryComponentPaths: [
      'components/shared/FormSection.tsx',
      'components/shared/FormGrid.tsx',
      'components/shared/FormStepper.tsx',
      'components/data-types/DataField.tsx',
      'components/data-types/RhfDataField.tsx',
    ],
    notesVi: 'Wizard nghiệp vụ tùy module: cha giữ step + render từng phần.',
  },
  dashboard: {
    id: 'dashboard',
    labelVi: 'Dashboard (trang module)',
    descriptionVi:
      'Lưới card submenu + có thể nhúng KPI; trang landing từng nhóm chức năng.',
    implementationStatus: 'ready',
    primaryComponentPaths: [
      'components/dashboard/ModuleDashboardLayout.tsx',
      'components/dashboard/SubModuleCard.tsx',
      'pages/dashboards/SystemDashboard.tsx',
    ],
  },
  chart_panel: {
    id: 'chart_panel',
    labelVi: 'Chart & thống kê (panel)',
    descriptionVi:
      'Biểu đồ Recharts, KPI — thường là tab “Thống kê” cạnh tab danh sách.',
    implementationStatus: 'ready',
    primaryComponentPaths: [
      'features/he-thong/nhan-vien/components/nhan-vien-stats.tsx',
      'components/ui/ChartTooltip.tsx',
    ],
    notesVi: 'Drag layout dashboard tùy chỉnh: chưa có.',
  },
  card_list: {
    id: 'card_list',
    labelVi: 'Card / danh sách thẻ',
    descriptionVi:
      'Danh sách dạng thẻ cho mobile hoặc entity có ảnh; có thể kết hợp với table responsive.',
    implementationStatus: 'partial',
    primaryComponentPaths: [
      'components/shared/MobileListCard.tsx',
      'pages/Home.tsx',
    ],
    notesVi: 'Kanban / deck kéo cột: chưa có; @dnd-kit trong package nhưng chưa dùng.',
  },
  calendar: {
    id: 'calendar',
    labelVi: 'Calendar View (lịch)',
    descriptionVi:
      'Xem theo ngày/tuần/tháng, kéo thả sự kiện, quick view — cần thư viện lịch + state riêng.',
    implementationStatus: 'planned',
    primaryComponentPaths: [
      'components/ui/DatePicker.tsx',
      'components/ui/DateRangePicker.tsx',
    ],
    notesVi: 'Mới có control chọn ngày; chưa có lịch sự kiện full.',
  },
  gallery: {
    id: 'gallery',
    labelVi: 'Gallery View (lưới ảnh)',
    descriptionVi: 'Grid ảnh đồng nhất, lightbox xem phóng to.',
    implementationStatus: 'partial',
    primaryComponentPaths: ['components/ui/MultiImageInput.tsx'],
    notesVi: 'Lightbox trong input ảnh; chưa có trang gallery catalog chung.',
  },
  map: {
    id: 'map',
    labelVi: 'Map View (bản đồ)',
    descriptionVi: 'Marker cửa hàng / kho / lộ trình — Leaflet/Mapbox.',
    implementationStatus: 'planned',
    primaryComponentPaths: [],
    notesVi: 'react-leaflet + leaflet có trong dependencies; chưa có màn map shell.',
  },
  onboarding: {
    id: 'onboarding',
    labelVi: 'Onboarding / Tour',
    descriptionVi: 'Slider hoặc step tour giới thiệu tính năng cho user mới.',
    implementationStatus: 'planned',
    primaryComponentPaths: [],
  },
  navigation_shell: {
    id: 'navigation_shell',
    labelVi: 'Khung điều hướng & layout',
    descriptionVi: 'Sidebar, header, breadcrumb, vùng nội dung chính.',
    implementationStatus: 'ready',
    primaryComponentPaths: [
      'components/layout/Layout.tsx',
      'components/layout/CommandPalette.tsx',
      'lib/command-palette-entries.ts',
      'components/shared/Breadcrumbs.tsx',
      'lib/sidebar-menu.tsx',
    ],
    notesVi: 'Command palette Cmd/Ctrl+K: điều hướng nhanh theo danh sách route.',
  },
  feedback_overlay: {
    id: 'feedback_overlay',
    labelVi: 'Phản hồi & overlay',
    descriptionVi: 'Toast, hộp xác nhận, empty state, (global progress bar tùy chọn).',
    implementationStatus: 'ready',
    primaryComponentPaths: [
      'App.tsx',
      'components/shared/ConfirmDialog.tsx',
      'components/shared/EmptyState.tsx',
    ],
    notesVi: 'Sonner Toaster trong App; thanh progress top (nprogress) chưa bắt buộc.',
  },
  data_utility: {
    id: 'data_utility',
    labelVi: 'Tiện ích dữ liệu',
    descriptionVi: 'Import/export Excel, filter nâng cao, preview file.',
    implementationStatus: 'partial',
    primaryComponentPaths: [
      'components/shared/ImportDialog.tsx',
      'components/shared/ExportDialog.tsx',
      'hooks/use-export-data.ts',
    ],
    notesVi: 'Filter: theo module (vd. nhân viên); file previewer PDF chung chưa có.',
  },
  security_ui: {
    id: 'security_ui',
    labelVi: 'Giao diện phân quyền',
    descriptionVi: 'Matrix quyền, chọn quyền theo chức vụ, ẩn nút theo policy.',
    implementationStatus: 'partial',
    primaryComponentPaths: [
      'features/he-thong/phan-quyen/',
      'components/shared/PositionPermissionPicker.tsx',
      'lib/permissions.ts',
      'components/auth/Can.tsx',
    ],
    notesVi: 'Client: `can()` + `<Can>` — cần policy server/RLS khi có RBAC đầy đủ.',
  },
  master_detail: {
    id: 'master_detail',
    labelVi: 'Master–detail & bảng con',
    descriptionVi:
      'Bản ghi cha + bảng con trong detail/form; CRUD dòng con hoặc chỉ đọc.',
    implementationStatus: 'ready',
    primaryComponentPaths: ['components/shared/GenericSubTableSection.tsx'],
    notesVi: 'Kết hợp với detail drawer + query con theo parent id.',
  },
};

export function getViewTypeDefinition(id: ViewTypeId): ViewTypeDefinition {
  return VIEW_TYPE_REGISTRY[id];
}

/** Các view type theo mức độ triển khai (để checklist hoặc UI nội bộ). */
export function listViewTypesByStatus(
  status: ViewTypeDefinition['implementationStatus']
): ViewTypeId[] {
  return (Object.keys(VIEW_TYPE_REGISTRY) as ViewTypeId[]).filter(
    (k) => VIEW_TYPE_REGISTRY[k].implementationStatus === status
  );
}
