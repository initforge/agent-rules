import { Position } from '../core/types';
import { PositionFormValues, positionSchema } from '../core/schema';
import { parseTrangThaiHoatDongImport, type TrangThaiHoatDong } from '@/lib/constants/trang-thai';
import { getDepartments } from '@/features/he-thong/phong-ban/services/phong-ban-service';
import { createRepository } from '@/lib/data/create-repository';
import { isSupabase } from '@/lib/data/config';
import { getSupabase } from '@/lib/supabase/client';
import { handleSupabaseError } from '@/lib/supabase/errors';
import {
  POSITION_RETURNING_FULL,
  POSITION_RETURNING_STATUS_ONLY,
  POSITION_SELECT_FULL,
} from '../core/supabase-select';
import { txt } from '@/lib/text';
import { POSITIONS_LIST_QUERY_PARAMS } from '@/lib/query-keys';
import { mapPositionFromDb } from '../core/map-from-db';
import { assertAllBatchSucceeded, runInBatchesSettled } from '@/lib/async-utils';
import { runImportBatch, type ImportBatchRow, type ImportResult } from '@/lib/import';
import { getCurrentEmployeeId } from '@/lib/current-session-employee';

const ts = () => new Date().toISOString();

/** Cấp bậc mock (int2): 1=Giám đốc, 2=Trưởng phòng, 3=Phó giám đốc, 4=Nhân viên. */

type MockPositionInput = Omit<Position, 'cap_bac'> & { cap_bac?: number | null };

function normalizeMockPosition(row: MockPositionInput): Position {
  return { ...row, cap_bac: row.cap_bac ?? null };
}

