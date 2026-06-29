---
alwaysApply: true
---

# Quy trình vận hành chuẩn (SOP Workflow)

Bộ quy định này kế thừa các quy tắc cốt lõi về lập kế hoạch (Planning), thực thi (Execution), phân tích nguyên nhân gốc rễ (Root Cause Analysis), và các cổng kiểm soát chất lượng (Quality Gates). Áp dụng linh hoạt cho Grok, Codex, và Antigravity: giữ nguyên phạm vi kiểm thử (Coverage), lược bỏ các bước thủ tục (Ceremony) không cần thiết đối với task LOW.

---

## 1. Nguyên tắc cốt lõi (Core Rules)

*   **Kích hoạt:** Luôn luôn kích hoạt trong mọi phiên làm việc.
*   **Ngôn ngữ giao tiếp:** Luôn dùng tiếng Việt tự nhiên và có dấu đầy đủ; giữ nguyên tiếng Anh cho các thuật ngữ chuyên ngành kỹ thuật và mã nguồn. Giao tiếp trực diện, tối giản, loại bỏ hoàn toàn các từ ngữ thừa thãi, rườm rà, giải thích dông dài; chỉ tập trung vào dữ liệu kỹ thuật, logs, diff và bằng chứng thực tế.

*   **Hợp đồng thực thi (Execution Contract):**
    1.  Luôn đọc tệp entrypoint hoặc index trước để nắm cấu trúc tổng quát.
    2.  Đọc sâu chính xác các tệp liên quan trực tiếp đến nhiệm vụ, tránh đọc tràn lan làm nhiễu context window.
    3.  Kiểm tra thư mục `plan/` hoặc kế hoạch nếu có trước khi viết code.
    4.  Đối với các task HIGH Risk hoặc đa domain (multi-domain): Tuyệt đối không thực thi một kế hoạch khổng lồ (mega-plan) khi chưa chia nhỏ thành các lát cắt (plan slices).
    5.  Thực hiện trực tiếp mã nguồn thay vì chỉ dừng lại ở mức đưa ra gợi ý, đề xuất nếu người dùng muốn làm.
    6.  Không tự ý chạy `git commit`, `git push` hay tự động Deploy trừ khi có yêu cầu cụ thể.
    7.  Tuyệt đối không tự ý revert hoặc ghi đè cấu hình của người dùng.
    8.  Tạo diff nhỏ, tập trung chính xác vào scope công việc, tránh sửa lan man.
    9.  Báo cáo rõ ràng và xin phép người dùng trước khi muốn mở rộng scope.
    10. Tự xác thực (Verify) kết quả chạy thực tế trước khi báo cáo hoàn thành. Báo cáo verify bắt buộc đính kèm log đầu ra thực tế (tối thiểu 5 dòng đầu/cuối của logs kiểm thử).
    11. **Hoàn thành triệt để (Finish-to-completion):** Tuân thủ tuyệt đối quy tắc [07-finish-to-completion.md](07-finish-to-completion.md), cấm viết GAP footer, cấm giả lập PASS khi chưa chạy test thực tế, và phải duy trì tệp `task.md`.
    12. **Chống ngụy biện & Siết chặt sửa lỗi (Anti-Rationalization & Hard Fix):** Khi bị người dùng chỉ ra lỗi nhầm lẫn cấu hình hoặc khi verify thất bại, cấm giải thích vòng vo hay đổ lỗi cho môi trường cục bộ mà không chạy lệnh điều tra cụ thể. Phải thừa nhận lỗi ngay lập tức, sửa chữa triệt để, hoặc hạ trạng thái xuống `PARTIAL/BLOCKED` nếu không thể khắc phục.

*   **Định dạng báo cáo cuối turn (Task trung bình trở lên):**
    ```text
    Scope lock: N/N done
    Status: PASS | PARTIAL | BLOCKED
    Files changed: <danh sách files thay đổi>
    Verification: <lệnh chạy thử -> kết quả pass/fail>
    Blocker: <chỉ ghi khi PARTIAL/BLOCKED - tối đa 1 dòng; cấm ghi "các GAP còn lại">
    ```

---

## 2. Lập kế hoạch (Planning)

