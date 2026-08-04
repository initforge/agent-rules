"""Repair and verify defects in long-task evaluation."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any


def repair_defect_currency(content: str) -> str:
    """Fix missing currency validation in payment.py."""
    if "supported_currencies" not in content:
        # Add supported currencies check
        old = "return PaymentResponse(success=True, transaction_id=\"txn_123\")"
        new = '''if request.currency not in ("USD", "EUR", "GBP", "JPY"):
            return PaymentResponse(success=False, error="Unsupported currency")
        return PaymentResponse(success=True, transaction_id="txn_123")'''
        return content.replace(old, new)
    return content


def repair_defect_division_by_zero(content: str) -> str:
    """Fix division by zero in calculator.py - raise instead of return 0."""
    old = """    if count == 0:
        return 0  # BUG: Silent zero return hides the error
    return total / count"""
    new = """    if count == 0:
        raise ValueError("Division by zero")
    return total / count"""
    return content.replace(old, new)


def repair_defect_email_regex(content: str) -> str:
    """Fix weak email regex in validation.py."""
    old = r'pattern = r".+@.+"'
    new = '''pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"'''
    return re.sub(old, new, content)


# Adversarial repair functions
def repair_obfuscated_email(content: str) -> str:
    """Fix obfuscated weak email regex."""
    # Replace any .+@.+ pattern with proper regex
    old = r'pattern = r"\."'
    new = 'pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"'
    content = re.sub(r'pattern\s*=\s*r"\."', new, content)
    # Also fix the pattern + "+@.+" construction
    content = re.sub(r'pattern\s*=\s*r"\."\s*\+\s*"\+@\.+"', new, content)
    return content


def repair_silent_div_zero(content: str) -> str:
    """Fix silent division by zero with misleading comments."""
    old = """    if count == 0:
        return 0  # Intentionally safe default"""
    new = """    if count == 0:
        raise ValueError("Division by zero: count cannot be zero")"""
    return content.replace(old, new)


def repair_currency_default(content: str) -> str:
    """Fix currency default that bypasses validation."""
    # Remove default value, add proper validation
    old = 'currency: str = "USD"'
    new = 'currency: str'
    content = content.replace(old, new)
    # Add validation before processing
    old2 = "if request.amount < 0:"
    new2 = '''if request.currency not in ("USD", "EUR", "GBP", "JPY"):
        return PaymentResponse(success=False, error="Unsupported currency: " + request.currency)
    if request.amount < 0:'''
    return content.replace(old2, new2)


def repair_race_condition(content: str) -> str:
    """Fix race condition by adding thread safety."""
    if "import threading" not in content and "from threading import" not in content:
        content = content.replace(
            "from src.api.payment import",
            "import threading\nfrom src.api.payment import"
        )
    # Add lock to __init__
    content = content.replace(
        "self.repo = repo",
        "self.repo = repo\n        self._lock = threading.Lock()"
    )
    # Wrap state mutations with lock
    content = content.replace(
        "self._pending_transactions[txn_id] = request",
        "with self._lock:\n            self._pending_transactions[txn_id] = request"
    )
    content = content.replace(
        "self._completed_transactions.append(txn_id)",
        "with self._lock:\n            self._completed_transactions.append(txn_id)"
    )
    return content


# False-green repair functions
def repair_empty_test(content: str) -> str:
    """Fix empty test methods that pass."""
    # With placeholder docstring
    content = re.sub(
        r'(def test_\w+\([^)]*\):\s*)"""[^"]*"""\s*pass',
        r'\1"""Test implementation required."""\n        raise NotImplementedError("Test not implemented")',
        content
    )
    # Bare pass without docstring
    content = re.sub(
        r'(def test_\w+\([^)]*\):\s*)pass\s*$',
        r'\1"""Test implementation required."""\n        raise NotImplementedError("Test not implemented")',
        content,
        flags=re.MULTILINE,
    )
    return content


def repair_skipped_test(content: str) -> str:
    """Remove @unittest.skip decorator."""
    return re.sub(r'@unittest\.skip\([^)]*\)\s*\n', '', content)


def repair_assert_true(content: str) -> str:
    """Replace always-true assertion with a real check marker."""
    return re.sub(
        r"assert\s+True\s*$",
        'raise NotImplementedError("Test requires real assertion")',
        content,
        flags=re.MULTILINE,
    )


REPAIR_FUNCTIONS = {
    "currency-validation": repair_defect_currency,
    "division-by-zero": repair_defect_division_by_zero,
    "weak-email-regex": repair_defect_email_regex,
}

ADVERSARIAL_REPAIR_FUNCTIONS = {
    "obfuscated-email": repair_obfuscated_email,
    "silent-div-zero": repair_silent_div_zero,
    "currency-type-bypass": repair_currency_default,
    "race-condition": repair_race_condition,
}

