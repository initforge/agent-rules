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

from evals.long_task.fixtures import LONG_TASK_FIXTURE
from evals.long_task.defects import detect_defects
from evals.long_task.repair import repair_defects, verify_repair
from evals.long_task.runner import LongTaskRunner, run_eval


def main() -> int:
    ws = Path(tempfile.mkdtemp(prefix="longtask-check-"))

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

    print("all assertions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
