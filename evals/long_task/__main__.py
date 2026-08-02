"""CLI entry for long-task evaluation.

Usage:
    python -m evals.long_task                # full run, print result JSON
    python -m evals.long_task --resume DIR   # resume from checkpoint in DIR
    python -m evals.long_task --quick        # run + compact receipt line
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from .runner import run_eval


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]

    output_dir: Path | None = None
    resume = False
    quick = False

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--resume" and i + 1 < len(args):
            output_dir = Path(args[i + 1])
            resume = True
            i += 2
        elif arg == "--quick":
            quick = True
            i += 1
        elif arg.startswith("--out="):
            output_dir = Path(arg.split("=", 1)[1])
            i += 1
        else:
            print(f"unknown arg: {arg}", file=sys.stderr)
            return 2

    result = run_eval(output_dir=output_dir, resume=resume)

    if quick:
        print(
            f"run_id={result.run_id} case={result.case_id} "
            f"plan_files={result.plan_files} seeded={result.defects_seeded} "
            f"found={result.defects_found} repaired={result.defects_repaired} "
            f"verified={result.verification_passed} resume={result.checkpoint_resume_ok} "
            f"outcome={result.outcome} duration_ms={result.duration_ms}"
        )
    else:
        print(json.dumps(result.to_dict(), indent=2))

    return 0 if result.outcome == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
