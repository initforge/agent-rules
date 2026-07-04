---
name: implementation-discovery
description: Reality-check before and during implementation when plan assumptions may not match repo, DB, template, or runtime. Use when implementing, fixing, refactoring, migrating, or verifying before code changes. Trigger on "verify trước khi sửa", "phát hiện lúc code", "known-unknowns", stack vs spec, mojibake, orphaned records, stale closure, permission hydrate, template gaps, or after plan-and-handoff before execution. Do NOT use for pure Q&A or plan-only work without implementation.
---

# Implementation Discovery

**Ý đồ:** Plan chốt quyết định; implement **xác minh thực tế** trước khi đổi behavior và xử lý unknown đúng cách — không bịa, không hỏi lại mọi thứ.

## Use when

- Scope đã khóa (plan hoặc slice rõ) và sắp sửa code/schema/UI
- Giả định plan chưa được đối chiếu với repo/template/DB thật
- Implement gặp mâu thuẫn spec vs source, hoặc bug chỉ lộ lúc chạy

## Do NOT use when

- Chỉ giải thích/review, chưa implement
- Task dài/multi-phase chưa cắt slice rõ → `plan-and-handoff` trước (≥2 files alone không kích hoạt)

## 1. Verify gate (đầu implement)

Trước khi đổi shared behavior, chạy gate ngắn:

1. Đọc entrypoint/index + file/interface liên quan (không preload cả repo).
2. Đối chiếu **Assumptions locked** và **Known-unknowns** từ plan với thực tế:
   - routes, services, schema/migration, template reference, permission hooks
3. Trace call sites / downstream consumers (`rules/10-execution.md` #3).
4. Nếu lệch: **báo lệch + cập nhật plan/handoff** trước khi code — không implement theo plan sai.

Output tối thiểu:

```text
Verify gate: assumptions checked against <sources>
Mismatch: (none | list)
Proceed: yes | blocked
```

## 2. Escape-hatch (giữa implement)

Gặp quyết định chưa chốt:

**Must-not-self-decide** → `BLOCKED`, ghi blocker (project: `open-questions.md`):

- credentials / secrets thật
- schema hoặc migration thật chưa owner chốt
- xóa/sửa lớn template hoặc shared API
- permission rule cụ thể chưa có nguồn
- bật RLS thay app-side permission khi chưa yêu cầu
- mock khi owner yêu cầu nối thật
- thu hẹp scope khi owner đã chốt full scope

**Small / equivalent options** → tự chọn, **log assumption** trong report, không gián đoạn owner.

Không hỏi user việc agent tự làm được; `BLOCKED` chỉ khi thuộc nhóm trên.

## 3. Known-unknowns catalog (rà lúc implement)

Những thứ plan **không thể chốt trước** — liệt kê trong plan, verify lúc code:

| Nhóm | Rà gì |
|---|---|
| **Data reality** | Orphaned FK; field mismatch DB↔model; type coerce (`"4"===4`); silent migration; cascade/trigger side effects |
| **Template / stack** | Repo stack ≠ spec; module gaps vs template vàng; reference module đang lỗi |
| **Encoding / render** | Mojibake UTF-8; PDF font Unicode; Excel number-as-text |
| **Runtime-only** | Stale closure/TDZ; conditional hooks; drawer stale state; download blob/atob/PWA filename |
| **Permission / auth** | Store chưa hydrate (`cap_bac`, `employeeRecord`); mock auth toast; test chỉ admin |
| **Hidden UI** | Orphan nodes tàng hình; `h-page` lồng đẩy footer; null FK hiển thị sai |

Ví dụ chi tiết 5fedu: `context/5fedu/domains/ui-delivery.md`, `domains/references/ui-delivery-detail.md`, `domains/module-mapping.md`.

## Read-only verify (plan-only modes)
Khi ở các chế độ `plan-authoring` hoặc `plan-review`, chỉ sử dụng các công cụ đọc (read-only tools như grep, view_file, list_dir, search) để thu thập thông tin và xác minh các giả định. Tuyệt đối không sửa mã nguồn. Kết quả đầu ra: `Proceed: yes` có nghĩa là tiếp tục soạn thảo/đánh giá kế hoạch (không phải code).

## Workflow tie-in

```text
plan-first path → read-only discovery (optional) → deliver plan
execute path → discovery verify (this skill) → finish-to-completion
```

## Phrase bank (recall)

verify trước khi sửa, phát hiện lúc code, known-unknowns, đối chiếu giả định, stack vs spec, orphaned, mojibake, stale closure, permission hydrate, template gaps
