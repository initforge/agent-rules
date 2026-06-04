# Delivery Và Quality Gates

## Code và thư mục

- Code sạch, dùng lại tốt, dễ mở rộng.
- Cấu trúc thư mục chia theo chức năng/domain, ví dụ Hệ thống, Nhân sự.
- Cây thư mục và file trong từng module ưu tiên tham khảo app template.
- Không refactor rộng nếu không cần để hoàn thành spec.

## Kiểm Thử Và Xác Minh (Quy Tắc Cứng)

Trước khi báo hoàn thành nhiệm vụ:

1. **Kiểm Thử Biên Dịch (Pre-flight Build Check)**:
   - Trước khi commit bất kỳ thay đổi nào liên quan đến code hoặc config (như `vite.config.ts`, `tsconfig.json`, hook React), bắt buộc phải chạy thử build production ở local (`npm run build` hoặc lệnh tương tự) để kiểm tra lỗi cú pháp và thiếu import (ví dụ: thiếu import hook React `useCallback`, `useMemo` từ `'react'`).

2. **Xác Thực Thực Tế Trên Production (Verify-on-Production)**:
   - Môi trường phát triển local có thể tự vá hoặc bỏ qua một số lỗi biên dịch/runtime đặc thù. Tất cả các sửa đổi UI, chức năng, hoặc sửa lỗi bắt buộc phải được kiểm tra chạy thử trực tiếp trên môi trường production/live thực tế (ví dụ: `https://tah-app.vercel.app`).
   - Smoke test tối thiểu phải thực hiện trên production đối với các tính năng CRUD đã thay đổi.

3. **Kiểm Tra Giao Diện & Tìm Kiếm**:
   - Đối chiếu chặt chẽ với các thành phần mẫu trong template trước khi chỉnh sửa.
   - Kiểm tra hiển thị responsive (desktop list view, mobile card view), form validation, và các drawer detail.
   - Kiểm tra search box tìm kiếm được cả trường trực tiếp lẫn trường liên kết.
   - **Cấm lồng ghép class `h-page`**: Không bao giờ được dùng class `.h-page` ở các component con hoặc trang con nhúng (như `TransportModulePage`). Việc lồng ghép nhiều thẻ mang class `h-page` khi có `TabGroup` hoặc tiêu đề đẩy ở trên sẽ kéo giãn chiều cao vượt quá viewport, đẩy chân trang (Table footer, pagination, tổng số dòng) bị ẩn mất xuống dưới màn hình. Trang con nhúng bắt buộc dùng `h-full min-h-0` để co giãn chính xác theo không gian còn lại của flex parent.

4. **Kiểm Tra Quy Chuẩn Xuất File Excel (Excel Export Verification)**:
   - Khi kiểm thử chức năng xuất Excel (Export), bắt buộc phải tải file `.xlsx` về máy và mở kiểm tra trực tiếp:
     - **Kiểu dữ liệu (Cell Type 'n')**: Các cột chứa số liệu (như Tiền lương, Chi phí, Số chuyến...) bắt buộc phải được xuất dưới dạng Number thực tế để có thể tính toán (`=SUM()`, `=AVERAGE()`), không được để kiểu String/Text (gây ra cảnh báo tam giác xanh lá "Number stored as text").
     - **Định dạng hiển thị (Number Format)**: Phải hiển thị phân tách phần nghìn rõ ràng (`#,##0`), căn lề phải cho cột số, căn lề giữa cho ngày tháng/trạng thái/biển số, và căn lề trái cho text thường.
     - **Màu sắc và Layout**: Header màu xanh dương đậm thương hiệu (`#1E3A8A`) chữ trắng đậm Segoe UI, có viền mỏng bao quanh và màu nền dòng xen kẽ nhẹ nhàng để tăng độ tương phản.

