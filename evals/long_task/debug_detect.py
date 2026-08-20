"""Debug script for defect detection."""
from __future__ import annotations

import tempfile
from pathlib import Path
import re
from evals.long_task.fixtures import LONG_TASK_FIXTURE
from evals.long_task.defects import DEFECT_SIGNATURES, detect_defects

ws = Path(tempfile.mkdtemp(prefix="debug-"))
for p, c in LONG_TASK_FIXTURE["files"].items():
    t = ws / p
    t.parent.mkdir(parents=True, exist_ok=True)
    t.write_text(c)

print("Files in workspace:")
for p in ws.rglob("*.py"):
    rel = str(p.relative_to(ws))
    print(f"  {rel}")

print()
print("Testing detection for currency-validation:")
sig = DEFECT_SIGNATURES["currency-validation"]
file_pattern = sig["file_pattern"]
print(f"  Pattern: {file_pattern}")

for path in ws.rglob("*.py"):
    rel = str(path.relative_to(ws))
    print(f"  Checking {rel}...")
    if re.search(file_pattern, rel):
        print(f"    MATCH! Testing detect...")
        content = path.read_text()
        result = sig["detect"](content)
        print(f"    Detect: {result}")

print()
print("Full detect_defects result:", detect_defects(ws, LONG_TASK_FIXTURE["seeded_defects"]))
