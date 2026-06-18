# Hoàn thành triệt để (Finish to Completion)

**Luật sắt (Iron Law):** Không kết thúc turn khi còn bất kỳ sản phẩm/yêu cầu bàn giao nào (Deliverable) trong scope mà Agent có thể tự thực hiện.

Mọi hành vi bàn giao một phần (Partial Handoff) đều bị coi là **lỗi nghiêm trọng**, không phải là phong cách làm việc hợp lệ.

---

## 1. Khóa Scope (Scope Lock) — Thực hiện ở Turn-0 (Trước tool đầu tiên)

1.  Đọc yêu cầu của người dùng $\rightarrow$ xác định rõ số lượng **Deliverables** cần bàn giao (files cần sửa, hàm cần viết, test case cần chạy, hoặc câu lệnh phải thực thi).
2.  Ghi nhận nội bộ trong suy nghĩ hoặc đầu ra: `Scope lock: N deliverables — [liệt kê ngắn gọn]`.
3.  **Tuyệt đối không** tự ý vẽ thêm việc hoặc mở rộng scope (ví dụ: cố gắng tối ưu hóa toàn bộ hệ thống hoặc đóng mọi khoảng trống không liên quan) trừ khi người dùng yêu cầu rõ ràng.
4.  Nếu bắt buộc phải mở rộng scope trong quá trình làm việc $\rightarrow$ thông báo và xin ý kiến người dùng **trước khi làm** — cấm im lặng làm rồi vứt đống backlog/GAP ở cuối turn.

---

## 2. Vòng lặp thực thi bắt buộc (Execution Loop)

```text
WHILE còn deliverable chưa hoàn thành:
  thực thi deliverable tiếp theo
  verify deliverable đó (nếu có validation gate)
  đánh dấu done
IF gặp lỗi/kẹt không thể đi tiếp sau khi đã thử mọi phương án fallback:
  Status = BLOCKED (nêu rõ lý do trong 1 dòng cụ thể)
ELSE:
  Status = PASS
```

**Cấm** thoát khỏi vòng lặp sớm với lý do "đã làm xong phần chính", "đủ để chạy demo", hoặc "turn làm việc quá dài".

---

## 3. Tự làm việc — Không chuyển việc cho người dùng

| Việc Agent bắt buộc phải tự làm | Chỉ được phép hỏi người dùng khi |
|---|---|
| Chạy build, lint, test trong repository | Thiếu credentials, API keys, secrets hoặc mã xác thực MFA |
| Chỉnh sửa tất cả các file còn lại trong scope | Cần đưa ra quyết định nghiệp vụ (Product Decision) không thể suy luận logic được |
| Chạy các script verify có sẵn trong dự án | Không có quyền push/deploy và bước đó là bắt buộc để báo PASS |
| Chủ động đọc thêm file để tránh bỏ sót lỗi | Môi trường hệ thống (Env) bị sập sau khi đã thử mọi cách khắc phục |

**Cấm** mô tả câu lệnh bằng văn bản rồi yêu cầu người dùng chạy hộ khi Agent có sẵn terminal và câu lệnh đó an toàn.

---

## 4. Kiểm tra chống sót lỗi (Miss Prevention) — Thực hiện trước khi kết turn

Đối chiếu và đánh dấu check từng mục trong Scope Lock ban đầu:
*   `[ ]` Đã implement/sửa đổi đầy đủ từng mục trong scope?
*   `[ ]` Đã chạy verify cho từng mục có cổng kiểm soát (gate)?
*   `[ ]` File diff thực tế chỉ tác động chính xác vào scope — không bỏ sót files liên quan?
*   `[ ]` Không tự ý chèn thêm các ký hiệu `TODO` / `FIXME` mới vào code trong scope?
*   `[ ]` Trạng thái (Status) trùng khớp hoàn toàn với bằng chứng thực tế (không báo PASS khi chưa chạy lệnh verify)?

