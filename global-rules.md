# Bộ Nạp Runtime Chung

File này là điểm tương thích cho các project vẫn import:

```text
@P:\agent-rules\global-rules.md
```

Runtime Codex đang được bảo trì nằm tại:

```text
P:\agent-rules\codex
```

Đọc và tuân thủ các file sau:

```text
@P:\agent-rules\codex\rules\core.md
@P:\agent-rules\codex\rules\planning.md
@P:\agent-rules\codex\rules\execution.md
@P:\agent-rules\codex\rules\quality-gates.md
@P:\agent-rules\codex\rules\context-tools.md
@P:\agent-rules\codex\rules\tool-inventory.md
```

## Quy Tắc Ngôn Ngữ

- Trả lời bằng tiếng Việt có dấu đầy đủ theo mặc định.
- Không viết tiếng Việt không dấu, trừ khi người dùng yêu cầu rõ văn bản ASCII-only hoặc file đích đã có quy ước ASCII-only thật.
- Không dùng tiếng Anh nếu có cách nói tiếng Việt tự nhiên.
- Giữ tiếng Anh cho thuật ngữ kỹ thuật, tên model, lệnh, đường dẫn, API, package, schema key, tên tool, tên sản phẩm và mã nguồn.

## Quy Tắc Giao Diện (UI) & An Toàn Biên Dịch (Build Safety)

### 1. Quy Tắc Vận Hành Hệ Thống (Áp Dụng Cho Mọi Dự Án)

- **Kỷ luật Brainstorm & Khảo sát Ảnh hưởng Trước khi Code (Mandatory Pre-Implementation Audit)**:
  - *Luật bắt buộc*: Nghiêm cấm Agent nhảy vào sửa code ngay lập tức khi nhận yêu cầu mà chưa thực hiện phân tích luồng.
  - *Quy trình*: Trước khi thực hiện bất kỳ lệnh chỉnh sửa file hay cấu trúc nào, Agent **bắt buộc phải trình bày một bảng phân tích ảnh hưởng (Impact Table)** trong cuộc hội thoại:
    1. Liệt kê rõ các tệp tin đích sẽ chỉnh sửa.
    2. Chỉ ra các luồng nghiệp vụ liên quan hoặc tính năng chéo (cross-module) có thể bị tác động gián tiếp.
    3. Rà soát các ràng buộc khóa ngoại, trigger database hoặc kiểu dữ liệu chịu ảnh hưởng.
    4. Xác định các trường hợp biên (edge cases) cần phòng vệ.
    5. Đề xuất phương án thiết kế cụ thể và chỉ sửa code khi phương án đã rõ ràng.
- **Phân định rõ Ranh giới Global & Local Context (Context Boundary Rule)**:
  - *Luật bắt buộc*: Agent phải phân biệt rạch ròi giữa quy chuẩn ứng xử chung (Global) và logic nghiệp vụ đặc thù dự án (Local).
    - **Global (`global-rules.md`)**: Chỉ lưu trữ các nguyên tắc hành vi (behaviors), tri thức lập trình cốt lõi, an toàn build và tiêu chuẩn thiết kế chung. Nghiêm cấm nạp các logic nghiệp vụ cụ thể (như tên bảng DB, thứ tự cột đặc thù, mã ID, tên module key slug, hoặc phân quyền cụ thể) vào đây.
    - **Local (ví dụ: `.agents/5fedu/`)**: Là nơi lưu trữ toàn bộ các đặc tả nghiệp vụ, ma trận phân quyền chi tiết và cấu trúc dữ liệu của riêng dự án đó.
  - Mọi hành vi nhầm lẫn, làm loãng hoặc nhồi nhét logic dự án cục bộ lên tệp quy tắc toàn cầu là vi phạm kỷ luật cấu trúc nghiêm trọng.
