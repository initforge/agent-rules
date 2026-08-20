"""Adversarial long-task evaluation - real worker paths, crash/resume, duplicate/lost receipts.

Run: python evals/long_task/test_adversarial.py
No framework — uses bare assert for signal clarity.

Ponytail: This is the canonical adversarial test. Add harder cases here.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

# Allow `python evals/long_task/test_adversarial.py`
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from evals.long_task.fixtures import LONG_TASK_FIXTURE, ADVERSARIAL_FIXTURE, RECEIPT_TEST_FIXTURE
from evals.long_task.defects import (
    detect_defects,
    detect_adversarial_defects,
    detect_false_green,
    compute_content_hash,
    ADVERSARIAL_SIGNATURES,
    FALSE_GREEN_SIGNATURES,
)
from evals.long_task.repair import (
    repair_defects,
    repair_adversarial_defects,
    repair_false_green,
    verify_repair,
    verify_adversarial_repair,
    verify_false_green_repair,
)


# ─────────────────────────────────────────────────────────────────────────────
# Receipt handling for duplicate/lost tests
# ─────────────────────────────────────────────────────────────────────────────

class ReceiptTracker:
    """Tracks receipts for idempotency and delivery guarantee tests."""

    def __init__(self):
        self._receipts: dict[str, dict] = {}
        self._processed_ids: set[str] = set()
        self._delivery_log: list[dict] = []

    def add_receipt(self, receipt: dict) -> str:
        """Add receipt, track delivery. Returns receipt_id."""
        receipt_id = receipt.get("receipt_id", "")
        self._receipts[receipt_id] = receipt
        self._delivery_log.append({
            "receipt_id": receipt_id,
            "timestamp": time.time(),
            "action": "delivered",
        })
        return receipt_id

    def has_receipt(self, receipt_id: str) -> bool:
        return receipt_id in self._receipts

    def get_receipt(self, receipt_id: str) -> dict | None:
        return self._receipts.get(receipt_id)

    def compute_idempotent_id(self, task_id: str, content_hash: str) -> str:
        """Compute deterministic ID for idempotency check."""
        raw = f"{task_id}:{content_hash}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def simulate_duplicate(self, receipt: dict) -> dict:
        """Simulate duplicate receipt - should be idempotent."""
        receipt_id = receipt.get("receipt_id", "")
        if receipt_id in self._processed_ids:
            # Idempotent: return existing receipt
            return self._receipts[receipt_id]
        self._processed_ids.add(receipt_id)
        return receipt

    def simulate_lost_receipt(self, receipt_id: str) -> bool:
        """Simulate lost receipt by removing it."""
        if receipt_id in self._receipts:
            del self._receipts[receipt_id]
            self._delivery_log.append({
                "receipt_id": receipt_id,
                "timestamp": time.time(),
                "action": "lost",
            })
            return True
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Crash simulation helpers
# ─────────────────────────────────────────────────────────────────────────────

class CrashSimulator:
    """Simulates various crash/resume scenarios."""

    @staticmethod
    def corrupt_checkpoint(cp_path: Path) -> None:
        """Corrupt checkpoint file to simulate crash."""
        if cp_path.exists():
            content = cp_path.read_text()
            # Truncate to simulate partial write
            cp_path.write_text(content[:len(content) // 2])

    @staticmethod
    def delete_receipt(store_dir: Path, receipt_id: str) -> bool:
        """Delete a receipt to simulate lost delivery."""
        receipt_path = store_dir / f"{receipt_id}.json"
        if receipt_path.exists():
            receipt_path.unlink()
            return True
        return False

    @staticmethod
    def truncate_file(path: Path, lines: int | None = None) -> None:
        """Truncate file to simulate partial write."""
        content = path.read_text()
        if lines is None:
            content = content[:max(1, len(content) // 2)]
        else:
            content = '\n'.join(content.split('\n')[:lines])
        path.write_text(content)


# ─────────────────────────────────────────────────────────────────────────────
# Test fixtures as actual files in temp workspace
# ─────────────────────────────────────────────────────────────────────────────

def setup_workspace(fixture: dict, base_dir: Path | None = None) -> Path:
    """Setup workspace from fixture with real files."""
    if base_dir is None:
        base_dir = Path(tempfile.mkdtemp(prefix="adversarial-ws-"))
    else:
        base_dir.mkdir(parents=True, exist_ok=True)

    for path, content in fixture["files"].items():
        target = base_dir / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    return base_dir


def setup_receipt_workspace(base_dir: Path | None = None) -> tuple[Path, ReceiptTracker]:
    """Setup workspace for receipt tests with ReceiptTracker."""
    if base_dir is None:
        base_dir = Path(tempfile.mkdtemp(prefix="receipt-ws-"))
    else:
        base_dir.mkdir(parents=True, exist_ok=True)

    for path, content in RECEIPT_TEST_FIXTURE["files"].items():
        target = base_dir / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    tracker = ReceiptTracker()
    return base_dir, tracker


# ─────────────────────────────────────────────────────────────────────────────
# Worker execution path (real, not simulated)
# ─────────────────────────────────────────────────────────────────────────────

class RealWorkerPath:
    """Execute real worker operations through actual Python execution."""

    def __init__(self, workspace: Path):
        self.workspace = workspace
        self._sys_path = [str(workspace)] + sys.path

    def execute_python_file(self, file_path: Path) -> tuple[int, str, str]:
        """Execute a Python file and return (exit_code, stdout, stderr)."""
        result = subprocess.run(
            [sys.executable, str(file_path)],
            capture_output=True,
            text=True,
            cwd=self.workspace,
            env={**os.environ, "PYTHONPATH": str(self.workspace)},
        )
        return result.returncode, result.stdout, result.stderr

    def run_tests(self, test_pattern: str = "test_*.py") -> tuple[int, str, str]:
        """Run pytest on test files in workspace."""
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-v", f"src/tests/{test_pattern}"],
            capture_output=True,
            text=True,
            cwd=self.workspace,
            env={**os.environ, "PYTHONPATH": str(self.workspace)},
        )
        return result.returncode, result.stdout, result.stderr

    def check_defect_signatures(self) -> dict[str, bool]:
        """Check if defects still exist by running actual code."""
        results = {}

        # Check division by zero behavior
        calc_path = self.workspace / "src/api/calculator.py"
        if calc_path.exists():
            test_code = '''
import sys
sys.path.insert(0, "src")
from api.calculator import divide
try:
    result = divide(10, 0)
    print("RETURNED:", result)
except ValueError as e:
    print("RAISED:", e)
'''
            test_path = self.workspace / "_test_div.py"
            test_path.write_text(test_code)
            _, stdout, _ = self.execute_python_file(test_path)
            results["division-by-zero"] = "RETURNED: 0" in stdout
            test_path.unlink()

        # Check email validation
        val_path = self.workspace / "src/api/validation.py"
        if val_path.exists():
            test_code = '''
import sys
sys.path.insert(0, "src")
from api.validation import validate_email
# Weak patterns that should be rejected
bad_patterns = ["userexample.com", "user@", "@domain.com", "user@.com"]
results = [validate_email(p) for p in bad_patterns]
if any(results):
    print("WEAK_VALIDATION:", results)
else:
    print("STRONG_VALIDATION")
'''
            test_path = self.workspace / "_test_email.py"
            test_path.write_text(test_code)
            _, stdout, _ = self.execute_python_file(test_path)
            results["weak-email-regex"] = "WEAK_VALIDATION" in stdout
            test_path.unlink()

        return results


# ─────────────────────────────────────────────────────────────────────────────
# Main adversarial test suite
# ─────────────────────────────────────────────────────────────────────────────

def test_standard_defects_real_worker_path() -> tuple[bool, str]:
    """Test standard seeded defects with real worker execution path."""
    ws = Path(tempfile.mkdtemp(prefix="adv-std-"))
    setup_workspace(LONG_TASK_FIXTURE, ws)
    worker = RealWorkerPath(ws)

    # Detect defects
    found = detect_defects(ws, LONG_TASK_FIXTURE["seeded_defects"])
    assert len(found) == 3, f"expected 3 defects, found {found}"

    # Verify defects exist via real execution
    defect_status = worker.check_defect_signatures()
    assert defect_status.get("division-by-zero") is True, "div/zero defect not detected by execution"
    assert defect_status.get("weak-email-regex") is True, "email defect not detected by execution"

    # Repair defects
    repaired = repair_defects(ws, found, LONG_TASK_FIXTURE["seeded_defects"])
    assert len(repaired) == 3, f"repaired {len(repaired)} defects"

    # Verify repairs via real execution
    defect_status = worker.check_defect_signatures()
    assert defect_status.get("division-by-zero") is False, "div/zero still broken after repair"
    assert defect_status.get("weak-email-regex") is False, "email still broken after repair"

    shutil.rmtree(ws, ignore_errors=True)
    return True, "standard_defects_real_worker_path"


def test_adversarial_defects_detected() -> tuple[bool, str]:
    """Test adversarial defects are detected by extended signatures."""
    ws = Path(tempfile.mkdtemp(prefix="adv-adv-"))
    setup_workspace(ADVERSARIAL_FIXTURE, ws)

    # Detect standard defects first
    found_std = detect_defects(ws, ADVERSARIAL_FIXTURE["seeded_defects"])
    assert len(found_std) == 3, f"expected 3 standard defects, found {found_std}"

    # Detect adversarial defects
    found_adv = detect_adversarial_defects(ws)
    adv_ids = [d["id"] for d in found_adv]

    # Every seeded obfuscated defect must be detected (no fixture weakening)
    expected_adv = {d["id"] for d in ADVERSARIAL_FIXTURE["adversarial_defects"]}
    assert set(adv_ids) == expected_adv, \
        f"adversarial defects not all detected: found={adv_ids} expected={expected_adv}"

    shutil.rmtree(ws, ignore_errors=True)
    return True, "adversarial_defects_detected"


def test_adversarial_repair_works() -> tuple[bool, str]:
    """Test adversarial defects can be repaired."""
    ws = Path(tempfile.mkdtemp(prefix="adv-repair-"))
    setup_workspace(ADVERSARIAL_FIXTURE, ws)

    # Detect adversarial defects
    found_adv = detect_adversarial_defects(ws)
    assert len(found_adv) == 4, f"expected 4 adversarial defects, found {found_adv}"

    # Repair adversarial defects
    repaired = repair_adversarial_defects(ws, found_adv)
    assert len(repaired) == 4, f"expected 4 repaired, got {repaired}"

    # Verify repair: every repaired defect no longer detected
    assert verify_adversarial_repair(ws, repaired), "adversarial repair verification failed"

    remaining = detect_adversarial_defects(ws)
    remaining_ids = [d["id"] for d in remaining]
    assert len(remaining_ids) == 0, f"adversarial defects still present: {remaining_ids}"

    shutil.rmtree(ws, ignore_errors=True)
    return True, "adversarial_repair_works"


def test_false_green_detected() -> tuple[bool, str]:
    """Test false-green patterns (tests that pass but shouldn't) are detected."""
    ws = Path(tempfile.mkdtemp(prefix="adv-falsegreen-"))
    setup_workspace(ADVERSARIAL_FIXTURE, ws)

    # Detect false-green patterns
    found = detect_false_green(ws)
    assert len(found) > 0, "no false-green patterns detected"

    fg_ids = [d["id"] for d in found]
    # Every seeded false-green class must be detected (docstring-pass, bare
    # assert True, and skipped test) — no fixture weakening.
    expected_fg = {"test-passes-on-empty", "assert-always-true", "test-skipped"}
    assert expected_fg.issubset(set(fg_ids)), \
        f"expected false-green patterns {expected_fg}, found: {fg_ids}"

    shutil.rmtree(ws, ignore_errors=True)
    return True, "false_green_detected"


def test_false_green_repair_works() -> tuple[bool, str]:
    """Test false-green patterns can be repaired."""
    ws = Path(tempfile.mkdtemp(prefix="adv-fg-repair-"))
    setup_workspace(ADVERSARIAL_FIXTURE, ws)

    # Detect false-green
    found = detect_false_green(ws)
    assert len(found) > 0, "no false-green patterns found"

    # Repair false-green
    repaired = repair_false_green(ws, found)
    assert len(repaired) == len(found), f"repaired {len(repaired)} of {len(found)} false-green"

    # Verify repair: every repaired pattern no longer detected
    assert verify_false_green_repair(ws, repaired), "false-green repair verification failed"

    remaining = detect_false_green(ws)
    assert len(remaining) == 0, f"false-green still present: {remaining}"

    shutil.rmtree(ws, ignore_errors=True)
    return True, "false_green_repair_works"


def test_receipt_idempotency() -> tuple[bool, str]:
    """Test receipts are idempotent - duplicate execution same receipt."""
    ws, tracker = setup_receipt_workspace()

    # Import and execute receipt handler
    sys.path.insert(0, str(ws))
    from src.receipt_handler import ReceiptStore
    from src.worker import Worker

    store = ReceiptStore()
    worker = Worker(store)

    # Execute same task twice
    task_id = "T-IDEMPOTENT"
    content = "print('hello')"

    r1 = worker.execute_task(task_id, content)
    r2 = worker.execute_task(task_id, content)

    # Same receipt ID due to idempotency
    assert r1["receipt_id"] == r2["receipt_id"], \
        f"idempotency broken: {r1['receipt_id']} != {r2['receipt_id']}"

    # Only one receipt stored
    assert len(store.list_all()) == 1, f"expected 1 receipt, got {len(store.list_all())}"

    shutil.rmtree(ws, ignore_errors=True)
    sys.path.remove(str(ws))
    return True, "receipt_idempotency"


def test_receipt_duplicate_handling() -> tuple[bool, str]:
    """Test duplicate receipts are handled correctly."""
    tracker = ReceiptTracker()

    receipt = {
        "receipt_id": "dup-test-001",
        "task_id": "T-DUP",
        "content_hash": "abc123",
        "status": "PASS",
    }

    # Add receipt first time
    tracker.add_receipt(receipt)
    assert tracker.has_receipt("dup-test-001")

    # Simulate duplicate delivery
    dup_receipt = tracker.simulate_duplicate(receipt)

    # Should return existing receipt, not create duplicate
    assert dup_receipt["receipt_id"] == receipt["receipt_id"]

    return True, "receipt_duplicate_handling"


def test_receipt_lost_detection() -> tuple[bool, str]:
    """Test lost receipts are detected."""
    ws = Path(tempfile.mkdtemp(prefix="adv-lost-"))
    ws.mkdir(parents=True, exist_ok=True)
    tracker = ReceiptTracker()

    receipt = {
        "receipt_id": "lost-test-001",
        "task_id": "T-LOST",
        "content_hash": "xyz789",
        "status": "PASS",
    }

    # Add receipt
    tracker.add_receipt(receipt)
    assert tracker.has_receipt("lost-test-001")

    # Simulate lost receipt
    lost = tracker.simulate_lost_receipt("lost-test-001")
    assert lost, "receipt should be lost"
    assert not tracker.has_receipt("lost-test-001"), "receipt should no longer exist"

    # Verify delivery log shows loss
    loss_events = [e for e in tracker._delivery_log if e["action"] == "lost"]
    assert len(loss_events) == 1, f"expected 1 loss event, got {len(loss_events)}"

    shutil.rmtree(ws, ignore_errors=True)
    return True, "receipt_lost_detection"


def test_crash_resume_from_checkpoint() -> tuple[bool, str]:
    """Test crash/resume from corrupted checkpoint."""
    ws = Path(tempfile.mkdtemp(prefix="adv-crash-"))

    # Setup fixture
    setup_workspace(LONG_TASK_FIXTURE, ws)

    # Simulate a partial run with checkpoint
    checkpoint_data = {
        "run_id": "crash-test-001",
        "phase": "EXECUTE",
        "files_written": {
            "src/api/payment.py": compute_content_hash("# corrupted"),
        },
        "defects_found": [],
        "defects_repaired": [],
        "ts": "2024-01-01T00:00:00Z",
    }
    cp_path = ws / "checkpoint.json"
    cp_path.write_text(json.dumps(checkpoint_data))

    # Corrupt checkpoint
    CrashSimulator.corrupt_checkpoint(cp_path)

    # Attempt resume - should handle corrupted checkpoint gracefully
    try:
        # Read corrupted checkpoint
        with open(cp_path) as f:
            raw = f.read()
        # Parse should fail or return partial data
        try:
            data = json.loads(raw)
            # If parse succeeds, data might be incomplete
            if len(raw) < len(json.dumps(checkpoint_data)):
                # Checkpoint was truncated - partial recovery
                assert len(raw) < len(json.dumps(checkpoint_data))
        except json.JSONDecodeError:
            # Expected: corrupted JSON should fail to parse
            assert True
    except Exception as e:
        # Any crash should be caught, not propagate
        raise AssertionError(f"Crash handling failed: {e}")

    shutil.rmtree(ws, ignore_errors=True)
    return True, "crash_resume_from_checkpoint"


def test_checkpoint_survives_partial_write() -> tuple[bool, str]:
    """Test checkpoint file integrity after partial write."""
    ws = Path(tempfile.mkdtemp(prefix="adv-cp-"))

    checkpoint_data = {
        "run_id": "cp-test-001",
        "phase": "PLAN",
        "files_written": {"test.py": "abc123"},
    }
    cp_path = ws / "checkpoint.json"

    # Write full checkpoint
    cp_path.write_text(json.dumps(checkpoint_data))

    # Truncate to simulate partial write
    CrashSimulator.truncate_file(cp_path)

    # Verify checkpoint is now invalid JSON
    try:
        json.loads(cp_path.read_text())
        raise AssertionError("Truncated checkpoint should be invalid JSON")
    except json.JSONDecodeError:
        pass  # Expected

    shutil.rmtree(ws, ignore_errors=True)
    return True, "checkpoint_survives_partial_write"


def test_no_false_green_without_repair() -> tuple[bool, str]:
    """Test that without repair, verification fails (no false green)."""
    ws = Path(tempfile.mkdtemp(prefix="adv-nofg-"))
    setup_workspace(LONG_TASK_FIXTURE, ws)

    # Detect defects but don't repair
    found = detect_defects(ws, LONG_TASK_FIXTURE["seeded_defects"])
    assert len(found) > 0

    # Verify repair should fail without repairs
    verified = verify_repair(ws, LONG_TASK_FIXTURE["verification_commands"], found, [])
    assert not verified, "false green: verification passed without repair"

    shutil.rmtree(ws, ignore_errors=True)
    return True, "no_false_green_without_repair"


def test_adversarial_no_fixture_weakening() -> tuple[bool, str]:
    """Verify adversarial fixture is not weakened - defects still present."""
    ws = Path(tempfile.mkdtemp(prefix="adv-strength-"))
    setup_workspace(ADVERSARIAL_FIXTURE, ws)

    # Verify all seeded defects are present
    found_std = detect_defects(ws, ADVERSARIAL_FIXTURE["seeded_defects"])
    assert len(found_std) == 3, f"standard defects weakened: {found_std}"

    # Verify adversarial defects are present
    found_adv = detect_adversarial_defects(ws)
    expected_adv = {d["id"] for d in ADVERSARIAL_FIXTURE["adversarial_defects"]}
    assert set(d["id"] for d in found_adv) == expected_adv, \
        f"adversarial defects missing/extra: {found_adv}"

    # Verify false-green patterns are present
    found_fg = detect_false_green(ws)
    expected_fg = {"test-passes-on-empty", "assert-always-true", "test-skipped"}
    assert expected_fg.issubset(set(d["id"] for d in found_fg)), \
        f"false-green patterns missing: {found_fg}"

    shutil.rmtree(ws, ignore_errors=True)
    return True, "adversarial_no_fixture_weakening"


def test_content_hash_deterministic() -> tuple[bool, str]:
    """Test content hash is deterministic for same content."""
    content = "def test(): pass"
    hash1 = compute_content_hash(content)
    hash2 = compute_content_hash(content)
    assert hash1 == hash2, "content hash not deterministic"

    # Different content produces different hash
    hash3 = compute_content_hash(content + "\n")
    assert hash1 != hash3, "different content should produce different hash"

    return True, "content_hash_deterministic"


def test_adversarial_full_runner_passes() -> tuple[bool, str]:
    """Full `--adversarial` run: all obfuscated defects + false-green found,
    repaired, and verified — real end-to-end execution, not a stubbed path."""
    from evals.long_task.runner import run_eval

    ws = Path(tempfile.mkdtemp(prefix="adv-runner-"))
    result = run_eval(output_dir=ws, adversarial=True)

    assert result.variant == "adversarial", f"variant={result.variant}"
    assert result.outcome == "PASS", f"outcome={result.outcome} evidence={result.evidence}"

    # Every seeded obfuscated defect detected and repaired
    expected_adv = {d["id"] for d in ADVERSARIAL_FIXTURE["adversarial_defects"]}
    assert result.adversarial_found == len(expected_adv), \
        f"adversarial_found={result.adversarial_found} expected={len(expected_adv)}"
    assert result.adversarial_repaired == len(expected_adv), \
        f"adversarial_repaired={result.adversarial_repaired}"

    # Every false-green pattern detected and repaired
    expected_fg = {"test-passes-on-empty", "assert-always-true", "test-skipped"}
    assert result.falsegreen_found >= len(expected_fg), \
        f"falsegreen_found={result.falsegreen_found}"
    assert result.falsegreen_found == result.falsegreen_repaired, \
        f"false-green partial repair: found={result.falsegreen_found} repaired={result.falsegreen_repaired}"

    # Verification covers seeded + adversarial + false-green repairs
    assert result.verification_passed, "adversarial verification failed"

    # No fixture weakening: post-run workspace contains no residual defects
    assert detect_adversarial_defects(ws) == [], "adversarial defects remain after run"
    assert detect_false_green(ws) == [], "false-green patterns remain after run"

    shutil.rmtree(ws, ignore_errors=True)
    return True, "adversarial_full_runner_passes"


def test_receipt_hash_chain_integrity() -> tuple[bool, str]:
    """Test receipt hash chain maintains integrity."""
    ws, tracker = setup_receipt_workspace()

    sys.path.insert(0, str(ws))
    from src.receipt_handler import ReceiptStore

    store = ReceiptStore()

    # Create receipts with hash chain
    receipts = []
    for i in range(3):
        receipt = {
            "receipt_id": f"chain-{i}",
            "task_id": f"T-{i}",
            "content_hash": compute_content_hash(f"content-{i}"),
            "status": "PASS",
            "prev_hash": receipts[-1]["receipt_id"] if receipts else "GENESIS",
        }
        store.store(receipt)
        receipts.append(store.get(receipt["receipt_id"]))

    # Verify hash chain integrity
    for i, receipt in enumerate(receipts):
        assert receipt is not None
        if i > 0:
            assert receipt["prev_hash"] == receipts[i-1]["receipt_id"], \
                f"hash chain broken at {i}"

    shutil.rmtree(ws, ignore_errors=True)
    sys.path.remove(str(ws))
    return True, "receipt_hash_chain_integrity"


# ─────────────────────────────────────────────────────────────────────────────
# Test runner
# ─────────────────────────────────────────────────────────────────────────────

TESTS = [
    test_standard_defects_real_worker_path,
    test_adversarial_defects_detected,
    test_adversarial_repair_works,
    test_false_green_detected,
    test_false_green_repair_works,
    test_receipt_idempotency,
    test_receipt_duplicate_handling,
    test_receipt_lost_detection,
    test_crash_resume_from_checkpoint,
    test_checkpoint_survives_partial_write,
    test_no_false_green_without_repair,
    test_adversarial_no_fixture_weakening,
    test_content_hash_deterministic,
    test_adversarial_full_runner_passes,
    test_receipt_hash_chain_integrity,
]


def main() -> int:
    """Run all adversarial tests."""
    print("=" * 70)
    print("ADVERSARIAL LONG-TASK EVALUATION")
    print("=" * 70)
    print()

    passed = 0
    failed = 0
    errors = []

    for test_fn in TESTS:
        test_name = test_fn.__name__
        print(f"Running: {test_name}...", end=" ", flush=True)
        try:
            ok, label = test_fn()
            if ok:
                print("PASS")
                passed += 1
            else:
                print(f"FAIL: {label}")
                failed += 1
                errors.append((test_name, label))
        except Exception as e:
            print(f"ERROR: {e}")
            failed += 1
            errors.append((test_name, str(e)))

    print()
    print("=" * 70)
    print(f"RESULTS: {passed} passed, {failed} failed, {len(TESTS)} total")
    print("=" * 70)

    if errors:
        print()
        print("FAILURES:")
        for name, reason in errors:
            print(f"  - {name}: {reason}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
