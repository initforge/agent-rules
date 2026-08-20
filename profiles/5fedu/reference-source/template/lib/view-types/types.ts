/**
 * Các kiểu giao diện (presentation / layout) trong ERP — tách biệt với
 * [`DataTypeId`](../data-types/types.ts) (kiểu *trường dữ liệu*).
 *
 * Dùng cho: tài liệu, codegen, chọn template màn hình, onboarding nội bộ.
 */
export const VIEW_TYPE_IDS = [
  /** Bảng: danh sách lớn, filter, export */
  'table',
  /** Drawer/section chi tiết một bản ghi */
  'detail',
  /** Nhập liệu: form drawer, nhiều cột, RHF */
  'form',
  /** Trang tổng quan module (card submenu + KPI) */
  'dashboard',
  /** Biểu đồ / widget số liệu (thường nhúng trong dashboard hoặc tab stats) */
  'chart_panel',
  /** Danh sách dạng thẻ (mobile hoặc catalog) */
  'card_list',
  /** Lịch: ngày/tuần/tháng, sự kiện — chưa có shell chung */
  'calendar',
  /** Lưới ảnh, lightbox — gallery trang */
  'gallery',
  /** Bản đồ marker — chưa tích hợp shell */
  'map',
  /** Tour / slider hướng dẫn — chưa có component chuẩn */
  'onboarding',
  /** Khung app: sidebar, breadcrumb, layout */
  'navigation_shell',
  /** Toast, confirm, empty, loading */
  'feedback_overlay',
  /** Import/export, filter panel, preview file */
  'data_utility',
  /** Ẩn nút theo quyền, matrix phân quyền */
  'security_ui',
  /** Cha–con: form + bảng con inline / detail + sub-table */
  'master_detail',
] as const;

export type ViewTypeId = (typeof VIEW_TYPE_IDS)[number];

/** Mức độ sẵn sàng trong template hiện tại */
export type ViewImplementationStatus = 'ready' | 'partial' | 'planned';

export interface ViewTypeDefinition {
  id: ViewTypeId;
  labelVi: string;
  descriptionVi: string;
  implementationStatus: ViewImplementationStatus;
  /**
   * Đường dẫn file component / factory trong repo (tham chiếu tài liệu, không import vòng).
   */
  primaryComponentPaths: string[];
  notesVi?: string;
}
