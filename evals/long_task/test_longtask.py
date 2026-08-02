"""Direct test: long-task runner (SS-15 / R-027).

Demonstrates >=10-file plan, seeded defect detection, repair/reverify,
and checkpoint/resume. Run with: python -m unittest evals.long_task.test_longtask
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from .fixtures import LONG_TASK_FIXTURE
from .runner import LongTaskRunner, RunPhase
from .defects import detect_defects
from .repair import repair_defects, verify_repair


class TestFixtureStructure(unittest.TestCase):
    """Fixture must be a genuine >=10-file long task."""

    def test_fixture_has_10_plus_files(self):
        self.assertGreaterEqual(len(LONG_TASK_FIXTURE["files"]), 10)

    def test_fixture_has_seeded_defects(self):
        self.assertGreaterEqual(len(LONG_TASK_FIXTURE["seeded_defects"]), 1)

    def test_fixture_has_task(self):
        self.assertTrue(LONG_TASK_FIXTURE["task"])


class TestRunner(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="longtask-test-")

    def test_full_run_passes(self):
        """Full run: plan >=10 files, detect all defects, repair, verify."""
        runner = LongTaskRunner(output_dir=Path(self.tmp))
        result = runner.run()

        self.assertGreaterEqual(result.plan_files, 10)
        self.assertEqual(result.defects_seeded, 3)
        self.assertEqual(result.defects_found, 3)
        self.assertEqual(result.defects_repaired, 3)
        self.assertTrue(result.verification_passed)
        self.assertEqual(result.outcome, "PASS")

        # Evidence artifacts exist
        self.assertTrue((Path(self.tmp) / "checkpoint.json").exists())

    def test_checkpoint_exists_after_run(self):
        """Checkpoint persisted at each phase."""
        runner = LongTaskRunner(output_dir=Path(self.tmp))
        runner.run()

        cp_path = Path(self.tmp) / "checkpoint.json"
        self.assertTrue(cp_path.exists())
        data = json.loads(cp_path.read_text())
        self.assertEqual(data["phase"], "COMPLETE")
        self.assertEqual(len(data["files_written"]), len(LONG_TASK_FIXTURE["files"]))
        self.assertEqual(len(data["defects_found"]), 3)

    def test_resume_from_checkpoint(self):
        """Interrupt mid-run, then resume — must complete and stay consistent."""
        # First run: stop after PLAN phase by setting phase directly
        runner = LongTaskRunner(output_dir=Path(self.tmp))
        runner._setup_fixture()
        runner._generate_plan()
        runner._set_phase(RunPhase.EXECUTE)  # simulate interruption

        # Second run: resume from checkpoint
        runner2 = LongTaskRunner(
            output_dir=Path(self.tmp),
            checkpoint_path=Path(self.tmp) / "checkpoint.json",
            resume=True,
        )
        result = runner2.run()

        self.assertTrue(result.checkpoint_resume_ok)
        self.assertEqual(result.outcome, "PASS")
        # State preserved across resume
        self.assertEqual(result.evidence["files_in_fixture"], len(LONG_TASK_FIXTURE["files"]))

    def test_defect_detection_finds_all_seeded(self):
        """All seeded defects are detected by signature scan."""
        runner = LongTaskRunner(output_dir=Path(self.tmp))
        runner._setup_fixture()

        found = detect_defects(Path(self.tmp), LONG_TASK_FIXTURE["seeded_defects"])
        self.assertEqual(set(found), {"currency-validation", "division-by-zero", "weak-email-regex"})

    def test_repair_and_reverify(self):
        """Repair removes all detected defects; reverify passes."""
        runner = LongTaskRunner(output_dir=Path(self.tmp))
        runner._setup_fixture()
        ws = Path(self.tmp)

        found = detect_defects(ws, LONG_TASK_FIXTURE["seeded_defects"])
        repaired = repair_defects(ws, found, LONG_TASK_FIXTURE["seeded_defects"])
        verified = verify_repair(ws, LONG_TASK_FIXTURE["verification_commands"], found, repaired)

        self.assertEqual(len(repaired), 3)
        self.assertTrue(verified)

    def test_no_fake_pass(self):
        """Without repair, verification must fail (no fake PASS)."""
        runner = LongTaskRunner(output_dir=Path(self.tmp))
        runner._setup_fixture()
        ws = Path(self.tmp)

        # No defects repaired -> verification fails
        verified = verify_repair(ws, LONG_TASK_FIXTURE["verification_commands"], ["currency-validation"], [])
        self.assertFalse(verified)


class TestRunAsModule(unittest.TestCase):
    """CLI entry: `python -m evals.long_task` runs and prints receipt."""

    def test_module_prints_result(self):
        import subprocess
        import sys
        proc = subprocess.run(
            [sys.executable, "-m", "evals.long_task", "--quick"],
            capture_output=True, text=True, cwd=str(Path(__file__).parents[2]),
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr)
        self.assertIn("outcome=PASS", proc.stdout)


if __name__ == "__main__":
    unittest.main()
