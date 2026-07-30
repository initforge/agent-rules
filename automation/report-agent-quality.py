#!/usr/bin/env python3
"""Generate machine-readable and human-readable agent-quality reports."""
from __future__ import annotations

import argparse
from pathlib import Path

from agent_quality import (
    DEFAULT_CORPUS,
    ContractError,
    aggregate_quality_report,
    load_json,
    read_records,
    render_markdown,
    write_json,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", default=str(DEFAULT_CORPUS))
    parser.add_argument("--routing")
    parser.add_argument("--live", action="append", default=[])
    parser.add_argument("--trace", action="append", default=[])
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    try:
        corpus = load_json(args.corpus)
        routing = load_json(args.routing) if args.routing else None
        live = read_records(args.live)
        trace = read_records(args.trace)
        report = aggregate_quality_report(corpus, routing, live, trace)
        output_dir = Path(args.output_dir)
        write_json(output_dir / "report.json", report)
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "REPORT.md").write_text(render_markdown(report), encoding="utf-8")
    except (ContractError, OSError, ValueError) as exc:
        print(f"FAIL: {exc}")
        return 1
    print(f"PASS: quality report -> {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
