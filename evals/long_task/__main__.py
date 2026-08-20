"""CLI entry for long-task evaluation.

Usage:
    python -m evals.long_task                # full run, print result JSON
    python -m evals.long_task --resume DIR   # resume from checkpoint in DIR
    python -m evals.long_task --quick        # run + compact receipt line
    python -m evals.long_task --adversarial # adversarial variant with harder defects
    python -m evals.long_task --check        # run assert-based smoke test
    python -m evals.long_task --adversarial-check  # run adversarial tests
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
    adversarial = False
    check = False
    adversarial_check = False

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
        elif arg == "--adversarial":
            adversarial = True
            i += 1
        elif arg == "--check":
            check = True
            i += 1
        elif arg == "--adversarial-check":
            adversarial_check = True
            i += 1
        elif arg.startswith("--out="):
            output_dir = Path(arg.split("=", 1)[1])
            i += 1
        else:
            print(f"unknown arg: {arg}", file=sys.stderr)
            return 2

    # Smoke check mode
    if check:
        from .check import main as check_main
        return check_main()

    # Adversarial test mode
    if adversarial_check:
        from .test_adversarial import main as adv_main
        return adv_main()

    # Normal run mode
    result = run_eval(output_dir=output_dir, resume=resume, adversarial=adversarial)

    if quick:
        print(
            f"run_id={result.run_id} variant={result.variant} "
            f"case={result.case_id} plan_files={result.plan_files} "
            f"seeded={result.defects_seeded} found={result.defects_found} "
            f"repaired={result.defects_repaired} "
            f"adv_found={result.adversarial_found} adv_repaired={result.adversarial_repaired} "
            f"fg_found={result.falsegreen_found} fg_repaired={result.falsegreen_repaired} "
            f"verified={result.verification_passed} "
            f"resume={result.checkpoint_resume_ok} corrupted={result.checkpoint_corrupted} "
            f"outcome={result.outcome} duration_ms={result.duration_ms}"
        )
    else:
        print(json.dumps(result.to_dict(), indent=2))

    return 0 if result.outcome == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
