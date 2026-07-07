# Completion ledger (AC-gate máy kiểm)

**Ý đồ:** Biến "verify before claim" từ prose thành artifact **máy grep được**. Đóng lỗ hổng model tự tuyên `PASS` mà không chạy evidence — nguyên nhân chính của "tường 90%".

## Khi nào dùng

- Task `normal`/`high-risk` mode=`execution` có **≥3 deliverable** hoặc **acceptance criteria (AC)** rõ.
- Bắt buộc khi execute một phase từ PAF (`plan-and-handoff`) hoặc một gap-closure slice.
- Bỏ qua với `tiny` (1 file) — dùng self-report trace thường.

## Vị trí file

`<working-repo>/.agent/ledger/<phase-or-slice-id>.md` — `.agent/` gitignored, advisory, không phải canonical.

## Format (một dòng một AC)

```md
# Ledger: <slice-id> — <mô tả 1 dòng>
tier_used: L0 | L1 | L2

- [ ] AC1 <mô tả> | verify: `<cmd chạy thật>` | evidence: <chưa chạy>
- [ ] AC2 <mô tả> | verify: `rg -n "CANCELLED" apps/ | wc -l` | evidence: <chưa chạy>
```

Sau khi chạy verify, điền evidence + tick:

```md
- [x] AC2 no CANCELLED refs | verify: `rg -n "CANCELLED" apps/ | wc -l` | evidence: `0`
```

## Luật gate (hard)

1. **Mỗi AC phải có `verify:` là command chạy được** — không phải "đã kiểm tra bằng mắt".
2. **`evidence:` phải là output THẬT** copy từ lần chạy fresh trong session — không "should be 0".
3. **Cấm `PASS`** khi còn bất kỳ `- [ ]` (chưa tick) hoặc `evidence: <chưa chạy>`.
4. Command tự kiểm trước final message:

   ```bash
   grep -nE "^- \[ \]|evidence: <chưa chạy>" .agent/ledger/<slice-id>.md
   ```

   Có dòng khớp → **continue working**, không respond final.
5. AC không tick được do blocker must-not-self-decide → đánh dấu `- [!]` + ghi blocker; status `BLOCKED`/`PARTIAL`, không `PASS`.

## Ví dụ AC verify theo loại

| Loại thay đổi | verify command mẫu |
|---|---|
| Xoá symbol xuyên repo | `rg -n "<symbol>" apps/ packages/ \| wc -l` → kỳ vọng `0` |
| Build sạch | `npm run build 2>&1 \| tail -5` |
| Typecheck | `npm run typecheck 2>&1 \| tail -5` |
| E2E | `npm run test:mission 2>&1 \| tail -15` |
| File ≤ giới hạn dòng | `wc -l <file>` → `≤ 300` |
| API wiring thật | `rg -n "<field>" apps/api/src/services/<svc>.ts` |
| DB migration áp | `npx prisma migrate status 2>&1 \| tail -5` |

## Liên kết

- Enforcement: `finish-to-completion/SKILL.md` §Verify Before Claim.
- Tier ghi trong ledger khớp phase `tier_used` của PAF (`plan-and-handoff/references/capability-tier-routing.md`).
