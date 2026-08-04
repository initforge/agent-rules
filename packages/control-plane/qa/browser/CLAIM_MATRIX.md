# Control Plane Browser QA - Claim Matrix

**Verifier**: Read-only/browser verifier  
**Date**: 2026-08-02  
**Candidate**: packages/control-plane  
**Tool**: Playwright + Chrome CDP  

---

## Route Coverage Matrix

| Route | Type | Component | API Dependencies | Test Status |
|-------|------|----------|-----------------|-------------|
| `/overview` | SPA | Overview.tsx | `/api/health`, `/api/config/all`, `/api/plans` | ⚠️ FAIL (409) |
| `/plan` | SPA | PlanWorkspace.tsx | `/api/plans`, `/api/mutation/*` | ⚠️ FAIL (409) |
| `/runs` | SPA | Runs.tsx | `/api/runs` | UNTESTED |
| `/evaluations` | SPA | Evaluations.tsx | `/api/health` | UNTESTED |
| `/architecture` | SPA | Architecture.tsx | `/api/config/agents`, `/api/config/all` | UNTESTED |
| `/architecture/dag` | SPA sub | Architecture.tsx | `/api/config/agents` | UNTESTED |
| `/architecture/subsystems` | SPA sub | Architecture.tsx | `/api/config/all` | UNTESTED |
| `/architecture/routes` | SPA sub | Architecture.tsx | (empty state) | UNTESTED |
| `/configuration` | SPA | Configuration.tsx | `/api/config/*` | UNTESTED |
| `/profiles` | SPA | Profiles.tsx | `/api/config/profiles` | UNTESTED |
| `/audit` | SPA | Audit.tsx | `/api/audit` | UNTESTED |
| `/c4` | SPA | C4.tsx | `/api/c4` | UNTESTED |
| `/m11` | SPA | M11Views.tsx | `/api/m11/views` | UNTESTED |
| `/m11/readiness` | SPA tab | M11Views.tsx | `/api/m11/readiness` | ✅ PASS |
| `/m11/*` (10 views) | SPA tab | M11Views.tsx | `/api/m11/{dag,conflicts,worktrees,agents,resources,topology,parity,waits,gates,calibration}` | ✅ PASS (API) |

---

## API Routes

| Endpoint | Handler | Status | Notes |
|----------|---------|--------|-------|
| `GET /api/health` | health.ts | ✅ PASS | Core health check |
| `GET /api/config/all` | config.ts | ✅ PASS | Config aggregation |
| `GET /api/config/agents` | config.ts | ✅ PASS | Agent manifest |
| `GET /api/config/profiles` | config.ts | UNTESTED | Profile manifest |
| `GET /api/config/model-policy` | config.ts | UNTESTED | Model policy |
| `GET /api/plans` | plans.ts | ⚠️ 409 | PlanIntegrityError (non-MISSING findings) |
| `GET /api/plans/:planId` | plans.ts | ⚠️ DEPENDS | Depends on above |
| `GET /api/runs` | runs.ts | UNTESTED | Run history |
| `GET /api/audit` | audit.ts | UNTESTED | Audit log |
| `GET /api/c4` | c4.ts | UNTESTED | C4 model data |
| `GET /api/m11/views` | m11.ts | ✅ PASS | M11 view names |
| `GET /api/m11/{view}` | m11.ts | ✅ PASS | All 11 M11 views |

---

## Test Execution Results

### Summary
- **Total Tests**: 15
- **Passed**: 11
- **Failed**: 4
- **Duration**: 20.95s

### Passed (11)
| Test | Duration | Claims |
|------|----------|--------|
| `/m11/readiness` renders nav, main, h1 | 743ms | Landmark structure valid |
| `/m11/readiness` tablist with 11 tabs | 756ms | ARIA tablist correct |
| Tab switching works | 2042ms | Terminal Gates, DAG views |
| Overview screenshot non-blank | 828ms | ≥10KB, variance >5 |
| M11 screenshot non-blank | 796ms | ≥10KB, variance >5 |
| Homepage axe violations | 1289ms | 0 critical/serious |
| M11 axe violations + tables | 1489ms | 0 violations, semantic tables |
| Images have alt text | 2211ms | All img elements accessible |
| M11 view APIs return 200 | 345ms | All 11 views ok |
| Reduced motion CSS | 734ms | Animation disabled |
| 200% zoom no overflow | 733ms | Reflow without h-scroll |

