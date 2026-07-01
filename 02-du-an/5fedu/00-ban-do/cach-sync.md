# Cách Sync 5fedu

Mặc định chỉ sync một chiều:

`02-du-an/5fedu -> project context/5fedu`

Không sync hai chiều tự do.

## Được phép

- cập nhật template 5fedu canonical rồi cài vào repo dự án
- promote rule từ evidence sang `10-rule-song/` sau khi review
- cập nhật `quyet-dinh.md` khi có xác nhận rõ

## Không được phép

- copy log/evidence vào global context
- copy nguyên `.agents/`, `.codex/`, runtime build hoặc generated mirrors về canonical
- sửa `40-legacy/` rồi coi như đã sửa rule sống
