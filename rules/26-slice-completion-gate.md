---
alwaysApply: true
description: Hard gates for slice-scoped execution and ledger-backed PASS.
---

# Slice completion gate

Execute pivot với ≥3 AC hoặc multi-file slice → đọc `skills/finish-to-completion/references/slice-gate-protocol.md` **trước edit đầu tiên**. Tiny/clear normal một file vẫn dùng quick verify, không bị ép ceremony.

**Hard gates:**

- `Status: PASS` **cấm** khi ledger của slice hiện tại còn `- [ ]`, `[!]` hoặc evidence placeholder. Ledger mới mặc định ở `.agent/plans/<plan-id>/ledger/`; `.agent/ledger/` là compatibility path, không quét toàn repo.
- **1 session = 1 slice** — scope creep ngoài Scope IN = `BLOCKED` (trừ user pivot).
- **Path E:** chỉ đóng AC còn mở trong ledger — cấm re-run full plan.
- Verify cmd từ slice phải chạy fresh trước PASS — không "should work".

**Report footer (execution):**

```text
Ledger: <path> | Slice: <id> | Open AC: 0
```

Procedure + Gates A–D + Path E → SGP (single source). AC format → `completion-ledger.md`. Machine gate: `automation/audit-slice-ledger.ps1 -LedgerPath <path> -Strict`.
