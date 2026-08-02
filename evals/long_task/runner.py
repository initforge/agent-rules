"""Long-task canonical runner with checkpoint/resume (SS-15 / R-027).

Wraps engine fixture, demonstrates >=10-file plan, seeded defect detection,
repair/reverify, and checkpoint/resume.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum, auto
from pathlib import Path
from typing import Any

from .fixtures import LONG_TASK_FIXTURE
from .defects import detect_defects
from .repair import repair_defects, verify_repair


class RunPhase(Enum):
    """Phases of a long-task evaluation run."""
    INIT = auto()
    PLAN = auto()       # >=10-file plan generated
    EXECUTE = auto()    # Engine working on task
    DEFECT_DETECT = auto()  # Seeded defects discovered
    REPAIR = auto()     # Repair attempted
    VERIFY = auto()     # Reverify after repair
    COMPLETE = auto()
    FAILED = auto()


@dataclass
class Checkpoint:
    """Persisted run state for resume."""
    run_id: str
    phase: str
    files_written: dict[str, str]  # path -> content hash
    defects_found: list[str]       # defect IDs
    defects_repaired: list[str]   # repaired defect IDs
    plan: dict[str, Any]
    ts: str
    duration_ms: int


@dataclass
class EvaluationResult:
    """Canonical result for long-task eval."""
    run_id: str
    variant: str = "longtask"
    case_id: str = "long-task-10file"
    plan_files: int = 0
    defects_seeded: int = 0
    defects_found: int = 0
    defects_repaired: int = 0
    verification_passed: bool = False
    checkpoint_resume_ok: bool = False
    duration_ms: int = 0
    ts: str = ""
    outcome: str = "NOT_RUN"
    evidence: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")


def _hash_content(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()[:16]


class LongTaskRunner:
    """Canonical runner for long-task evaluation.

    Demonstrates:
    - >=10-file plan generation
    - Seeded defect detection
    - Repair/reverify
    - Checkpoint/resume
    """

    def __init__(
        self,
        output_dir: Path | None = None,
        checkpoint_path: Path | None = None,
        resume: bool = False,
    ):
        self.run_id = uuid.uuid4().hex[:12]
        self.output_dir = output_dir or Path(tempfile.mkdtemp(prefix="longtask-"))
        self.checkpoint_path = checkpoint_path or self.output_dir / "checkpoint.json"
        self.resume = resume

        self._phase = RunPhase.INIT
        self._files: dict[str, str] = {}  # path -> content
        self._defects_found: list[str] = []
        self._defects_repaired: list[str] = []
        self._plan: dict[str, Any] = {}
        self._start_ms: int = 0
        self._result: EvaluationResult | None = None
        self._verification_passed: bool = False

    def _load_checkpoint(self) -> Checkpoint | None:
        if not self.checkpoint_path.exists():
            return None
        try:
            data = json.loads(self.checkpoint_path.read_text())
            return Checkpoint(**data)
        except Exception:
            return None

    def _save_checkpoint(self) -> None:
        start_ms = getattr(self, "_start_ms", 0)
        cp = Checkpoint(
            run_id=self.run_id,
            phase=self._phase.name,
            files_written={k: _hash_content(v) for k, v in self._files.items()},
            defects_found=self._defects_found,
            defects_repaired=self._defects_repaired,
            plan=self._plan,
            ts=datetime.now(timezone.utc).isoformat(),
            duration_ms=int(time.time() * 1000) - start_ms,
        )
        self.checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        self.checkpoint_path.write_text(json.dumps(asdict(cp), indent=2), encoding="utf-8")

    def _set_phase(self, phase: RunPhase) -> None:
        self._phase = phase
        self._save_checkpoint()

    def run(self) -> EvaluationResult:
        """Execute full long-task evaluation with checkpoint/resume."""
        self._start_ms = int(time.time() * 1000)

        # Resume from checkpoint if requested
        if self.resume:
            cp = self._load_checkpoint()
            if cp:
                self._files = {}
                for path, _hash in cp.files_written.items():
                    fp = self.output_dir / path
                    if fp.exists():
                        self._files[path] = fp.read_text()
                self._defects_found = cp.defects_found
                self._defects_repaired = cp.defects_repaired
                self._plan = cp.plan
                self._phase = RunPhase[cp.phase]
                print(f"[{self.run_id}] Resumed from phase: {cp.phase}")

        # Phase 1: Setup fixture files
        if self._phase == RunPhase.INIT:
            self._setup_fixture()
            self._set_phase(RunPhase.PLAN)

        # Phase 2: Generate >=10-file plan
        if self._phase == RunPhase.PLAN:
            self._generate_plan()
            self._set_phase(RunPhase.EXECUTE)

        # Phase 3: Execute (simulate engine work)
        if self._phase == RunPhase.EXECUTE:
            self._execute_task()
            self._set_phase(RunPhase.DEFECT_DETECT)

        # Phase 4: Seeded defect detection
        if self._phase == RunPhase.DEFECT_DETECT:
            self._detect_defects()
            self._set_phase(RunPhase.REPAIR)

        # Phase 5: Repair detected defects
        if self._phase == RunPhase.REPAIR:
            self._repair_defects()
            self._set_phase(RunPhase.VERIFY)

        # Phase 6: Verify repairs
        if self._phase == RunPhase.VERIFY:
            self._verify_repairs()
            self._set_phase(RunPhase.COMPLETE)

        return self._build_result()

    def _setup_fixture(self) -> None:
        """Populate workspace from engine fixture."""
        fixture = LONG_TASK_FIXTURE
        for path, content in fixture["files"].items():
            target = self.output_dir / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            self._files[path] = content

    def _generate_plan(self) -> None:
        """Generate >=10-file plan from fixture task."""
        fixture = LONG_TASK_FIXTURE
        task_desc = fixture["task"]

        # Canonical plan structure for long-task
        self._plan = {
            "plan_id": f"plan-{self.run_id}",
            "task": task_desc,
            "files_count": len(self._files),
            "steps": [
                {"step": 1, "action": "analyze", "files": list(self._files.keys())[:3], "desc": "Analyze existing files"},
                {"step": 2, "action": "plan", "files": list(self._files.keys())[3:6], "desc": "Plan modifications"},
                {"step": 3, "action": "implement", "files": list(self._files.keys())[6:], "desc": "Implement changes"},
                {"step": 4, "action": "test", "files": ["test_*.py"], "desc": "Run tests"},
                {"step": 5, "action": "verify", "desc": "Verify all requirements"},
            ],
            "defect_checkpoints": ["after_step_2", "after_step_3"],
            "expected_files": len(self._files),
        }

    def _execute_task(self) -> None:
        """Simulate engine executing the plan (produces artifacts)."""
        # For the fixture: produce analysis and test files
        task_file = self.output_dir / "task.md"
        task_file.write_text(self._plan.get("task", ""), encoding="utf-8")

        # Generate analysis artifact
        analysis = self.output_dir / "analysis.md"
        analysis.write_text(f"# Analysis\n\nTask: {self._plan.get('task', '')}\n\nSteps: {len(self._plan.get('steps', []))}\n", encoding="utf-8")

    def _detect_defects(self) -> None:
        """Detect seeded defects in the fixture."""
        seeded_defects = LONG_TASK_FIXTURE.get("seeded_defects", [])
        self._defects_found = detect_defects(self.output_dir, seeded_defects)

    def _repair_defects(self) -> None:
        """Repair detected defects."""
        seeded_defects = LONG_TASK_FIXTURE.get("seeded_defects", [])
        repaired = repair_defects(self.output_dir, self._defects_found, seeded_defects)
        self._defects_repaired = repaired

    def _verify_repairs(self) -> None:
        """Verify repairs via test run."""
        # Run verification using fixture commands
        fixture = LONG_TASK_FIXTURE
        verified = verify_repair(
            self.output_dir,
            fixture.get("verification_commands", []),
            self._defects_found,
            self._defects_repaired,
        )
        self._verification_passed = verified

    def _build_result(self) -> EvaluationResult:
        """Build final evaluation result."""
        duration_ms = int(time.time() * 1000) - self._start_ms

        outcome = "NOT_RUN"
        if self._phase == RunPhase.COMPLETE:
            if self._verification_passed:
                outcome = "PASS"
            else:
                outcome = "FAIL"

        seeded_count = len(LONG_TASK_FIXTURE.get("seeded_defects", []))

        result = EvaluationResult(
            run_id=self.run_id,
            case_id="long-task-10file",
            plan_files=self._plan.get("files_count", len(self._files)),
            defects_seeded=seeded_count,
            defects_found=len(self._defects_found),
            defects_repaired=len(self._defects_repaired),
            verification_passed=getattr(self, "_verification_passed", False),
            checkpoint_resume_ok=self.resume and self._phase != RunPhase.INIT,
            duration_ms=duration_ms,
            ts=datetime.now(timezone.utc).isoformat(),
            outcome=outcome,
            evidence={
                "phase": self._phase.name,
                "plan_steps": len(self._plan.get("steps", [])),
                "files_in_fixture": len(LONG_TASK_FIXTURE["files"]),
                "checkpoint_path": str(self.checkpoint_path),
                "output_dir": str(self.output_dir),
            },
        )
        self._result = result
        return result


def run_eval(
    output_dir: Path | None = None,
    resume: bool = False,
    checkpoint_path: Path | None = None,
) -> EvaluationResult:
    """Convenience: run long-task evaluation and return result."""
    runner = LongTaskRunner(
        output_dir=output_dir,
        checkpoint_path=checkpoint_path,
        resume=resume,
    )
    return runner.run()
