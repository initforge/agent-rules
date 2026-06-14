# E2E Completeness Harness

**Ưu tiên:** đầy đủ (đủ chiều + evidence) **>** tốc độ. Tối ưu tốc độ chỉ sau khi đã chọn chiều bắt buộc — never before.

> Completeness is dimension coverage with evidence. Speed optimization is allowed only after the required dimensions are selected, never before.

## Flow bắt buộc (agent)

```text
diff → blast radius → required dimensions → run level (L0–L4)
     → matrix (+ data contract) → conditional non-functional gates
     → execute → classify outcomes → done definition
```

---

## Step 0 — Blast radius (trước chiều)

Xác định phạm vi lan truyền **trước** khi chọn chiều hoặc L1:

| Radius | Nghĩa | Ví dụ |
|---|---|---|
| `local` | 1 component / spec / helper | Sửa 1 assert, 1 locator |
| `screen` | 1 màn | Form list, 1 tab |
| `module` | Nhiều màn 1 module | Transport CRUD |
| `cross-module` | Shared data, API, permission, report | Auth helper, payroll rollup |
| `release` | Nhiều module hoặc **không chắc** phạm vi | Refactor, dependency bump |

**Rules:**

- Không xác định được blast radius → **nâng 1 bậc chạy** (L1→L2, L2→L3).
- **Unknown scope is not L1.**
- Sửa “nhỏ” nhưng đụng shared helper, route, fixture, auth, API client → tối thiểu `screen` hoặc `module`, không L1.

### Blast radius → run level (gợi ý tối thiểu)

| Radius | Run level tối thiểu (sau khi chọn chiều) |
|---|---|
| local | L1 `-g` 1 test |
| screen | L1–L2 (file spec) |
| module | L2–L3 (module / smoke) |
| cross-module | L2–L3 |
| release | L3–L4 (full / nightly) |

---

## 8 chiều đầy đủ (dimensions)

Chọn **chiều bắt buộc** theo diff + blast radius — không cần cả 8 mọi lần.

| # | Chiều | Đầy đủ khi |
|---|---|---|
| D1 | Business map | Module → screen → action → side effect downstream |
| D2 | Permission | Mỗi role allow + deny (không chỉ admin) |
| D3 | CRUD & state | CRUD + empty / loading / error |
| D4 | Edge & negative | Validation, boundary, duplicate, 403/404 |
| D5 | Cross-module | Shared data / API ảnh hưởng B/C |
| D6 | Surface | Export / print / download — file thật nếu scope có |
| D7 | Environment | Đúng env; session/auth thật |
| D8 | Evidence | Matrix + command output; không PASS ảo |

### Diff → chiều (quick map)

| Diff chạm | Chiều bắt buộc tối thiểu |
|---|---|
| spec/helper only | D7, D8 + case liên quan |
| 1 màn UI | D3, D4 + D2 nếu role đụng màn |
| auth / RLS | D2 (+ D5 nếu shared data) |
| API / shared service | D1, D5 |
| export / report | D6 (+ D3) |
| refactor / release | D1–D8 trong scope release |

---

## Test data contract (trong matrix)

Cột bắt buộc — E2E fail/miss thường do data mơ hồ.

| Field | Ghi rõ |
|---|---|
| Seed / fixture | File, script, env var |
| User / role | Account cụ thể |
| Record create | Tạo mới gì, khi nào |
| Record reuse | ID / key reuse — deterministic |
| Cleanup | Sau test / afterAll |
| Time-sensitive? | Date, TTL, cron — yes/no |

**Rule:** Không dùng “existing customer” / “some row” nếu cần evidence deterministic.

Matrix row mẫu:

```text
| Case | Dim | Data seed | Role | Cleanup | Run level |
```

---

## Conditional non-functional gates

Không thành chiều thứ 9 — **gate bổ sung** khi diff chạm vùng:

| Diff chạm | Gate (bắt buộc nếu trong scope) |
|---|---|
| a11y-critical UI | Keyboard focus, aria label cơ bản, không trap |
| perf-sensitive flow | Không timeout rõ; không regression load obvious |
| security / auth / payment / export | Negative path + deny (kết hợp D2/D4) |

Ví dụ auth/RLS:

```text
required: D2 Permission + D4 Negative + D5 if shared data
optional gate: security regression (403, session invalid)
```

---

## Flake classification (outcome)

Mọi kết quả phải phân loại — **retry pass ≠ PASS sạch tự động**.

| Class | Ý nghĩa | Final status |
|---|---|---|
| `PASS` | Output ổn định, không retry hoặc retry có lý do ghi rõ | PASS |
| `FAIL` | Product / spec / data / env xác định | PARTIAL / BLOCKED |
| `FLAKE` | Retry pass, nguyên nhân chưa chốt | PARTIAL — phải ghi retry count |
| `BLOCKED` | Env down, account, external | BLOCKED |

**Rule:** Evidence ghi `retries: N` và lý do nếu N > 0. Không `Status: PASS` khi còn FLAKE chưa giải thích trong scope.

---

## Run level L0–L4 (speed sau completeness)

| Bậc | Khi | Ví dụ |
|---|---|---|
| L0 | Debug locator | playwright CLI / headed 1 test |
| L1 | local radius, chiều đã chọn | `-g` 1 test |
| L2 | screen / module | 1 file spec |
| L3 | module / cross-module | smoke, folder, multi-file |
| L4 | release / unknown scope | full deep, CI nightly |

Chỉ leo bậc khi bậc hiện tại pass hoặc FAIL đã khoanh đủ 1 case.

---

## Speed (sau khi chiều đã chọn)

- `storageState` / persona — không bỏ D2
- Ready locator — thay `networkidle`; không bỏ D3
- Parallel — session/account riêng; không share role
- L1/L2 thay L4 trong dev loop — **không** thay thế L4 ở cửa release

---

## Done definition (agent dừng khi nào)

```text
Done only when:
1. diff classified (+ blast radius stated)
2. required dimensions selected (D1–D8 subset)
3. matrix rows created/updated (incl. data contract)
4. matching run level executed per radius
5. evidence attached per required dimension (command → output)
6. all failures classified (PASS/FAIL/FLAKE/BLOCKED)
7. no required-scope matrix row remains empty
```

Thiếu 1–7 → `PARTIAL` hoặc `BLOCKED`, không `PASS`.

---

## Matrix template (copy vào plan hoặc comment PR)

```markdown
## E2E matrix — <feature>

**Blast radius:** local | screen | module | cross-module | release
**Run level:** L0 | L1 | L2 | L3 | L4
**Required dimensions:** D1, D2, ...

| # | Case | Dim | Role | Data / seed | Cleanup | NFR gate | Level | Evidence |
|---|------|-----|------|-------------|---------|----------|-------|----------|
| 1 | ... | D3 | admin | fixture X | afterAll | — | L1 | `cmd` → pass |
```

---

## Final evidence block (message)

```text
Blast radius:
Required dimensions:
Test matrix: (rows ticked)
Test data contract: OK / gaps
Run level executed:
Commands run:
Outcomes: PASS n | FAIL n | FLAKE n | BLOCKED n
Retries:
Non-functional gates:
Skill activated: e2e-qa
Status: PASS | PARTIAL | BLOCKED
```