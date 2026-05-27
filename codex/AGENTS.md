@C:\Users\DELL\.codex\RTK.md
@C:\Users\DELL\.codex\rules\core.md
@C:\Users\DELL\.codex\rules\planning.md
@C:\Users\DELL\.codex\rules\execution.md
@C:\Users\DELL\.codex\rules\quality-gates.md
@C:\Users\DELL\.codex\rules\context-tools.md
@C:\Users\DELL\.codex\rules\tool-inventory.md
@C:\Users\DELL\.codex\rules\clean-code.md
@C:\Users\DELL\.codex\rules\codex-overlay.md

# Bộ Nạp Runtime Codex

File này là điểm vào global cho Codex.

## Nguồn Runtime

Dùng file local dưới:

```text
C:\Users\DELL\.codex\
```

Không phụ thuộc vào `P:\agent-rules` khi làm việc hằng ngày.

`P:\agent-rules` chỉ dùng cho:
- backup
- sync
- bootstrap máy mới
- chia sẻ rule với agent/tool khác
- lưu tài liệu setup dài

## Quy Tắc Ngôn Ngữ

- Giao tiếp với người dùng bằng tiếng Việt có dấu đầy đủ.
- Không dùng tiếng Việt không dấu.
- Không dùng tiếng Anh nếu có cách nói tiếng Việt tự nhiên.
- Giữ tiếng Anh cho thuật ngữ kỹ thuật, tên model, lệnh, đường dẫn, API, package, schema key, tên tool, tên sản phẩm và mã nguồn.

## Tóm Tắt Vận Hành

Task nhỏ rõ ràng -> sửa trực tiếp + verify tối thiểu.

Task vừa -> đọc ngữ cảnh + lập plan khi có nhiều lát cắt + triển khai + verify.

Task rủi ro cao -> locked plan + risk register + reviewer gate + verify sâu.

HIGH risk hoặc multi-domain -> phải băm thành `plan/<feature>/00-index.md` và các slice liên tục `01-...md`, `02-...md`, `03-...md`; không dùng mega-plan hoặc số nhảy như `30`, `35`, `60` nếu không có convention được ghi rõ.

`Codex Research` -> lớp nghiên cứu chính; ghi note vào `plan/<feature>/research/` hoặc `plan/<feature>/review/`.

`GitNexus` -> công cụ context/impact có kiểm soát, không tự index mỗi lượt.

`RTK` -> lớp nén lệnh; PowerShell cmdlet cần `rtk proxy powershell`.

Skill/MCP/tool -> ghi inventory và tài liệu dưới `.codex\docs` và `.codex\inventory`.

Trạng thái cuối phải là `PASS`, `PARTIAL`, hoặc `BLOCKED`.

## Quy Tắc Cứng

Codex là chủ sở hữu triển khai cuối cùng.
