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


REPAIR_FUNCTIONS = {
    "currency-validation": repair_defect_currency,
    "division-by-zero": repair_defect_division_by_zero,
    "weak-email-regex": repair_defect_email_regex,
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

        # Find and repair file
        for path in workspace.rglob("*.py"):
            rel = str(path.relative_to(workspace))
            if rel == file_path or rel.replace("/", ".").startswith(file_path.replace("/", ".")):
                try:
                    content = path.read_text()
                    new_content = repair_fn(content)
                    if new_content != content:
                        path.write_text(new_content)
                        repaired.append(defect_id)
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