// --- Mock Data: Chức vụ liên kết Phòng ban + cấp bậc (số) ---
const MOCK_POSITIONS_RAW: MockPositionInput[] = [
  // Phòng Ban Giám đốc (dep-0)
  { id: "pos-1", ma_chuc_vu: "CEO", ten_chuc_vu: "Tổng Giám Đốc", cap_bac: 1, phong_ban_id: "dep-0", ten_phong_ban: "Phòng Ban Giám đốc", mo_ta: "Điều hành toàn bộ hoạt động công ty", thu_tu: 1, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-2", ma_chuc_vu: "PCEO", ten_chuc_vu: "Phó Tổng Giám Đốc", cap_bac: 3, phong_ban_id: "dep-0", ten_phong_ban: "Phòng Ban Giám đốc", mo_ta: "Hỗ trợ Tổng Giám đốc điều hành", thu_tu: 2, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-3", ma_chuc_vu: "GD-DH", ten_chuc_vu: "Trưởng Nhóm Điều hành", cap_bac: 2, phong_ban_id: "dep-0-1", ten_phong_ban: "Nhóm điều hành", mo_ta: "Điều phối công việc điều hành", thu_tu: 3, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-4", ma_chuc_vu: "GD-TL", ten_chuc_vu: "Trưởng Nhóm Trợ lý", cap_bac: 2, phong_ban_id: "dep-0-2", ten_phong_ban: "Nhóm trợ lý", mo_ta: "Quản lý đội trợ lý Giám đốc", thu_tu: 4, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-5", ma_chuc_vu: "TL-GD", ten_chuc_vu: "Trợ lý Giám đốc", cap_bac: 4, phong_ban_id: "dep-0-2", ten_phong_ban: "Nhóm trợ lý", mo_ta: "Hỗ trợ hành chính, lịch làm việc", thu_tu: 5, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-6", ma_chuc_vu: "NV-DH", ten_chuc_vu: "Chuyên viên Điều hành", cap_bac: 4, phong_ban_id: "dep-0-1", ten_phong_ban: "Nhóm điều hành", mo_ta: "Theo dõi tiến độ, báo cáo", thu_tu: 6, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  // Phòng Kỹ thuật (dep-1)
  { id: "pos-10", ma_chuc_vu: "TP-KT", ten_chuc_vu: "Trưởng Phòng Kỹ thuật", cap_bac: 2, phong_ban_id: "dep-1", ten_phong_ban: "Phòng Kỹ thuật", mo_ta: "Quản lý toàn bộ mảng kỹ thuật", thu_tu: 10, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-11", ma_chuc_vu: "PP-KT", ten_chuc_vu: "Phó Phòng Kỹ thuật", cap_bac: 3, phong_ban_id: "dep-1", ten_phong_ban: "Phòng Kỹ thuật", mo_ta: "Hỗ trợ trưởng phòng kỹ thuật", thu_tu: 11, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-12", ma_chuc_vu: "TN-DEV", ten_chuc_vu: "Trưởng Nhóm Phát triển", cap_bac: 2, phong_ban_id: "dep-1-1", ten_phong_ban: "Nhóm Phát triển phần mềm", mo_ta: "Lead team dev, review code", thu_tu: 12, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-13", ma_chuc_vu: "TN-INFRA", ten_chuc_vu: "Trưởng Nhóm Hạ tầng", cap_bac: 2, phong_ban_id: "dep-1-2", ten_phong_ban: "Nhóm Hạ tầng IT", mo_ta: "Quản lý hệ thống, DevOps", thu_tu: 13, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-14", ma_chuc_vu: "DEV-SR", ten_chuc_vu: "Lập trình viên Senior", cap_bac: 4, phong_ban_id: "dep-1-1", ten_phong_ban: "Nhóm Phát triển phần mềm", mo_ta: "Phát triển phần mềm cốt lõi", thu_tu: 14, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-15", ma_chuc_vu: "DEV-JR", ten_chuc_vu: "Lập trình viên Junior", cap_bac: 4, phong_ban_id: "dep-1-1", ten_phong_ban: "Nhóm Phát triển phần mềm", mo_ta: null, thu_tu: 15, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-16", ma_chuc_vu: "SYS-ADMIN", ten_chuc_vu: "Quản trị hệ thống", cap_bac: 4, phong_ban_id: "dep-1-2", ten_phong_ban: "Nhóm Hạ tầng IT", mo_ta: "Vận hành server, mạng", thu_tu: 16, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  // Phòng Nhân sự (dep-2)
  { id: "pos-20", ma_chuc_vu: "TP-NS", ten_chuc_vu: "Trưởng Phòng Nhân sự", cap_bac: 2, phong_ban_id: "dep-2", ten_phong_ban: "Phòng Nhân sự", mo_ta: "Quản lý tuyển dụng, đào tạo, chính sách", thu_tu: 20, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-21", ma_chuc_vu: "PP-NS", ten_chuc_vu: "Phó Phòng Nhân sự", cap_bac: 3, phong_ban_id: "dep-2", ten_phong_ban: "Phòng Nhân sự", mo_ta: null, thu_tu: 21, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-22", ma_chuc_vu: "CV-TD", ten_chuc_vu: "Chuyên viên Tuyển dụng", cap_bac: 4, phong_ban_id: "dep-2-1", ten_phong_ban: "Nhóm Tuyển dụng", mo_ta: "Tuyển dụng, phỏng vấn", thu_tu: 22, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-23", ma_chuc_vu: "CV-DT", ten_chuc_vu: "Chuyên viên Đào tạo", cap_bac: 4, phong_ban_id: "dep-2-2", ten_phong_ban: "Nhóm Đào tạo", mo_ta: "Xây dựng và triển khai đào tạo", thu_tu: 23, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  // Phòng Tài chính - Kế toán (dep-3)
  { id: "pos-30", ma_chuc_vu: "TP-TC", ten_chuc_vu: "Trưởng Phòng Tài chính", cap_bac: 2, phong_ban_id: "dep-3", ten_phong_ban: "Phòng Tài chính - Kế toán", mo_ta: "Quản lý tài chính, kế toán", thu_tu: 30, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-31", ma_chuc_vu: "KT-TR", ten_chuc_vu: "Kế toán trưởng", cap_bac: 2, phong_ban_id: "dep-3-1", ten_phong_ban: "Nhóm Kế toán", mo_ta: "Điều hành công tác kế toán", thu_tu: 31, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-32", ma_chuc_vu: "CV-KT", ten_chuc_vu: "Kế toán viên", cap_bac: 4, phong_ban_id: "dep-3-1", ten_phong_ban: "Nhóm Kế toán", mo_ta: null, thu_tu: 32, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-33", ma_chuc_vu: "CV-TCDN", ten_chuc_vu: "Chuyên viên Tài chính", cap_bac: 4, phong_ban_id: "dep-3-2", ten_phong_ban: "Nhóm Tài chính", mo_ta: "Phân tích, dự báo tài chính", thu_tu: 33, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  // Phòng Kinh doanh (dep-4)
  { id: "pos-40", ma_chuc_vu: "TP-KD", ten_chuc_vu: "Trưởng Phòng Kinh doanh", cap_bac: 2, phong_ban_id: "dep-4", ten_phong_ban: "Phòng Kinh doanh", mo_ta: "Chỉ đạo hoạt động kinh doanh", thu_tu: 40, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-41", ma_chuc_vu: "TN-B2B", ten_chuc_vu: "Trưởng Nhóm Kinh doanh B2B", cap_bac: 2, phong_ban_id: "dep-4-1", ten_phong_ban: "Nhóm Kinh doanh B2B", mo_ta: null, thu_tu: 41, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-42", ma_chuc_vu: "TN-B2C", ten_chuc_vu: "Trưởng Nhóm Kinh doanh B2C", cap_bac: 2, phong_ban_id: "dep-4-2", ten_phong_ban: "Nhóm Kinh doanh B2C", mo_ta: null, thu_tu: 42, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-43", ma_chuc_vu: "NV-KD", ten_chuc_vu: "Nhân viên Kinh doanh", cap_bac: 4, phong_ban_id: "dep-4-1", ten_phong_ban: "Nhóm Kinh doanh B2B", mo_ta: "Chăm sóc khách hàng doanh nghiệp", thu_tu: 43, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-44", ma_chuc_vu: "NV-B2C", ten_chuc_vu: "Nhân viên B2C", cap_bac: 4, phong_ban_id: "dep-4-2", ten_phong_ban: "Nhóm Kinh doanh B2C", mo_ta: null, thu_tu: 44, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  // Phòng Kho vận (dep-5)
  { id: "pos-50", ma_chuc_vu: "TP-KHO", ten_chuc_vu: "Trưởng Phòng Kho vận", cap_bac: 2, phong_ban_id: "dep-5", ten_phong_ban: "Phòng Kho vận", mo_ta: "Quản lý kho, xuất nhập", thu_tu: 50, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-51", ma_chuc_vu: "TN-NHAP", ten_chuc_vu: "Trưởng Nhóm Nhập kho", cap_bac: 2, phong_ban_id: "dep-5-1", ten_phong_ban: "Nhóm Nhập kho", mo_ta: null, thu_tu: 51, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-52", ma_chuc_vu: "TN-XUAT", ten_chuc_vu: "Trưởng Nhóm Xuất kho", cap_bac: 2, phong_ban_id: "dep-5-2", ten_phong_ban: "Nhóm Xuất kho", mo_ta: null, thu_tu: 52, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-53", ma_chuc_vu: "NV-KHO", ten_chuc_vu: "Nhân viên Kho", cap_bac: 4, phong_ban_id: "dep-5-1", ten_phong_ban: "Nhóm Nhập kho", mo_ta: "Kiểm nhận, sắp xếp hàng", thu_tu: 53, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  // Phòng Marketing (dep-6)
  { id: "pos-60", ma_chuc_vu: "TP-MKT", ten_chuc_vu: "Trưởng Phòng Marketing", cap_bac: 2, phong_ban_id: "dep-6", ten_phong_ban: "Phòng Marketing", mo_ta: "Chiến lược marketing, thương hiệu", thu_tu: 60, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-61", ma_chuc_vu: "TN-DIGITAL", ten_chuc_vu: "Trưởng Nhóm Digital Marketing", cap_bac: 2, phong_ban_id: "dep-6-1", ten_phong_ban: "Nhóm Digital Marketing", mo_ta: null, thu_tu: 61, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-62", ma_chuc_vu: "TN-BRAND", ten_chuc_vu: "Trưởng Nhóm Thương hiệu", cap_bac: 2, phong_ban_id: "dep-6-2", ten_phong_ban: "Nhóm Thương hiệu", mo_ta: null, thu_tu: 62, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-63", ma_chuc_vu: "CV-MKT", ten_chuc_vu: "Chuyên viên Marketing", cap_bac: 4, phong_ban_id: "dep-6-1", ten_phong_ban: "Nhóm Digital Marketing", mo_ta: "Content, quảng cáo online", thu_tu: 63, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  // Phòng Hành chính (dep-7)
  { id: "pos-70", ma_chuc_vu: "TP-HC", ten_chuc_vu: "Trưởng Phòng Hành chính", cap_bac: 2, phong_ban_id: "dep-7", ten_phong_ban: "Phòng Hành chính", mo_ta: "Quản lý hành chính, văn phòng", thu_tu: 70, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-71", ma_chuc_vu: "PP-HC", ten_chuc_vu: "Phó Phòng Hành chính", cap_bac: 3, phong_ban_id: "dep-7", ten_phong_ban: "Phòng Hành chính", mo_ta: null, thu_tu: 71, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-72", ma_chuc_vu: "TN-VP", ten_chuc_vu: "Trưởng Nhóm Văn phòng", cap_bac: 2, phong_ban_id: "dep-7-1", ten_phong_ban: "Nhóm Văn phòng", mo_ta: "Văn thư, tài sản, hậu cần", thu_tu: 72, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-73", ma_chuc_vu: "NV-HC", ten_chuc_vu: "Nhân viên Hành chính", cap_bac: 4, phong_ban_id: "dep-7-1", ten_phong_ban: "Nhóm Văn phòng", mo_ta: null, thu_tu: 73, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-74", ma_chuc_vu: "NV-SK", ten_chuc_vu: "Nhân viên Tổ chức sự kiện", cap_bac: 4, phong_ban_id: "dep-7-2", ten_phong_ban: "Nhóm Tổ chức sự kiện", mo_ta: null, thu_tu: 74, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  // --- Thêm ~20 chức vụ mẫu ---
  { id: "pos-80", ma_chuc_vu: "DEV-FE", ten_chuc_vu: "Lập trình viên Frontend", cap_bac: 4, phong_ban_id: "dep-1-1", ten_phong_ban: "Nhóm Phát triển phần mềm", mo_ta: "Phát triển giao diện người dùng", thu_tu: 80, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-81", ma_chuc_vu: "DEV-BE", ten_chuc_vu: "Lập trình viên Backend", cap_bac: 4, phong_ban_id: "dep-1-1", ten_phong_ban: "Nhóm Phát triển phần mềm", mo_ta: "Phát triển API, xử lý nghiệp vụ", thu_tu: 81, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-82", ma_chuc_vu: "QA", ten_chuc_vu: "Chuyên viên Kiểm thử", cap_bac: 4, phong_ban_id: "dep-1-1", ten_phong_ban: "Nhóm Phát triển phần mềm", mo_ta: "Kiểm thử chất lượng phần mềm", thu_tu: 82, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-83", ma_chuc_vu: "BA", ten_chuc_vu: "Chuyên viên Phân tích nghiệp vụ", cap_bac: 4, phong_ban_id: "dep-1", ten_phong_ban: "Phòng Kỹ thuật", mo_ta: "Phân tích yêu cầu, tài liệu", thu_tu: 83, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-84", ma_chuc_vu: "CV-CB", ten_chuc_vu: "Chuyên viên Chính sách & Đãi ngộ", cap_bac: 4, phong_ban_id: "dep-2", ten_phong_ban: "Phòng Nhân sự", mo_ta: "Xây dựng chính sách lương, phúc lợi", thu_tu: 84, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-85", ma_chuc_vu: "CV-NS", ten_chuc_vu: "Chuyên viên Nhân sự tổng hợp", cap_bac: 4, phong_ban_id: "dep-2", ten_phong_ban: "Phòng Nhân sự", mo_ta: "Hành chính nhân sự, hồ sơ", thu_tu: 85, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-86", ma_chuc_vu: "TQ", ten_chuc_vu: "Thủ quỹ", cap_bac: 4, phong_ban_id: "dep-3-2", ten_phong_ban: "Nhóm Tài chính", mo_ta: "Quản lý quỹ tiền mặt, đối chiếu", thu_tu: 86, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-87", ma_chuc_vu: "CV-KS", ten_chuc_vu: "Chuyên viên Kiểm soát nội bộ", cap_bac: 4, phong_ban_id: "dep-3", ten_phong_ban: "Phòng Tài chính - Kế toán", mo_ta: "Kiểm soát rủi ro, tuân thủ", thu_tu: 87, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-88", ma_chuc_vu: "NV-SALE-SP", ten_chuc_vu: "Nhân viên Hỗ trợ Kinh doanh", cap_bac: 4, phong_ban_id: "dep-4", ten_phong_ban: "Phòng Kinh doanh", mo_ta: "Chuẩn bị báo giá, hồ sơ thầu", thu_tu: 88, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-89", ma_chuc_vu: "NV-XUAT", ten_chuc_vu: "Nhân viên Xuất kho", cap_bac: 4, phong_ban_id: "dep-5-2", ten_phong_ban: "Nhóm Xuất kho", mo_ta: "Đóng gói, xuất hàng, đối soát", thu_tu: 89, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-90", ma_chuc_vu: "THU-KHO", ten_chuc_vu: "Thủ kho", cap_bac: 4, phong_ban_id: "dep-5", ten_phong_ban: "Phòng Kho vận", mo_ta: "Quản lý tồn kho, sổ kho", thu_tu: 90, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-91", ma_chuc_vu: "CV-DESIGN", ten_chuc_vu: "Chuyên viên Thiết kế", cap_bac: 4, phong_ban_id: "dep-6-2", ten_phong_ban: "Nhóm Thương hiệu", mo_ta: "Thiết kế đồ họa, nhận diện thương hiệu", thu_tu: 91, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-92", ma_chuc_vu: "CV-COPY", ten_chuc_vu: "Copywriter", cap_bac: 4, phong_ban_id: "dep-6-1", ten_phong_ban: "Nhóm Digital Marketing", mo_ta: "Viết nội dung quảng cáo, SEO", thu_tu: 92, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-93", ma_chuc_vu: "NV-PR", ten_chuc_vu: "Nhân viên Truyền thông", cap_bac: 4, phong_ban_id: "dep-6", ten_phong_ban: "Phòng Marketing", mo_ta: "Quan hệ báo chí, truyền thông nội bộ", thu_tu: 93, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-94", ma_chuc_vu: "LE-TAN", ten_chuc_vu: "Lễ tân", cap_bac: 4, phong_ban_id: "dep-7-1", ten_phong_ban: "Nhóm Văn phòng", mo_ta: "Đón tiếp khách, tổng đài", thu_tu: 94, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-95", ma_chuc_vu: "CV-VT", ten_chuc_vu: "Chuyên viên Văn thư", cap_bac: 4, phong_ban_id: "dep-7-1", ten_phong_ban: "Nhóm Văn phòng", mo_ta: "Soạn thảo, lưu trữ văn bản", thu_tu: 95, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-96", ma_chuc_vu: "TT-DRIVER", ten_chuc_vu: "Tài xế", cap_bac: 4, phong_ban_id: "dep-5", ten_phong_ban: "Phòng Kho vận", mo_ta: "Vận chuyển hàng hóa", thu_tu: 96, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-97", ma_chuc_vu: "THU-KY", ten_chuc_vu: "Thư ký văn phòng", cap_bac: 4, phong_ban_id: "dep-0-2", ten_phong_ban: "Nhóm trợ lý", mo_ta: "Sắp xếp lịch, soạn thảo văn bản", thu_tu: 97, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-98", ma_chuc_vu: "DEV-OPS", ten_chuc_vu: "Chuyên viên DevOps", cap_bac: 4, phong_ban_id: "dep-1-2", ten_phong_ban: "Nhóm Hạ tầng IT", mo_ta: "CI/CD, triển khai, giám sát", thu_tu: 98, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-99", ma_chuc_vu: "PP-TC", ten_chuc_vu: "Phó Phòng Tài chính", cap_bac: 3, phong_ban_id: "dep-3", ten_phong_ban: "Phòng Tài chính - Kế toán", mo_ta: "Hỗ trợ trưởng phòng tài chính", thu_tu: 99, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },

  // --- Bổ sung mẫu đủ 4 cấp bậc ---
  { id: "pos-100", ma_chuc_vu: "GD-DU-AN", ten_chuc_vu: "Giám đốc Dự án", cap_bac: 1, phong_ban_id: "dep-1", ten_phong_ban: "Phòng Kỹ thuật", mo_ta: "Chỉ đạo các dự án trọng điểm", thu_tu: 100, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-101", ma_chuc_vu: "PP-KD", ten_chuc_vu: "Phó Phòng Kinh doanh", cap_bac: 3, phong_ban_id: "dep-4", ten_phong_ban: "Phòng Kinh doanh", mo_ta: "Hỗ trợ trưởng phòng kinh doanh", thu_tu: 101, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-102", ma_chuc_vu: "TN-CSKH", ten_chuc_vu: "Trưởng Nhóm Chăm sóc KH", cap_bac: 2, phong_ban_id: "dep-4-2", ten_phong_ban: "Nhóm Kinh doanh B2C", mo_ta: "Quản lý đội CSKH B2C", thu_tu: 102, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
  { id: "pos-103", ma_chuc_vu: "THU-KY-MKT", ten_chuc_vu: "Thư ký Marketing", cap_bac: 4, phong_ban_id: "dep-6", ten_phong_ban: "Phòng Marketing", mo_ta: "Hỗ trợ hành chính phòng Marketing", thu_tu: 103, trang_thai: 'Đang hoạt động', tg_tao: ts(), tg_cap_nhat: ts() },
];

const MOCK_POSITIONS: Position[] = MOCK_POSITIONS_RAW.map(normalizeMockPosition);

const repo = createRepository<Position>({
  tableName: 'var_chuc_vu',
  mockData: MOCK_POSITIONS,
  select: POSITION_SELECT_FULL,
  delay: 600,
  mapFromDb: mapPositionFromDb,
});

async function enrichPosition(raw: Position): Promise<Position> {
  if (isSupabase()) return raw;
  const depts = await getDepartments();
  return {
    ...raw,
    ten_phong_ban: depts.find((d) => d.id === raw.phong_ban_id)?.ten_phong_ban,
  };
}

export type GetPositionsParams = {
  limit?: number;
  offset?: number;
  orderBy?: string;
  ascending?: boolean;
};

export type PositionsListResult = {
  items: Position[];
  total: number;
};

async function mapPositionRows(list: Position[]): Promise<Position[]> {
  return Promise.all(list.map(enrichPosition));
}

export const getPositionCount = async (): Promise<number> => repo.count();

export const getPositionsPage = async (
  params: GetPositionsParams = {},
): Promise<PositionsListResult> => {
  const limit = params.limit ?? POSITIONS_LIST_QUERY_PARAMS.limit;
  const offset = params.offset ?? POSITIONS_LIST_QUERY_PARAMS.offset;
  const orderBy = params.orderBy ?? POSITIONS_LIST_QUERY_PARAMS.orderBy;
  const ascending = params.ascending ?? POSITIONS_LIST_QUERY_PARAMS.ascending;
  const { items } = await repo.getPage({
    limit,
    offset,
    orderBy,
    ascending,
    select: POSITION_SELECT_FULL,
    includeTotal: false,
  });
  return { items: await mapPositionRows(items), total: 0 };
};

export const getPositions = async (params: GetPositionsParams = {}): Promise<Position[]> => {
  const { items } = await getPositionsPage(params);
  return items;
};

/** Chức vụ đang hoạt động — dùng matrix phân quyền; lọc ở DB khi Supabase. */
export const getActivePositions = async (): Promise<Position[]> => {
  if (isSupabase()) {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('var_chuc_vu')
      .select(POSITION_SELECT_FULL)
      .eq('trang_thai', 'Đang hoạt động')
      .order('thu_tu', { ascending: true });
    if (error) handleSupabaseError(error);
    const flattened = (data ?? []).map((row) =>
      mapPositionFromDb(row as unknown as Record<string, unknown>),
    );
    return Promise.all(flattened.map(enrichPosition));
  }
  const all = await getPositions();
  return all.filter((p) => p.trang_thai === 'Đang hoạt động');
};

export const createPosition = async (data: PositionFormValues): Promise<Position> => {
  const now = new Date().toISOString();

  if (isSupabase()) {
    const creatorId = getCurrentEmployeeId();
    const inserted = await repo.insert(
      {
        ma_chuc_vu: data.ma_chuc_vu,
        ten_chuc_vu: data.ten_chuc_vu,
        cap_bac: data.cap_bac ?? null,
        phong_ban_id: data.phong_ban_id ?? null,
        mo_ta: data.mo_ta ?? null,
        thu_tu: data.thu_tu ?? 1,
        trang_thai: data.trang_thai,
        nguoi_tao: creatorId,
        tg_tao: now,
        tg_cap_nhat: now,
      } as Omit<Position, 'id'>,
      { returningSelect: POSITION_RETURNING_FULL },
    );
    return enrichPosition(inserted);
  }

  const id = `pos-${Date.now()}`;
  const creatorId = getCurrentEmployeeId();
  const inserted = await repo.insert(
    {
    id,
    ma_chuc_vu: data.ma_chuc_vu,
    ten_chuc_vu: data.ten_chuc_vu,
    cap_bac: data.cap_bac ?? null,
    phong_ban_id: data.phong_ban_id ?? null,
    mo_ta: data.mo_ta ?? null,
    thu_tu: data.thu_tu ?? 0,
    trang_thai: data.trang_thai,
    nguoi_tao: creatorId,
    tg_tao: now,
    tg_cap_nhat: now,
  } as Omit<Position, 'id'> & { id: string },
    { returningSelect: POSITION_RETURNING_FULL },
  );
  return enrichPosition(inserted);
};

export const updatePosition = async (id: string, data: PositionFormValues): Promise<Position> => {
  const existing = await repo.getById(id);
  if (!existing) throw new Error(txt('position.service.notFound'));
  const updated = await repo.update(
    id,
    {
    ...data,
    mo_ta: data.mo_ta ?? null,
    thu_tu: data.thu_tu ?? existing.thu_tu,
    trang_thai: data.trang_thai,
    tg_cap_nhat: new Date().toISOString(),
    },
    { returningSelect: POSITION_RETURNING_FULL },
  );
  return enrichPosition(updated);
};

export const updatePositionStatus = async (ids: string[], status: TrangThaiHoatDong): Promise<Position | undefined> => {
  const timestamp = new Date().toISOString();
  const results = await runInBatchesSettled(ids, 5, (id) =>
    repo.update(
      id,
      { trang_thai: status, tg_cap_nhat: timestamp },
      { returningSelect: POSITION_RETURNING_STATUS_ONLY },
    ),
  );
  assertAllBatchSucceeded(results);
  if (ids.length !== 1) return undefined;
  const only = results[0];
  if (!only?.ok) return undefined;
  return enrichPosition(only.value);
};

export const deletePositions = async (ids: string[]): Promise<void> => {
  await repo.remove(ids);
};

/** Import nhiều chức vụ (chỉ thêm mới). Cột gợi ý: ma_chuc_vu, ten_chuc_vu, cap_bac, ma_phong_ban|phong_ban_id, mo_ta, thu_tu, trang_thai */
export const importPositions = async (
  rows: ImportBatchRow[],
  options?: { onProgress?: (done: number, total: number) => void },
): Promise<ImportResult> => {
  const depts = await getDepartments();

  const parseCapBac = (raw: unknown): number | null | undefined => {
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 32767) return undefined;
    return n;
  };

  const resolveDeptId = (raw: unknown): string | null => {
    if (raw == null || String(raw).trim() === '') return null;
    const s = String(raw).trim();
    const byId = depts.find((d) => d.id === s);
    if (byId) return byId.id;
    const up = s.toUpperCase();
    const byMa = depts.find((d) => d.ma_phong_ban?.toUpperCase() === up);
    return byMa?.id ?? null;
  };

  return runImportBatch(
    rows,
    async (row) => {
      const ma_chuc_vu = String(row.ma_chuc_vu ?? '').trim().toUpperCase();
      const ten_chuc_vu = String(row.ten_chuc_vu ?? '').trim();
      if (!ma_chuc_vu || !ten_chuc_vu) {
        throw new Error('Thiếu mã hoặc tên chức vụ');
      }

      const capRaw = row.cap_bac;
      const pbRaw = row.phong_ban_id ?? row.ma_phong_ban;
      const cap_bac = parseCapBac(capRaw);
      const phong_ban_id = resolveDeptId(pbRaw);
      if (capRaw != null && String(capRaw).trim() !== '' && cap_bac === undefined) {
        throw new Error('Cấp bậc không hợp lệ (số nguyên 0–32767)');
      }
      if (pbRaw != null && String(pbRaw).trim() !== '' && !phong_ban_id) {
        throw new Error('Không tìm thấy phòng ban (mã hoặc id)');
      }

      const parsed = positionSchema.safeParse({
        ma_chuc_vu,
        ten_chuc_vu,
        cap_bac: cap_bac ?? null,
        phong_ban_id: phong_ban_id ?? '',
        mo_ta: row.mo_ta != null ? String(row.mo_ta) : '',
        thu_tu: row.thu_tu != null && String(row.thu_tu).trim() !== '' ? Number(row.thu_tu) : 0,
        trang_thai: parseTrangThaiHoatDongImport(row.trang_thai),
      });
      if (!parsed.success) {
        const msg = parsed.error.flatten().formErrors[0] ?? parsed.error.message;
        throw new Error(msg);
      }

      await createPosition({
        ...parsed.data,
        cap_bac: cap_bac ?? null,
        phong_ban_id: phong_ban_id ?? null,
        mo_ta: parsed.data.mo_ta?.trim() || null,
      });
    },
    options,
  );
};