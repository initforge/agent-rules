---
alwaysApply: true
---

# Hợp đồng Outcome chung (Universal Frontier Contract)

**Một nguồn chuẩn nội dung — Ba môi trường chạy Native — Cùng một tiêu chuẩn chất lượng (Frontier).**

Người dùng **không** bắt buộc phải chuyển sang Grok để kiểm thử E2E, dùng Codex để lập kế hoạch (Plan), hay dùng Antigravity cho việc phát triển giao diện (UI). **Bất kỳ** nền tảng nào cũng phải đủ mạnh để tự xây dựng và triển khai các dự án phức tạp **một mình**, hỗ trợ mọi Model và mọi cách thức làm việc (Terminal, IDE, Slash commands, hay chạy phân pha Profile).

## Nguyên tắc cốt lõi

1.  **Cùng một tiêu chuẩn đầu ra (Outcome Bar):** Bắt buộc trả về trạng thái kết thúc (`PASS` / `PARTIAL` / `BLOCKED`), thực hiện quét kỹ năng Turn-0 (Visible Echo), kích hoạt Multi-Skill Stack, kiểm soát nợ kỹ thuật (Technical Debt Gate), và tuân thủ tuyệt đối quy tắc chống chừa việc [07-finish-to-completion.md](07-finish-to-completion.md).
2.  **Khác biệt cơ chế thực thi (Native Harness):** Mỗi nền tảng sẽ sử dụng cơ chế nạp quy tắc và công cụ native mạnh nhất của chính nó để ép buộc hành vi của AI, tuyệt đối không sao chép máy móc cấu trúc giữa các nền tảng.
3.  **Một nguồn chuẩn duy nhất (Master Source):** Mọi chỉnh sửa được thực hiện tại thư mục `rules/`, `skills/`, `workflows/`, hoặc `shared/` ở thư mục gốc của repo này, sau đó chạy đồng bộ sang các platform tương ứng.
4.  **Không phân mảnh quy trình:** Không viết tài liệu định hướng kiểu "Task này bắt buộc phải dùng Grok". Một task phức tạp đòi hỏi AI phải tự nạp đủ Skill Stack cần thiết ngay trên nền tảng người dùng đang chạy.

---

## Tiêu chuẩn chất lượng (Mọi Nền tảng)

| Năng lực bắt buộc (Capability) | Yêu cầu thực thi (Enforcement) |
|---|---|
| Turn-0 Skill Scan + Visible Echo | Thực hiện ở mọi lượt hội thoại, mọi model |
| Multi-Skill Stack + Primary | Kích hoạt khi làm việc với nhiều domain công nghệ khác nhau |
| Nghiên cứu đa nguồn (`researcher`) | Bắt buộc chạy trước khi code các module lớn hoặc khi bị kẹt lỗi |
| Phát triển UI & Xác thực Browser | Thiết kế theo mẫu, chạy xác thực bằng Playwright/Browser thực tế |
| E2E deep ladder | Kiểm thử tích hợp sâu, không lặp lại các test case mù quáng |
| Cổng kiểm soát 5fedu | Mapping (Ánh xạ) → Pattern Fidelity Packet → Template (Mẫu) → Verify (Xác thực) |
| Kiểm soát nợ kỹ thuật & Anti-Fake-PASS | Bắt buộc chạy kiểm thử thực tế và phân loại nợ kỹ thuật trước khi báo PASS |
| Chống chừa việc (`07`) | Giải quyết triệt để scope công việc, không bàn giao việc dở dang |

---

## Cơ chế nạp Native của từng nền tảng (Cùng chuẩn, khác cơ chế)

### Grok CLI — Terminal-Native Harness
*   **Tải cấu hình (Load):** `~/.grok/.grok/rules/` + `~/.grok/skills/`
*   **Ép buộc hành vi (Enforce):** Chặn cứng ở mức cơ học thông qua `~/.grok/hooks/skill-orchestrator.json` (chạy script kiểm tra PreToolUse trước khi AI gọi tool).
*   **Trạng thái (State):** `~/.grok/skill-state/`

### Codex CLI — Phase-Native Harness
*   **Tải cấu hình (Load):** `~/.codex/rules/` thông qua `@import` của `AGENTS.md` kết hợp với cấu hình model/effort trong `agents/*.toml`.
*   **Ép buộc hành vi (Enforce):** Điều phối phân pha thông qua rules + `workflow-router` + `~/.codex/scripts/skill-gate.py`.
*   **Trạng thái (State):** `~/.codex/skill-state/`

### Antigravity IDE 2.0 — IDE-Native Harness
*   **Tải cấu hình (Load):** Tự động nạp global từ `~/.gemini/GEMINI.md` kết hợp với global customizations đặt tại `~/.gemini/config/` (`rules/` Always On có frontmatter + `skills/` nạp theo trigger + `workflows/` slash command).
*   **Ép buộc hành vi (Enforce):** Tự động tuân thủ kỷ luật rules Always On, tự chạy preflight nhắc nhở Turn-0, và sử dụng các slash command thủ công khi cần.
*   **Trạng thái (State):** Quản lý qua Customizations của IDE.

---

## Sự tương xứng về kiểm soát hành vi (Enforcement Parity)

| Cổng kiểm soát (Gate) | Grok CLI | Codex CLI | Antigravity IDE 2.0 |
|---|---|---|---|
| Kiểm thử tích hợp sâu (E2E) | Hook chặn cứng + State | Hook + Rule | Rule + slash `/check-work` |
| Đọc Skill trước khi dùng Tool | Rule Turn-0 + Hook chặn | Rule Turn-0 + Profile | Rule Always On + Trigger nạp |
| Xác thực trước khi commit | Hook chặn git commit | Hook chặn git commit | Rule kiểm soát hành vi tự giác |
| Bằng chứng xác thực (Evidence) | Chụp màn hình/Console log | Chụp màn hình/Console log | Playwright/Browser verification |

---

## Kịch bản chạy độc lập (Khi chỉ dùng 1 nền tảng)

| Tình huống (Scenario) | Grok CLI | Codex CLI | Antigravity IDE 2.0 |
|---|---|---|---|
| Xây dựng ứng dụng mới | researcher → craft → e2e | same stack + plan slices | same + slash workflows |
| Phát triển module 5fedu | 5fedu → craft → e2e | same + profiles | same + IDE global verify |
| Bảo trì Harness | validate + hooks | validate + sync | validate + global install |

---

## Cú pháp kết thúc Turn bắt buộc (Mọi Nền tảng)

Trình bày dạng danh sách xuống dòng rõ ràng và sử dụng thẻ HTML `<mark>` để highlight các giá trị quan trọng:

*   **Skill scan:** <mark>...</mark>
*   **Skills active:** <mark>...</mark>
*   **Primary (this step):** <mark>...</mark>
*   **Skill activated:** <mark>...</mark>
*   **Verification:** <mark>...</mark>
*   **Technical debt check:** <mark>...</mark>
*   **Status:** <mark>PASS | PARTIAL | BLOCKED</mark>

Thiếu bằng chứng cụ thể (test logs, console output, screenshots) -> bắt buộc trả về trạng thái `PARTIAL` hoặc `BLOCKED`, tuyệt đối không fake PASS.