5. **Kiểm Tra Quy Chuẩn Xuất File PDF (PDF Export Verification)**:
    - Khi kiểm thử chức năng xuất PDF (Export PDF), bắt buộc phải tải/mở trực tiếp file PDF được sinh ra để kiểm duyệt:
      - **Hỗ trợ Tiếng Việt (Unicode Support)**: Tuyệt đối không dùng các font mặc định của jsPDF (như Helvetica, Times, Courier) vì các font này không hỗ trợ bảng mã Unicode tiếng Việt, dẫn đến vỡ font/hiển thị ký tự lạ (mojibake).
      - **Đăng ký Font Chữ**: Phải fetch các tệp font TrueType hỗ trợ tiếng Việt (như `Roboto-Regular.ttf` và `Roboto-Medium.ttf` từ CDN uy tín như cdnjs), chuyển đổi thành base64 thông qua ArrayBuffer, và đăng ký với jsPDF bằng `doc.addFileToVFS` và `doc.addFont`.
      - **Áp dụng Font**: Đảm bảo tất cả các văn bản vẽ bằng `doc.text` và bảng vẽ bằng `autoTable` đều chỉ định sử dụng font đã đăng ký (ví dụ: `font: 'Roboto'`).


## Tối ưu cuối dự án

Khi làm xong dự án hoặc gần bàn giao, luôn nhắc/tạo plan:

```text
Lên kế hoạch tối ưu để tránh làm quá tải Supabase Egress và Vercel Edge Function. Tham khảo tài liệu gốc của Supabase và Vercel trước khi chốt.
```

Vì tài liệu nền tảng có thể thay đổi, khi làm bước này phải tra tài liệu chính thức mới nhất.

## Vercel và npm install

- Clean install trên CI/Vercel phải chạy được bằng npm bình thường, không dùng `--force` hoặc `--legacy-peer-deps` để né lỗi peer dependency.
- Trước khi nâng major version of toolchain build/lint như ESLint, Vite, TypeScript, React plugin, phải kiểm tra peer dependency của các plugin chính.
- Với cấu hình hiện tại, giữ `eslint` và `@eslint/js` ở major 9 cho tới khi `eslint-plugin-jsx-a11y` hỗ trợ ESLint 10.
- Build/deploy log không dùng `npm audit` làm gate cài đặt dependency; audit bảo mật là backlog/gate riêng để xử lý có kiểm soát.

## 6. Bài Học Và Kỷ Luật Phát Triển Hệ Thống (Lessons Learned)

- **Chống Tư Duy Sửa Lỗi Hời Hợt (Anti-Superficial Bug Fixing & Audit Everything)**:
  - *Bản chất sai lầm*: Khi fix bug, chỉ nhìn nhận bề nổi của lỗi (ví dụ: chỉ sửa logic UI hoặc chỉ đổi khóa ngoại DB) mà không audit toàn diện các luồng liên đới, dẫn đến lỗi dây chuyền (như cascade delete ở DB kích hoạt trigger gây ra lỗi khóa ngoại mới do insert vào bảng liên quan, hoặc dùng các phương thức bất đồng bộ làm mất user gesture của trình duyệt làm sập tính năng tải file).
  - *Kỷ luật bắt buộc (1 Phát Ăn Luôn)*: Khi sửa bất kỳ lỗi nào, phải thực hiện phân tích tĩnh (static analysis) và trace toàn bộ luồng thực thi:
    - Nếu thay đổi DB schema (khóa ngoại, cascade): Phải rà soát tất cả các database triggers (`AFTER/BEFORE INSERT/UPDATE/DELETE`) trên các bảng bị ảnh hưởng để đảm bảo trigger không thực hiện insert/update các bản ghi vừa bị xóa, gây vi phạm khóa ngoại.
    - Phải đặt kiểm tra phòng vệ trong trigger (ví dụ: `if not exists (select 1 from public.var_nhan_vien where id = v_id) then return null; end if;`) nếu trigger thực hiện đồng bộ hoặc tính toán tổng hợp.
    - Nếu sửa đổi cơ chế giao tiếp trình duyệt (tải file, APIs): Phải đảm bảo không phá vỡ cơ chế kích hoạt đồng bộ của người dùng (user activation gesture). Tuyệt đối cấm sử dụng các phương thức bất đồng bộ trung gian (như FileReader onload) nằm ngoài tầm kiểm soát của gesture trước lệnh download để tránh bị trình duyệt chặn hoàn toàn.
    - Tuyệt đối không được vội vàng kết luận lỗi đã được sửa khi chưa audit và kiểm tra kỹ lưỡng toàn bộ chuỗi tác động.
