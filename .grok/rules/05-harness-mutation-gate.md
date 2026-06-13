---
description: "Chống tự tiến hóa harness — chỉ sửa khi user yêu cầu rõ"
---

# 05-harness-mutation-gate

Chống bệnh agent **tự thêm/sửa/xóa** rules, skills, workflows, INTENT, sync script trong lúc làm task thường.

## Nguyên tắc

**Harness = hạ tầng, không phải notepad.** Mặc định **CẤM** mutate harness. Learning loop **không** được tự ghi vào harness.

## Phân tầng learning (bắt buộc)

| Tier | Đích | Path | Ai được ghi |
|---|---|---|---|
| L0 | Ghi nhớ lượt | chat / báo cáo cuối | Agent |
| L1 | Dự án hiện tại | `<repo>/.grok/5fedu/`, `AGENTS.md` dự án, `plan/` | Agent khi feedback lặp **trong dự án đó** |
| L2 | Harness master | `cursor/rules/`, `cursor/skills/`, `cursor/INTENT.md` | **Chỉ khi user yêu cầu rõ** |
| L3 | Nền khác | `codex/`, `antigravity/`, `kiro/`, `.agents/`, `.kiro/` | **Chỉ khi user yêu cầu rõ + đúng nền** |

**Không nhảy tier.** Feedback 1 lần → L0 hoặc L1, không promote L2/L3.

## Khi nào ĐƯỢC sửa harness (L2)

Chỉ khi user nói rõ trong session, ví dụ:

- "sửa harness", "cập nhật rule", "thêm skill", "sync harness"
- "áp lên toàn bộ hệ thống", "port sang grok/codex"
- "execute plan" / design doc **chỉ định** đụng `cursor/` hoặc `.grok/`

Không đủ: "làm cho chuẩn hơn", "cải tiến thêm", "fix triệt để" (→ sửa **code dự án**, không sửa harness).

## Khi nào CẤM (mặc định)

- Task sửa bug/feature/UI/DB trên dự án khách
- User phàn nàn agent làm dở → sửa code, **không** thêm rule mới
- "Tôi sẽ thêm rule để lần sau..." → **CẤM** trừ user yêu cầu
- Cleanup/audit → **không** đụng `cursor/`, `.grok/`, `codex/rules/`, protected skills
- Chạy `sync-harness.sh` khi user chưa yêu cầu sync harness

## Protected paths (không xóa/rename/gitignore/gộp)

```text
cursor/
.grok/rules/
.grok/skills/
cursor/scripts/sync-harness.sh
codex/rules/
codex/skills/
.agents/rules/
.agents/skills/
.kiro/steering/
kiro/steering/
docs/06-harness-philosophy.md
docs/07-cursor-composer-harness.md
docs/08-opus-emulation-harness.md
```

Live `.grok/` là mirror — **sửa master `cursor/`**, rồi sync. Không sửa live rồi quên master.

## Quy trình khi muốn đổi harness (user đã yêu cầu)

1. Nêu **1 câu** thay đổi + tier (L2/L3) + file đích.
2. Sửa **tối thiểu** — không refactor harness lan.
3. Không tạo skill mới nếu mở rộng skill cũ đủ.
4. Chạy `cursor/scripts/sync-harness.sh` nếu đổi `cursor/rules` hoặc `cursor/skills`.
5. Báo user cần sync `codex/` / `.agents/` / `kiro/` **riêng** — không tự sync chéo.

## Đề xuất thay vì tự sửa (mặc định)

Khi học được điều có thể thành rule:

```text
Harness proposal (chưa áp):
- Tier đề xuất: L1 | L2 | L3
- File đề xuất: ...
- Nội dung 1-3 dòng: ...
- Lý do: ...
→ Cần user xác nhận trước khi sửa harness.
```

Ghi vào `plan/` hoặc báo cáo cuối. **Không** ghi thẳng vào `cursor/rules/`.

## Repo `agent-rules` đặc biệt

Đây là repo harness, **không** phải dự án 5fedu. Làm việc ở đây:

- Câu hỏi kiến trúc → trả lời ngắn, **không** explore 15+ file rồi sửa harness.
- Chỉ mutate harness khi user chỉ định scope harness.

## Anti-pattern (tuyệt đối cấm)

| Bệnh | Cách xử lý đúng |
|---|---|
| Mỗi lỗi thêm 1 rule file | Ghi L1 project context hoặc proposal L2 |
| Promote feedback 1 lần lên `codex/rules/` | L0/L1; L3 cần user |
| Tạo skill umbrella trùng skill cũ | Mở rộng skill có sẵn |
| Đọc harness để "hiểu" rồi sửa luôn | Đọc tối thiểu; sửa chỉ khi user yêu cầu |
| Copy Antigravity nặng sang Grok | Adapt Codex-light; xem `docs/06` |