# Control Plane V2 — kế hoạch thực thi

Đây là handoff **CANDIDATE**, chưa phải authority đang chạy. Không được tự tạo
script để sửa `.agent/current.json`, ledger hoặc tombstone. Sau khi chủ sở hữu
duyệt thiết kế, chỉ canonical goal transaction sẵn có mới được kích hoạt phase.

## Hợp đồng kết quả

Control Plane là workspace cho người vận hành, không phải dashboard kỹ thuật
hay nguồn authority. Giao diện mặc định bằng tiếng Việt, light-first và hướng
theo case. Pencil là nguồn sự thật cho thiết kế; browser/runtime evidence mới
là nguồn sự thật cho sản phẩm đã chạy.

## Phase A — Pencil design review (phiên mới làm đến đây rồi dừng)

1. Bắt đầu phiên mới tại workspace đang chứa candidate handoff này. Không dùng
   worktree thất bại, code, `.pen`, `.agent/current.json`, ledger hay receipt
   của nó; giữ nguyên candidate và thay đổi bẩn ngoài scope trong workspace này.
2. Đọc `AGENTS.md`, `rules/manifest.yaml`, `integrations/manual/pencil-mcp/`
   và toàn bộ artifact trong thư mục plan này.
3. Xác nhận Pencil desktop/editor đang mở ở foreground, host Antigravity báo
   Pencil MCP connected và các capability `design.inspect`, `design.compose`,
   `design.render`, `design.tokens` thật sự gọi được.
4. Tạo **qua Pencil MCP** file
   `packages/control-plane/design/control-plane.pen`, mở chính file đó trong
   editor foreground, rồi thiết kế và render các board dưới đây. Không được tạo
   `.pen` bằng shell, script, text editor hoặc JSON tự viết.
5. Render tối thiểu desktop 1440px, tablet 768px và mobile 390px. Hiển thị
   render/screenshot trong phiên cho chủ sở hữu, nêu đường dẫn file và frame ID
   đã render.
6. Ghi receipt có link tới output MCP, thời điểm, đường dẫn `.pen`, frame ID,
   render và các state đã kiểm tra. Receipt chỉ ghi fact quan sát được, không
   tự ghi “duyệt”.
7. Dừng và chờ câu **“duyệt thiết kế”** của chủ sở hữu. Trước câu này cấm sửa
   `packages/control-plane/src/**`, API, test, Docker, `.agent/current.json`,
   ledger và tombstone.

Nếu bất kỳ điều kiện Pencil nào không đạt, trả `BLOCKED` với điều kiện thiếu;
không có fallback viết code hay dựng một file `.pen` thay thế.

### Board bắt buộc trong Pencil

| Board | Case vận hành | Nội dung bắt buộc |
|---|---|---|
| Workspace đang chạy | Theo dõi một kế hoạch/lần chạy | authority, bước hiện tại, blocker, bằng chứng mới nhất, hành động an toàn tiếp theo |
| Cần xử lý | Integrity, stale, blocked, offline, thiếu evidence | giải thích rõ, mức độ ảnh hưởng, hành động có thể làm và action bị khóa |
| Chuẩn bị hành động | Thay thế mục tiêu hoặc đổi cấu hình | quyền hiện có, preview, xác nhận có chủ đích, audit và rollback |
| Lịch sử & bằng chứng | Tra cứu quyết định và lần chạy | timeline, traceability, nguồn evidence, trạng thái xác thực |
| Hệ thống | Xem sức khỏe runtime | health, capability, store, kết nối; chỉ thông tin vận hành dễ hiểu |

Không thiết kế dashboard “tổng quan” bằng lưới KPI, không mở rộng navigation
vì các diagnostic nội bộ và không dùng số liệu mẫu để làm UI trông có dữ liệu.

### Hướng visual bắt buộc

- Nền sáng ấm, chữ graphite, accent xanh Apple vừa phải, màu semantic rõ ràng.
- Lưới 8px, typography system font, khoảng trắng rộng, radius mềm, viền mảnh,
  shadow nhẹ và decor có mục đích; không giả lập giao diện Apple.
- Ưu tiên hierarchy, timeline, progress và evidence relationship thay vì card
  lặp vô nghĩa.
- Dùng icon SVG có label/accessibility; cấm emoji, ký tự unicode thay icon hay
  glyph placeholder.
- Có empty, loading, success, blocked, integrity failure, stale, offline,
  unavailable và read-only state cho từng case liên quan.