- **Kỷ Luật Cấm Deploy Thủ Công Trên Production (No Manual Terminal Deployment Rule)**:
  - *Bản chất quy tắc*: Hệ thống của 5fedu tuân theo cơ chế tích hợp liên tục (CI/CD) thông qua kết nối Git tự động (Vercel Git Integration) hoặc do lập trình viên/owner trực tiếp kiểm soát việc phát hành. Việc tự ý chạy lệnh deploy trực tiếp từ terminal (như `vercel --prod` hay tương đương) từ phía AI có thể gây xung đột trạng thái build, ghi đè không mong muốn các bản phân phối ổn định, hoặc lộ bí mật môi trường.
  - *Quy tắc cứng*: AI tuyệt đối không bao giờ được tự chạy lệnh deploy ứng dụng lên production thông qua terminal. AI chỉ thực hiện sửa code, kiểm thử local để đảm bảo chất lượng, commit và push mã nguồn lên repository và báo cáo kết quả để hệ thống CI/CD tự động xử lý hoặc người dùng kiểm tra độc lập.

Từ feedback của chủ dự án về việc sửa đổi Auth và gộp bảng Vận tải, bắt buộc tuân thủ các kỷ luật sau:

1. **Khóa Ngoại Khi Hợp Nhất Bảng (Database Consolidations)**:
   - Khi di chuyển dữ liệu từ một bảng cũ sang bảng mới (ví dụ: gộp tài xế vào bảng nhân viên), bắt buộc phải **drop khóa ngoại cũ** và **create khóa ngoại mới** ở tất cả các bảng tham chiếu (như chuyến xe, bảng lương).
   - Khi chạy lệnh SQL di chuyển dữ liệu, phải đảm bảo các giá trị khóa tự tăng và các cột ràng buộc `NOT NULL` (ví dụ: `ten_dang_nhap`) được điền đầy đủ và đúng quy trình để tránh lỗi di chuyển nửa chừng (silent migration failure).

2. **Cảnh Giác Với Code Mock Auth/Session**:
   - Khi phát triển các tính năng bảo mật cốt lõi (Đổi mật khẩu, Đăng xuất, Phân quyền), không được chủ quan tin vào giao diện mẫu. Bắt buộc phải rà soát mã nguồn xem các action đó có đang chạy `mock setTimeout/toast` hay không. Phải thay thế bằng API thực tế (`AuthService.updatePassword`, `AuthService.signOut`) để tránh trường hợp đổi mật khẩu ảo ở client nhưng server vẫn nhận mật khẩu cũ.

3. **Bảo Đảm Nhất Quán Số Liệu Tự Tính (Database-level Roll-ups)**:
    - Các trường tổng hợp tự tính (như tổng tiền chuyến, tổng lương, tổng chuyến) hiển thị trên UI có thể được tính toán động tại client, nhưng trong Database vẫn phải nhất quán. Bắt buộc phải viết **PostgreSQL Trigger** (sau các lệnh `INSERT/UPDATE/DELETE` ở bảng con) để tự động tính toán và lưu trữ chính xác số liệu tổng hợp lên bảng cha và bảng liên đới (bảng lương), giúp dữ liệu luôn đồng bộ khi xuất file hoặc chạy API bên ngoài.

4. **Kỷ Luật Đồng Bộ Quy Tắc Phân Cấp (Tree Parity Discipline)**:
    - Tuyệt đối không tự tiện thay đổi cấu trúc dữ liệu trả về hoặc cách dựng cây của template gốc. Mọi sự thay đổi khiến nút con biến mất khỏi cây cha hoặc mất cấp độ hiển thị (Level) đều bị coi là lỗi nghiêm trọng. Phải thực hiện kiểm thử trên dữ liệu thực tế ít nhất 2 cấp độ phân cấp trước khi bàn giao.