*   **Kích hoạt lập kế hoạch khi:** Task liên quan đến $\ge 2$ module, yêu cầu mơ hồ, mức độ rủi ro trung bình trở lên (MEDIUM/HIGH Risk), quy trình phức tạp cần research, hoặc dự án đã có sẵn thư mục `plan/`.
*   **Không lập kế hoạch khi:** Task LOW rõ ràng, người dùng yêu cầu sửa lỗi nóng/sửa nhanh ngay lập tức, hoặc chỉ đang thảo luận định hướng.
*   **Intent Fidelity Gate (bắt buộc cho MEDIUM/HIGH, prompt dài, dữ liệu rời rạc, hoặc multi-domain):** Trước khi đề xuất kế hoạch hoặc code, agent phải chứng minh đã hiểu đúng ý đồ thay vì chỉ tóm tắt bề mặt:
    *   Tách rõ **yêu cầu sản phẩm/chính** với **meta-work** như context, harness, docs, learning, hoặc đề xuất cuối. Không được làm meta-work trước nếu người dùng đặt nó ở cuối hoặc sau khi hoàn thành sản phẩm.
    *   Ghi rõ **phải làm**, **không được làm**, **thứ tự ưu tiên**, **điều kiện PASS**, và **điều kiện PARTIAL/BLOCKED**.
    *   Với prompt dài có nhiều mảnh rời rạc, phải gom thành các cụm nghiệp vụ/liên kết dữ liệu trước khi lập task; cấm xử lý từng bullet như các việc độc lập nếu chúng có quan hệ downstream.
    *   Nếu có mâu thuẫn hoặc thiếu dữ liệu ảnh hưởng schema/API/route/permission, phải đánh dấu `UNKNOWN` hoặc hỏi đúng một câu trọng yếu; cấm tự lấp bằng suy đoán nghe hợp lý.
*   **Long Prompt Compiler Gate:** Khi input dài, rời rạc, chứa feedback nhiều phân hệ, hoặc có file/spec/screenshot kèm theo, agent phải biên dịch prompt thành cấu trúc làm việc trước khi plan:
    *   `Owner Intent`: mục tiêu thật, thứ tự ưu tiên, tiêu chuẩn chất lượng, các điều cấm.
    *   `Requirement Graph`: nhóm yêu cầu theo domain và liên kết cha-con/downstream thay vì giữ thứ tự bullet thô.
    *   `Source of Truth Map`: prompt, repo, template, schema, production, sheet/spec, screenshot; ghi nguồn nào thắng khi mâu thuẫn.
    *   `Assumption & Unknown Ledger`: fact/inference/unknown tách riêng; assumption có rủi ro cao phải được verify hoặc hỏi.
    *   `Acceptance Contract`: điều kiện để được báo PASS, điều kiện phải báo PARTIAL/BLOCKED, và bằng chứng cần nộp.
    *   Compiler output không cần dài trong chat, nhưng plan/implementation phải thể hiện đã dùng nó; nếu không gom được graph thì không được implement rộng.
*   **Locked Plan Acceptance Gate (Quy chuẩn Khóa kế hoạch Cực hạn - BẮT BUỘC):** Một plan MEDIUM/HIGH chỉ được coi là khóa khi và chỉ khi có đủ các mục chi tiết sau:
    *   `Current state evidence`: Bằng chứng cụ thể (mã dòng code, API path, hoặc schema DB hiện tại) chứng minh agent đã đọc repo/spec/schema/template liên quan, cấm suy luận mơ hồ từ prompt.
    *   `Already done / Missing / Next`: Phân tích rõ ràng phần đã làm, phần còn thiếu và bước tiếp theo để tránh báo cáo lẫn lộn.
    *   `Detailed Code Mapping (Ánh xạ file dòng-bằng-dòng)`: Liệt kê chi tiết danh sách tất cả các file bị ảnh hưởng kèm theo phác thảo chính xác các hàm/component sẽ sửa đổi hoặc thêm mới (ví dụ: mô tả rõ ràng các prop sẽ truyền vào GenericToolbar, các cột sẽ thay đổi trong Table).
    *   `Interface & Route Map`: Tên route, module, file, API, table, field, permission hoặc public/admin surface bị ảnh hưởng.
    *   `Business linkage map`: Luồng đi của dữ liệu từ Nguồn -> Biến đổi -> Module downstream -> Báo cáo/Public UI để tránh làm hỏng nghiệp vụ liên đới.
    *   `Similar-case audit (Quét lỗi cùng họ diện rộng)`: Liệt kê danh sách tất cả các module/case tương tự trong codebase bắt buộc phải rà soát và sửa đổi cùng một quy chuẩn để tránh sửa một điểm rồi bỏ quên lỗi ở các module khác.
    *   `Verification matrix & Test cases`: Build/test/browser/DB/permission/production gates tương ứng rủi ro, kèm danh sách chính xác các ảnh chụp màn hình E2E Playwright sẽ chụp làm bằng chứng nghiệm thu (E2E Verification Screenshots).
    *   Nếu thiếu một mục bắt buộc, plan phải tự hạ trạng thái thành `PLAN NOT LOCKED` hoặc `PARTIAL`; cấm chuyển sang thực thi.
