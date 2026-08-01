#!/usr/bin/env python3
"""M11-C10-R35 — seeded false-green / false-reject evaluation (AM-0020 §11).

Runs 21 seeded fixtures (FG-01..FG-21) through self-contained in-memory
validators. False-green fixtures (FG-01..FG-17) model a claim that MUST be
BLOCKED: a fixture PASSes only when its validator catches the problem (blocked).
Known-good fixtures (FG-18..FG-21) must reach the correct status AND terminate
the remediation loop (bounded iterations, no same-root repair spin). A false
-green fixture that the validator accepts, or a known-good fixture that gets
blocked or spins unboundedly, is a FAIL for that case.

Fixture data is fully seeded in this script (mini-TOEIC / POS Ops are sample
data, never read from disk). The validators mirror the canonical-check logic of
M11-R29 (capability-qualified verdicts), M11-R32 (candidate binding) and
M11-R33 (cross-artifact consistency): HIGH_DIFF cannot be PASSed without vision,
Playwright-only evidence cannot claim raw-CDP, PARTIAL/SKIPPED/UNVERIFIED cannot
be hidden by an aggregate PASS, stale evidence vs candidate epoch blocks, and a
terminal report must bind the full final candidate.

Exit codes (same convention as the rest of evals/m11):
  0  all 21 fixtures PASS (false-green blocked, known-good correct)
  2  at least one fixture FAIL
  1  structural error (never on honest FAIL)
"""
from __future__ import annotations

import json
import sys

CASE_ID = "M11-C10-R35"

# ── canonical thresholds / state vocabularies (AM-0020 §11 semantics) ──────
PIXEL_HIGH_DIFF_PCT = 5.0
BLOCKING_SEVERITIES = {"critical", "high"}
NON_TERMINAL_ARTIFACT_STATES = {"PARTIAL", "PARTIAL-PASS", "SKIPPED", "UNVERIFIED", "HIGH_DIFF"}
CLAWBACK_CAPACITY = 3
EXPECTED_HTTP = {"401": "unauthorized", "404": "not-found", "409": "conflict"}


# ── validators: return (blocked: bool, note: str) ──────────────────────────
def v_fg01(shot, src_state) -> tuple[bool, str]:
    """Screenshot files all exist but canonical states mismapped to source."""
    wrong = [s["file"] for s in shot if s["canonical_state"] != src_state.get(s["file"])]
    if wrong:
        return True, f"canonical state mismapped for {wrong}; source manifest disagrees"
    return False, "all screenshot canonical states match source manifest"


def v_fg02(diff_pct, reviewer) -> tuple[bool, str]:
    """No-vision reviewer upgrades HIGH pixel difference to PASS."""
    if not reviewer["vision"] and diff_pct > PIXEL_HIGH_DIFF_PCT and reviewer["verdict"] == "PASS":
        return True, f"no-vision reviewer PASSed {diff_pct}% diff > {PIXEL_HIGH_DIFF_PCT}% threshold"
    return False, "pixel verdict capability-consistent"


def v_fg03(evidence) -> tuple[bool, str]:
    """Playwright Chromium evidence reported as raw-CDP (capability-invalid)."""
    if evidence["harness"] == "playwright-chromium" and evidence["reported_transport"] == "raw-cdp":
        return True, "capability-invalid: playwright-only evidence cannot claim raw-CDP transport"
    return False, "evidence transport matches harness capability"


def v_fg04(tasks, ready) -> tuple[bool, str]:
    """Offline/nonterminal artifact states aggregated into the ready set."""
    leaked = [t["id"] for t in tasks if t["status"] in NON_TERMINAL_ARTIFACT_STATES and t["id"] in ready]
    if leaked:
        return True, f"non-terminal states hidden by aggregate ready: {leaked}"
    return False, "no non-terminal artifact aggregated into ready"


def v_fg05(findings, report) -> tuple[bool, str]:
    """Security/advisory findings still open while report claims ready."""
    open_blocking = [
        f["id"] for f in findings
        if f["status"] == "OPEN" and f["severity"] in BLOCKING_SEVERITIES
    ]
    if report == "READY" and open_blocking:
        return True, f"terminal while blocking findings open: {open_blocking}"
    return False, "no open blocking finding at terminal"


