# Cách sync 5fedu

**Vai trò:** Quy tắc sync context dự án.  
**Ý đồ:** Install một chiều (no-wipe); write-back có kiểm soát sau khi sửa trong repo.

Canonical agent-rules: **`P:\agent-rules`**.

## Hierarchy sync

| Layer | agent-rules canonical | Synced to repo | Installer |
|---|---|---|---|
| Organization | `organization/` | `context/5fedu/organization/` | Ghi đè |
| Domain | `domains/<domain>/` | `context/5fedu/domains/<domain>/` | Ghi đè |
| Project facts | `projects/<project-name>/` (shared) | `context/5fedu/project-local/` | **Không đụng** |
| Evidence | `evidence/` | Không sync | — |
| Archive | `archive/` | Không sync | — |

## Đọc (implement)

- Khi code trong repo dự án: chỉ đọc `<repo>/context/5fedu/`, **không** đọc `agent-rules/` làm nguồn sống.
- Nội dung dự án thật (sheets map, Supabase spec, decisions đã chốt): **`context/5fedu/project-local/`** — installer **không bao giờ** ghi đè thư mục này.

## Hai lớp context

| Lớp | Vị trí | Installer | Nội dung |
|---|---|---|---|
| **Template** | `organization/`, `domains/*`, `00-context-map.md`, `decisions.md` | Ghi đè khi `08-install` | Pattern 5fedu chung |
| **Project-local** | `project-local/*` | **Không đụng** | Sheets, Supabase, spec đã chốt — riêng từng repo |

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
|---|---|---|---|
| **1. Global** | `rules/`, `skills/` toàn cục | `agent-rules/rules/`, `agent-rules/skills/` | — |
| **2. Organization** | `<repo>/context/5fedu/organization/` | `agent-rules/organization/` | `project-local/` |
| **3. Domain** | `<repo>/context/5fedu/domains/<domain>/` | `agent-rules/domains/<domain>/` | `project-local/` |
| **4. Project facts** | `<repo>/context/5fedu/project-local/` | **Không write-back** | — |

**Không** write-back `project-local/` lên template harness — đó là dữ liệu sống riêng từng repo.

Chiều ngược: `agent-rules → repo` + `agent-rules → global` ghi đè template `.md` thoải mái; `project-local/` trong repo không bị đụng.

Sau write-back: chạy `automation/03-validate-context.ps1` rồi `01-build-runtime.ps1`. Review diff trước khi commit.

## Vòng sync đầy đủ

| Bước | Lệnh | Ghi chú |
|---|---|---|
| 1. Sửa generic trong harness | Sửa `organization/` hoặc `domains/<domain>/` | Nguồn canonical |
| 2. Sync ra Tah-app | `08-install ... -Profile tah-app -Force` | Không đụng project-local |
| 3. Sync ra nostime | `08-install ... -Profile nostime -Force` | Organization + domains sync |
| 4. Sửa generic trong repo | Sửa `organization/` hoặc `domains/` trong repo | Khi fix thực tế ở app trước |
| 5. Write-back | `10-export-5fedu-writeback.ps1 -ProjectRoot ... -RelativePaths domains/<domain>/foo.md -Apply` | Không đụng project-local |
| 6. Gate | `03-validate-context.ps1` | Purity + validate PASS |
| 7. Re-sync cả hai repo | `08-install` tah-app + nostime `-Force` | Propagate generic mới |

## Quy tắc vàng write-back

- Sửa **generic organization pattern** → write-back `organization/` → re-sync cả hai repo.
- Sửa **generic domain pattern** → write-back `domains/<domain>/` → re-sync cả hai repo.
- Sửa **spec Tah-app** (transport, vercel, sheets TAH) → chỉ `Tah-app/project-local/` — **không** write-back.
- Sửa **spec Nostime** (retail, journal) → chỉ `nostime/project-local/` hoặc trực tiếp `archive/nostime/` trên harness → chỉ re-sync nostime.
- **Không** promote `project-local/` lên harness template.

## Chính sách không backup

- **Không** tạo thư mục `*.backup-*` khi cài lại context.
- Xóa backup cũ nếu còn; **live** trong repo là nguồn trust duy nhất.

## Được phép

- Cập nhật template canonical rồi chạy `08-install-5fedu-context.ps1 -Force`
- Promote rule từ `evidence/` sang `domains/<domain>/` sau khi review
- Cập nhật `decisions.md` generic; quyết định dự án → `project-local/`
- Write-back file organization/domain đã sửa sang `agent-rules`

## Không được phép

- Copy log/evidence vào global `rules/` hoặc `skills/`
- Copy nguyên `.agents/`, `.codex/`, `05-generated/` về canonical
- Sửa `evidence/` rồi coi như rule sống (chỉ promote sau review sang `domains/`)
- Đưa quyết định Nostime vào `organization/` chung
- Sync toàn bộ skills hay runtime generated khi chỉ sửa vài file context
- Ghi đè hoặc xóa `project-local/` qua installer

Reverse sync có review: `automation/07-import-reviewed-changes.ps1`.