- Toàn bộ copy, nhãn aria, tooltip, placeholder và lỗi trong board là tiếng
  Việt; giữ nguyên identifier, enum, hash, path và code trong dữ liệu.

## Phase B — activation có kiểm soát (sau owner approval)

1. Tạo contract và ledger đúng schema bằng command/transaction canonical đang
   có; không tự viết file pointer, ledger hay activation script.
2. Nếu repository chưa có command/transaction tạo target hợp lệ cho phase mới,
   báo `BLOCKED` và nêu command/capability còn thiếu. Không bịa transaction.
3. Chụp baseline build, typecheck, test, browser QA và Docker availability.
4. Lưu link thiết kế đã duyệt vào contract/receipt theo schema hiện có.

## Phase C — xây lại Control Plane (sau activation)

1. Giữ React + TypeScript + Vite. Thay presentation layer bằng app shell và
   workspace theo board đã duyệt; không mechanical-translate layout cũ.
2. Đặt `/workspace` là entry chính. Kế hoạch, lần chạy, bằng chứng và hệ thống
   là các secondary flow có deep link ổn định. Các route cũ chỉ redirect hoặc
   compatibility projection đến khi có parity.
3. Tạo một typed client/view-model boundary. UI đọc authority từ API canonical,
   không suy luận từ selection, session hoặc telemetry.
4. Đưa i18n/copy vào một nguồn tập trung. Không dịch raw ID, enum, hash, path
   hoặc protocol value.
5. Chỉ hiển thị dữ liệu thực. Thiếu nguồn dữ liệu phải là state trung thực,
   không dùng hard-coded metric, chart hay success giả.
6. Trình bày integrity `409`, stale, blocked, offline, unavailable và read-only
   như trạng thái hành động được, không phải toast chung chung hoặc console error.
7. Mutation UI chỉ gọi canonical authority transaction và flow preview/apply/
   audit/rollback. Read-only phải chặn cả UI lẫn endpoint, không fake success.
8. Không thiết kế lại hay gắn diagnostic nội bộ vào navigation/sản phẩm; giữ
   endpoint nội bộ nguyên trạng nếu compatibility còn cần.

## Phase D — Docker preview

Tạo `docker/control-plane.Dockerfile`, `docker/control-plane.compose.yml` và
`.dockerignore` nếu cần. Image multi-stage dùng Node 22, build theo dependency
order của workspace và expose server trên `0.0.0.0:3099`.

Compose mặc định phải mount repository tại `/workspace:ro`, đặt
`HARNESS_ROOT=/workspace`, `CONTROL_PLANE_STORE_PATH=/var/lib/control-plane/store.json`,
`CONTROL_PLANE_READ_ONLY=1`, dùng volume riêng cho store/telemetry và có
healthcheck `/api/health`. Không mount hoặc chạy Pencil trong container. Profile
writable, nếu cần test, phải opt-in và tách khỏi default.

## Phase E — kiểm chứng và cutover

1. Chạy typecheck, production build, API/unit/security test và test package
   Control Plane liên quan.
2. Kiểm tra Docker config, image build và health smoke ở default read-only.
3. Chạy browser QA foreground trên native và Docker: keyboard/focus, axe,
   reduced motion, desktop/tablet/mobile, 200% zoom, deep link và trạng thái lỗi.
4. Chụp screenshot browser của từng board đã duyệt và so với render Pencil;
   không dùng ảnh trắng/rỗng hay screenshot một dashboard cũ làm bằng chứng.
5. Kiểm tra authority, stale-generation, integrity, read-only, preview/apply/
   rollback và recovery paths với dữ liệu thật hoặc fixture có provenance rõ.
6. Chỉ cutover khi claim bắt buộc có evidence độc lập tương ứng. Legacy chỉ
   archive sau parity evidence và tombstone lifecycle.

## Phạm vi được sở hữu sau approval

- `packages/control-plane/**`, trừ diagnostic nội bộ và trang/API riêng của nó.
- `docker/control-plane.Dockerfile`, `docker/control-plane.compose.yml` và
  `.dockerignore` khi cần.
- Artifact phase, test/QA/evidence trực tiếp phục vụ V2.

## Phạm vi cấm

- `generated/**`, installed runtime mirrors, `packages/kernel/**`,
  `packages/engine/**`.
- `.agent/current.json`, ledger, tombstone và lịch sử evidence, trừ transaction
  canonical sau owner approval.
- Diagnostic nội bộ, thay đổi bẩn không liên quan, commit, push và deploy.
