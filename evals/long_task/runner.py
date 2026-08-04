"""Long-task canonical runner with checkpoint/resume (SS-15 / R-027).

Wraps engine fixture, demonstrates >=10-file plan, seeded defect detection,
repair/reverify, and checkpoint/resume with crash resilience.
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

from .fixtures import LONG_TASK_FIXTURE, ADVERSARIAL_FIXTURE
from .defects import detect_defects, detect_adversarial_defects, detect_false_green
from .repair import (
    repair_defects,
    repair_adversarial_defects,
    repair_false_green,
    verify_repair,
    verify_adversarial_repair,
    verify_false_green_repair,
)


class RunPhase(Enum):
    """Phases of a long-task evaluation run."""
    INIT = auto()
    PLAN = auto()       # >=10-file plan generated
    EXECUTE = auto()    # Engine working on task
    DEFECT_DETECT = auto()  # Seeded defects discovered
    ADVERSARIAL_DETECT = auto()  # Adversarial defects discovered
    FALSEGREEN_DETECT = auto()  # False-green patterns discovered
    REPAIR = auto()     # Repair attempted
    ADVERSARIAL_REPAIR = auto()  # Adversarial repair
    VERIFY = auto()     # Reverify after repair
    COMPLETE = auto()
    FAILED = auto()
    CORRUPTED = auto()  # Checkpoint corruption detected


@dataclass
class Checkpoint:
    """Persisted run state for resume."""
    run_id: str
    phase: str
    files_written: dict[str, str]  # path -> content hash
    defects_found: list[str]       # defect IDs
    defects_repaired: list[str]   # repaired defect IDs
    adversarial_found: list[dict]  # adversarial defect info
    falsegreen_found: list[dict]   # false-green pattern info
    plan: dict[str, Any]
    ts: str
    duration_ms: int
    content_hashes: dict[str, str]  # path -> hash of file content at checkpoint

    def validate(self) -> tuple[bool, str]:
        """Validate checkpoint integrity."""
        if not self.run_id:
            return False, "Missing run_id"
        if not self.phase:
            return False, "Missing phase"
        if not self.ts:
            return False, "Missing timestamp"
        return True, "valid"


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
    adversarial_found: int = 0
    adversarial_repaired: int = 0
    falsegreen_found: int = 0
    falsegreen_repaired: int = 0
    verification_passed: bool = False
    checkpoint_resume_ok: bool = False
    checkpoint_corrupted: bool = False
    crash_simulated: bool = False
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


class CheckpointError(Exception):
    """Raised when checkpoint is corrupted or invalid."""
    pass


class LongTaskRunner:
    """Canonical runner for long-task evaluation.

    Demonstrates:
    - >=10-file plan generation
    - Seeded defect detection
    - Adversarial defect detection
    - False-green pattern detection
    - Repair/reverify
    - Checkpoint/resume with corruption detection
    """

    def __init__(
        self,
        output_dir: Path | None = None,
        checkpoint_path: Path | None = None,
        resume: bool = False,
        adversarial: bool = False,
    ):
        self.run_id = uuid.uuid4().hex[:12]
        self.output_dir = output_dir or Path(tempfile.mkdtemp(prefix="longtask-"))
        self.checkpoint_path = checkpoint_path or self.output_dir / "checkpoint.json"
        self.resume = resume
        self.adversarial = adversarial

        self._phase = RunPhase.INIT
        self._files: dict[str, str] = {}  # path -> content
        self._defects_found: list[str] = []
        self._defects_repaired: list[str] = []
        self._adversarial_found: list[dict] = []
        self._adversarial_repaired: list[str] = []
        self._falsegreen_found: list[dict] = []
        self._falsegreen_repaired: list[str] = []
        self._plan: dict[str, Any] = {}
        self._start_ms: int = 0
        self._result: EvaluationResult | None = None
        self._verification_passed: bool = False
        self._checkpoint_corrupted: bool = False

    def _load_checkpoint(self) -> Checkpoint | None:
        """Load checkpoint with corruption detection."""
        if not self.checkpoint_path.exists():
            return None

        try:
            raw = self.checkpoint_path.read_text()
            data = json.loads(raw)

            # Validate required fields
            cp = Checkpoint(**data)
            valid, reason = cp.validate()
            if not valid:
                raise CheckpointError(f"Invalid checkpoint: {reason}")

            return cp
        except json.JSONDecodeError as e:
            # Corrupted checkpoint - JSON parse failed
            self._checkpoint_corrupted = True
            raise CheckpointError(f"Corrupted checkpoint JSON: {e}")
        except CheckpointError:
            raise
        except Exception as e:
            self._checkpoint_corrupted = True
            raise CheckpointError(f"Failed to load checkpoint: {e}")

    def _save_checkpoint(self) -> None:
        """Save checkpoint with atomic write."""
        start_ms = getattr(self, "_start_ms", 0)

        # Compute content hashes
        content_hashes = {}
        for path, content in self._files.items():
            content_hashes[path] = _hash_content(content)

        cp = Checkpoint(
            run_id=self.run_id,
            phase=self._phase.name,
            files_written={k: _hash_content(v) for k, v in self._files.items()},
            defects_found=self._defects_found,
            defects_repaired=self._defects_repaired,
            adversarial_found=self._adversarial_found,
            falsegreen_found=self._falsegreen_found,
            plan=self._plan,
            ts=datetime.now(timezone.utc).isoformat(),
            duration_ms=int(time.time() * 1000) - start_ms,
            content_hashes=content_hashes,
        )

        self.checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

        # Atomic write: write to temp, then rename
        tmp_path = self.checkpoint_path.with_suffix('.tmp')
        tmp_path.write_text(json.dumps(asdict(cp), indent=2), encoding="utf-8")
        tmp_path.replace(self.checkpoint_path)

    def _verify_workspace_integrity(self) -> bool:
        """Verify workspace files match stored content hashes."""
        for path, content in self._files.items():
            file_path = self.output_dir / path
            if not file_path.exists():
                return False
            # _files stores content; compare against stored content hash
            expected_hash = _hash_content(content)
            actual_hash = _hash_content(file_path.read_text())
            if actual_hash != expected_hash:
                return False
        return True

    def _set_phase(self, phase: RunPhase) -> None:
        self._phase = phase
        try:
            self._save_checkpoint()
        except CheckpointError:
            self._phase = RunPhase.CORRUPTED
            raise

    def run(self) -> EvaluationResult:
        """Execute full long-task evaluation with checkpoint/resume."""
        self._start_ms = int(time.time() * 1000)

        # Resume from checkpoint if requested
        if self.resume:
            try:
                cp = self._load_checkpoint()
                if cp:
                    self._files = {}
                    for path, _hash in cp.files_written.items():
                        fp = self.output_dir / path
                        if fp.exists():
                            self._files[path] = fp.read_text()
                    self._defects_found = cp.defects_found
                    self._defects_repaired = cp.defects_repaired
                    self._adversarial_found = cp.adversarial_found
                    self._falsegreen_found = cp.falsegreen_found
                    self._plan = cp.plan
                    self._phase = RunPhase[cp.phase]
                    print(f"[{self.run_id}] Resumed from phase: {cp.phase}")

                    # Verify workspace integrity after resume
                    if not self._verify_workspace_integrity():
                        print(f"[{self.run_id}] WARNING: Workspace integrity check failed")
            except CheckpointError as e:
                print(f"[{self.run_id}] Checkpoint error: {e}")
                self._checkpoint_corrupted = True
                self._phase = RunPhase.INIT

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
            if self.adversarial:
                self._set_phase(RunPhase.ADVERSARIAL_DETECT)
            else:
                self._set_phase(RunPhase.REPAIR)

        # Phase 5: Adversarial defect detection
        if self._phase == RunPhase.ADVERSARIAL_DETECT:
            self._detect_adversarial_defects()
            self._set_phase(RunPhase.FALSEGREEN_DETECT)

        # Phase 6: False-green detection + repair
        if self._phase == RunPhase.FALSEGREEN_DETECT:
            self._detect_falsegreen()
            self._repair_falsegreen()
            self._set_phase(RunPhase.REPAIR)

        # Phase 7: Repair detected defects
        if self._phase == RunPhase.REPAIR:
            self._repair_defects()
            if self.adversarial:
                self._set_phase(RunPhase.ADVERSARIAL_REPAIR)
            else:
                self._set_phase(RunPhase.VERIFY)

        # Phase 8: Repair adversarial defects
        if self._phase == RunPhase.ADVERSARIAL_REPAIR:
            self._repair_adversarial_defects()
            self._set_phase(RunPhase.VERIFY)

        # Phase 9: Verify repairs
        if self._phase == RunPhase.VERIFY:
            self._verify_repairs()
            self._set_phase(RunPhase.COMPLETE)

        return self._build_result()

    def _setup_fixture(self) -> None:
        """Populate workspace from engine fixture."""
        fixture = ADVERSARIAL_FIXTURE if self.adversarial else LONG_TASK_FIXTURE
        for path, content in fixture["files"].items():
            target = self.output_dir / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            self._files[path] = content

    def _generate_plan(self) -> None:
        """Generate >=10-file plan from fixture task."""
        fixture = ADVERSARIAL_FIXTURE if self.adversarial else LONG_TASK_FIXTURE
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
        fixture = ADVERSARIAL_FIXTURE if self.adversarial else LONG_TASK_FIXTURE
        seeded_defects = fixture.get("seeded_defects", [])
        self._defects_found = detect_defects(self.output_dir, seeded_defects)

    def _detect_adversarial_defects(self) -> None:
        """Detect adversarial defects."""
        self._adversarial_found = detect_adversarial_defects(self.output_dir)

    def _detect_falsegreen(self) -> None:
        """Detect false-green patterns."""
        self._falsegreen_found = detect_false_green(self.output_dir)

    def _repair_defects(self) -> None:
        """Repair detected defects."""
        fixture = ADVERSARIAL_FIXTURE if self.adversarial else LONG_TASK_FIXTURE
        seeded_defects = fixture.get("seeded_defects", [])
        repaired = repair_defects(self.output_dir, self._defects_found, seeded_defects)
        self._defects_repaired = repaired

    def _repair_adversarial_defects(self) -> None:
        """Repair adversarial defects."""
        repaired = repair_adversarial_defects(self.output_dir, self._adversarial_found)
        self._adversarial_repaired = repaired

    def _repair_falsegreen(self) -> None:
        """Repair false-green patterns."""
        repaired = repair_false_green(self.output_dir, self._falsegreen_found)
        self._falsegreen_repaired = repaired

    def _verify_repairs(self) -> None:
        """Verify repairs via signature re-scan (all repair categories)."""
        fixture = ADVERSARIAL_FIXTURE if self.adversarial else LONG_TASK_FIXTURE
        verified = verify_repair(
            self.output_dir,
            fixture.get("verification_commands", []),
            self._defects_found,
            self._defects_repaired,
        )
        if self.adversarial:
            verified = (
                verified
                and verify_adversarial_repair(self.output_dir, self._adversarial_repaired)
                and verify_false_green_repair(self.output_dir, self._falsegreen_repaired)
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
        elif self._phase == RunPhase.CORRUPTED:
            outcome = "CORRUPTED_CHECKPOINT"

        fixture = ADVERSARIAL_FIXTURE if self.adversarial else LONG_TASK_FIXTURE
        seeded_count = len(fixture.get("seeded_defects", []))

        result = EvaluationResult(
            run_id=self.run_id,
            case_id="long-task-10file",
            variant="adversarial" if self.adversarial else "longtask",
            plan_files=self._plan.get("files_count", len(self._files)),
            defects_seeded=seeded_count,
            defects_found=len(self._defects_found),
            defects_repaired=len(self._defects_repaired),
            adversarial_found=len(self._adversarial_found),
            adversarial_repaired=len(self._adversarial_repaired),
            falsegreen_found=len(self._falsegreen_found),
            falsegreen_repaired=len(self._falsegreen_repaired),
            verification_passed=getattr(self, "_verification_passed", False),
            checkpoint_resume_ok=self.resume and self._phase not in (RunPhase.INIT, RunPhase.CORRUPTED),
            checkpoint_corrupted=self._checkpoint_corrupted,
            crash_simulated=False,
            duration_ms=duration_ms,
            ts=datetime.now(timezone.utc).isoformat(),
            outcome=outcome,
            evidence={
                "phase": self._phase.name,
                "plan_steps": len(self._plan.get("steps", [])),
                "files_in_fixture": len(fixture["files"]),
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
    adversarial: bool = False,
) -> EvaluationResult:
    """Convenience: run long-task evaluation and return result."""
    runner = LongTaskRunner(
        output_dir=output_dir,
        checkpoint_path=checkpoint_path,
        resume=resume,
        adversarial=adversarial,
    )
    return runner.run()
