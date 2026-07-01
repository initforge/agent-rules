# Mô Hình Runtime

Canonical source không bao giờ là runtime mirror.

- `04-tu-dong-hoa/01-build-runtime.ps1` build `01-global/loi` và `01-global/ky-nang` sang `05-ban-dung/runtime-build/<platform>/`.
- `04-tu-dong-hoa/02-cai-runtime.ps1` cài build output vào global runtime homes.
- `03-nen-tang/<platform>/` chỉ chứa overlay và adapter riêng cho từng runtime.

Hash của core và skills phải giống nhau giữa các platform, trừ overlay riêng. `.agents/`, `.codex/` và project adapter chỉ là pointer/configuration, không phải nơi mirror full global context.
