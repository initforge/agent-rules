#!/usr/bin/env python3
"""Validate and normalize externally collected live-agent evidence."""
from __future__ import annotations

import argparse
from pathlib import Path

from agent_quality import DEFAULT_CORPUS, ContractError, load_json, read_records, validate_corpus, validate_live_results, write_jsonl


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", help="JSON or JSONL live-result files")
    parser.add_argument("--corpus", default=str(DEFAULT_CORPUS))
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    try:
        corpus = load_json(args.corpus)
        validate_corpus(corpus)
        records = read_records(args.inputs)
        validate_live_results(records, corpus)
        write_jsonl(args.output, records)
    except (ContractError, OSError, ValueError) as exc:
        print(f"FAIL: {exc}")
        return 1
    print(f"PASS: collected {len(records)} live result(s) -> {Path(args.output)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
