# Bảo Trì Và Rủi Ro

## 1. Nguyên tắc bảo trì

`agent-rules` là repo nhỏ về code nhưng rủi ro cao về vận hành. Một thay đổi sai trong rule, skill hoặc script có thể làm mọi phiên Codex sau đó hành xử sai. Vì vậy bảo trì repo này phải ưu tiên tính rõ ràng, khả năng phục hồi và khả năng kiểm chứng hơn tốc độ.

## 2. Vùng nhạy cảm

| Vùng | Vì sao nhạy cảm | Cách đổi an toàn |
|---|---|---|
| `codex/AGENTS.md` | Điểm nạp runtime | Kiểm tra import path và chạy `verify-codex-rules.ps1` |
| `codex/rules/core.md` | Ảnh hưởng mọi task | Đọc lại các rule liên quan và test bằng task nhỏ |
| `codex/rules/planning.md` | Quy định plan/slice | Validate bằng một plan thật hoặc sample |
| `codex/skills/*/SKILL.md` | Ảnh hưởng trigger và workflow skill | Chạy `quick_validate.py` nếu là Codex skill |
| `codex/scripts/sync-*.ps1` | Có thể ghi đè runtime | Test bằng dry-run hoặc backup trước |
| `codex/inventory/*` | Có thể lộ path/secret | Không ghi secret value |

## 3. Rủi ro thường gặp

### Runtime lệch giữa local và backup

**Dấu hiệu:** Codex trên máy local dùng skill mới, nhưng repo hoặc `P:\agent-rules` vẫn giữ bản cũ.

**Nguyên nhân:** Sửa `C:\Users\DELL\.codex` nhưng quên sync.

**Xử lý:** Chạy `sync-codex-to-p.ps1`, sau đó commit thay đổi trong repo nếu đây là bản cần lưu lâu dài.

### Restore nhầm hướng

**Dấu hiệu:** Skill/rule vừa sửa biến mất sau khi chạy script.

**Nguyên nhân:** Chạy restore từ `P:\agent-rules\codex` về local trong khi backup cũ hơn.

**Xử lý:** Kiểm tra git diff, timestamp và nội dung trước khi restore. Khi cần, tạo backup trước khi ghi đè.

### Registry đẹp nhưng không đúng máy thật

**Dấu hiệu:** Docs nói tool có sẵn nhưng `verify-toolchain.ps1` hoặc inventory không khớp.

**Nguyên nhân:** Registry được cập nhật thủ công nhưng không chạy inventory.

**Xử lý:** Chạy lại `inventory-current-machine.ps1`, cập nhật registry theo kết quả thật.

### Skill trigger sai

**Dấu hiệu:** Codex gọi skill trong ngữ cảnh không phù hợp hoặc không gọi khi cần.

**Nguyên nhân:** `description` trong frontmatter quá hẹp, quá rộng hoặc stale so với workflow thật.

**Xử lý:** Sửa `description`, chạy validate, thử bằng một prompt thực tế và ghi lại trigger trong registry.

## 4. Quy trình đổi skill

1. Sửa skill trong `C:\Users\DELL\.codex\skills/<skill>`.
2. Chạy validation tương ứng.
3. Sync sang `P:\agent-rules\codex\skills/<skill>`.
4. Cập nhật `codex/docs/skills-registry.md` nếu trigger, path hoặc verify command đổi.
5. Commit repo với mô tả rõ và `[skip ci]` nếu chỉ là docs/runtime metadata.

## 5. Quy trình đổi rule

1. Xác định rule thuộc lớp nào: core, planning, execution, quality, context hay inventory.
2. Kiểm tra rule khác có đang phụ thuộc vào wording hoặc status values không.
3. Sửa rule.
4. Chạy `verify-codex-rules.ps1`.
5. Chạy một task nhỏ hoặc dry-run plan để kiểm tra rule có thể thực thi.
6. Sync và commit.

## 6. Cleanup policy

Được xóa:

- `__pycache__/`
- `*.pyc`
- backup cũ đã được thay thế
- docs trùng lặp đã merge vào spec/operations

Không được xóa nếu chưa đọc:

- rule runtime
- skill references
- registry
- inventory snapshot đang dùng để bootstrap
- script sync/restore

## 7. Checklist trước khi commit

- [ ] `git status` chỉ chứa thay đổi đúng scope.
- [ ] Không còn file cache/binary artifact vô nghĩa.
- [ ] Skill thay đổi đã validate.
- [ ] Rule thay đổi đã chạy `verify-codex-rules.ps1`.
- [ ] Docs không chứa secret.
- [ ] Commit message có `[skip ci]`.