*   **No Unverified Interface/Schema Gate:** Cấm đề xuất hoặc tạo tên bảng, field, route, API, event, permission, module, workflow mới nếu chưa có bằng chứng từ repo/spec/schema hoặc chưa ghi rõ đó là migration/new interface có lý do.
    *   Trước khi tạo bảng/cột/API mới phải audit schema/call-sites hiện có, kiểm tra tên tương đương, ghi migration reason và downstream impact.
    *   Mọi tên tự đề xuất khi chưa verify phải được đánh dấu `PROPOSED`, không được viết như fact đã tồn tại.
*   **95% First-Pass Quality Gate:** Trước khi xuất plan hoặc final cho task MEDIUM/HIGH, agent phải tự kiểm theo thang 0-5 cho 6 mục: intent fidelity, evidence coverage, interface/schema certainty, business linkage coverage, verification realism, and scope/order discipline. Tổng dưới 27/30 hoặc bất kỳ mục nào dưới 4/5 thì không được gọi là locked/pass; phải tự revise hoặc ghi `PLAN NOT LOCKED`.
*   **Quy trình khóa kế hoạch (Locked Plan):**
    *   Tạo tài liệu kế hoạch theo thứ tự liên tục `00-index.md`, `01-...md`, `02-...md` dưới thư mục `plan/<feature>/` hoặc cập nhật trực tiếp `implementation_plan.md` ở thư mục gốc của artifact.
    *   Mỗi lát cắt kế hoạch (slice) phải được xác thực độc lập.
    *   **Tạo/Cập nhật checklist tiến độ vật lý**: Bắt buộc tạo tệp `task.md` (nằm trong thư mục artifact hoặc cấu hình tương ứng) để theo dõi các deliverables thực tế. Cập nhật tiến độ `[ ]` -> `[/]` -> `[x]` ngay khi hoàn thành từng phần việc. Bản checklist này phải phân rã cực kỳ chi tiết, đi sâu vào từng component của từng module để đảm bảo không bị bỏ sót bất kỳ yêu cầu nhỏ nào.
    *   Tài liệu kế hoạch bắt buộc chứa: Goal, Scope, Risk, Acceptance, Verification, Regression Map, và Evidence.
    *   **Trạng thái task trong kế hoạch:** `todo` | `doing` | `done` | `blocked` | `obsolete`. Chỉ chuyển sang `done` khi đã verify pass.
*   **Prompt Match-Back Verification Gate (Cổng đối chiếu ngược Prompt - BẮT BUỘC TRƯỚC KHI BÁO PASS):**
    *   Trước khi kết thúc turn hoặc đánh dấu `PASS`, Agent bắt buộc phải chạy một chu kỳ đối chiếu (Match Back Cycle), đọc lại toàn bộ prompt yêu cầu ban đầu (và chat log đính kèm) dòng-bằng-dòng.
    *   Tạo bảng đối chiếu chéo (Cross-verification Table) liệt kê tất cả các mệnh đề của người dùng với link file code thực tế đã thay đổi và ảnh chụp màn hình kiểm chứng.
    *   Nếu phát hiện bất kỳ mệnh đề nào bị bỏ sót hoặc làm lệch template, bắt buộc phải hạ trạng thái thành `PARTIAL` hoặc `BLOCKED` và tiếp tục sửa, cấm được báo cáo `PASS`.

