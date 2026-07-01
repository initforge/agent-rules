# 5fedu Project Entry

Đây là entrypoint duy nhất cho context 5fedu trong một repo dự án.

## Đọc trước

1. `context/5fedu/00-ban-do/doc-truoc.md`
2. `context/5fedu/00-ban-do/quyet-dinh.md`
3. `context/5fedu/00-ban-do/cau-hoi-mo.md`

## Chức năng từng lớp

- `10-rule-song/`: rule đang sống, được sửa khi chốt quy tắc mới.
- `20-mapping/`: mapping spec, template, source coverage.
- `30-bang-chung/`: feedback thô, evidence, audit.
- `40-legacy/`: tài liệu cũ để tham chiếu, không phải source of truth.
- `90-ghi-chu/`: note kỹ thuật dài, ít truy cập.

## Quy tắc sửa

- Chốt rule mới: sửa `10-rule-song/`
- Chốt quyết định owner: sửa `00-ban-do/quyet-dinh.md`
- Thiếu dữ kiện: ghi `00-ban-do/cau-hoi-mo.md`
- Log/evidence: chỉ ghi `30-bang-chung/`
- Legacy không được promote ngược lên rule sống nếu chưa review