5. **Chuẩn Hóa Giao Diện Danh Sách & Thao Tác (ListView & Actions Standardization)**:
    - **Xóa Header Dư Thừa**: Tuyệt đối không tự vẽ khối Page Header (tiêu đề, mô tả, icon lớn) bên trong panel nội dung của các trang nghiệp vụ/phân hệ. Phải nhường vai trò hiển thị này cho hệ thống Breadcrumbs và Layout bao quát chung để giao diện luôn sạch sẽ, thống nhất.
    - **Chuyển Lọc Thô Sang Combobox Group**: Khi phát triển bộ lọc trên toolbar, không dùng select thô. Bắt buộc tích hợp `FilterChipMultiSelect` và `ToolbarFilterChipGroup` để hỗ trợ lọc động nhiều giá trị cùng lúc, đi kèm bộ đếm Badge và nút reset bộ lọc.
    - **Bảo Vệ Hành Động Phá Hủy (Destructive Actions)**: Các nút thao tác có tính phá hủy dữ liệu (Xóa) hoặc các nút chuyển đổi trạng thái nghiệp vụ (Duyệt) không được để hiển thị lộ thiên trên dòng dữ liệu hoặc chân Mobile Card. Nút Sửa được để dạng icon button primary ngoài bảng, còn các nút Xóa (destructive), Duyệt phải được đưa vào dropdown menu ẩn (`DataTableRowActions`).
    - **Cảnh giác lỗi Temporal Dead Zone (TDZ) trên Production**: Khi khai báo các biến hoặc hàm callback (như `const askApprove = ...`), tuyệt đối không được tham chiếu chúng trong các hooks hoặc mảng dependency của `useMemo`/`useCallback` đặt ở phía trước chúng trong file. Cần gom các hàm handlers và mutations lên phần đầu component (ngay sau trạng thái state) để đảm bảo thứ tự khởi tạo hợp lệ.
    - **Kiểm Soát Import Và Biến Thừa**: Tránh sử dụng trực tiếp các component hoặc icon (ví dụ: `<Power />`) mà không import chúng ở đầu file. Browser có thể hiểu nhầm đó là một đối tượng toàn cục (global object trong DOM) lúc biên dịch, nhưng sẽ crash runtime (`ReferenceError: Cannot access 'X' before initialization`) trên Production. Luôn chạy `npm run build` cục bộ và rà soát kỹ log để phát hiện sớm.
    - **Kỷ Luật Vận Hành React Hooks & Tránh Race Condition Thống Kê**:
      - *Không gọi hook có điều kiện/trả về sớm*: Tuyệt đối không viết các khối lệnh kiểm tra điều kiện và trả về JSX sớm (như `if (isLoading) return ...`) ở phía trên các khai báo React Hook khác (như `useMemo`, `useCallback`, `useEffect`). Quy tắc React Hooks bắt buộc số lượng và thứ tự hook phải nhất quán trên mỗi lượt render. Toàn bộ các hook bắt buộc phải được khai báo ở đầu component, và các lệnh kiểm tra điều kiện trả về UI thay thế phải nằm ở cuối cùng của component, ngay trước khối `return` chính.
      - *Chặn hiển thị không đồng bộ (UI Flashing)*: Khi một trang tính toán thống kê phụ thuộc vào nhiều nguồn dữ liệu tải song song (như dữ liệu chi tiết và các bảng tra cứu danh mục lookups), phải trì hoãn hiển thị dữ liệu tổng hợp (KPI cards, charts) cho đến khi cả dữ liệu chi tiết và danh mục lookups đã hoàn thành tải (`isLoading = false`). Tránh hiển thị dữ liệu thô bị thiếu trường dẫn đến lọc sai (hiển thị dữ liệu cũ trong tích tắc rồi nhảy về 0).

## 7. Quy Tắc Đồng Bộ Và Xác Thực Phân Cấp Dữ Liệu (Hierarchy & Nested Trees Quality Gates)

1. **Chuẩn Hóa ID & Khoá Ngoại trong Tree**:
   - Khi làm việc với dữ liệu phân cấp (Cha-Con) trong Database sử dụng ID dạng `int8` (Supabase trả về kiểu số), tất cả các hàm normalizer hoặc service layer bắt buộc phải chuyển đổi (coerce) cả `id` và khoá ngoại trỏ tới cha (ví dụ: `id_phong_ban_quan_ly` hay `cha_id`) sang kiểu chuỗi (`string`) thông qua `String(val)` trước khi xây dựng cây phân cấp (Tree-building/Tree-flattening).
   - Điều này tránh hoàn toàn lỗi lệch kiểu khi so sánh (như `"4" === 4` trả về `false`), dẫn đến các nút con bị coi là mồ côi (orphans) và hiển thị sai lệch ở Level 1 (không thụt lề, mất badge).

