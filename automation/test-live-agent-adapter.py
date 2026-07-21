#!/usr/bin/env python3
"""Contract tests for isolated live-agent execution and secret handling."""
from __future__ import annotations

import argparse
import os
import tempfile
from pathlib import Path

from agent_quality import DEFAULT_CORPUS, load_json
from live_benchmark_runner import (
    BENCHMARK_ARTIFACT_ROOT,
    DEFAULT_RUNTIME,
    prepare_run_home,
    require_environment_credential,
    require_native_artifact_path,
    resolve_variants,
    self_test as runner_self_test,
)
from live_workspace_verifier import DEFAULT_FIXTURES, self_test as verifier_self_test

ROOT = Path(__file__).resolve().parents[1]


def credential_contract() -> None:
    for variant in ("baseline", "core", "full"):
        auth = DEFAULT_RUNTIME / variant / "auth.json"
        if auth.exists():
            raise AssertionError(f"persistent credential found: {auth}")
    holder = prepare_run_home(DEFAULT_RUNTIME / "baseline")
    temp_home = Path(holder.name)
    try:
        if (temp_home / "auth.json").exists():
            raise AssertionError("credential leaked into ephemeral home")
    finally:
        holder.cleanup()
    if temp_home.exists():
        raise AssertionError("ephemeral home was not removed")
    prior = os.environ.pop("CODEX_API_KEY", None)
    try:
        try:
            require_environment_credential()
        except RuntimeError:
            pass
        else:
            raise AssertionError("missing API key was accepted")
        os.environ["CODEX_API_KEY"] = "test-only-placeholder"
        require_environment_credential()
    finally:
        if prior is None:
            os.environ.pop("CODEX_API_KEY", None)
        else:
            os.environ["CODEX_API_KEY"] = prior
    print("PASS: credentials are environment-only; no auth file is copied")


def contracts() -> None:
    fixtures = load_json(DEFAULT_FIXTURES)["fixtures"]
    corpus = load_json(DEFAULT_CORPUS)
    runnable = {
        case["workspace"].get("fixture")
        for case in corpus["cases"]
        if case["evaluator"] == "live" and case["workspace"].get("fixture") in fixtures
    }
    if len(runnable) < 6:
        raise AssertionError(f"expected at least six executable live fixtures, got {sorted(runnable)}")
    runner_self_test()
    verifier_self_test()
    native_contract()
    print(f"PASS: live adapter contracts ({len(runnable)} executable fixture oracles)")


def native_contract() -> None:
    if resolve_variants("native", None) != ["full"]:
        raise AssertionError("native mode must default to full only")
    for forbidden in (["baseline"], ["core"], ["baseline", "core", "full"]):
        try:
            resolve_variants("native", forbidden)
        except ValueError:
            pass
        else:
            raise AssertionError(f"native mode accepted isolated variants: {forbidden}")
    safe = require_native_artifact_path(BENCHMARK_ARTIFACT_ROOT / "self-test" / "result.jsonl", "result")
    if BENCHMARK_ARTIFACT_ROOT.resolve() not in safe.parents:
        raise AssertionError("native artifact path escaped benchmark root")
    try:
        require_native_artifact_path(ROOT / "outside-native-result.jsonl", "result")
    except ValueError:
        pass
    else:
        raise AssertionError("native mode accepted an artifact path outside .agent/benchmarks")
    print("PASS: native mode is full-only and artifact-confined")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--credential-contract", action="store_true")
    parser.add_argument("--contracts-only", action="store_true")
    parser.add_argument("--native-contract", action="store_true")
    args = parser.parse_args()
    try:
        if args.credential_contract:
            credential_contract()
        elif args.native_contract:
            native_contract()
        elif args.contracts_only:
            contracts()
        else:
            contracts()
            credential_contract()
        return 0
    except (AssertionError, OSError, ValueError) as exc:
        print(f"FAIL: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
