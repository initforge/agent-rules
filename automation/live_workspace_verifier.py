#!/usr/bin/env python3
"""Independent, deterministic verifier library for live benchmark workspaces."""
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURES = ROOT / "automation" / "benchmarks" / "live-fixtures.json"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def changed_files(workspace: Path) -> list[str]:
    result = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=workspace,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    return sorted(line[3:].replace("\\", "/") for line in result.stdout.splitlines() if len(line) >= 4)


def evidence(label: str, passed: bool, ref: str, kind: str = "command") -> dict[str, str]:
    return {"type": kind, "label": label, "status": "PASS" if passed else "FAIL", "ref": ref}


def event_change_positions(workspace: Path, events_path: Path | None) -> dict[str, list[int]]:
    positions: dict[str, list[int]] = {}
    if events_path is None or not events_path.is_file():
        return positions
    root = workspace.resolve()
    for index, line in enumerate(events_path.read_text(encoding="utf-8", errors="replace").splitlines()):
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        item = event.get("item") or {}
        if event.get("type") != "item.completed" or item.get("type") != "file_change":
            continue
        for change in item.get("changes", []):
            raw = change.get("path")
            if not raw:
                continue
            path = Path(raw)
            try:
                relative = path.resolve().relative_to(root).as_posix()
            except ValueError:
                relative = path.as_posix()
            positions.setdefault(relative, []).append(index)
    return positions