### Failed (4)
| Test | Error | Blocker |
|------|-------|---------|
| `/overview` landmarks | console.error: 409 Conflict | `/api/plans` returns PlanIntegrityError |
| `/plan` landmarks | console.error: 409 Conflict | `/api/plans` returns PlanIntegrityError |
| Console errors on overview | 2x 409 errors logged | Same as above |
| Failed responses on overview | 2x 409 logged | Same as above |

---

## Blockers

### BLOCKER-1: Plan Integrity Error (409)
**Severity**: MEDIUM  
**Root Cause**: `src/routes/plans.ts` line 40 returns 409 when `PlanIntegrityError` has findings that don't start with `MISSING_`  
**Impact**: `/overview` and `/plan` pages generate console errors and failed response assertions  
**Expected Behavior**: The server returns valid JSON `{ok: false, error: "...", code: "INTEGRITY_FAILURE", details: {...}}`  
**Actual Behavior**: Browser logs "Failed to load resource: the server responded with a status of 409 (Conflict)"  
**Fix Options**:
1. Suppress 409 from console error tracking (acknowledge as expected integrity warning)
2. Seed valid plan data to eliminate the integrity error
3. Modify test to filter 409 from `/api/plans` specifically

---

## Executable Commands

```powershell
# Run browser QA suite
cd packages/control-plane
npm test -- tests/browser-qa.test.ts

# Run specific test
npm test -- tests/browser-qa.test.ts -- --testNamePattern="m11/readiness"

# Run a11y source tests (no server required)
npm test -- tests/a11y-min.test.ts

# Run all tests
npm test
```

---

## Evidence Paths

| Artifact | Path |
|----------|------|
| Test Receipt | `packages/control-plane/qa/browser/TEST_RECEIPT.md` |
| Screenshots | `%TEMP%/control-plane-browser-qa/*.png` (temp dir) |
| Test Source | `packages/control-plane/tests/browser-qa.test.ts` |

---

## Playwright + CDP Claim Matrix

| Claim | Method | Assertions | Status |
|-------|--------|------------|--------|
| Page renders with landmarks | CDP `locator.isVisible()` | nav, main, h1 visible | ⚠️ PARTIAL |
| Screenshot non-blank | CDP `screenshot()` + variance | bytes >10KB, variance >5 | ✅ PASS |
| Axe violations | `@axe-core/playwright` | 0 critical/serious | ✅ PASS |
| Console errors | CDP `page.on('console')` | 0 errors | ⚠️ FAIL (409) |
| Request failures | CDP `page.on('requestfailed')` | 0 fatal | ✅ PASS |
| Failed responses | CDP `page.on('response')` | 0 >=400 | ⚠️ FAIL (409) |
| Tablist ARIA | CDP `locator.count()` | 11 tabs, tabpanel aria-labelledby | ✅ PASS |
| Tab switching | CDP `click()` + textContent | Views switch correctly | ✅ PASS |
| Reduced motion | CDP `evaluate()` | CSS animation:none | ✅ PASS |
| 200% zoom reflow | CDP viewport + scrollWidth | No h-scroll | ✅ PASS |
| Semantic tables | CDP `th[scope="col"]` | scope attributes present | ✅ PASS |
| Images alt text | CDP `img.getAttribute('alt')` | All alt non-null | ✅ PASS |
| M11 APIs | `fetch()` HTTP | 11 views return 200 | ✅ PASS |

---

## Recommendation

**UNVERIFIED** for `/overview` and `/plan` routes due to BLOCKER-1.

**Conditional PASS** for M11 views and accessibility suite.

**Action Required**: Resolve PLAN-1 blocker to achieve full coverage.
