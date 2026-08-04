"""Plain assert-based smoke test for long_task runner.

Run: python evals/long_task/check.py
No framework — uses bare assert for signal clarity.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

# Allow `python evals/long_task/check.py` and `python -m evals.long_task.check`
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from evals.long_task.fixtures import LONG_TASK_FIXTURE, ADVERSARIAL_FIXTURE
from evals.long_task.defects import detect_defects, detect_adversarial_defects, detect_false_green
from evals.long_task.repair import (
    repair_defects,
    repair_adversarial_defects,
    repair_false_green,
    verify_repair,
    verify_adversarial_repair,
    verify_false_green_repair,
)
from evals.long_task.runner import LongTaskRunner, run_eval


def main() -> int:
    ws = Path(tempfile.mkdtemp(prefix="longtask-check-"))

    # ── Standard fixture checks ─────────────────────────────────────────────
    # Fixture >=10 files
    assert len(LONG_TASK_FIXTURE["files"]) >= 10, f"fixture files={len(LONG_TASK_FIXTURE['files'])} < 10"

    # 3 seeded defects
    assert len(LONG_TASK_FIXTURE["seeded_defects"]) == 3, f"seeded={len(LONG_TASK_FIXTURE['seeded_defects'])}"

    # Setup
    for p, c in LONG_TASK_FIXTURE["files"].items():
        t = ws / p; t.parent.mkdir(parents=True, exist_ok=True); t.write_text(c)

    # Detect all
    found = detect_defects(ws, LONG_TASK_FIXTURE["seeded_defects"])
    assert set(found) == {"currency-validation", "division-by-zero", "weak-email-regex"}, \
        f"unexpected found={found}"

    # Repair all
    repaired = repair_defects(ws, found, LONG_TASK_FIXTURE["seeded_defects"])
    assert len(repaired) == 3, f"repaired={len(repaired)}"

    # Verify — no false green
    verified = verify_repair(ws, LONG_TASK_FIXTURE["verification_commands"], found, repaired)
    assert verified, "verification failed after full repair"

    # No-repair = no pass
    no_repair = verify_repair(ws, LONG_TASK_FIXTURE["verification_commands"], found, [])
    assert not no_repair, "fake pass: verification passed without repair"

    # Full runner PASS
    result = run_eval(output_dir=ws)
    assert result.outcome == "PASS", f"outcome={result.outcome}"
    assert result.plan_files >= 10, f"plan_files={result.plan_files}"
    assert result.defects_seeded == 3
    assert result.defects_found == 3
    assert result.defects_repaired == 3
    assert result.verification_passed
    assert not result.checkpoint_resume_ok  # first run, not a resume

    # CLI quick mode
    import subprocess, sys
    proc = subprocess.run(
        [sys.executable, "-m", "evals.long_task", "--quick"],
        capture_output=True, text=True, cwd=Path(__file__).parents[2],
    )
    assert proc.returncode == 0, f"CLI exit={proc.returncode} stderr={proc.stderr}"
    assert "outcome=PASS" in proc.stdout, f"CLI stdout={proc.stdout}"

    # ── Adversarial fixture checks ──────────────────────────────────────────
    aws = Path(tempfile.mkdtemp(prefix="adv-check-"))
    for p, c in ADVERSARIAL_FIXTURE["files"].items():
        t = aws / p; t.parent.mkdir(parents=True, exist_ok=True); t.write_text(c)

    # Adversarial defects detected
    adv_found = detect_adversarial_defects(aws)
    assert len(adv_found) > 0, f"adversarial defects not detected: {adv_found}"

    # False-green patterns detected
    fg_found = detect_false_green(aws)
    assert len(fg_found) > 0, f"false-green patterns not detected: {fg_found}"

    # No fixture weakening: adversarial fixture still has all seeded defects
    std_found = detect_defects(aws, ADVERSARIAL_FIXTURE["seeded_defects"])
    assert len(std_found) == 3, f"standard defects weakened in adversarial fixture: {std_found}"

    # Repair adversarial defects
    adv_repaired = repair_adversarial_defects(aws, adv_found)
    assert len(adv_repaired) > 0, f"adversarial repair failed: {adv_repaired}"

    # Verify adversarial repair
    assert verify_adversarial_repair(aws, adv_repaired), "adversarial repair verification failed"

    # ── Receipt idempotency check ───────────────────────────────────────────
    from evals.long_task.fixtures import RECEIPT_TEST_FIXTURE
    rws = Path(tempfile.mkdtemp(prefix="receipt-check-"))
    for p, c in RECEIPT_TEST_FIXTURE["files"].items():
        t = rws / p; t.parent.mkdir(parents=True, exist_ok=True); t.write_text(c)

    sys.path.insert(0, str(rws))
    from src.receipt_handler import ReceiptStore
    from src.worker import Worker

    store = ReceiptStore()
    worker = Worker(store)

    # Duplicate execution -> same receipt ID (idempotent)
    r1 = worker.execute_task("T-DUP", "print('x')")
    r2 = worker.execute_task("T-DUP", "print('x')")
    assert r1["receipt_id"] == r2["receipt_id"], "receipt idempotency broken"
    assert len(store.list_all()) == 1, "duplicate receipt stored"

    # ── Full adversarial runner ─────────────────────────────────────────────
    adv_result = run_eval(output_dir=Path(tempfile.mkdtemp(prefix="adv-run-")), adversarial=True)
    assert adv_result.variant == "adversarial", f"variant={adv_result.variant}"
    assert adv_result.outcome == "PASS", f"outcome={adv_result.outcome} evidence={adv_result.evidence}"
    assert adv_result.defects_seeded == 3, f"seeded={adv_result.defects_seeded}"
    assert adv_result.adversarial_found == 4, f"adversarial_found={adv_result.adversarial_found}"
    assert adv_result.adversarial_repaired == 4, f"adversarial_repaired={adv_result.adversarial_repaired}"
    assert adv_result.falsegreen_found >= 3, f"falsegreen_found={adv_result.falsegreen_found}"
    assert adv_result.falsegreen_found == adv_result.falsegreen_repaired, \
        f"false-green partial repair: found={adv_result.falsegreen_found} repaired={adv_result.falsegreen_repaired}"
    assert adv_result.verification_passed, "adversarial verification failed"

    print("all assertions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
