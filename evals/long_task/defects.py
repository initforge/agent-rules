"""Seeded defect detection for long-task evaluation."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any


# Defect signatures to detect
DEFECT_SIGNATURES = {
    "currency-validation": {
        "file_pattern": r"src/api/payment\.py",
        # Defect: PaymentRequest has currency field but process_payment never uses it
        "detect": lambda content: (
            "def process_payment" in content
            and "currency" in content
            and "request.currency" not in content
        ),
        "desc": "Missing currency validation",
    },
    "division-by-zero": {
        "file_pattern": r"src/api/calculator\.py",
        "detect": lambda content: bool(
            re.search(r"if count == 0:\s*\n\s*return 0\b", content)
        ),
        "desc": "Division by zero returns 0 instead of raising",
    },
    "weak-email-regex": {
        "file_pattern": r"src/api/validation\.py",
        "detect": lambda content: bool(re.search(r'pattern\s*=\s*r".\+@.+"', content)),
        "desc": "Weak email regex pattern",
    },
}


def detect_defects(
    workspace: Path,
    seeded_defects: list[dict[str, Any]],
) -> list[str]:
    """Detect seeded defects in workspace.

    Returns list of detected defect IDs.
    """
    found: list[str] = []

    for defect in seeded_defects:
        defect_id = defect.get("id", "")
        if defect_id not in DEFECT_SIGNATURES:
            continue

        sig = DEFECT_SIGNATURES[defect_id]
        file_pattern = sig["file_pattern"]

        # Find matching file
        for path in workspace.rglob("*.py"):
            rel = str(path.relative_to(workspace))
            if re.search(file_pattern, rel):
                try:
                    content = path.read_text()
                    if sig["detect"](content):
                        found.append(defect_id)
                except Exception:
                    pass

    return found


def get_defect_info(defect_id: str) -> dict[str, Any] | None:
    """Get information about a specific defect."""
    if defect_id in DEFECT_SIGNATURES:
        sig = DEFECT_SIGNATURES[defect_id].copy()
        sig.pop("detect")
        return sig
    return None
