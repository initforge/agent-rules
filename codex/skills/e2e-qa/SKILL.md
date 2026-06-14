---
name: e2e-qa
description: Professional E2E QA for Codex and Grok CLI. ULTRA-SENSITIVE Turn-0 trigger — activate on ANY of e2e, test, QA, kiểm thử, playwright, spec, verify, production, regression, phân quyền, role, tiếp tục, làm đi, fix test, *.spec.ts, test:e2e, npm run test, or screenshot/terminal showing Playwright. Read SKILL.md before any test tool call. Completeness harness (blast radius → 8 dimensions → ladder) + anti-stuck. Full reference references/completeness-harness.md.
---

# E2E QA — Professional Tester

Tách khỏi `playwright` (CLI debug). Skill này = **tester chuyên nghiệp**, không snapshot lướt.

**Ưu tiên:** đầy đủ (đủ chiều + evidence) **>** tốc độ. Tối ưu tốc độ chỉ **sau** khi chọn chiều bắt buộc.

> Completeness is dimension coverage with evidence. Speed optimization is allowed only after the required dimensions are selected, never before.

Chi tiết: `references/completeness-harness.md`.

## Completeness harness (bắt buộc mọi task E2E)

```text
diff → blast radius → required dimensions (D1–D8) → run level L0–L4
     → matrix + test data contract → non-functional gates (nếu đụng)
     → execute → flake classification → done definition
```

### Blast radius (trước chiều)

| Radius | Ý nghĩa |
|---|---|
| `local` | 1 component / spec / helper |
| `screen` | 1 màn |
| `module` | Nhiều màn 1 module |
| `cross-module` | Shared helper, API, permission, report |
| `release` | Nhiều module hoặc không chắc phạm vi |

**Rules:** Không chắc radius → **nâng 1 bậc chạy**. **Unknown scope is not L1.** Shared helper/auth/fixture → không coi là `local`.

### 8 chiều (chọn subset theo diff — không cần cả 8 mọi lần)

| | Chiều |
|---|---|
| D1 | Business map (module → action → downstream) |
| D2 | Permission (allow + deny mỗi role) |
| D3 | CRUD & state (empty/loading/error) |
| D4 | Edge & negative |
| D5 | Cross-module |
| D6 | Surface (export/print/download thật) |
| D7 | Environment (env/session đúng) |
| D8 | Evidence (matrix + command output) |

### Test data contract (trong matrix)

Mỗi row quan trọng: **seed**, **role**, **create vs reuse**, **cleanup**, **time-sensitive?**  
**Cấm** data mơ hồ (“existing row”) khi cần evidence deterministic.

### Non-functional gates (conditional)

- a11y-critical UI → keyboard/aria cơ bản  
- perf-sensitive flow → không timeout/regression hiển nhiên  
- auth/payment/export → negative + security path (cùng D2/D4)

### Flake classification

| Class | Ghi chú |
|---|---|
| `PASS` | Ổn định; retry phải ghi count + lý do |
| `FAIL` | product/spec/data/env |
| `FLAKE` | Retry pass, chưa rõ — **PARTIAL**, không PASS sạch |
| `BLOCKED` | env/account/downstream |

### Done only when

1. diff + blast radius stated  
2. required dimensions selected  
3. matrix rows (+ data contract)  
4. run level khớp radius đã chạy  
5. evidence per required dimension  
6. failures classified  
7. không còn row trống trong scope  

Thiếu → `PARTIAL` / `BLOCKED`.

## Phase 0 — Deep intake

Đọc từng chữ: spec, AGENTS, permission doc, user stories, bug report. Liệt kê module, entity, role, side effects downstream.

## Phase 1 — Business map (D1)

```text
Module → Screen → Action → API/DB effect → Downstream (B/C modules)
```

## Phase 2 — Permission matrix (D2)

| Role | Read | Create | Update | Delete | Special actions |
|---|---|---|---|---|---|

- **Cấm** chỉ test Admin. Mỗi role: allowed + denied.

## Phase 3 — Test matrix (D3–D6, D8 — trước spec)

Bảng markdown — template trong `references/completeness-harness.md`:

- CRUD, toolbar, empty/loading/error, boundary, regression
- Cột data contract + blast radius + run level + evidence

## Phase 4 — Research (khi suite mới / domain phức tạp)

Skill `researcher` — ≥3 nguồn. Output: `Sources` · `Applied to matrix` · `Gaps`

## Phase 5 — Implement & run

- 1 spec = 1 module/flow/role slice; 1 test ≈ 1 behavior
- Locator ổn định; fixture deterministic (data contract)

### Execution ladder L0–L4

| Bậc | Khi |
|---|---|
| L0 | Debug locator |
| L1 | `local` + `-g` 1 test |
| L2 | `screen` / 1 file |
| L3 | `module` / smoke |
| L4 | `release` / full deep — cửa merge/nightly |

### Anti-stuck loop (bắt buộc)

**Cấm:** sửa 1 dòng → L4 / `*:deep` loop. Deep tối đa 1×/task giữa chừng; timeout 8m không output → `Ctrl+C`, diagnose `PARTIAL`. Cùng test fail >2 lần → CLI/trace, không sửa mù lần 3.

### Speed (sau completeness)

`storageState`, ready locator (không `networkidle` mặc định), parallel có session riêng — **không** cắt chiều D1–D8 trong scope.

### Scope redirect

| Sai | Đúng |
|---|---|
| L4 sau edit nhỏ | L1 `-g` |
| Chạy test không matrix | Viết matrix ngắn |
| Unknown scope + L1 | Nâng bậc + ghi blast radius |

## Phase 6 — Report

```text
Blast radius:
Required dimensions:
Test matrix:
Test data contract:
Run level executed:
Commands run:
Outcomes (PASS/FAIL/FLAKE/BLOCKED):
Retries:
Skill activated: e2e-qa
Status: PASS | PARTIAL | BLOCKED
```

## Skill activation (Turn-0)

Kích hoạt: test/e2e/playwright/spec; sửa `*.spec.ts`; `npm run test*`; ảnh terminal Playwright.

**In message:** `Skill scan: … → e2e-qa` · `Skill activated: e2e-qa` — trước Shell/Edit test.

## vs `playwright` CLI

| playwright | e2e-qa |
|---|---|
| CLI debug 1 màn | Matrix, dimensions, ladder, release gate |