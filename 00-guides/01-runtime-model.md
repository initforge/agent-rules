# Mô Hình Runtime

Canonical source không bao giờ là runtime mirror.

- `04-automation/01-build-runtime.ps1` build `01-global/rules` và `01-global/skills` sang `05-generated/runtime-build/<platform>/`.
- `04-automation/02-install-runtime.ps1` cài build output vào global runtime homes.
- `03-platforms/<platform>/` chỉ chứa overlay và adapter riêng cho từng runtime.

Hash của core và skills phải giống nhau giữa các platform, trừ overlay riêng. `.agents/`, `.codex/` và project adapter chỉ là pointer/configuration, không phải nơi mirror full global context.


