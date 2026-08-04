"""Debug runner detection issue."""
import tempfile
from pathlib import Path
import sys

# Add repo to path
sys.path.insert(0, 'P:/agent-rules')

from evals.long_task.runner import LongTaskRunner, run_eval
from evals.long_task.defects import detect_defects
from evals.long_task.fixtures import LONG_TASK_FIXTURE

ws = Path(tempfile.mkdtemp(prefix='runner-debug-'))

# Create runner
runner = LongTaskRunner(output_dir=ws)

# Manually run setup
runner._setup_fixture()

print(f"Files written to workspace: {ws}")
for p in ws.rglob("*.py"):
    print(f"  {p.relative_to(ws)}")

print()
print("Fixture seeded_defects:", LONG_TASK_FIXTURE['seeded_defects'])

print()
print("Testing detect_defects on workspace...")
found = detect_defects(ws, LONG_TASK_FIXTURE["seeded_defects"])
print(f"found: {found}")

print()
print("Checking if files exist...")
payment = ws / "src/api/payment.py"
calc = ws / "src/api/calculator.py"
val = ws / "src/api/validation.py"
print(f"payment.py exists: {payment.exists()}")
print(f"calculator.py exists: {calc.exists()}")
print(f"validation.py exists: {val.exists()}")
