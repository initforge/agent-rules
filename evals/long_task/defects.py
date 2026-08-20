"""Seeded defect detection for long-task evaluation."""
from __future__ import annotations

import re
import hashlib
from pathlib import Path
from typing import Any


# Standard defect signatures
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
        # Defect: count==0 returns 0 instead of raising ValueError
        "detect": lambda content: bool(
            re.search(r"if\s+count\s*==\s*0\s*:[^\n]*\n\s*return\s+0", content)
        ),
        "desc": "Division by zero returns 0 instead of raising",
    },
    "weak-email-regex": {
        "file_pattern": r"src/api/validation\.py",
        # Defect: weak email pattern. Detects standard r".+@.+" and the
        # obfuscated r"." + "+@.+" form. After repair the pattern assignment
        # becomes a strong character-class regex, so neither form matches.
        "detect": lambda content: bool(
            re.search(r'pattern\s*=\s*r"\.\+@\.\+"', content)
            or (
                re.search(r'pattern\s*=\s*r"\."', content)
                and '"+@.+"' in content
            )
        ),
        "desc": "Weak email regex pattern",
    },
}

# Adversarial defect signatures - harder to detect, bypasses common patterns
ADVERSARIAL_SIGNATURES = {
    "obfuscated-email": {
        "file_pattern": r"src/api/validation\.py",
        "detect": lambda content: bool(re.search(r'pattern\s*=\s*r["\']\.', content)),
        "desc": "Obfuscated weak email regex (short char class)",
        "severity": "adversarial",
    },
    "silent-div-zero": {
        "file_pattern": r"src/api/calculator\.py",
        # Obfuscation: zero-input branch returns a silent default with an
        # inline comment that makes it look intentional. The comment text is
        # arbitrary (misleading), so match any inline comment after return 0.
        "detect": lambda content: bool(
            re.search(r"return\s+(?:0|None)\s*#", content)
        ),
        "desc": "Silent division by zero with misleading comment",
        "severity": "adversarial",
    },
    "currency-type-bypass": {
        "file_pattern": r"src/api/payment\.py",
        "detect": lambda content: bool(
            "currency" in content
            and "isinstance" not in content
            and re.search(r"currency:\s*str\s*=\s*['\"]", content)
        ),
        "desc": "Currency accepts string without validation",
        "severity": "adversarial",
    },
    "race-condition": {
        "file_pattern": r"src/services/payment_service\.py",
        # Defect: shared mutable state (self._attr = / [ / .append / .update)
        # present with no synchronization primitive anywhere in the file.
        "detect": lambda content: bool(
            re.search(r"self\._\w+\s*(?:=|\[|\.append|\.update)", content)
            and not re.search(
                r"threading\.Lock|asyncio\.Lock|multiprocessing\.Lock|self\._lock\b|_mutex\b",
                content,
            )
        ),
        "desc": "Shared mutable state without synchronization",
        "severity": "adversarial",
    },
}

# False-green signatures - tests that pass but shouldn't
FALSE_GREEN_SIGNATURES = {
    "test-passes-on-empty": {
        "file_pattern": r"src/tests/test_\w+\.py",
        # Obfuscation: empty test hides behind a placeholder docstring.
        # Matches `def test_x(...):` followed by optional docstring then `pass`.
        "detect": lambda content: bool(
            re.search(
                r"def\s+test_\w+\([^)]*\):\s*(?:[\"']{3}[\s\S]*?[\"']{3}\s*)?pass\s*(?:#.*)?$",
                content,
                re.MULTILINE,
            )
        ),
        "desc": "Test method exists but does nothing",
        "severity": "false-green",
    },
    "assert-always-true": {
        "file_pattern": r"src/tests/test_\w+\.py",
        "detect": lambda content: bool(
            re.search(r"assert\s+True\s*$", content, re.MULTILINE)
        ),
        "desc": "Assertion always passes",
        "severity": "false-green",
    },
    "test-skipped": {
        "file_pattern": r"src/tests/test_\w+\.py",
        "detect": lambda content: bool(
            re.search(r"@pytest\.mark\.skip|@unittest\.skip", content)
        ),
        "desc": "Test is skipped",
        "severity": "false-green",
    },
}


def _norm_path(path: Path, workspace: Path) -> str:
    """Normalize relative path to forward slashes for cross-platform pattern matching."""
    return str(path.relative_to(workspace)).replace("\\", "/")


def compute_content_hash(content: str) -> str:
    """Compute deterministic hash for content verification."""
    return hashlib.sha256(content.encode()).hexdigest()[:16]


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

        for path in workspace.rglob("*.py"):
            rel = _norm_path(path, workspace)
            if re.search(file_pattern, rel):
                try:
                    content = path.read_text()
                    if sig["detect"](content):
                        found.append(defect_id)
                except Exception:
                    pass

    return found


def detect_adversarial_defects(
    workspace: Path,
) -> list[dict[str, Any]]:
    """Detect adversarial defects that bypass standard checks.

    Returns list of detected adversarial defects with file paths and hashes.
    """
    found: list[dict[str, Any]] = []

    for defect_id, sig in ADVERSARIAL_SIGNATURES.items():
        file_pattern = sig["file_pattern"]

        for path in workspace.rglob("*.py"):
            rel = _norm_path(path, workspace)
            if re.search(file_pattern, rel):
                try:
                    content = path.read_text()
                    if sig["detect"](content):
                        found.append({
                            "id": defect_id,
                            "file": rel,
                            "desc": sig["desc"],
                            "severity": sig["severity"],
                            "content_hash": compute_content_hash(content),
                        })
                except Exception:
                    pass

    return found


def detect_false_green(
    workspace: Path,
) -> list[dict[str, Any]]:
    """Detect false-green patterns (tests that pass but shouldn't).

    Returns list of false-green patterns with evidence.
    """
    found: list[dict[str, Any]] = []

    for defect_id, sig in FALSE_GREEN_SIGNATURES.items():
        file_pattern = sig["file_pattern"]

        for path in workspace.rglob("*.py"):
            rel = _norm_path(path, workspace)
            if re.search(file_pattern, rel):
                try:
                    content = path.read_text()
                    if sig["detect"](content):
                        found.append({
                            "id": defect_id,
                            "file": rel,
                            "desc": sig["desc"],
                            "severity": sig["severity"],
                        })
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
