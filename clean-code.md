# Bộ Nạp Clean Code

File này là điểm tương thích cho các project vẫn import:

```text
@P:\agent-rules\clean-code.md
```

Rule clean-code đang được bảo trì nằm tại:

```text
@P:\agent-rules\codex\rules\clean-code.md
```

Tài liệu tham chiếu:

```text
P:\agent-rules\codex\docs\clean-code-reference.md
```

## Tóm Tắt Tương Thích

- Xem clean code là công cụ kiểm soát rủi ro, không phải mục tiêu làm đẹp.
- Chỉ cleanup nhỏ trong đúng vùng đang chạm nếu nó giảm rủi ro hoặc giảm chi phí đọc code.
- Refactor có phạm vi lớn cần plan, kiểm tra blast radius và verify rõ.
- Xóa dead code phải có bằng chứng.
- Dùng GitNexus trước khi xóa, đổi tên, di chuyển hoặc refactor symbol dùng chung.
- Tránh churn chỉ vì style nếu nó không giảm rủi ro bug hoặc chi phí bảo trì.

