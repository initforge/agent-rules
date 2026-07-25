import type { Notification } from '@/types';

const now = Date.now();
const ms = (m: number) => new Date(now - m * 60 * 1000).toISOString();

const mockNotifications: Notification[] = [
  { id: 'notif-sample-1', title: 'Chào mừng trở lại', message: 'Đây là thông báo mẫu. Bạn có thể thêm, đánh dấu đã đọc hoặc xóa từng thông báo.', type: 'info', read: false, createdAt: ms(2) },
  { id: 'notif-sample-2', title: 'Cập nhật hệ thống', message: 'Phiên bản mới đã sẵn sàng. Vui lòng làm mới trang khi thuận tiện.', type: 'success', read: false, createdAt: ms(15) },
  { id: 'notif-sample-3', title: 'Đơn nghỉ phép đã duyệt', message: 'Đơn xin nghỉ phép từ 12/02 đến 14/02 đã được phê duyệt.', type: 'success', read: false, createdAt: ms(45), link: '/he-thong/nhan-vien' },
  { id: 'notif-sample-4', title: 'Bảo trì định kỳ', message: 'Hệ thống sẽ bảo trì từ 23:00 ngày 15/02 đến 02:00 ngày 16/02. Vui lòng lưu dữ liệu trước đó.', type: 'warning', read: false, createdAt: ms(120) },
  { id: 'notif-sample-5', title: 'Nhắc nhở nộp báo cáo', message: 'Báo cáo tháng 1 chưa được nộp. Hạn chót: 15/02.', type: 'warning', read: true, createdAt: ms(180) },
  { id: 'notif-sample-6', title: 'Đăng nhập từ thiết bị mới', message: 'Phát hiện đăng nhập từ IP mới. Nếu không phải bạn, vui lòng đổi mật khẩu.', type: 'info', read: true, createdAt: ms(240) },
  { id: 'notif-sample-7', title: 'Import nhân viên thành công', message: 'Đã import 24 bản ghi nhân viên từ file Excel.', type: 'success', read: true, createdAt: ms(360) },
  { id: 'notif-sample-8', title: 'Lỗi kết nối tạm thời', message: 'Dịch vụ đã khôi phục. Một số thao tác có thể đã bị trì hoãn.', type: 'error', read: true, createdAt: ms(480) },
  { id: 'notif-sample-9', title: 'Họp nội bộ', message: 'Cuộc họp lúc 14:00 ngày 11/02 đã được lên lịch. Phòng A301.', type: 'info', read: true, createdAt: ms(720) },
  { id: 'notif-sample-10', title: 'Cập nhật phân quyền', message: 'Vai trò của bạn đã được cập nhật. Một số quyền mới đã được kích hoạt.', type: 'success', read: true, createdAt: ms(900) },
  { id: 'notif-sample-11', title: 'Sao lưu hoàn tất', message: 'Sao lưu dữ liệu định kỳ đã chạy thành công lúc 02:00.', type: 'success', read: true, createdAt: ms(1200) },
  { id: 'notif-sample-12', title: 'Tin nhắn từ HR', message: 'Vui lòng cập nhật thông tin liên hệ trong hồ sơ cá nhân trước 20/02.', type: 'info', read: true, createdAt: ms(1440) },
  { id: 'notif-sample-13', title: 'Xuất báo cáo lương', message: 'File xuất báo cáo lương tháng 1 đã sẵn sàng tải xuống.', type: 'success', read: true, createdAt: ms(1800), link: '/he-thong/nhan-vien' },
  { id: 'notif-sample-14', title: 'Cảnh báo hết hạn hợp đồng', message: '3 hợp đồng lao động sắp hết hạn trong 30 ngày tới.', type: 'warning', read: true, createdAt: ms(2400) },
  { id: 'notif-sample-15', title: 'Thông báo từ Admin', message: 'Hệ thống sẽ nâng cấp module Nhân sự vào cuối tuần. Chi tiết sẽ gửi qua email.', type: 'info', read: true, createdAt: ms(2880) },
];

/** Mock API — thay bằng Supabase khi có backend thật */
export async function getNotifications(): Promise<Notification[]> {
  return structuredClone(mockNotifications);
}
