# Dual MCP — Playwright + Chrome DevTools

## Vai trò

| MCP | Mạnh | Yếu |
|---|---|---|
| **Playwright** | Snapshot a11y, click ref ổn định, multi-page, wait | Ít “x-ray” network/console chi tiết |
| **Chrome DevTools** | Console, network, perf, CDP, screenshot deep | Click tree kém structured hơn PW |

## Quy tắc phối hợp

1. **Happy path / matrix case** → Playwright first.
2. **Case fail** → DevTools: console errors, failed XHR, status codes; chụp screenshot.
3. **Nghi flaky / chậm** → DevTools performance + Playwright retry 1 lần.
4. **Không** chạy 2 navigate song song cùng URL nếu đụng profile — sequential: PW session rồi DevTools inspect, hoặc isolated profiles.
5. Adapter harness: Chrome DevTools `--isolated` (temp profile) — an toàn multi-agent.

## Thiếu MCP

| Thiếu | Hành động |
|---|---|
| Thiếu Playwright | Dùng DevTools only; `PARTIAL` nếu click complex |
| Thiếu DevTools | Playwright only; ghi thiếu console/network evidence |
| Thiếu cả hai | `BLOCKED` / `PARTIAL` 1 dòng — re-run `02-install-runtime` |