- **Kỷ luật Biên dịch React & Code Hygiene (React Hooks, TDZ & Imports)**:
  - *Phòng vệ Temporal Dead Zone (TDZ)*: Khai báo tất cả các hàm handler (như `handleSave`, `handleSubmit`) ở đầu component (ngay sau state). Tuyệt đối cấm tham chiếu các handler này trong dependency array của các hooks `useMemo`/`useCallback` định nghĩa ở phía trước dòng định nghĩa handler.
  - *React Hooks trong Render*: Tất cả các hooks (`useMemo`, `useCallback`, `useEffect`) bắt buộc phải được khai báo ở đầu component. Tuyệt đối cấm gọi hooks có điều kiện (trong câu lệnh `if`) hoặc trả về sớm (JSX early return) ở phía trên các khai báo React Hook khác.
  - *Kiểm soát Import*: Bắt buộc import đầy đủ, rõ ràng tất cả các components, icons ở đầu file; không sử dụng tham chiếu ngầm định toàn cục gây lỗi ReferenceError lúc runtime.
- **Ngăn ngừa rò rỉ Credential**: Không bao giờ được hardcode tài khoản, mật khẩu test hoặc API tokens vào mã nguồn giao diện. Nếu cần ghi nhớ để tiện test, hãy dùng `localStorage` động hoặc đọc qua biến môi trường. *Ngoại lệ: Trừ trường hợp được người dùng chỉ định rõ ràng hoặc cung cấp trực tiếp cho mục đích phát triển/kiểm thử.*
- **Kỷ luật Sanitize Dữ liệu Trước Khi Ghi DB (Data Sanitization Before Write)**:
  - Tầng repository/service **bắt buộc** phải chuyển đổi chuỗi rỗng `""` thành `null` cho mọi cột kiểu số nguyên (`int`, `int8`, `float`) và cột khóa ngoại (key bắt đầu bằng `id_`) trước khi gửi lên database.
  - Các giá trị `undefined` phải được loại bỏ khỏi payload (xóa key) thay vì gửi lên.
  - Phòng vệ này phải được đặt ở **tầng thấp nhất** (Repository) chứ không phải chỉ ở tầng Form/UI, để đảm bảo mọi luồng ghi (insert, update, upsert) đều được bảo vệ đồng nhất.
- **Migration Phải Tự Chứa (Self-Contained Migration Rule)**:
  - Mọi file migration SQL tạo bảng mới **bắt buộc** phải bao gồm đầy đủ 4 thành phần trong cùng một file: `CREATE TABLE`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `CREATE POLICY ... FOR ALL TO authenticated USING (true) WITH CHECK (true)`, và `CREATE TRIGGER` cho cột audit tự cập nhật thời gian.
  - Nghiêm cấm phụ thuộc vào thao tác tay trên Dashboard (Supabase/Cloud Console) để bổ sung RLS, trigger hay index sau. Migration file phải là nguồn sự thật duy nhất (Single Source of Truth) cho schema.
- **Bản địa hóa Thông báo Lỗi Database (Error Message Localization)**:
  - Mọi lỗi trả về từ database/backend (PostgreSQL error, Supabase error) **bắt buộc phải được dịch** thành thông báo tiếng Việt thân thiện trước khi hiển thị lên toast/UI cho người dùng cuối.
  - Nghiêm cấm hiển thị thông báo lỗi kỹ thuật thô (như `violates row-level security policy`, `invalid input syntax for type bigint`) trực tiếp lên giao diện. Phải ánh xạ qua bộ từ điển lỗi hoặc hàm dịch lỗi chung.
