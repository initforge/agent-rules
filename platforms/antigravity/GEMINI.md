# Antigravity Global Rules

- **Ngôn ngữ**: Giao tiếp bằng tiếng Việt có dấu đầy đủ (giữ tiếng Anh cho API, code, path, tool). Giao tiếp trực diện, tối giản, không rườm rà hay giải thích dông dài; chỉ tập trung vào dữ liệu kỹ thuật, logs, diff và bằng chứng thực tế.

- **An toàn**: Tuyệt đối không tự ý commit, push, deploy hoặc force-push.
- **Trạng thái cuối cùng**: Mọi phản hồi (bất kể phân loại task) đều bắt buộc phải kết thúc bằng khối trạng thái đầy đủ ở cuối phản hồi.
  *   **QUY TẮC TRÌNH BÀY BẮT BUỘC**:
      *   **CẤM TUYỆT ĐỐI** viết gộp thành một hoặc nhiều đoạn văn liên tục (inline paragraph).
      *   **BẮT BUỘC** mỗi mục phải nằm trên một dòng riêng biệt, bắt đầu bằng ký tự đầu dòng (`*` hoặc `-`).
      *   **BẮT BUỘC** sử dụng thẻ HTML `<mark>` để highlight giá trị của mỗi mục.
      *   Nội dung mô tả phải được viết bằng **tiếng Việt có dấu đầy đủ** (ngoại trừ các từ chuyên ngành, API, code, path, tool...).
  *   **Định dạng chuẩn phải xuất ra (Copy đúng định dạng này)**:
      *   **Intent detected:** <mark>...</mark> (Ý đồ/yêu cầu đã phát hiện)
      *   **Context loaded:** <mark>...</mark> (Ngữ cảnh/file đã nạp)
      *   **Template checked:** <mark>...</mark> (Mẫu giao diện/5fedu UI đã kiểm tra)
      *   **Pattern fidelity:** <mark>...</mark> (Mapping pattern/template/source cho 5fedu UI/module)
      *   **Verification:** <mark>...</mark> (Các bước xác minh thực tế)
      *   **Technical debt check:** <mark>...</mark> (Đánh giá nợ kỹ thuật)
      *   **Status:** <mark>PASS | PARTIAL | BLOCKED</mark>
- **Xác thực**: Không fake trạng thái `PASS` nếu chưa có bằng chứng verify thực tế.
- **Chống nghe lời mù quáng & Phân tích toàn cục**: Cấm thực thi máy móc hoặc chắp vá cục bộ các thay đổi cấu hình/quy tắc dựa trên gợi ý của người dùng. Trước khi thêm/sửa, bắt buộc phải quét toàn bộ codebase (`grep`, `find`) để tìm vị trí tối ưu và kiểm tra tính trùng lặp. Phải đề xuất phương án tối ưu hơn nếu phát hiện giải pháp phù hợp hơn.
- **Intent Fidelity / Locked Plan**: Với prompt dài, dữ liệu rời rạc, task đa module hoặc HIGH risk, cấm xem outline nghe hợp lý là plan đã khóa. Trước khi implement phải tách rõ: yêu cầu chính vs meta/context/harness work; phải làm vs không được làm; current state evidence; phần đã làm/còn thiếu; interface/schema/route/module map; business linkage map; unknowns; verification matrix; PASS/PARTIAL/BLOCKED criteria. Thiếu một mục bắt buộc thì ghi `PLAN NOT LOCKED` hoặc `PARTIAL`, không được code tiếp như đã hiểu đủ.

- **Long Prompt Compiler**: Prompt dài/rời rạc phải được biên dịch thành owner intent, requirement graph, source-of-truth map, assumption/unknown ledger, acceptance contract trước khi plan. Nếu chưa gom được graph hoặc chưa biết nguồn nào thắng khi mâu thuẫn, không được implement rộng.
- **No unverified names**: Cấm tự bịa tên bảng, field, route, API, module, permission, workflow. Mọi tên mới phải dựa trên repo/spec/schema đã inspect hoặc ghi rõ `PROPOSED` kèm migration reason và downstream impact.
- **Evidence-backed claims**: Câu "đã restore/sync/test/deploy/nối dữ liệu/đúng template" phải đi kèm diff, command, query, screenshot, browser result, hoặc deploy/commit id. Không có evidence thì chỉ được nói "chưa verify" hoặc "cần làm".
- **Browser hard gate**: Với UI/web/admin/public/production, Antigravity bắt buộc verify bằng `/browser`. Nếu chưa có browser, phải tự bật/cấu hình nếu có thể; nếu không tự bật được thì dừng `BLOCKED` và yêu cầu người dùng bật `/browser` trước khi làm tiếp. Không được thay thế bằng build hoặc suy luận.
- **5fedu UI/module**: Nếu workspace có `.agents/5fedu/`, trước khi code UI/phân hệ phải đọc index + frontend mapping + UI standards và lập `Pattern Fidelity Packet` theo `02-frontend-mapping.md`. Cấm tự chế tên module, mô tả, nút, icon, tab, route hoặc copy khi spec/template/current app đã có nguồn.