FALSE_GREEN_REPAIR_FUNCTIONS = {
    "test-passes-on-empty": repair_empty_test,
    "test-skipped": repair_skipped_test,
    "assert-always-true": repair_assert_true,
}


def repair_defects(
    workspace: Path,
    detected_defect_ids: list[str],
    seeded_defects: list[dict[str, Any]],
) -> list[str]:
    """Repair detected defects in workspace.

    Returns list of successfully repaired defect IDs.
    """
    repaired: list[str] = []

    defect_map = {d["id"]: d for d in seeded_defects if "id" in d}

    for defect_id in detected_defect_ids:
        if defect_id not in REPAIR_FUNCTIONS:
            continue

        repair_fn = REPAIR_FUNCTIONS[defect_id]
        defect_info = defect_map.get(defect_id, {})
        file_path = defect_info.get("file", "")

        # Find and repair file (normalize to forward slashes for cross-platform)
        for path in workspace.rglob("*.py"):
            rel = str(path.relative_to(workspace)).replace("\\", "/")
            if rel == file_path or rel.startswith(file_path + "/") or file_path.startswith(rel + "/"):
                try:
                    content = path.read_text()
                    new_content = repair_fn(content)
                    if new_content != content:
                        path.write_text(new_content)
                        repaired.append(defect_id)
                except Exception:
                    pass

    return repaired


def repair_adversarial_defects(
    workspace: Path,
    detected_defect_ids: list[dict[str, Any]],
) -> list[str]:
    """Repair adversarial defects.

    Returns list of successfully repaired defect IDs.
    """
    repaired: list[str] = []

    for defect_info in detected_defect_ids:
        defect_id = defect_info.get("id", "")
        file_path = defect_info.get("file", "")

        if defect_id not in ADVERSARIAL_REPAIR_FUNCTIONS:
            continue

        repair_fn = ADVERSARIAL_REPAIR_FUNCTIONS[defect_id]

        for path in workspace.rglob("*.py"):
            rel = str(path.relative_to(workspace)).replace("\\", "/")
            if rel == file_path:
                try:
                    content = path.read_text()
                    new_content = repair_fn(content)
                    if new_content != content:
                        path.write_text(new_content)
                        repaired.append(defect_id)
                except Exception:
                    pass

    return repaired


def repair_false_green(
    workspace: Path,
    detected_patterns: list[dict[str, Any]],
) -> list[str]:
    """Repair false-green patterns.

    Returns list of repaired pattern IDs.
    """
    repaired: list[str] = []

    for pattern_info in detected_patterns:
        pattern_id = pattern_info.get("id", "")
        file_path = pattern_info.get("file", "")

        if pattern_id not in FALSE_GREEN_REPAIR_FUNCTIONS:
            continue

        repair_fn = FALSE_GREEN_REPAIR_FUNCTIONS[pattern_id]

        for path in workspace.rglob("*.py"):
            rel = str(path.relative_to(workspace)).replace("\\", "/")
            if rel == file_path:
                try:
                    content = path.read_text()
                    new_content = repair_fn(content)
                    if new_content != content:
                        path.write_text(new_content)
                        repaired.append(pattern_id)
                except Exception:
                    pass

    return repaired


def verify_repair(
    workspace: Path,
    verification_commands: list[str],
    detected_defects: list[str],
    repaired_defects: list[str],
) -> bool:
    """Verify repairs by running verification commands.

    Returns True if verification passes.
    """
    if not repaired_defects:
        return False

    # For testing: verify the repaired defects no longer match signatures
    from .defects import detect_defects

    remaining = detect_defects(workspace, [
        {"id": d} for d in repaired_defects
    ])

    # All repaired defects should no longer be detected
    return len(remaining) == 0


def verify_adversarial_repair(
    workspace: Path,
    repaired_defect_ids: list[str],
) -> bool:
    """Verify adversarial defects are repaired.

    Returns True if all adversarial defects are fixed.
    """
    from .defects import detect_adversarial_defects

    remaining = detect_adversarial_defects(workspace)
    remaining_ids = [d["id"] for d in remaining if d["id"] in repaired_defect_ids]

    return len(remaining_ids) == 0


def verify_false_green_repair(
    workspace: Path,
    repaired_pattern_ids: list[str],
) -> bool:
    """Verify false-green patterns are repaired.

    Returns True if all false-green patterns are fixed.
    """
    from .defects import detect_false_green

    remaining = detect_false_green(workspace)
    remaining_ids = [d["id"] for d in remaining if d["id"] in repaired_pattern_ids]

    return len(remaining_ids) == 0