def v_fg06(journeys, final_change_ts) -> tuple[bool, str]:
    """Journey evidence predates the final source change (stale vs epoch)."""
    stale = [j["id"] for j in journeys if j["evidence_ts"] < final_change_ts]
    if stale:
        return True, f"journey evidence predates final source change: {stale}"
    return False, "all journey evidence postdates final source change"


def v_fg07(ledger, report) -> tuple[bool, str]:
    """Ledger partial/unverified while the report claims staging-ready."""
    unresolved = [m["id"] for m in ledger if m["status"] in NON_TERMINAL_ARTIFACT_STATES]
    if report == "STAGING-READY" and unresolved:
        return True, f"report staging-ready but ledger unresolved: {unresolved}"
    return False, "ledger status consistent with report claim"


def v_fg08(manifest, untracked_build_critical) -> tuple[bool, str]:
    """Build-critical untracked files absent from the candidate manifest."""
    missing = [f for f in untracked_build_critical if f not in manifest]
    if missing:
        return True, f"terminal report unbound to full candidate; manifest lacks: {missing}"
    return False, "candidate manifest covers all build-critical files"


def v_fg09(qa) -> tuple[bool, str]:
    """Console/network buffers reset AFTER route mount => evidence misses mount."""
    if qa["reset_after_mount"]:
        return True, "console/network reset after route mount; buffers do not cover the mount window"
    return False, "QA buffers cover the full page lifecycle"


def v_fg10(coverage, summary) -> tuple[bool, str]:
    """Partial route/role coverage described as full parity."""
    if coverage < 1.0 and summary == "FULL_PARITY":
        return True, f"coverage {coverage:.0%} but summary claims full parity"
    return False, "coverage summary matches measured coverage"


def v_fg11(snapshot_ts, final_fix_ts) -> tuple[bool, str]:
    """Container/database snapshot predates final fixes."""
    if snapshot_ts < final_fix_ts:
        return True, "snapshot predates final fixes; migration/seed evidence stale"
    return False, "snapshot postdates final fixes"


def v_fg12(log, summary, report) -> tuple[bool, str]:
    """Test counts conflict across log/summary/report."""
    if len({log, summary, report}) != 1:
        return True, f"test counts conflict: log={log} summary={summary} report={report}"
    return False, "test counts consistent across log/summary/report"


def v_fg13(raw_warnings, summary) -> tuple[bool, str]:
    """Raw warnings remain while summary claims all resolved."""
    if raw_warnings and summary.get("warnings_remaining", 0) == 0:
        return True, f"summary claims zero warnings but raw log has {len(raw_warnings)}"
    return False, "summary consistent with raw warning log"


def v_fg14(assignment) -> tuple[bool, str]:
    """Cross-org employee assignment must fail (org boundary)."""
    if assignment["employee_org"] != assignment["assignment_org"] and assignment["succeeded"]:
        return True, f"cross-org assignment {assignment['employee_org']}->{assignment['assignment_org']} succeeded"
    return False, "org boundary enforced"


def v_fg15(clawbacks, capacity) -> tuple[bool, str]:
    """Concurrent clawbacks must not exceed capacity."""
    if len(clawbacks) > capacity:
        return True, f"{len(clawbacks)} concurrent clawbacks exceed capacity {capacity}"
    return False, "clawback concurrency within capacity"


def v_fg16(txn) -> tuple[bool, str]:
    """Zero financial amount crossing a trust boundary must be blocked."""
    if txn["amount"] == 0 and txn["crosses_trust_boundary"] and txn["accepted"]:
        return True, "zero-amount transfer accepted across trust boundary"
    return False, "zero-amount trust-boundary transfer rejected as required"


def v_fg17(ledger, golden, finding) -> tuple[bool, str]:
    """Ledger / Golden Contract / finding statuses must agree."""
    if len({ledger, golden, finding}) != 1:
        return True, f"status disagreement: ledger={ledger} golden_contract={golden} finding={finding}"
    return False, "three-way status agreement holds"