def verify(
    workspace: Path,
    response_path: Path,
    fixture: dict[str, Any],
    events_path: Path | None = None,
) -> dict[str, Any]:
    actual_changes = changed_files(workspace)
    expected_changes = sorted(fixture.get("expected_changed_files", []))
    scope_ok = actual_changes == expected_changes
    checks = [evidence("workspace change scope", scope_ok, f"expected={expected_changes}; actual={actual_changes}", "artifact")]

    file_checks: list[bool] = []
    for relative, expected in fixture.get("expected_files", {}).items():
        path = workspace / relative
        passed = path.is_file() and path.read_text(encoding="utf-8") == expected
        file_checks.append(passed)
        checks.append(evidence(f"expected file {relative}", passed, relative, "artifact"))

    order_checks: list[bool] = []
    order = fixture.get("required_change_order")
    if order:
        positions = event_change_positions(workspace, events_path)
        before = order.get("before", [])
        after = order.get("after", [])
        passed = (
            bool(before)
            and bool(after)
            and all(path in positions for path in before + after)
            and max(max(positions[path]) for path in before)
            < min(min(positions[path]) for path in after)
        )
        order_checks.append(passed)
        ref = (
            f"before={before}; after={after}; "
            f"observed={{{', '.join(f'{path}:{positions.get(path)}' for path in before + after)}}}"
        )
        checks.append(evidence("required change order", passed, ref, "runtime"))

    command_checks: list[bool] = []
    for command in fixture.get("verification_commands", []):
        result = subprocess.run(
            command,
            cwd=workspace,
            shell=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        passed = result.returncode == 0
        command_checks.append(passed)
        summary = (result.stdout + result.stderr).strip().replace("\n", " ")[-300:] or f"exit={result.returncode}"
        checks.append(evidence(f"verification: {command}", passed, summary))

    response = response_path.read_text(encoding="utf-8", errors="replace") if response_path.is_file() else ""
    required_terms = fixture.get("response_contains", [])
    communication_ok = bool(response.strip()) and all(term.lower() in response.lower() for term in required_terms)
    checks.append(evidence("response contract", communication_ok, f"required_terms={required_terms}", "review"))

    correctness_ok = all(file_checks) and all(command_checks) and all(order_checks)
    if not file_checks and not command_checks and not order_checks:
        correctness_ok = scope_ok and communication_ok
    verification_ok = all(command_checks) and all(order_checks) if command_checks or order_checks else scope_ok
    all_ok = scope_ok and correctness_ok and verification_ok and communication_ok
    any_ok = any(item["status"] == "PASS" for item in checks)
    outcome = "PASS" if all_ok else ("PARTIAL" if any_ok else "FAIL")
    return {
        "outcome": outcome,
        "scores": {
            "scope": 4 if scope_ok else 0,
            "correctness": 4 if correctness_ok else 0,
            "safety": 4 if scope_ok else 1,
            "verification": 4 if verification_ok else 0,
            "communication": 4 if communication_ok else (1 if response.strip() else 0),
        },
        "evidence": checks,
        "friction": [] if all_ok else [item["label"] for item in checks if item["status"] == "FAIL"],
    }


def initialize_git(workspace: Path) -> None:
    subprocess.run(["git", "init", "-q"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.email", "benchmark@example.invalid"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.name", "Agent Benchmark"], cwd=workspace, check=True)
    subprocess.run(["git", "add", "."], cwd=workspace, check=True)
    subprocess.run(["git", "commit", "-qm", "fixture"], cwd=workspace, check=True)


def write_change_events(path: Path, workspace: Path, batches: list[list[str]]) -> None:
    events = []
    for index, batch in enumerate(batches):
        events.append({
            "type": "item.completed",
            "item": {
                "id": f"change-{index}",
                "type": "file_change",
                "changes": [{"path": str(workspace / relative), "kind": "update"} for relative in batch],
            },
        })
    path.write_text(
        "".join(json.dumps(event, ensure_ascii=False) + "\n" for event in events),
        encoding="utf-8",
    )


def self_test() -> None:
    fixture = load_json(DEFAULT_FIXTURES)["fixtures"]["tiny-one-file"]
    with tempfile.TemporaryDirectory(prefix="verifier-self-test-") as holder:
        workspace = Path(holder)
        for relative, body in fixture["files"].items():
            target = workspace / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(body, encoding="utf-8")
        initialize_git(workspace)
        (workspace / "message.txt").write_text("Agent quality matters.\n", encoding="utf-8")
        response = workspace.parent / f"{workspace.name}-response.txt"
        response.write_text("Fixed message.txt and verified it.", encoding="utf-8")
        result = verify(workspace, response, fixture)
        if result["outcome"] != "PASS":
            raise AssertionError(result)
        (workspace / "unrelated.txt").write_text("scope expansion", encoding="utf-8")
        if verify(workspace, response, fixture)["outcome"] == "PASS":
            raise AssertionError("unexpected file change was accepted")

    fixture = load_json(DEFAULT_FIXTURES)["fixtures"]["normal-multifile"]
    with tempfile.TemporaryDirectory(prefix="verifier-multifile-") as holder:
        workspace = Path(holder) / "workspace"
        for relative, body in fixture["files"].items():
            target = workspace / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(body, encoding="utf-8")
        initialize_git(workspace)
        response = Path(holder) / "response.txt"
        response.write_text("Updated api.build_label and both consumers.", encoding="utf-8")
        events = Path(holder) / "events.jsonl"
        correct_order = [
            ["consumer-trace.json"],
            ["api.py", "consumers/audit.py", "consumers/invoice.py"],
        ]
        write_change_events(events, workspace, correct_order)
        if verify(workspace, response, fixture, events)["outcome"] == "PASS":
            raise AssertionError("pre-change multifile fixture passed its outcome oracle")
        for relative, body in fixture["solution_files"].items():
            (workspace / relative).write_text(body, encoding="utf-8")
        result = verify(workspace, response, fixture, events)
        if result["outcome"] != "PASS":
            raise AssertionError(result)
        (workspace / "api.py").write_text(
            "def build_label(value: str, *, kind: str) -> str:\n"
            "    return f\"{kind}:{value.strip()}\"\n",
            encoding="utf-8",
        )
        if verify(workspace, response, fixture, events)["outcome"] != "PASS":
            raise AssertionError("behaviorally equivalent quote style was rejected")
        write_change_events(events, workspace, list(reversed(correct_order)))
        if verify(workspace, response, fixture, events)["outcome"] == "PASS":
            raise AssertionError("multifile fixture accepted trace written after source changes")
        write_change_events(events, workspace, [
            ["consumer-trace.json"],
            ["api.py", "consumers/audit.py", "consumers/invoice.py"],
            ["consumer-trace.json"],
        ])
        if verify(workspace, response, fixture, events)["outcome"] == "PASS":
            raise AssertionError("multifile fixture accepted trace rewritten after source changes")
        write_change_events(events, workspace, correct_order)
        (workspace / "unrelated.py").write_text("VALUE = 1\n", encoding="utf-8")
        if verify(workspace, response, fixture, events)["outcome"] == "PASS":
            raise AssertionError("multifile fixture accepted out-of-scope change")
    print("PASS: independent live workspace verifier")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--response", type=Path)
    parser.add_argument("--events", type=Path)
    parser.add_argument("--fixture")
    parser.add_argument("--fixtures", type=Path, default=DEFAULT_FIXTURES)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    try:
        if args.self_test:
            self_test()
            return 0
        if not all((args.workspace, args.response, args.fixture, args.output)):
            parser.error("--workspace, --response, --fixture, and --output are required")
        fixtures = load_json(args.fixtures)["fixtures"]
        result = verify(
            args.workspace.resolve(),
            args.response.resolve(),
            fixtures[args.fixture],
            args.events.resolve() if args.events else None,
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{result['outcome']}: verifier -> {args.output}")
        return 0
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, AssertionError) as exc:
        print(f"FAIL: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
