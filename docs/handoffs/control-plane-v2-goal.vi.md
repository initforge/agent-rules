# Goal cho Antigravity — Control Plane V2, phase thiết kế

Đây là **phiên mới chỉ để làm thiết kế Pencil và trình cho chủ sở hữu duyệt**.
Chạy ở workspace đang chứa handoff này; không tái sử dụng worktree, `.pen`,
code, `.agent/current.json`, ledger hay receipt của phiên Control Plane thất
bại trước đó.

## Đọc trước khi làm

- `AGENTS.md`
- `rules/manifest.yaml`
- `integrations/manual/pencil-mcp/README.md`
- `.agent/plans/control-plane-v2/original.md`
- `.agent/plans/control-plane-v2/plan.md`
- `.agent/plans/control-plane-v2/requirements.yaml`
- `.agent/plans/control-plane-v2/criteria-index.yaml`
- `.agent/plans/control-plane-v2/architecture-map.md`

## Mục tiêu

Thiết kế lại Control Plane thành workspace tiếng Việt theo case vận hành: nhẹ,
sáng, trực quan, có decor tinh tế theo tinh thần Apple và không còn dashboard
KPI/card chung chung. Phải dùng **Pencil MCP thật** để tạo và render design, sau
đó hiển thị design trong phiên để chủ sở hữu duyệt.

## Thứ tự tuyệt đối

1. Mở Pencil desktop/editor ở foreground và xác nhận host Antigravity có MCP
   `pencil` đang connected. Gọi thực tế `design.inspect`, `design.compose`,
   `design.render` và `design.tokens`; không coi env var là bằng chứng đủ.
2. Qua MCP, tạo `packages/control-plane/design/control-plane.pen` trong
   **worktree mới này**, rồi mở chính file đó trong editor foreground. Cấm tạo
   hay sửa `.pen` bằng shell, script, JSON/text editor hoặc copy file cũ.
3. Thiết kế và render desktop 1440px, tablet 768px, mobile 390px cho: Workspace
   đang chạy; Cần xử lý; Chuẩn bị hành động; Lịch sử & bằng chứng; Hệ thống.
4. Trong câu trả lời, đính/hiển thị render hoặc screenshot từ Pencil, đường dẫn
   `.pen`, frame ID, output thao tác MCP và các state đã cover. Ghi receipt
   chỉ bằng fact quan sát được.
5. Dừng. Chờ đúng câu **“duyệt thiết kế”** từ chủ sở hữu rồi mới activation,
   code, Docker hay test implementation.

Nếu Pencil editor/MCP/capability/render không dùng được: trả `BLOCKED`, nêu
chính xác điều kiện thiếu và dừng. Không có fallback làm web, mockup ảnh hay
`.pen` tự tạo.

## Bắt buộc cho design

- Workspace theo case là primary surface; không dùng lưới KPI hoặc dashboard
  card làm màn hình mặc định.
- Dữ liệu hiển thị phải có provenance; có state rõ cho empty, loading,
  read-only, integrity failure, stale, blocked, offline, unavailable và thiếu
  evidence. Không dùng fake metric/chart/success để lấp chỗ trống.
- Nền sáng ấm, chữ graphite, accent xanh tiết chế, semantic color, 8px grid,
  typography system font, whitespace rộng, border/shadow nhẹ và decor có mục
  đích. Dùng SVG icon có accessibility; cấm emoji, glyph placeholder.
- Tất cả visible copy, aria label, tooltip, placeholder và lỗi bằng tiếng Việt;
  raw identifier, enum, hash, path và code giữ nguyên.
- Không đưa diagnostic nội bộ vào navigation, board, URL mới, copy, `.pen` hay
  acceptance UI. Không sửa trang/API diagnostic nội bộ.
- Không sửa bất kỳ file implementation, Docker, `.agent/current.json`, ledger,
  tombstone hay generated/runtime mirror trong phase này. Không commit/push/deploy.

## Khi chủ sở hữu duyệt thiết kế

Chỉ sau approval, quay lại `.agent/plans/control-plane-v2/plan.md` từ Phase B.
Activation phải qua canonical goal transaction có sẵn; nếu chưa có đường hợp lệ
thì báo `BLOCKED`, không tự viết script/file pointer/ledger. Sau đó implement,
Docker và browser QA theo đầy đủ criteria, không hỏi lại preference.