2. **Dựng Cây Đệ Quy và Động (Dynamic Tree Traversal)**:
   - Đối với các bảng không lưu cứng trường `cap_do` (Level) và `duong_dan` (Path) trong database (ví dụ: `var_phong_ban`), service layer bắt buộc phải tính toán động các thuộc tính này qua thuật toán duyệt đệ quy (recursive traversal) trên toàn bộ danh sách gốc.
   - Hàm đệ quy phải đảm bảo cập nhật đầy đủ thông tin: `cap_do` cha + 1, và nối dài `duong_dan` dạng `/id_cha/id_con` để phục vụ việc sắp xếp thứ tự hiển thị và độ thụt lề UI.

3. **Xác Thực Hiển Thị và Tìm Kiếm Phân Cấp**:
   - Khi kiểm thử trên production, bắt buộc phải tạo/sửa một bản ghi con, gắn cha cho nó, và kiểm tra trực tiếp:
     - Nút con phải có độ thụt lề UI tương ứng (ví dụ: 32px cho Level 2).
     - Phải có biểu tượng mũi tên phụ thuộc `↳` đứng trước tên phòng ban con.
     - Nhãn/Badge phân cấp phải hiển thị đúng màu và đúng số cấp độ (`Level 2`).
   - Phải kiểm tra hành vi Tìm kiếm/Lọc (Search/Filter): Đảm bảo khi tìm kiếm từ khoá của nút con (ví dụ: `BP Lái xe`), nút con vẫn giữ nguyên thuộc tính hiển thị (thụt lề, badge Level 2) ngay cả khi nút cha của nó bị lọc ẩn khỏi danh sách.

4. **Khắc phục Lệch tên trường dữ liệu (Field Mismatch Resolution)**:
   - Cần cảnh giác với sự khác biệt giữa tên cột vật lý trong Database Schema (ví dụ: `tt` đại diện cho thứ tự, `id_phong_ban_quan_ly` đại diện cho cha) và tên thuộc tính mô hình Frontend Model (ví dụ: `thu_tu`, `cha_id`).
   - Mọi hàm normalizer hoặc map dữ liệu từ DB lên client bắt buộc phải thực hiện mapping rõ ràng và đầy đủ (ví dụ: `thu_tu: row.thu_tu ?? (row as any).tt ?? 0`). Tuyệt đối không để xảy ra tình trạng mất dữ liệu thuộc tính khiến UI nhận giá trị rỗng/mặc định (như hiển thị toàn bộ cột thứ tự bằng `0`), gây lỗi logic sắp xếp và làm hỏng giao diện nghiệp vụ.

5. **Đồng bộ Dữ liệu Drawer Chi Tiết (Detail Drawer State Synchronization)**:
   - **Bài học rủi ro**: Khi hiển thị chi tiết của một dòng thông qua drawer (ví dụ: `viewingRow`), nếu dùng trực tiếp state thô của dòng được truyền vào lúc click, drawer sẽ không cập nhật khi dữ liệu thay đổi trên server (như khi nhấn "Duyệt chuyến" hoặc thay đổi trạng thái của dòng). Kể cả khi danh sách cha đã được refetch qua React Query, drawer vẫn hiển thị dữ liệu tĩnh cũ.
   - **Quy tắc sửa đổi**: Tuyệt đối không truyền trực tiếp state thô `row={viewingRow}` vào component drawer. Phải luôn sử dụng `useMemo` để tìm dòng tương ứng mới nhất từ danh sách đang cache trong React Query (ví dụ: `const currentViewingRow = useMemo(() => rows.find(r => String(r.id) === String(viewingRow.id)) || viewingRow, [viewingRow, rows]);`), rồi truyền `currentViewingRow` vào drawer. Cách này giúp drawer tự động hiển thị dữ liệu mới nhất (trạng thái "Đã duyệt", các trường tổng tiền tự động tính từ dòng con) ngay sau khi mutations thành công và invalidate query.

