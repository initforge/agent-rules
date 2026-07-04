# Cách sync 5fedu

**Vai trò:** Quy tắc sync context dự án.  
**Ý đồ:** Install một chiều (no-wipe); write-back có kiểm soát sau khi sửa trong repo.

Canonical agent-rules: **`P:\agent-rules`**.

## Đọc (implement)

- Khi code trong repo dự án: chỉ đọc `<repo>/context/5fedu/`, **không** đọc `agent-rules/projects/5fedu/` làm nguồn sống.
- Nội dung dự án thật (sheets map, Supabase spec, decisions đã chốt): **`context/5fedu/project-local/`** — installer **không bao giờ** ghi đè thư mục này.

## Hai lớp context

| Lớp | Vị trí | Installer | Nội dung |
|---|---|---|---|
| **Template** | `AGENTS.md`, `00-context-map.md`, `domains/*`, `decisions.md` (generic), `archive/nostime/*` (profile nostime) | Ghi đè khi `08-install` | Pattern 5fedu chung |
| **Project-local** | `project-local/*` | **Không đụng** | Sheets, Supabase, spec đã chốt, transport, e2e — riêng từng repo |

## Cài từ template → repo (no-wipe)

`automation/08-install-5fedu-context.ps1`:

- **Không** tạo `*.backup-*`.
- **Không** xóa/wipe toàn bộ `context/5fedu`.
- Chỉ `Copy-Item -Force` file/thư mục **thuộc template**; giữ nguyên `project-local/` và mọi path không nằm trong template set.
- Tự dọn `5fedu.backup-*` cũ nếu còn sót.
- Ghi `.template-managed.json` (danh sách path template quản lý).
- `-Force` = ghi đè file template, không hỏi — **không** phá hủy project-local.

## Write-back (sau khi sửa — chỉ phần thay đổi)

Sync **ngay sau khi sửa**, không mirror toàn bộ skills hay `05-generated/`:

| Case | Nguồn sửa | Đích sync | Loại trừ |
|------|-----------|-----------|----------|
| **1. Global** | `rules/`, `skills/` toàn cục | `agent-rules/rules/`, `agent-rules/skills/` | — |
| **2. Context 5fedu** | `<repo>/context/5fedu/` (file `.md` template) | `agent-rules/projects/5fedu/` (cùng đường dẫn tương đối) | `project-local/`, `skills/`, README, JSON, file không liên quan |

**Không** write-back `project-local/` lên template harness — đó là dữ liệu sống riêng từng repo.

Chiều ngược: `agent-rules → repo` + `agent-rules → global` ghi đè template `.md` thoải mái; `project-local/` trong repo không bị đụng.

Sau write-back: chạy `automation/03-validate-context.ps1` rồi `01-build-runtime.ps1`. Review diff trước khi commit.

## Vòng sync đầy đủ

| Bước | Lệnh | Ghi chú |
|---|---|---|
| 1. Sửa generic trong harness | Sửa `projects/5fedu/domains/*` | Nguồn canonical |
| 2. Sync ra Tah-app | `08-install ... -Profile tah-app -Force` | Không đụng project-local |
| 3. Sync ra nostime | `08-install ... -Profile nostime -Force` | Overlay từ archive |
| 4. Sửa generic trong repo | Sửa `domains/*` trong repo | Khi fix thực tế ở app trước |
| 5. Write-back | `10-export-5fedu-writeback.ps1 -ProjectRoot ... -RelativePaths domains/foo.md -Apply` | Không đụng project-local |
| 6. Gate | `03-validate-context.ps1` | Purity + validate PASS |
| 7. Re-sync cả hai repo | `08-install` tah-app + nostime `-Force` | Propagate generic mới |

## Quy tắc vàng write-back

- Sửa **generic ERP pattern** → write-back `domains/` hoặc `decisions.md` generic → re-sync cả hai repo.
- Sửa **spec Tah-app** (transport, vercel, sheets TAH) → chỉ `Tah-app/project-local/` — **không** write-back.
- Sửa **spec Nostime** (retail, journal) → chỉ `nostime/project-local/` hoặc trực tiếp `archive/nostime/` trên harness → chỉ re-sync nostime.
- **Không** promote `project-local/ui-standards.md` (TAH) lên harness template.

## Chính sách không backup

- **Không** tạo thư mục `*.backup-*` khi cài lại context.
- Xóa backup cũ nếu còn; **live** trong repo là nguồn trust duy nhất.

## Được phép

- Cập nhật template canonical rồi chạy `08-install-5fedu-context.ps1 -Force`
- Promote rule từ `evidence/` sang `domains/` sau khi review
- Cập nhật `decisions.md` generic khi owner chốt (template); quyết định dự án → `project-local/decisions.md`
- Write-back file template đã sửa sang `agent-rules` theo case 2 (không gồm project-local)

## Không được phép

- Copy log/evidence vào global `rules/` hoặc `skills/`
- Copy nguyên `.agents/`, `.codex/`, `05-generated/` về canonical
- Sửa `evidence/` rồi coi như rule sống (chỉ promote sau review sang `domains/`)
- Đưa quyết định Nostime vào `decisions.md` chung — dùng `project-local/` hoặc `archive/nostime/`
- Sync toàn bộ skills hay runtime generated khi chỉ sửa vài file context
- Ghi đè hoặc xóa `project-local/` qua installer

Reverse sync có review: `automation/07-import-reviewed-changes.ps1`.