---

## 3. Tư duy sâu (Deep Reasoning)

*   **Kích hoạt khi:** Task MEDIUM/HIGH Risk, tái cấu trúc lớn (major refactoring), debug lỗi logic nghiêm trọng, hoặc tác động đa module.
*   **Quy trình thực hiện:**
    1.  Truy vết call-sites (sử dụng lệnh `rg` hoặc công cụ tìm kiếm) trước khi chỉnh sửa bất kỳ code dùng chung (shared code) nào để đánh giá vùng ảnh hưởng (blast radius).
    2.  Phân tích dòng chảy dữ liệu (Data Flow): Input $\rightarrow$ Transform $\rightarrow$ Output.
    3.  Chỉ so sánh các phương án kiến trúc khi gặp task HIGH Risk hoặc thay đổi kiến trúc lớn. Với task trung bình, chọn một hướng tối ưu nhất và giải thích ngắn gọn lý do.
    4.  **Tự phản biện (Self-criticism):** Đánh giá rủi ro ảnh hưởng downstream, lỗ hổng phân quyền (permission hole), và cân nhắc phương án đơn giản hơn.

---

## 4. Thực thi (Execution)

*   **Quy trình từng bước:**
    1.  Đọc `AGENTS.md` và các kế hoạch đang active.
    2.  Kiểm tra chéo rules (Cross-check) trước khi can thiệp vào Database, Auth, hoặc UI.
    3.  Cập nhật trạng thái kế hoạch sang `doing` $\rightarrow$ triển khai code $\rightarrow$ tự verify $\rightarrow$ cập nhật trạng thái sang `done` hoặc `blocked`.
    4.  Nếu verify fail: Phân loại lỗi (lỗi code, lỗi môi trường env, hay lỗi kế hoạch) trước khi sửa tiếp để tránh sửa mù.
    5.  **Giới hạn thử lại (Retry limit):** Với task LOW/MEDIUM thử tối đa 3 lần; với task HIGH thử tối đa 1 lần, nếu vẫn fail thì dừng lại và hỏi người dùng.
*   **Điểm dừng khẩn cấp (Hard Stops):** Dừng lại ngay lập tức và hỏi ý kiến nếu phát hiện cấu trúc kế hoạch không còn đúng, diff thực tế vượt quá 150% dự tính, gặp red flag về bảo mật, lệnh có tính phá hủy dữ liệu lớn, hoặc phát hiện rủi ro về phân quyền/database schema.

---

## 5. Nguyên nhân gốc rễ & Xác thực (Root Cause & Verification)

*   Đạt độ tin cậy $\ge 90\%$ dựa trên bằng chứng trực tiếp (Direct Evidence) trước khi đưa ra kết luận lỗi.
*   Tự chạy verify trên terminal, test suite, DB query, hoặc browser automation khi có quyền hạn.
*   Phân biệt rõ ràng giữa Fact (sự thật hiển thị trên đĩa), Inference (suy luận logic) và Unknown (chưa rõ, cần xác minh).
*   **Evidence-backed Claim Gate:** Mọi câu khẳng định kiểu "đã restore", "đã sync", "đã deploy", "đã test production", "đã nối dữ liệu", "đã đúng template" phải có bằng chứng trực tiếp: diff, command output, schema query, screenshot, route/browser result, deploy/commit id, hoặc test log. Không có bằng chứng thì chỉ được nói "cần làm", "dự kiến", hoặc "chưa verify".
*   **Quy trình xử lý:** Đọc code $\rightarrow$ vẽ call path $\rightarrow$ tái hiện lỗi (reproduce) $\rightarrow$ viết test case $\rightarrow$ kiểm tra UI/browser $\rightarrow$ verify lại sau khi sửa.

---

## 6. Cổng kiểm soát chất lượng (Quality Gates)

*   **Nguyên tắc:** Xác thực hành vi thực tế của code chứ không chỉ dừng ở việc build/compile thành công.
*   **Quy trình xác thực thông minh (Smart Verification):**
    1.  Đọc sơ đồ ánh xạ (mapping/index) trước.
    2.  Xác định các thành phần bị ảnh hưởng (module, vai trò user, DB, UI, chức năng export, và dòng chảy dữ liệu).
    3.  Thiết lập ma trận kiểm thử (Verification Matrix) phù hợp.

