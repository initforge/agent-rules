---
alwaysApply: false
description: Hard gates for slice-scoped execution and ledger-backed PASS.
---

# Slice completion gate

Execute pivot với ≥3 AC hoặc multi-file slice → đọc `skills/finish-to-completion/references/slice-gate-protocol.md` **trước edit đầu tiên**.

**Hard gates:**

- `Status: PASS` **cấm** khi ledger hiện tại còn `- [ ]`, `[!]` hoặc evidence placeholder. Ledger mặc định ở `.agent/plans/<plan-id>/ledger/`; `.agent/ledger/` chỉ đọc để migrate.
- **1 session = 1 slice** — scope creep ngoài Scope IN = `BLOCKED` (trừ user pivot).
- **Path E:** chỉ đóng AC còn mở trong ledger — cấm re-run full plan.
- Verify cmd từ slice phải chạy fresh trước PASS — không "should work".
- Mỗi AC trong tracked plan phải có runner receipt mới khớp `plan_hash`, `revision`, `phase contract_hash`, command hash, exit code và expected result; copy output vào ledger chỉ là derived view.
- Ledger sạch chỉ chứng minh `SLICE_PASS`; không được suy rộng thành toàn-plan PASS. Tracked plan chỉ hoàn tất khi `planctl finalize` re-audit và phát `PLAN_PASS`.

**Report footer (execution):**

```text
Ledger: <path> | Slice: <id> | Open AC: 0
```

Procedure + Gates A–D + Path E → SGP (single source). AC format → `completion-ledger.md`; machine gate: `automation/audit-slice-ledger.ps1 -LedgerPath <path> -Strict`.