- **Xác minh Schema Thực tế Trước Khi Phát triển (Schema Verification Before Development)**:
  - Trước khi phát triển hoặc sửa đổi tính năng liên quan đến database, Agent **bắt buộc phải truy vấn schema thực tế** trên môi trường production (ví dụ: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ten_bang'`) để xác nhận cấu trúc bảng hiện hành.
  - Nghiêm cấm suy đoán cấu trúc bảng từ tài liệu spec cũ, file migration cũ hoặc code cũ mà không đối chiếu với thực tế, vì schema có thể đã bị thay đổi trực tiếp trên Dashboard mà không cập nhật lại tài liệu.
- **Ẩn thông tin kỹ thuật thô**: Không hiển thị các tên bảng cơ sở dữ liệu thô (ví dụ: `vt_tai_xe`), ID thô hoặc các ký hiệu kỹ thuật trên tiêu đề, nhãn, Drawer của người dùng cuối. Hãy sử dụng ngôn ngữ tự nhiên đã bản địa hóa.
- **Đồng bộ Icon và Nhãn nút**: Đảm bảo các nút có cùng tính năng trên toàn hệ thống phải dùng đồng bộ một loại Icon (ví dụ: dùng thống nhất `Edit` thay vì trộn lẫn với `Pencil`, dùng thống nhất `Download` cho xuất báo cáo).
- **Kiểm thử biên dịch bắt buộc (Pre-flight Build Check)**: Trước khi commit bất kỳ thay đổi nào liên quan đến các file cấu hình dùng chung (như `vite.config.ts`, `tsconfig.json`, `package.json`), bắt buộc phải chạy thử lệnh build biên dịch (`npm run build` hoặc lệnh tương đương) tại local để đảm bảo không bị lỗi cú pháp làm hỏng pipeline CI/CD (như Vercel/GitHub Actions).
- **Tập trung vào môi trường Production chính thức (Production Environment Focus)**:
  - Khi phát triển và triển khai (deploy) hệ thống, chỉ kiểm thử và cấu hình trực tiếp trên domain chính thức của dự án (ví dụ: `https://tah-app.vercel.app`).
  - Tuyệt đối không tự ý deploy lên các tên miền phụ/nháp tự sinh của Vercel (như `tah-app-ruddy.vercel.app`) hoặc hướng dẫn khách hàng sử dụng chúng.
  - **Cấm tạo Site/Project Vercel mới**: AI tuyệt đối không được tạo Vercel project mới, link repo vào Vercel project mới, hoặc chạy `vercel` CLI để tạo deployment mới. Dự án đã có site Vercel chính thức — chỉ sử dụng site đó. Mọi hành vi tạo site mới để "test trước" là vi phạm kỷ luật nghiêm trọng vì gây rò rỉ tài nguyên, xung đột cấu hình và làm mất tập trung khỏi môi trường production thực tế.
- **Quy trình nạp Biến môi trường trên Cloud (Cloud Environment Variable Lifecycle)**: Các thay đổi hoặc thêm mới biến môi trường trên Vercel/Cloud chỉ có tác dụng cho các bản build mới (New Deployments). Chúng không tự áp dụng cho bản build cũ đang chạy. Do đó, sau khi cấu hình hoặc cập nhật Env, bắt buộc phải kích hoạt Redeploy/Promote bản build mới nhất để cập nhật cấu hình cho trang Production chính thức, tránh lỗi thiếu Key (API 500).


### 2. Quy Tắc Khái Quát Hóa Từ Bài Học 5fedu (Khuyến Nghị Áp Dụng Rộng Rãi)

- **Đồng bộ nhãn nút qua Helper (Button Labels Helper)**: Các nhãn nút bấm hành động chuẩn (như Đóng, Hủy, Lưu, Sửa, Xóa) nên sử dụng qua các helper/function định nghĩa sẵn (ví dụ: `BTN_CLOSE()`, `BTN_EDIT()`, `BTN_DELETE()`) để duy trì tính nhất quán ngôn ngữ và dịch thuật hệ thống.
- **Xử lý lỗi đồng bộ Auth mềm dẻo (Auth Sync Graceful Degradation)**: Khi thực hiện đồng bộ Auth giữa database và các dịch vụ bên thứ ba/auth provider (như Supabase Auth), mọi lỗi do thiếu cấu hình môi trường hoặc do mạng phải được bắt lỗi (catch) một cách mềm dẻo ở các tác vụ nhạy cảm như xóa (delete) để không ngăn cản/gây lỗi cho nghiệp vụ chính của người dùng ở database.
- **Suy luận giao diện theo Template & Hỏi phản hồi (Quy tắc vàng)**: Khi thực hiện chỉnh sửa/sửa lỗi frontend, bắt buộc phải suy luận chặt chẽ và đối chiếu trực tiếp với mã nguồn template gốc được chỉ định của dự án (ví dụ: thư mục `/template` hoặc template được chỉ định). Nếu nhận được phản hồi (feedback) từ người dùng, tuyệt đối cấm tự ý sửa đổi lung tung hay thay đổi sai lệch so với template chỉ để cố hoàn thành task cho xong. Trong trường hợp giao diện đã hoàn toàn chuẩn theo template mà người dùng vẫn phản hồi chưa đạt, phải dừng lại hỏi ngược người dùng ngay lập tức kèm theo phân tích/suy luận rõ vị trí đang nói tới là ở đâu.
- **Xác thực bắt buộc trên Production**: Mọi tính năng, sửa đổi UI hoặc sửa lỗi phải được verify trực tiếp trên môi trường production/live thực tế của dự án, không được chỉ kiểm tra ở môi trường local (vì môi trường local có thể tự sửa lỗi hoặc bỏ qua lỗi build/runtime như thiếu import hook React, gây sập trang khi lên live).
- **Quy chuẩn Định dạng Excel khi Xuất (Excel Export Format & Style)**: Mọi thao tác xuất dữ liệu ra file Excel (.xlsx) phải sử dụng thư viện thích hợp (như `xlsx-js-style`) để định dạng giao diện chuyên nghiệp:
  - Header của file Excel phải có font chữ, in đậm, màu chữ trắng (`#FFFFFF`) và nền ô là màu thương hiệu đậm (ví dụ: màu Navy `#1E3A8A`). Các ô header phải có viền mỏng và căn giữa.
  - Các cột số liệu (tiền lương, chi phí, doanh thu, số lượng...) bắt buộc phải được xuất dưới dạng **Number thực tế (cell type 'n')**, không được xuất dưới dạng String/Text (cell type 's') để tránh lỗi cảnh báo của Excel (green triangle) và cho phép người dùng sử dụng các hàm tính toán (SUM, AVERAGE, v.v.). Đồng thời, định dạng hiển thị số phải áp dụng `numFmt: "#,##0"`.
  - Các ô dữ liệu thông thường phải được căn chỉnh (align) hợp lý: cột số căn lề phải (right), cột ngày tháng/trạng thái/biển số căn giữa (center), các cột chữ khác căn lề trái (left). Các dòng xen kẽ có thể tô màu nền xám rất nhẹ (`#F8FAFC` và `#FFFFFF`) để tăng độ tương phản.
- **Thiết kế các Module Dùng chung dữ liệu (Shared Data Modules Pattern)**: Đối với các module nghiệp vụ có sự chồng chéo hoặc liên quan chặt chẽ đến nhau về mặt thông tin (ví dụ: Nhân sự & Tài xế, Khách hàng & Nhà cung cấp...):
  - **Dữ liệu (Database)**: Sử dụng một bảng dữ liệu gốc duy nhất (ví dụ: `var_nhan_vien` hoặc `partner`) để làm Single Source of Truth và dùng cờ boolean để phân loại vai trò đối tượng thay vì tách bảng, giúp tránh trùng lặp thông tin.
  - **Giao diện (UI)**: Vẫn duy trì các module/giao diện quản lý riêng biệt cho từng vai trò nghiệp vụ nhằm đảm bảo trải nghiệm sâu của chuyên môn đó (ví dụ: chi tiết tài xế có lịch sử chuyến xe, lịch sử lương; nhân sự thì không cần). Module chuyên môn sẽ filter tự động từ bảng gốc.
  - **Điều hướng (Navigation)**: Trong form của module gốc, khi người dùng kích hoạt cờ vai trò, phải hiển thị link điều hướng trực quan đến trang chuyên môn tương ứng.
  - **Xóa mềm vai trò (Soft Delete Role)**: Khi thực hiện hành động xóa ở module chuyên môn, chỉ tắt cờ phân loại về `false` chứ không xóa vật lý bản ghi gốc để bảo toàn thông tin hồ sơ chung.
  - **Dropdown Liên kết (Dropdown-as-a-Service Pattern)**: Khóa ngoại trỏ đến bảng dùng chung (ví dụ: `id_doi_tac` trên đơn hàng, hoặc `id_tai_xe` trên chuyến xe) phải lọc động theo vai trò của đối tượng (ví dụ: `la_khach_hang = true` hoặc `la_tai_xe = true`) ở tầng Service/API trước khi hiển thị lên UI, và nhãn hiển thị (label) của dropdown phải được phân giải dựa trên thông tin đầy đủ của đối tượng thay vì ID thô.
  - **Đồng bộ dữ liệu và Thứ tự Giao dịch (External Sync Transaction Order)**: Khi thực hiện tích hợp đồng bộ dữ liệu giữa Database gốc và các dịch vụ bên thứ ba (như Supabase Auth, CRM, Zalo...), bắt buộc phải thực hiện các thao tác ghi/xóa trên Database gốc trước. Chỉ khi Database gốc hoàn thành thành công (không vi phạm khóa ngoại, ràng buộc...), mới được gọi API đồng bộ sang dịch vụ bên thứ ba. Tuyệt đối cấm gọi API bên thứ ba trước để tránh tình trạng mất đồng bộ (desync) và mâu thuẫn dữ liệu khi CSDL gốc từ chối thao tác. Đồng thời, cấu hình CSDL gốc cần tương thích với các thao tác xóa vật lý từ UI (ví dụ sử dụng `ON DELETE CASCADE` hoặc `ON DELETE SET NULL` cho các bảng phụ thuộc) để đảm bảo transaction xóa trên DB diễn ra thành công và Auth sync được kích hoạt đồng bộ sau đó.
  - **Chống Tư Duy Sửa Lỗi Hời Hợt (Anti-Superficial Bug Fixing & Audit Everything)**:
    - *Bản chất sai lầm*: Khi sửa lỗi (fix bug), chỉ nhìn nhận bề nổi của lỗi (ví dụ: chỉ sửa logic UI tạm thời hoặc chỉ thay đổi DB mà không kiểm tra tính đồng bộ của các luồng khác) mà không audit toàn diện các luồng liên đới, dẫn đến lỗi dây chuyền (như cascade delete ở DB kích hoạt trigger gây ra lỗi khóa ngoại mới, hoặc dùng các phương thức bất đồng bộ làm mất user gesture của trình duyệt làm sập tính năng tải file).
    - *Kỷ luật bắt buộc (1 Phát Ăn Luôn)*: Khi sửa bất kỳ lỗi nào, cấm làm việc hời hợt. Bắt buộc phải thực hiện phân tích tĩnh (static analysis) và trace toàn bộ luồng thực thi:
      - Nếu thay đổi DB schema (khóa ngoại, cascade): Phải rà soát tất cả các database triggers (`AFTER/BEFORE INSERT/UPDATE/DELETE`) trên các bảng bị ảnh hưởng để đảm bảo trigger không thực hiện ghi/sửa các bản ghi vừa bị xóa, gây vi phạm khóa ngoại. Phải đặt kiểm tra phòng vệ trong trigger (ví dụ: `if not exists (select 1 from public.ten_bang_goc where id = v_id) then return null; end if;`).
      - Nếu sửa đổi cơ chế giao tiếp trình duyệt (tải file, APIs): Phải đảm bảo không phá vỡ cơ chế kích hoạt đồng bộ của người dùng (user activation gesture). Tuyệt đối cấm sử dụng các phương thức bất đồng bộ trung gian (như FileReader onload) nằm ngoài tầm kiểm soát của gesture trước lệnh download để tránh bị trình duyệt chặn hoàn toàn.
      - Tuyệt đối không được vội vàng kết luận lỗi đã được sửa khi chưa audit và kiểm tra kỹ lượng toàn bộ chuỗi tác động gián tiếp trên môi trường production thực tế.
- **Bảo mật Đổi mật khẩu & Đồng bộ Auth**: Các form đổi mật khẩu trên trang cá nhân cần được kích hoạt thực tế thông qua các API an toàn (như `supabase.auth.updateUser`) thay vì để trạng thái chờ phát triển. Luồng đồng bộ thông tin tài khoản người dùng sang Auth Service phải có fallback/catch lỗi để không làm gián đoạn nghiệp vụ chính ở database khi môi trường thiếu khóa quản trị.
- **Chống Tư duy CRUD Generic Hời Hợt (Anti-Generic CRUD Fallacy)**:
  - **Bản chất lỗi (Root Cause)**: AI thường có xu hướng tạo ra các giao diện CRUD độc lập cho từng bảng một cách máy móc dựa trên schema DB (ví dụ: thấy trường `phe_duyet` ở bảng con thì lập tức tạo nút Duyệt cho từng dòng con), dẫn đến phá vỡ nghiệp vụ thực tế của hệ thống.
  - **Quy tắc**: Phải luôn phân tích luồng nghiệp vụ tổng thể (Operational Domain Flow) trước khi code. Phải xác định rõ thực thể nào là **Cha (Master)**, thực thể nào là **Con (Detail)**. Không được cung cấp các tính năng Duyệt/Hành động nghiệp vụ lẻ tẻ ở cấp dòng con nếu hành động đó thuộc thẩm quyền quyết định của dòng cha.
- **Quy chuẩn Thiết kế Master-Detail & Khóa Kế thừa (Cascading Lock Pattern)**:
  - **Phân cấp Hành động (Action Hierarchies)**: Cấp Cha nắm giữ các hành động phê duyệt, chốt sổ (ví dụ: "Duyệt Chuyến", "Chốt Lương"). Cấp Con nắm giữ hành động báo cáo tiến độ thực thi thực tế (ví dụ: "Báo tiến độ OK", "Hoàn thành nhiệm vụ").
  - **Khóa kế thừa (Cascading Lock)**: Khi thực thể Cha được duyệt/chốt, toàn bộ các thực thể Con liên kết bắt buộc phải tự động rơi vào trạng thái Chỉ đọc (Read-only). Giao diện của dòng con (ở cả tab danh sách con lẫn bảng con nhúng bên trong Drawer cha) phải tự động ẩn/vô hiệu hóa các nút `Thêm`, `Sửa`, `Xóa`.
  - **Đồng bộ tính toán Reactive (Reactive Auto-Calculation)**: Mọi thao tác ghi/sửa/xóa ở dòng con phải lập tức trigger cập nhật các trường tổng hợp (số lượng, tổng tiền, tổng phí...) của dòng cha ở database, và UI của dòng cha phải lập tức reload dữ liệu (thông qua React Query invalidate) để hiển thị kết quả tính toán mới nhất mà không yêu cầu reload trang thủ công.
- **Kỷ Luật Cấm Deploy Thủ Công & Cấm Tạo Site Mới (No Manual Deployment & No New Sites Rule)**:
  - *Bản chất quy tắc*: Hệ thống tuân theo cơ chế tích hợp liên tục (CI/CD) thông qua kết nối Git tự động (Vercel Git Integration) hoặc do lập trình viên/owner trực tiếp kiểm soát việc phát hành.
  - *Quy tắc cứng*: AI tuyệt đối không bao giờ được: (1) chạy lệnh deploy ứng dụng lên production qua terminal (`vercel --prod`, `vercel deploy`, `npx vercel` hay tương đương), (2) tạo Vercel project/site mới từ repo hiện có, (3) link repo sang một Vercel project khác để "test trước". AI chỉ thực hiện sửa code, kiểm thử local, commit và push mã nguồn lên repository để hệ thống CI/CD tự động xử lý.
- **Kỷ Luật Cô Lập Phạm Vi Agent (Agent Isolation Rule)**:
  - *Bản chất*: Người dùng làm việc đồng thời với nhiều Agent (Antigravity, Codex, v.v.) trên cùng một dự án hoặc nhiều dự án khác nhau. Mỗi Agent chỉ được phép thao tác trong phạm vi nhiệm vụ mà người dùng giao cho mình.
  - *Quy tắc cứng*: AI tuyệt đối không được: (1) can thiệp vào các file/module đang được Agent khác xử lý trừ khi được người dùng chỉ định rõ ràng, (2) tự ý sửa đổi cấu hình hạ tầng chung (database schema, Vercel settings, environment variables, RLS policies) mà không hỏi người dùng trước — vì hành động này có thể phá vỡ công việc của Agent khác đang chạy song song, (3) giả định rằng mình là Agent duy nhất đang làm việc trên dự án. Khi phát hiện conflict hoặc thay đổi bất thường trong file mình đang sửa, phải dừng lại và hỏi người dùng thay vì tự ý ghi đè.