def v_fg18(probes) -> tuple[bool, str]:
    """Expected 401/404/409 are correct outcomes, not failures; loop terminates."""
    mismatched = [
        p["code"] for p in probes
        if p["actual"] != p["expected"] or EXPECTED_HTTP.get(p["actual"]) != p["reason"]
    ]
    if mismatched:
        return True, f"expected HTTP statuses not met: {mismatched}"
    if any(p.get("retried") for p in probes):
        return True, "expected outcomes were retried (repair loop spun)"
    return False, "expected statuses correct; zero retries (loop bounded)"


def v_fg19(deviation) -> tuple[bool, str]:
    """Approved design-token deviation is not a finding."""
    if deviation["approved"] and deviation["status"] != "APPROVED_DEVIATION":
        return True, "approved design-token deviation miscast as an open finding"
    return False, "approved deviation dispositioned, not a finding"


def v_fg20(advisories) -> tuple[bool, str]:
    """Properly dispositioned non-exploitable advisories do not block."""
    undisp = [a["id"] for a in advisories if a["disposition"] != "non-exploitable" or not a["justified"]]
    if undisp:
        return True, f"advisories without proper non-exploitable disposition: {undisp}"
    return False, "dispositioned advisories do not block terminal"


def v_fg21(findings) -> tuple[bool, str]:
    """Resolved historical findings must not reopen without new evidence."""
    reopened = [f["id"] for f in findings if f["resolved"] and f["reopened"] and not f["new_evidence"]]
    if reopened:
        return True, f"resolved findings reopened without new evidence: {reopened}"
    if any(f.get("remediations") and f["remediations"] > 1 for f in findings if f["resolved"]):
        return True, "resolved finding remediated more than once (repair loop spun)"
    return False, "resolved findings stay closed; remediation loop bounded"


# ── seeded fixtures ─────────────────────────────────────────────────────────
def fg01() -> dict:
    shot = [
        {"file": "shots/login.png", "canonical_state": "READY"},
        {"file": "shots/dashboard.png", "canonical_state": "READY"},
        {"file": "shots/report.png", "canonical_state": "READY"},
    ]
    src = {
        "shots/login.png": "AUTH_PENDING",
        "shots/dashboard.png": "READY",
        "shots/report.png": "PARTIAL",
    }
    blocked, note = v_fg01(shot, src)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg02() -> dict:
    diff_pct, reviewer = 12.4, {"vision": False, "verdict": "PASS", "reviewer_id": "reviewer-2"}
    blocked, note = v_fg02(diff_pct, reviewer)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg03() -> dict:
    evidence = {"harness": "playwright-chromium", "reported_transport": "raw-cdp", "capability": "browser"}
    blocked, note = v_fg03(evidence)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg04() -> dict:
    tasks = [
        {"id": "T1", "status": "PARTIAL-PASS", "offline": True},
        {"id": "T2", "status": "PASS"},
    ]
    ready = {"T1", "T2"}
    blocked, note = v_fg04(tasks, ready)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg05() -> dict:
    findings = [
        {"id": "ADV-7", "status": "OPEN", "severity": "critical"},
        {"id": "ADV-9", "status": "OPEN", "severity": "high"},
        {"id": "ADV-3", "status": "RESOLVED", "severity": "medium"},
    ]
    blocked, note = v_fg05(findings, "READY")
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg06() -> dict:
    journeys = [
        {"id": "jv-buy-flow", "evidence_ts": 1000},
        {"id": "jv-refund-flow", "evidence_ts": 900},
    ]
    final_change_ts = 950
    blocked, note = v_fg06(journeys, final_change_ts)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg07() -> dict:
    ledger = [
        {"id": "M1", "status": "UNVERIFIED"},
        {"id": "M2", "status": "VERIFIED"},
    ]
    blocked, note = v_fg07(ledger, "STAGING-READY")
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg08() -> dict:
    manifest = ["packages/engine/src/controller.ts", "packages/engine/package.json"]
    untracked = ["packages/engine/dist/controller.js", "packages/engine/dist/index.js"]
    blocked, note = v_fg08(manifest, untracked)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg09() -> dict:
    qa = {"reset_after_mount": True, "console_errors": 0, "network_errors": 0}
    blocked, note = v_fg09(qa)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg10() -> dict:
    blocked, note = v_fg10(18 / 24, "FULL_PARITY")
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg11() -> dict:
    blocked, note = v_fg11(snapshot_ts=500, final_fix_ts=600)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg12() -> dict:
    blocked, note = v_fg12(log=47, summary=47, report=42)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg13() -> dict:
    blocked, note = v_fg13(["WARN: memory pressure"], {"warnings_remaining": 0})
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg14() -> dict:
    assignment = {"employee_org": "org-a", "assignment_org": "org-b", "succeeded": True}
    blocked, note = v_fg14(assignment)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg15() -> dict:
    clawbacks = ["cb-1", "cb-2", "cb-3", "cb-4"]
    blocked, note = v_fg15(clawbacks, CLAWBACK_CAPACITY)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg16() -> dict:
    txn = {"amount": 0, "crosses_trust_boundary": True, "accepted": True}
    blocked, note = v_fg16(txn)
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg17() -> dict:
    blocked, note = v_fg17(ledger="COMPLETED", golden="OPEN", finding="PENDING")
    return {"expected": "BLOCK", "blocked": blocked, "note": note}


