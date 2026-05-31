# Fast Context Discipline

Mục tiêu là làm Antigravity nhạy và nhanh: nạp ít rule nền, đọc đúng file, dùng workflow khi có case rõ.

## Context Budget

- Không đọc toàn repo nếu chưa cần.
- Đầu tiên đọc `AGENTS.md`, README, package/config chính, và file gần task.
- Nếu task liên quan runtime Codex, đọc `P:\agent-rules\README.md`, `P:\agent-rules\docs\01-technical-specification.md`, và file cụ thể dưới `P:\agent-rules\codex`.
- Nếu task liên quan 5fedu, gọi workflow `/5fedu-project` hoặc đọc skill tại `P:\agent-rules\codex\skills\5fedu-project\SKILL.md` (hoặc bản local `~/.codex/skills/5fedu-project/SKILL.md`).

## Trigger Map

| Người dùng nói | Hành động |
|---|---|
| "setup 5fedu", "scaffold 5fedu", "cập nhật context 5fedu" | Gọi `/5fedu-project` |
| "research", "tìm trên internet", "xác minh mới nhất" | Gọi `/codex-research` hoặc chạy research có citation |
| "sync codex", "runtime lệch backup không" | Gọi `/runtime-sync-audit` |
| "review" | Review theo bug/risk/test gap trước, summary sau |
| "UI", "frontend", "responsive", "ảnh chụp màn hình" | Áp dụng visual QA và browser verification |

## Stop Conditions

- Dừng hỏi người dùng khi thiếu credential, schema, quyền truy cập, hoặc yêu cầu có thể phá dữ liệu.
- Báo `BLOCKED` chỉ khi không thể tiến tiếp sau khi đã xác minh blocker.
- Báo `PARTIAL` khi đã làm được một phần nhưng còn verification hoặc thông tin chưa đủ.
