# Intent Contract

File này là hợp đồng ý đồ cho Antigravity. Nó không phải tài liệu tham khảo phụ. Khi workspace có adapter này, hãy dùng nó để quyết định cách hành động.

## Mục tiêu

- Làm đúng ý đồ của người dùng nhanh, gọn, có kiểm chứng.
- Dùng runtime Codex như nguồn chuẩn về hành vi, nhưng không copy toàn bộ `.codex` vào context.
- Ưu tiên workflow chuyên biệt khi request khớp, thay vì tự diễn giải lại từ đầu.
- Giữ Antigravity nhẹ: rules ngắn, workflows rõ, không profile/model config.

## Quy tắc kích hoạt

| Tình huống | Phải làm |
|---|---|
| User nói setup/scaffold/cập nhật 5fedu | Dùng workflow `/5fedu-project` |
| User hỏi research/tìm internet/xác minh mới nhất | Dùng workflow `/codex-research` hoặc research có citation |
| User hỏi sync Codex/runtime/backup lệch không | Dùng workflow `/runtime-sync-audit` |
| User hỏi review | Review bug/risk/regression/test gap trước, summary sau |
| User yêu cầu sửa code rõ ràng | Đọc ngữ cảnh gần nhất, sửa scoped, verify |
| Task có database/auth/permission/secret | Coi HIGH risk, hỏi phần thiếu, không bịa schema |

## Ý đồ của workflow

- `/5fedu-project` là để scaffold hoặc duy trì context project-local: `AGENTS.md` và `.agents/5fedu/*.md`. Không tự nhảy sang implement feature nếu user chỉ yêu cầu setup/context.
- `/codex-research` là để gom bằng chứng trước khi quyết định. Tách rõ fact, guess, risk, next steps và nguồn.
- `/runtime-sync-audit` là để so runtime local tại `~/.codex` với backup `P:\agent-rules\codex`. Không ghi đè `config.toml` trừ khi user yêu cầu rõ.

## Không làm

- Không port `codex/agents/*.toml` sang Antigravity.
- Không đặt model/effort trong adapter. Antigravity runtime tự quản model, ví dụ Gemini 3.5 Flash medium.
- Không biến rules thành prompt khổng lồ.
- Không sửa lan ngoài scope.
- Không coi build pass là đủ nếu task là UI có thể kiểm tra bằng browser/screenshot.

## Final

Kết thúc bằng một trong ba trạng thái:

- `PASS`: đã làm xong và verify đủ.
- `PARTIAL`: đã làm được phần chính nhưng còn khác biệt có chủ đích, thiếu verify hoặc còn unknown.
- `BLOCKED`: không thể tiến tiếp nếu thiếu dữ liệu/quyền/credential/decision.