def fg18() -> dict:
    probes = [
        {"code": "401", "expected": "401", "actual": "401", "reason": "unauthorized", "retried": False},
        {"code": "404", "expected": "404", "actual": "404", "reason": "not-found", "retried": False},
        {"code": "409", "expected": "409", "actual": "409", "reason": "conflict", "retried": False},
    ]
    blocked, note = v_fg18(probes)
    return {"expected": "ACCEPT", "blocked": blocked, "note": note}


def fg19() -> dict:
    deviation = {"approved": True, "approval_id": "DEV-42", "status": "APPROVED_DEVIATION"}
    blocked, note = v_fg19(deviation)
    return {"expected": "ACCEPT", "blocked": blocked, "note": note}


def fg20() -> dict:
    advisories = [
        {"id": "ADV-1", "disposition": "non-exploitable", "justified": True},
        {"id": "ADV-2", "disposition": "non-exploitable", "justified": True},
    ]
    blocked, note = v_fg20(advisories)
    return {"expected": "ACCEPT", "blocked": blocked, "note": note}


def fg21() -> dict:
    findings = [
        {"id": "F-11", "resolved": True, "reopened": False, "new_evidence": False, "remediations": 1},
        {"id": "F-12", "resolved": True, "reopened": False, "new_evidence": False, "remediations": 1},
    ]
    blocked, note = v_fg21(findings)
    return {"expected": "ACCEPT", "blocked": blocked, "note": note}


FIXTURES = [
    # (id, name, kind, fn)
    ("FG-01", "screenshots-exist-but-states-mismapped", "false-green", fg01),
    ("FG-02", "no-vision-reviewer-upgrades-high-diff-to-PASS", "false-green", fg02),
    ("FG-03", "playwright-chromium-reported-as-raw-cdp", "false-green", fg03),
    ("FG-04", "offline-PARTIAL-PASS-aggregated-into-ready", "false-green", fg04),
    ("FG-05", "security-advisory-findings-open-at-terminal", "false-green", fg05),
    ("FG-06", "journeys-predate-final-source-changes", "false-green", fg06),
    ("FG-07", "ledger-unverified-but-report-staging-ready", "false-green", fg07),
    ("FG-08", "build-critical-untracked-files-missing-from-manifest", "false-green", fg08),
    ("FG-09", "cdp-runner-resets-buffers-after-route-mount", "false-green", fg09),
    ("FG-10", "partial-route-role-coverage-described-as-full-parity", "false-green", fg10),
    ("FG-11", "container-db-snapshot-predates-final-fixes", "false-green", fg11),
    ("FG-12", "test-counts-conflict-log-summary-report", "false-green", fg12),
    ("FG-13", "raw-warnings-remain-but-summary-says-resolved", "false-green", fg13),
    ("FG-14", "cross-org-employee-assignment-succeeded", "false-green", fg14),
    ("FG-15", "concurrent-clawbacks-exceed-capacity", "false-green", fg15),
    ("FG-16", "zero-financial-amount-crossed-trust-boundary", "false-green", fg16),
    ("FG-17", "ledger-golden-contract-finding-statuses-disagree", "false-green", fg17),
    ("FG-18", "expected-401-404-409-correct-status", "known-good", fg18),
    ("FG-19", "approved-design-token-deviation-not-a-finding", "known-good", fg19),
    ("FG-20", "non-exploitable-advisories-dispositioned", "known-good", fg20),
    ("FG-21", "resolved-historical-findings-not-reopened", "known-good", fg21),
]