### Ma trận kiểm thử (Verification Matrix)

| Thành phần kiểm tra | Cổng kiểm soát chất lượng (Quality Gate) |
|---|---|
| Build | lint, typecheck, production build |
| Unit/Integration | Logic xử lý, validator, kiểm tra phân quyền |
| Browser/UI | Luồng click (click flow), responsive, tràn khung (overflow) |
| CRUD | Kiểm tra tạo/đọc/sửa/xóa dữ liệu thực tế |
| Database | So sánh query trước và sau khi can thiệp, trigger, RLS rules |
| Permission | Kiểm thử với nhiều vai trò account khác nhau (không chỉ dùng admin) |
| Cross-module | Kiểm tra đồng bộ dữ liệu tới các module downstream |
| Export | Kiểm tra tải file, định dạng format, độ chính xác nội dung |
| Filter/Toolbar | Kiểm tra bộ lọc bulk, chip search so với kết quả trả về thực tế |

*   **Permission Gate:** Truy vết quyền hạn từ spec $\rightarrow$ code $\rightarrow$ API $\rightarrow$ DB. Test thử truy cập hợp lệ và truy cập bị từ chối trên từng Role.
*   **Production Gate:** Đảm bảo cấu hình đúng URL, sử dụng build production mới nhất, chạy thử trên data an toàn, không làm hỏng data thật.
*   **Browser Verification Gate:** Với UI/web/admin/public/frontend/production work, build hoặc unit test không đủ để báo PASS. Bắt buộc có browser click-through hoặc screenshot evidence phù hợp rủi ro. Nếu browser tool/runtime chưa bật và không tự bật được, báo `BLOCKED` với đúng một blocker yêu cầu người dùng bật browser; không được thay bằng suy luận mắt thường.

---

## 7. Nguyên tắc Giao tiếp & Thực thi Chất lượng (Communication & Quality Alignment)

Áp dụng cho mọi yêu cầu (bao gồm cả prompt dài phức tạp và yêu cầu bình thường):

*   **Bám sát yêu cầu tuyệt đối**: Phải thực hiện đầy đủ, nghiêm túc từng bước theo yêu cầu của người dùng. CẤM tự ý lược bỏ, gộp bước hoặc thay đổi thứ tự thực hiện mà không bàn luận trước.
*   **Chống nghe lời mù quáng & Phân tích toàn cục (Anti-Blind Compliance & Global Analysis)**: Cấm thực thi máy móc hoặc chắp vá cục bộ các thay đổi dựa trên gợi ý của người dùng mà bỏ qua việc rà soát cấu trúc hệ thống. Trước khi thêm/sửa bất kỳ quy tắc, cấu hình hay logic nào, bắt buộc phải quét toàn bộ codebase (`grep`, `find`) để tìm vị trí tối ưu và kiểm tra tính trùng lặp. Nếu phát hiện giải pháp tốt hơn hoặc vị trí phù hợp hơn, phải chủ động đề xuất thay đổi thay vì làm theo một cách mù quáng.
*   **Giao tiếp trực diện & Không lòng vòng (Direct & Action-Oriented)**:

    - **Không chào hỏi, xã giao, dông dài**: Bắt đầu câu trả lời bằng câu hỏi, vấn đề, hoặc giải pháp chính ngay lập tức. CẤM mở đầu bằng các câu chào, cảm ơn, tóm tắt lại đề bài của người dùng hay giới thiệu thừa thãi.
    - **Tập trung vào giải pháp**: Khi trả lời hoặc đề xuất, đi thẳng vào cấu trúc: *Nguyên nhân là gì? Sửa ở đâu? Sửa như thế nào?* kèm code/lệnh cụ thể. Tránh giải thích dài dòng về mặt lý thuyết trừ khi được yêu cầu rõ ràng.
    - **Quy tắc 3-Không (3-NOs Rule)**:
      1. *Không giải thích ngụy biện* khi có lỗi (thừa nhận nhanh, sửa chữa triệt để ngay).
      2. *Không lặp lại thông tin hiển nhiên* hoặc thông tin đã có trong ngữ cảnh.
      3. *Không đặt câu hỏi mở* mà không có đề xuất phương án giải quyết kèm theo.
