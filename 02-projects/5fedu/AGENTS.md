# 5fedu Project Entry

Đây là entrypoint duy nhất cho context 5fedu trong một repo dự án.

## Đọc trước

1. `context/5fedu/00-map/read-first.md`
2. `context/5fedu/00-map/decisions.md`
3. `context/5fedu/00-map/open-questions.md`

## Chức năng từng lớp

- `10-live-rules/`: rule đang sống, được sửa khi chốt quy tắc mới.
- `20-mapping/`: mapping spec, template, source coverage.
- `30-evidence/`: feedback thô, evidence, audit.
- `40-legacy/`: tài liệu cũ để tham chiếu, không phải source of truth.
- `90-notes/`: note kỹ thuật dài, ít truy cập.

## Quy tắc sửa

- Chốt rule mới: sửa `10-live-rules/`
- Chốt quyết định owner: sửa `00-map/decisions.md`
- Thiếu dữ kiện: ghi `00-map/open-questions.md`
- Log/evidence: chỉ ghi `30-evidence/`
- Legacy không được promote ngược lên rule sống nếu chưa review