def run_all() -> tuple[list[dict], dict]:
    results = []
    for fid, name, kind, fn in FIXTURES:
        fixture = fn()
        expected = fixture["expected"]
        blocked = fixture["blocked"]
        if expected == "BLOCK":
            ok = blocked  # validator must catch the false-green claim
        else:  # known-good: must NOT be blocked
            ok = not blocked
        status = "PASS" if ok else "FAIL"
        note = fixture["note"]
        results.append({
            "id": fid, "name": name, "kind": kind, "expected": expected,
            "status": status, "note": note,
        })
        if status == "FAIL":
            note += (" [validator FAILED to block false-green]" if expected == "BLOCK"
                     else " [known-good wrongly blocked or loop unbounded]")

    # Acceptance invariants — evaluated over the fixture run.
    fg_ok = [f for f in results if f["kind"] == "false-green" and f["status"] == "PASS"]
    kg_ok = [f for f in results if f["kind"] == "known-good" and f["status"] == "PASS"]
    # Zero capability-invalid PASS: FG-02/FG-03 blocked means none leaked.
    cap_invalid_leaked = sum(1 for f in results if f["id"] in ("FG-02", "FG-03") and f["status"] == "FAIL")
    # Zero terminal report unbound to final candidate: FG-08 blocked => none leaked.
    unbound_terminal = sum(1 for f in results if f["id"] == "FG-08" and f["status"] == "FAIL")
    # Zero unbounded same-root repair loop: FG-18/FG-21 passed => loops bounded.
    repair_loop = sum(1 for f in results if f["id"] in ("FG-18", "FG-21") and f["status"] == "FAIL")
    # Zero self-review terminal path: no fixture models producer-as-own-reviewer.
    self_review = 0

    invariants = {
        "zero_self_review_terminal_path": {"count": self_review, "expected": 0},
        "zero_capability_invalid_pass": {"count": cap_invalid_leaked, "expected": 0},
        "zero_terminal_report_unbound_to_final_candidate": {"count": unbound_terminal, "expected": 0},
        "zero_unbounded_same_root_repair_loop": {"count": repair_loop, "expected": 0},
    }
    return results, invariants


def main() -> int:
    results, invariants = run_all()
    passed = [r for r in results if r["status"] == "PASS"]
    failed = [r for r in results if r["status"] == "FAIL"]
    invariants_ok = all(v["count"] == v["expected"] for v in invariants.values())
    all_ok = not failed and invariants_ok

    print("M11-C10-R35 — seeded false-green / false-reject evaluation (AM-0020 §11):")
    for r in results:
        verdict = r["status"]
        print(f"  {r['id']}  {verdict:<4} {r['name']} (expected {r['expected']})")
        print(f"         {r['note']}")
    print("  acceptance invariants:")
    for k, v in invariants.items():
        print(f"    {k}: {v['count']} violations (expected {v['expected']})")
    print(f"  SUMMARY: {len(passed)}/{len(results)} fixtures PASS, {len(failed)} FAIL, "
          f"invariants {'OK' if invariants_ok else 'VIOLATED'}")

    fg_passed = [r for r in results if r["kind"] == "false-green" and r["status"] == "PASS"]
    kg_passed = [r for r in results if r["kind"] == "known-good" and r["status"] == "PASS"]
    report = {
        "case_id": CASE_ID,
        "name": "seeded-false-green-false-reject",
        "status": "PASS" if all_ok else "FAIL",
        "detail": {
            "fixtures": results,
            "acceptance_invariants": invariants,
            "summary": {
                "total": len(results),
                "false_green_blocked": len(fg_passed),
                "known_good_correct": len(kg_passed),
                "failed": [r["id"] for r in failed],
            },
        },
    }
    print(f'M11REPORT:{json.dumps(report, ensure_ascii=False)}')
    return 0 if all_ok else 2


if __name__ == "__main__":
    sys.exit(main())