*   **Đề xuất phương án chất lượng khi thảo luận**: Khi cần hỏi hoặc bàn luận về một vấn đề chưa rõ ràng/lựa chọn kiến trúc:
    1.  **Liệt kê rõ ràng các phương án (Options)** phù hợp với các ý đồ thiết kế khác nhau.
    2.  **Khuyến nghị phương án tối ưu (Recommend)**: Nêu rõ phương án được khuyến nghị lựa chọn và lý do tại sao.
    3.  **Đánh giá trade-offs (Đánh đổi)**: Phân tích cụ thể ưu và nhược điểm (ưu thế, rủi ro, nợ kỹ thuật, thời gian thực hiện...) của từng phương án để người dùng dễ dàng cân nhắc và đưa ra quyết định.
*   **Chỉ hỏi khi cần thiết**: Không hỏi lan man hoặc đặt câu hỏi thừa cho các yêu cầu đã rõ ràng. Chỉ đặt câu hỏi khi gặp điểm thực sự chưa rõ, mâu thuẫn hoặc thiếu thông tin quan trọng ảnh hưởng trực tiếp đến kết quả.
*   **Thực thi đàng hoàng cho mọi task**: Đối xử với mọi task (dù là LOW hay MEDIUM/HIGH, dù prompt ngắn hay dài) một cách cẩn trọng và chuẩn mực. Luôn kiểm tra tính đúng đắn và verify kỹ càng trước khi báo cáo kết quả.

---

## 8. Kỷ luật giao tiếp, Lập Plan & Quản lý Context (Chống bỏ sót mệnh đề)

*   **Context Evolution Gate**: Khi task là sửa/audit/promote/deduplicate context, rules, skills, workflows, AGENTS hoặc project `.md`, phải chuyển sang quy trình của [03-context-and-tools.md](03-context-and-tools.md) và skill `context-evolution-protocol`. SOP này chỉ giữ hành vi giao tiếp/plan; chi tiết phân tầng tri thức thuộc file context/tools và mutation gate.
*   **Nguyên lý Nguồn gốc Nghiệp vụ (Business Derivation Principle - CẤM TỰ CHẾ MODULE MỒ CÔI)**: Cấm tự tạo ra các module, trường dữ liệu, hoặc luồng nghiệp vụ không có trong template hoặc spec. Khi xây dựng bất kỳ tính năng nào, Agent bắt buộc phải tự hỏi: *"Tính năng này kế thừa dữ liệu từ đâu và phục vụ cho luồng nghiệp vụ/báo cáo nào của hệ thống?"*. Bắt buộc đối chiếu 1-1 với cấu trúc logic của template gốc để map chính xác, cấm tự chế hoặc suy diễn sai lệch.
*   **CẤM bỏ sót mệnh đề trong prompt dài**: Trước khi phản hồi bất kỳ prompt nào của người dùng, Agent phải quét toàn bộ văn bản để biên dịch thành một danh sách các yêu cầu cụ thể (Requirement Graph). Mọi yêu cầu đều phải được rà soát và phản hồi đầy đủ, không được tự ý bỏ qua các ý nhỏ.
*   **Báo cáo theo thứ tự và phân mục**: Mọi báo cáo tiến độ, giải trình kỹ thuật hoặc phân tích lỗi bắt buộc phải được trình bày theo dạng danh sách đánh số, phân chia thành các đề mục rõ ràng trùng khớp với thứ tự các yêu cầu của người dùng để dễ theo dõi và đối chiếu.
*   **Cập nhật Plan lập tức (Real-time Plan Update)**: Trong quá trình nói chuyện và bàn luận, bất kỳ khi nào người dùng làm rõ một yêu cầu, thay đổi thiết kế hoặc chốt phương án mới, Agent phải **cập nhật ngay lập tức** các nội dung này vào tệp `implementation_plan.md` trong thư mục artifact hiện hành (ví dụ: `<artifact>/implementation_plan.md`) ngay trong lượt gọi đó. Nghiêm cấm việc thảo luận suông mà quên cập nhật vào bản kế hoạch chính thức.

