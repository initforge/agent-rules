---
name: 5fedu-project
description: Install or maintain the lean 5fedu context pack in an active project. Use for 5fedu setup, context/5fedu, tah-app, nostime, owner decisions, and Supabase conventions. During project implementation, use the installed project context. Do not use without 5fedu context in the active repository.
routing: {"signals":["5fedu","context/5fedu","tah-app","nostime","thiết lập 5fedu","cài context dự án","owner decisions","supabase"],"intent_signals":["5fedu_setup","5fedu_context"],"excludes":["generic module without 5fedu"],"priority":70,"loads":["profile:5fedu:readme"],"supports":["5fedu-module-parity"],"project_scope":"5fedu","platform_scope":"all","max_route_tokens":1800,"default":false}
---

# 5fedu project context

## Mục đích

Cài và duy trì pack lean tại `<active-repo>/context/5fedu/`. Khi triển khai
ứng dụng, đây là nguồn context đang sống; profile trong harness chỉ là nguồn
phát hành canonical.

## Pack được cài

| Path | Nội dung |
|---|---|
| `README.md` | Điểm vào và định tuyến ngắn |
| `rules/` | Business, data/auth và permission invariants |
| `behaviors/` | Activation và lifecycle policy |
| `module-mapping/` | Module roles, UI contracts và source verification |
| `project-local/` | Facts, quyết định và evidence do repo dự án sở hữu; được giữ nguyên khi cập nhật |

## Setup

```powershell
pwsh skills/5fedu-project/scripts/install-5fedu-context.ps1 `
  -ProjectRoot <repo> -Profile tah-app -SkipPrompts
```

- `-Profile default|tah-app|nostime` chỉ chọn định danh project cho routing.
- `-Force` cập nhật atomically phần managed và giữ `project-local/`.
- `-UpdatePointersOnly` chỉ sửa pointer sau khi pack hiện tại được xác minh.
- Các tham số ngoài API trên bị từ chối; không còn remote/template override.

## G-09 — Registry truth

Registry hiện có đúng hai project ID:

- `tah-app`
- `nostime`

Đây là tập hiện tại, không phải giới hạn vĩnh viễn. Chỉ owner mới được duyệt
thêm project; registry giữ ID, vai trò, repository URL và verified commit, và
không giữ đường dẫn tuyệt đối trên máy phát triển.

## G-04 — Decision truth and routing

- Quyết định project-local có trạng thái `DA_CHOT` là cơ sở thực thi và không
  được hỏi lại.
- Dữ kiện chưa được quyết định, mâu thuẫn hoặc rủi ro phải hỏi owner hoặc chặn
  phần việc chịu ảnh hưởng; không được phát minh fact.
- Công việc UI/module parity được giao cho `5fedu-module-parity`; skill này
  không định nghĩa lại workflow parity.
- Lesson áp dụng cho nhiều project chỉ được promote qua
  `context-evolution-protocol`.
