#!/usr/bin/env python3
"""Contract tests for isolated live-agent execution and secret handling."""
from __future__ import annotations

import argparse
import os
import subprocess
import tempfile
from unittest.mock import patch
from pathlib import Path

from agent_quality import DEFAULT_CORPUS, load_json
from live_benchmark_runner import (
    BENCHMARK_ARTIFACT_ROOT,
    DEFAULT_RUNTIME,
    prepare_run_home,
    require_environment_credential,
    require_native_artifact_path,
    resolve_variants,
    run_one,
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
    normal = fixtures.get("normal-multifile")
    if not normal:
        raise AssertionError("live-normal-multifile has no executable fixture oracle")
    if normal.get("expected_changed_files") != [
        "api.py", "consumer-trace.json", "consumers/audit.py", "consumers/invoice.py",
    ] or normal.get("verification_commands") != ["python -m unittest -q"]:
        raise AssertionError("normal-multifile fixture lost its scoped API and consumer contract")
    if sorted(normal.get("solution_files", {})) != normal["expected_changed_files"]:
        raise AssertionError("normal-multifile self-test solution no longer covers its exact change scope")
    if normal.get("required_change_order") != {
        "before": ["consumer-trace.json"],
        "after": ["api.py", "consumers/audit.py", "consumers/invoice.py"],
    }:
        raise AssertionError("normal-multifile trace-before-edit contract drifted")
    runner_self_test()
    verifier_self_test()
    native_contract()
    timeout_contract()
    print(f"PASS: live adapter contracts ({len(runnable)} executable fixture oracles)")


def timeout_contract() -> None:
    fixtures = load_json(DEFAULT_FIXTURES)["fixtures"]
    case = next(item for item in load_json(DEFAULT_CORPUS)["cases"] if item["id"] == "live-advisory-no-mutation")
    with tempfile.TemporaryDirectory(prefix="runner-timeout-") as holder:
        real_run = subprocess.run
        def timeout_codex(command, *args, **kwargs):
            if "exec" in command:
                raise subprocess.TimeoutExpired(command, 1)
            return real_run(command, *args, **kwargs)
        with patch("live_benchmark_runner.subprocess.run", side_effect=timeout_codex):
            result = run_one(
                "native", "timeout-contract", case, "full", fixtures["read-only-repo"],
                Path(holder) / "runtime", Path(holder) / "runs", "test-model", "medium",
            )
        if result["termination"] != "timeout" or result["outcome"] != "FAIL":
            raise AssertionError(f"timeout was not preserved as FAIL evidence: {result}")


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
