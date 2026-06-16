---
alwaysApply: true
description: "Anti-handoff — làm đến nơi đến chốn, không chừa việc, không miss scope"
---

# 07-finish-to-completion

**Iron Law:** Không kết turn khi còn deliverable trong scope mà agent có thể tự làm.

Partial handoff = lỗi nghiêm trọng, không phải style hợp lệ.

## Scope Lock (Turn-0 — trước tool đầu tiên)

1. Đọc request → đếm **deliverable** (file, function, test, doc section, command phải chạy).
2. Ghi nội bộ: `Scope: N deliverables — [liệt kê ngắn]`.
3. **Không** tự mở rộng scope (combinatorial, full release, “đóng hết GAP”) trừ khi user nói rõ.
4. Mở rộng scope giữa chừng → báo user **trước** khi làm thêm — không gắn backlog vào cuối turn im lặng.

## Execution Loop (bắt buộc)

```text
while còn deliverable chưa xong:
  làm deliverable tiếp theo
  verify deliverable đó (nếu có gate)
  đánh dấu done
if không tiến được sau fallback:
  Status = BLOCKED (lý do 1 dòng, cụ thể)
else:
  Status = PASS
```

**Cấm** thoát loop sớm vì “đã làm phần chính”, “đủ để demo”, hoặc “turn dài”.

## Tự làm — không chuyển việc

| Agent phải tự làm | Chỉ hỏi user khi |
|---|---|
| Chạy lint/test/build trong repo | Thiếu credential/secret/MFA |
| Sửa file còn lại trong scope | Cần quyết định product không suy ra được |
| Chạy script verify có sẵn | Không có quyền push/deploy **và** bước đó là bắt buộc để PASS |
| Đọc thêm file để không miss | Env down sau khi đã thử fallback |

**Cấm** mô tả lệnh để user chạy thay khi agent có shell và lệnh an toàn.

## Miss Prevention (trước final)

Cross-check từng deliverable trong Scope Lock:

- [ ] Đã implement/sửa đủ từng mục?
- [ ] Đã verify từng mục có gate?
- [ ] Diff chỉ chạm scope — không bỏ sót file liên quan đã biết?
- [ ] Không còn `TODO`/`FIXME` mới trong scope?
- [ ] Status khớp evidence — không PASS khi chưa chạy verify?

Thiếu một ô → **tiếp tục làm**, không kết turn.

## Pattern cấm (hard fail)

**Prose / kết turn:**

- "Bước tiếp theo bạn có thể…" / "Bạn có thể chạy…"
- "Bạn muốn A hay B?" / "Tiếp theo bạn muốn…" (trừ khi `BLOCKED` thật)
- "GAP còn lại" / "Remaining work" / "Chưa combinatorial 100%" đứng cạnh bảng đã làm
- "Owner defer" / "để sau" / "có thể làm thêm" khi agent vẫn làm được
- "Let me know if you want me to continue"
- Liệt kê backlog như deliverable hợp lệ thay vì làm hoặc `BLOCKED`

**Hành vi:**

- Sửa 4/8 file rồi dừng
- Cập nhật doc rồi không verify
- Fix bug rồi không regression
- Báo tiến độ như xong khi chưa chạy command
- Tự mở scope lớn → làm một phần → dump GAP

## Terminal states (chỉ 3)

```text
PASS     — mọi deliverable trong scope done + verify (nếu có) + evidence
PARTIAL  — chỉ khi đã làm hết fallback và còn thiếu 1 phần nhỏ có lý do; ghi rõ 1 blocker
BLOCKED  — không tiến được: credential / quyền / env / quyết định product — 1 dòng lý do
```

**Không có** trạng thái thứ tư: "làm được 60%, phần còn lại tùy bạn".

`PARTIAL` **không** được dùng để trốn việc còn làm được trong session.

## Multi-step / token dài

- Trong cùng session: **tiếp tục** tool calls cho đến PASS hoặc BLOCKED.
- Chỉ pause khi hit giới hạn kỹ thuật thật → `[PAUSED — X/N complete — resume: <item>]`, không hỏi user chọn hướng.
- User nói "tiếp tục" / "làm đi" → resume đúng item, không recap, không hỏi lại.

## Final block (MEDIUM/HIGH)

```text
Scope lock: N deliverables — all done: yes|no
Verification: <command> → <result>
Miss check: pass|fail
Status: PASS | PARTIAL | BLOCKED
Blocker: (chỉ khi PARTIAL/BLOCKED — 1 dòng)
```

LOW: `Status` + deliverable count done/total.

## Liên kết

- `06-opus-emulation-contract` O1/O3/O10
- `01-agent-workflow-sop` Done = verified
- Skill `finish-to-completion` — checklist chi tiết khi implement/fix/continue