6. **Chuẩn Hóa Tiện Ích Tải File Từ Data URIs (Data URI Download Normalization)**:
   - **Bài học rủi ro**: Khi xuất file Excel/PDF từ phía Client dưới dạng `data:` URI, trình duyệt Chrome có thể bỏ qua tên file/extension do chính sách bảo mật sandbox và tải file về dưới tên UUID không định dạng. Để giải quyết, tiện ích `triggerFileDownload` phải chuyển đổi `data:` URI thành Blob URL bằng `URL.createObjectURL`. Tuy nhiên, nếu base64 trong data URI bị URL-encode (ví dụ: chứa `%3D` thay cho `=`, `%2B` cho `+`), hàm `window.atob()` giải mã base64 sẽ quăng lỗi cú pháp, làm sập try-catch và fallback về link `data:` URI gốc, tái diễn lỗi tải file UUID.
   - **Quy tắc sửa đổi**: Trong hàm giải mã base64 của `triggerFileDownload`, bắt buộc phải gọi `decodeURIComponent(rawData)` để chuẩn hóa chuỗi base64 trước khi gọi `window.atob`. Điều này đảm bảo Blob URL luôn được sinh ra thành công đối với tất cả các link Excel/PDF/CSV, giữ nguyên tên file xuất bản.


## 8. Kiểm Tra Đối Chiếu Phân Quyền Bắt Buộc (Permission Cross-Reference Gate — QUY TẮC CỨNG)

**Bài học gốc**: Conversation trước đã triển khai row-level filtering bằng cách gọi `employeeRecord` từ store, nhưng store chưa bao giờ được hydrate trường này. Kết quả: tài khoản cấp 2/3/4 đăng nhập thấy bảng trống hoàn toàn. AI không tự phát hiện ra lỗi mà phải đợi owner gửi prompt thô nhắc lại quy tắc phân quyền.

**Quy tắc cứng — AI phải tự thực hiện mỗi khi đụng vào code liên quan đến phân quyền, auth, role, cấp bậc, hoặc row-level filtering:**

1. **Đối chiếu Context → Code (Spec-to-Code Trace)**:
   - Mở và đọc lại `04-auth-permissions-and-flows.md` và `02-database-and-auth-rules.md`.
   - Với MỖI quy tắc phân quyền trong context (xem/thêm/sửa/xóa theo `cap_bac`, `phong_id`, `id_nguoi_tao`, `id_tai_xe`, trạng thái duyệt/khóa), phải tìm được dòng code tương ứng trong `lib/permissions.ts` thực hiện đúng logic đó.
   - Nếu không tìm thấy → báo lỗi thiếu triển khai, KHÔNG được bỏ qua.

2. **Đối chiếu Code → Data Flow (Implementation-to-Runtime Trace)**:
   - Với mỗi biến/trường mà `lib/permissions.ts` sử dụng (như `capBac`, `employeeRecord`, `id_phong_ban`, `grantsByModule`), phải trace ngược lên xác nhận:
     - Biến đó được lưu ở đâu (store nào)?
     - Được hydrate/populate khi nào (hook nào, API nào)?
     - Có trường hợp nào biến đó bị `undefined`/`null` không?
   - Nếu phát hiện biến chưa được populate → phải sửa ngay trong cùng PR, KHÔNG được để lại.

3. **Kiểm tra end-to-end cho MỖI cấp bậc**:
   - Sau khi code xong, phải kiểm thử (hoặc trace logic) cho ít nhất 3 kịch bản:
     - Admin (`cap_bac=1` hoặc `role='admin'`): xem/sửa/xóa tất cả.
     - Trưởng phòng (`cap_bac=2`): chỉ thấy dữ liệu cùng `id_phong_ban`, chỉ sửa/xóa khi chưa duyệt/khóa.
     - Nhân viên (`cap_bac≥3`): chỉ thấy dữ liệu liên quan đến mình (`id_nguoi_tao`, `id_tai_xe`, hoặc `id` chính mình).
   - Nếu chưa có tài khoản test cho một cấp bậc → phải tạo trước khi kiểm thử.

4. **Không được báo hoàn thành** task liên quan đến phân quyền nếu chưa thực hiện đủ 3 bước trên.



