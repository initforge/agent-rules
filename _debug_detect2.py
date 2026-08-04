"""Deep debug of detect_defects."""
import tempfile
from pathlib import Path
import sys
import re

sys.path.insert(0, 'P:/agent-rules')

from evals.long_task.fixtures import LONG_TASK_FIXTURE
from evals.long_task.defects import DEFECT_SIGNATURES, detect_defects

ws = Path(tempfile.mkdtemp(prefix='deep-debug-'))

# Setup fixture
for p, c in LONG_TASK_FIXTURE["files"].items():
    t = ws / p
    t.parent.mkdir(parents=True, exist_ok=True)
    t.write_text(c)

print("Testing each defect detection step by step:")
print()

seeded_defects = LONG_TASK_FIXTURE["seeded_defects"]

for defect in seeded_defects:
    defect_id = defect.get("id", "")
    print(f"Defect: {defect_id}")
    print(f"  In DEFECT_SIGNATURES: {defect_id in DEFECT_SIGNATURES}")

    if defect_id not in DEFECT_SIGNATURES:
        continue

    sig = DEFECT_SIGNATURES[defect_id]
    file_pattern = sig["file_pattern"]
    print(f"  file_pattern: {file_pattern}")

    # Find matching files
    matching_files = []
    for path in ws.rglob("*.py"):
        rel = str(path.relative_to(ws))
        if re.search(file_pattern, rel):
            matching_files.append(rel)
    print(f"  Matching files: {matching_files}")

    if not matching_files:
        continue

    for path in ws.rglob("*.py"):
        rel = str(path.relative_to(ws))
        if re.search(file_pattern, rel):
            try:
                content = path.read_text()
                print(f"  Testing {rel}...")
                print(f"    sig['detect'](content): {sig['detect'](content)}")
            except Exception as e:
                print(f"    Error: {e}")

print()
print("Final result:", detect_defects(ws, seeded_defects))
