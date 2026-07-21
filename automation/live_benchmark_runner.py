#!/usr/bin/env python3
"""Run safe native Codex smoke tasks or isolated baseline/core/full ablations."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from agent_quality import DEFAULT_CORPUS, load_json, validate_live_results, write_jsonl
from live_workspace_verifier import DEFAULT_FIXTURES, initialize_git, verify


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RUNTIME = ROOT / ".agent" / "benchmarks" / "runtime"
DEFAULT_RUNS = ROOT / ".agent" / "benchmarks" / "runs"
DEFAULT_RESULTS = ROOT / ".agent" / "benchmarks" / "results" / "live-results.jsonl"
BENCHMARK_ARTIFACT_ROOT = ROOT / ".agent" / "benchmarks"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def materialize(workspace: Path, fixture: dict[str, Any]) -> None:
    workspace.mkdir(parents=True, exist_ok=True)
    for relative, body in fixture["files"].items():
        target = workspace / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body, encoding="utf-8")
    initialize_git(workspace)


def prompt_for(case: dict[str, Any]) -> str:
    behavior = "\n".join(f"- {item}" for item in case["required_behavior"])
    return (
        f"Benchmark task: {case['prompt']}\n\n"
        f"Required observable behavior:\n{behavior}\n\n"
        "Work only in the supplied fixture repository. Do not commit, push, deploy, or access credentials. "
        "Finish the task and report concise verification evidence."
    )


def prepare_run_home(variant_home: Path) -> tempfile.TemporaryDirectory[str]:
    holder = tempfile.TemporaryDirectory(prefix="codex-benchmark-home-")
    run_home = Path(holder.name)
    shutil.copytree(variant_home, run_home, dirs_exist_ok=True)
    return holder


def require_environment_credential() -> None:
    if not os.environ.get("CODEX_API_KEY"):
        raise RuntimeError("CODEX_API_KEY is required; local auth.json copying is intentionally unsupported")


def resolve_variants(mode: str, requested: list[str] | None) -> list[str]:
    if mode == "native":
        variants = requested or ["full"]
        if variants != ["full"]:
            raise ValueError("native mode permits only --variants full; it cannot provide isolated baseline/core evidence")
        return variants
    if mode == "ablation":
        return requested or ["baseline", "core", "full"]
    raise ValueError(f"unknown execution mode: {mode}")


def require_native_artifact_path(path: Path, label: str) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(BENCHMARK_ARTIFACT_ROOT.resolve())
    except ValueError as exc:
        raise ValueError(f"native {label} must stay under {BENCHMARK_ARTIFACT_ROOT}") from exc
    return resolved


def build_command(
    workspace: Path, response: Path, model: str, effort: str, sandbox: str, prompt: str
) -> list[str]:
    executable = shutil.which("codex.cmd" if os.name == "nt" else "codex") or "codex"
    return [
        executable, "exec", "--ephemeral", "--ignore-user-config", "--json",
        "--sandbox", sandbox, "-C", str(workspace), "-m", model,
        "-c", f'model_reasoning_effort="{effort}"', "-o", str(response), prompt,
    ]


def run_one(
    mode: str,
    run_id: str,
    case: dict[str, Any],
    variant: str,
    fixture: dict[str, Any],
    runtime_root: Path,
    runs_root: Path,
    model: str,
    effort: str,
) -> dict[str, Any]:
    artifact_dir = runs_root / run_id / case["id"] / variant
    workspace = artifact_dir / "workspace"
    response = artifact_dir / "last-message.txt"
    events = artifact_dir / "events.jsonl"
    stderr_path = artifact_dir / "stderr.txt"
    verifier_path = artifact_dir / "verifier.json"
    materialize(workspace, fixture)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    started_at = utc_now()
    started_clock = time.monotonic()
    command = build_command(workspace, response, model, effort, fixture["sandbox"], prompt_for(case))
    exit_code = 1
    stderr = ""
    holder: tempfile.TemporaryDirectory[str] | None = None
    try:
        env = os.environ.copy()
        if mode == "ablation":
            holder = prepare_run_home(runtime_root / variant)
            env["CODEX_HOME"] = holder.name
        completed = subprocess.run(
            command,
            cwd=workspace,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=900,
        )
        exit_code = completed.returncode
        events.write_text(completed.stdout, encoding="utf-8")
        stderr = completed.stderr
        stderr_path.write_text(stderr, encoding="utf-8")
    finally:
        if holder is not None:
            holder.cleanup()

    verified = verify(workspace, response, fixture)
    verifier_path.write_text(json.dumps(verified, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if exit_code != 0:
        verified["outcome"] = "BLOCKED" if any(word in stderr.lower() for word in ("auth", "login", "credential")) else "FAIL"
        verified["evidence"].append({
            "type": "runtime", "label": "codex exec", "status": "FAIL", "ref": f"exit={exit_code}; stderr.txt"
        })
        verified["friction"].append("codex exec failed")
    else:
        verified["evidence"].append({
            "type": "runtime", "label": "codex exec", "status": "PASS", "ref": "exit=0; events.jsonl"
        })
    finished_at = utc_now()
    return {
        "run_id": run_id,
        "case_id": case["id"],
        "variant": variant,
        "evidence_kind": "empirical",
        "platform": f"codex-cli-{mode}",
        "model": model,
        "model_version": "cli-default-provider",
        "reasoning_effort": effort,
        "tools_available": ["apply_patch", "shell"],
        "started_at": started_at,
        "finished_at": finished_at,
        "outcome": verified["outcome"],
        "scores": verified["scores"],
        "evidence": verified["evidence"],
        "owner_correction": False,
        "friction": verified["friction"],
        "duration_seconds": round(time.monotonic() - started_clock, 3),
        "notes": f"execution_mode={mode}; fixture={case['workspace']['fixture']}; artifact={artifact_dir}",
    }


def self_test() -> None:
    fixtures = load_json(DEFAULT_FIXTURES)["fixtures"]
    corpus = load_json(DEFAULT_CORPUS)
    case = next(item for item in corpus["cases"] if item["id"] == "live-advisory-no-mutation")
    with tempfile.TemporaryDirectory(prefix="runner-self-test-") as holder:
        workspace = Path(holder) / "workspace"
        materialize(workspace, fixtures[case["workspace"]["fixture"]])
        command = build_command(workspace, Path(holder) / "out.txt", "test-model", "medium", "read-only", prompt_for(case))
        required = {"--ephemeral", "--ignore-user-config", "--json", "--sandbox", "-C", "-m", "-c", "-o"}
        if not required.issubset(command):
            raise AssertionError(command)
        if (workspace / ".git").is_dir() is False:
            raise AssertionError("fixture was not initialized")
        if resolve_variants("native", None) != ["full"]:
            raise AssertionError("native default variant is not full")
        try:
            resolve_variants("native", ["baseline"])
        except ValueError:
            pass
        else:
            raise AssertionError("native mode accepted baseline")
    print("PASS: live benchmark runner contracts")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["native", "ablation"], default="native")
    parser.add_argument("--cases", nargs="+", default=["live-advisory-no-mutation"])
    parser.add_argument("--variants", nargs="+")
    parser.add_argument("--model", default="gpt-5.6-sol")
    parser.add_argument("--reasoning-effort", default="medium")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--runtime-root", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument("--runs-root", type=Path, default=DEFAULT_RUNS)
    parser.add_argument("--output", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    try:
        if args.self_test:
            self_test()
            return 0
        corpus = load_json(DEFAULT_CORPUS)
        cases = {case["id"]: case for case in corpus["cases"] if case["evaluator"] == "live"}
        fixtures = load_json(DEFAULT_FIXTURES)["fixtures"]
        variants = resolve_variants(args.mode, args.variants)
        runs_root = args.runs_root.resolve()
        output = args.output.resolve()
        if args.mode == "native":
            runs_root = require_native_artifact_path(args.runs_root, "runs root")
            output = require_native_artifact_path(args.output, "result output")
        else:
            if not (args.runtime_root / "runtime.json").is_file():
                raise FileNotFoundError("build isolated runtimes first with automation/build-benchmark-runtime.ps1")
            require_environment_credential()
        records = []
        if args.repeat < 1:
            raise ValueError("--repeat must be at least 1")
        for repetition in range(1, args.repeat + 1):
            run_id = f"codex-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
            for case_id in args.cases:
                case = cases[case_id]
                fixture_name = case["workspace"].get("fixture")
                if fixture_name not in fixtures:
                    raise KeyError(f"no executable fixture oracle for {case_id}: {fixture_name}")
                for variant in variants:
                    if variant not in case["variants"]:
                        raise ValueError(f"variant {variant} is not allowed for {case_id}")
                    print(f"RUN {repetition}/{args.repeat}: {case_id} [{variant}]", flush=True)
                    records.append(run_one(
                        args.mode, run_id, case, variant, fixtures[fixture_name], args.runtime_root.resolve(),
                        runs_root, args.model, args.reasoning_effort,
                    ))
                    validate_live_results(records, corpus)
                    write_jsonl(output, records)
        validate_live_results(records, corpus)
        print(f"PASS: {len(records)} {args.mode} empirical records -> {output}")
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError, AssertionError) as exc:
        print(f"FAIL: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
