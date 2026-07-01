# GHI CHÚ BACKEND & BUSINESS LOGIC THỰC TẾ – NOSTIME

Tài liệu này lưu trữ đặc tả chi tiết về mặt nghiệp vụ chuyên biệt của Nostime (Business Logic) và các nốt thuật toán tính toán phía Backend để dễ dàng phát triển và bảo trì.

---

## 1. THUẬT TOÁN TÍNH GIÁ VỐN & LỢI NHUẬN ĐỒNG HỒ ĐỘC BẢN

Khác với các hệ thống ERP bán lẻ đại trà tính giá vốn bình quân gia quyền (FIFO/LIFO), Nostime quản lý đồng hồ theo từng chiếc duy nhất (Unique Items).

### A. Công thức tính Giá vốn thực tế của sản phẩm:
Mỗi chiếc đồng hồ (1 dòng trong `web_san_pham`) có:
- `gia_mua`: Giá vốn gốc khi nhập hàng.
- `chi_phi_phat_sinh`: Tổng chi phí sửa chữa, bảo dưỡng spa hoặc vận chuyển riêng cho chiếc đồng hồ đó trước khi bán.
- **`tong_gia_von`**:
  $$\text{tong\_gia\_von} = \text{gia\_mua} + \text{chi\_phi\_phat\_sinh}$$

### B. Công thức tính Lợi nhuận gộp (Gross Profit) khi bán đồng hồ:
Khi một sản phẩm được xuất kho bán (được liên kết trong `kd_don_hang_ct` với `gia_ban` thực tế):
- **Trường hợp Hàng sở hữu (In-house) hoặc Bán hộ (Brokerage)**:
  $$\text{Gross Profit} = \text{gia\_ban} - \text{tong\_gia\_von}$$
- **Trường hợp Hàng ký gửi (Consignment)**:
  *   *Logic nghiệp vụ:* Lợi nhuận hàng ký gửi sẽ tính theo % hoa hồng thỏa thuận hoặc chênh lệch bán lẻ.
  *   Nếu thỏa thuận lấy hoa hồng cố định $P_{comm}$ từ người ký gửi:
      $$\text{Gross Profit} = P_{comm}$$
  *   Nếu thỏa thuận giá bán cứng trả về cho người ký gửi là $V_{consign}$ (gia_mua = $V_{consign}$):
      $$\text{Gross Profit} = \text{gia\_ban} - (V_{consign} + \text{chi\_phi\_phat\_sinh})$$

---

## 2. THUẬT TOÁN PHÂN BỔ CHI PHÍ HOẠT ĐỘNG THEO THÁNG (AMORTIZATION)

Đối với các khoản chi phí hoạt động lớn (ví dụ: chi phí sửa showroom 60 triệu dùng trong 6 tháng), nếu tính gộp toàn bộ vào tháng chi sẽ làm báo cáo P&L tháng đó bị lỗ nặng ảo, còn các tháng sau lãi ảo.

### A. Quy trình tạo phân bổ:
1. Khi tạo một giao dịch Chi (`tc_giao_dich` có `loai = 'Chi'`), người dùng tích chọn `Phân bổ chi phí` (`is_amortized = true`), nhập `ngay_bat_dau_pb` và `ngay_ket_thuc_pb`.
2. Hệ thống tự động đếm số tháng nằm trong khoảng phân bổ ($N$ tháng).
3. Hệ thống tự động chia đều số tiền chi và tạo ra $N$ dòng ghi nhận trong bảng `tc_phan_bo`:
   $$\text{so\_tien\_pb\_thang} = \frac{\text{so\_tien}}{N}$$
   Mỗi dòng ghi nhận cột `thang` dưới định dạng `YYYY-MM` và trạng thái `Chờ phân bổ`.

### B. Cơ chế đối soát trong Báo cáo P&L hàng tháng:
- Khi tính Chi phí hoạt động của tháng $M$ (định dạng `YYYY-MM`), hệ thống sẽ quét bảng `tc_phan_bo` lấy tổng các khoản có `thang = M` và cộng vào chi phí của tháng đó.
- Đồng thời cập nhật trạng thái các khoản này từ `Chờ phân bổ` sang `Đã phân bổ` khi tháng đó kết thúc.

---

## 3. THUẬT TOÁN TÍNH LƯƠNG NHÂN SỰ ĐIỀN TAY (PAYROLL)

Bảng lương của Nostime được thiết kế theo dạng điền tay đơn giản để kế toán dễ dàng vận hành, không cần qua chấm công tự động cồng kềnh.

### A. Các thông số đầu vào hàng tháng (cho từng nhân viên):
- `luong_co_ban`: Lương cứng trong hợp đồng của nhân viên.
- `ngay_cong`: Số ngày đi làm thực tế trong tháng (nhập tay, mặc định 26 ngày).
- `diem_kpi`: Điểm đánh giá công việc của tháng (nhập tay, hệ số từ 0.0 đến 2.0).
- `phu_cap`: Tiền ăn trưa, điện thoại, xăng xe.
- `bao_hiem`: Các khoản khấu trừ BHXH tự đóng.
- `tam_ung`: Số tiền nhân viên đã ứng trước trong tháng.

### B. Công thức tính Lương thực lĩnh (`luong_thuc_linh`):
$$\text{luong\_thuc\_linh} = \left( \text{luong\_co\_ban} \times \frac{\text{ngay\_cong}}{26} \times \text{diem\_kpi} \right) + \text{phu\_cap} - \text{bao\_hiem} - \text{tam\_ung}$$

### C. Logic Phân quyền bảng lương (App-side Guard):
- Nhân viên có chức vụ `quan_tri` hoặc có `cap_bac = 1` trong hệ thống được quyền xem bảng lương của toàn bộ công ty.
- Nhân viên bình thường chỉ có quyền gọi API tải phiếu lương (`Pay slip`) của chính ID tài khoản của mình.

---

## 4. CƠ CHẾ ĐỒNG BỘ DỮ LIỆU LOOKUP KHÔNG CẦN TOKEN (WEBSITE CLIENT)

Để khách hàng vãng lai truy cập website có thể tự tra cứu tiến độ đơn hàng/spa đồng hồ mà không cần đăng nhập:

1. **API Endpoint Public**: Thiết lập một route API công khai `/api/public/lookup` (hoặc cấu hình SELECT policy cho phép `anon` truy cập vào các bảng `kd_don_hang` và `kv_sua_chua` với các cột hạn chế).
2. **Tham số tra cứu**: Client truyền `so_dien_thoai` lên API.
3. **Logic xử lý Backend**:
   - Bước 1: Quét bảng `kd_khach_hang` tìm `id` đối tác có số điện thoại trùng khớp.
   - Bước 2: Truy vấn bảng `kd_don_hang` để lấy thông tin các sản phẩm đã mua và tình trạng bảo hành.
   - Bước 3: Truy vấn bảng `kv_sua_chua` để lấy tiến độ spa/sửa chữa đồng hồ (Mã phiếu, tên đồng hồ, trạng thái `Mới tiếp nhận / Đang sửa / Đã sửa xong / Đã bàn giao`, ngày hẹn giao).
   - Bước 4: Trả về client danh sách tinh lọc, ẩn đi các thông tin nhạy cảm (như giá vốn, chi phí sửa, ghi chú nội bộ).