Nếu còn bất kỳ ô check nào chưa đạt $\rightarrow$ **tiếp tục thực thi**, tuyệt đối không kết turn.

---

## 5. Các mẫu văn bản và hành vi bị CẤM (Bị tính là Hard Fail)

*   **Văn bản kết turn bị cấm:**
    *   *"Bước tiếp theo bạn có thể chạy..."* / *"Bạn có thể tự chạy lệnh..."*
    *   *"Bạn muốn chọn phương án A hay B?"* (Trừ trường hợp bị `BLOCKED` thực sự và cần quyết định nghiệp vụ).
    *   *"Danh sách các GAP còn lại..."* / *"Remaining work..."* đặt ngay cạnh bảng báo cáo các việc đã làm.
    *   *"Để sau"* / *"Lập trình viên có thể làm thêm..."* đối với các việc Agent hoàn toàn tự làm được.
    *   *"Let me know if you want me to continue"* (Hãy cho tôi biết nếu bạn muốn tôi tiếp tục).
    *   Liệt kê backlog như một deliverable hợp lệ thay vì trực tiếp thực hiện hoặc báo `BLOCKED` kèm lý do.
*   **Hành vi bị cấm:**
    *   Sửa 4 trên tổng số 8 files yêu cầu rồi dừng lại hỏi ý kiến.
    *   Cập nhật tài liệu hướng dẫn nhưng không chạy verify kiểm tra link.
    *   Sửa lỗi bug nhưng không viết test hoặc không kiểm tra lỗi hồi quy (regression).
    *   Báo cáo tiến độ như thể đã xong trong khi chưa chạy lệnh verify thực tế.

---

## 6. Trạng thái kết thúc bắt buộc (Terminal States)

Chỉ sử dụng duy nhất một trong ba trạng thái sau ở cuối phản hồi:

*   **`PASS`**: Mọi deliverables trong scope đã hoàn thành + đã chạy verify thành công + cung cấp đầy đủ bằng chứng (logs, output).
*   **`PARTIAL`**: Chỉ dùng khi đã thử mọi phương án fallback nhưng vẫn thiếu một phần việc nhỏ; bắt buộc ghi rõ nguyên nhân blocker trong 1 dòng duy nhất.
*   **`BLOCKED`**: Hoàn toàn không thể tiếp tục thực hiện công việc (thiếu quyền, thiếu credential, sập env, hoặc cần quyết định nghiệp vụ); ghi rõ nguyên nhân blocker trong 1 dòng duy nhất.

Tuyệt đối **không có trạng thái thứ tư** kiểu: *"Làm được 80%, phần còn lại tùy bạn"*. Không dùng `PARTIAL` để trốn tránh các phần việc còn tự làm được.

---

## 7. Xử lý Token dài / Multi-step

*   Trong cùng một session: **Liên tục gọi tools** cho đến khi đạt trạng thái `PASS` hoặc `BLOCKED`.
*   Chỉ tạm dừng khi chạm giới hạn kỹ thuật thực tế của hệ thống (ví dụ: giới hạn token/lượt gọi) $\rightarrow$ ghi nhận trạng thái: `[PAUSED — X/N complete — resume: <tên item tiếp theo>]`, không hỏi người dùng chọn hướng đi.
*   Khi người dùng phản hồi *"tiếp tục"* hoặc *"làm đi"* $\rightarrow$ ngay lập tức resume vào đúng item đang dở, cấm tóm tắt lại (recap) hoặc hỏi lại các câu hỏi cũ.

---

## 8. Khung báo cáo bắt buộc (MEDIUM/HIGH Task)

```text
Scope lock: N deliverables — all done: yes|no
Verification: <câu lệnh chạy thử> → <kết quả thực tế>
Miss check: pass|fail
Status: PASS | PARTIAL | BLOCKED
Blocker: <chỉ ghi khi PARTIAL/BLOCKED — tối đa 1 dòng>
```

Với task LOW: Chỉ cần ghi `Status` + số lượng deliverables đã hoàn thành/tổng số.