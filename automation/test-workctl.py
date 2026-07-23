#!/usr/bin/env python3
"""Adversarial contract tests for automatic work orchestration."""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKCTL = ROOT / "automation" / "workctl.py"


def run(root: Path, *args: str, expect: int = 0) -> dict:
    result = subprocess.run(
        [sys.executable, str(WORKCTL), "--root", str(root), *args],
        text=True,
        capture_output=True,
        encoding="utf-8",
    )
    if result.returncode != expect:
        raise AssertionError(
            f"command exit={result.returncode}, expected={expect}\n"
            f"stdout={result.stdout}\nstderr={result.stderr}"
        )
    return json.loads(result.stdout)


def compact(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def acceptance(identifier: str, claim: str) -> dict:
    return {
        "id": identifier,
        "claim": claim,
        "status": "open",
        "proof_required": True,
        "proof_profile": "integration",
        "required_proof_kinds": ["integration"],
        "required_dimensions": ["behavior", "negative-path"],
        "receipt_ids": [],
    }


def assignment(
    identifier: str,
    slice_id: str,
    agent: str,
    acceptance_id: str,
    source_ids: list[str],
    write_path: str,
    role: str = "executor",
) -> dict:
    return {
        "id": identifier,
        "slice_id": slice_id,
        "agent": agent,
        "role": role,
        "model_class": "standard",
        "model": "gpt-5.6-terra",
        "effort": "medium",
        "source_ids": source_ids,
        "write_paths": [write_path] if write_path else [],
        "context_paths": ["guides/00-system-map.md"],
        "forbidden_paths": ["secrets/**"],
        "acceptance_ids": [acceptance_id],
    }


def verification(identifier: str, acceptance_id: str, agent: str) -> dict:
    command = f'"{sys.executable}" -c "print(\'verified\')"'
    return {
        "id": identifier,
        "acceptance_id": acceptance_id,
        "proof_kind": "integration",
        "dimensions": ["behavior", "negative-path"],
        "command": command,
        "expected_exit_code": 0,
        "environment": "isolated-test-fixture",
        "artifact_paths": [],
        "agent": agent,
        "model": "gpt-5.6-terra",
        "effort": "medium",
    }


def expect_error(root: Path, *args: str, contains: str) -> dict:
    value = run(root, *args, expect=1)
    if contains not in value["error"]:
        raise AssertionError(f"expected {contains!r} in error: {value}")
    return value


def main() -> None:
    small = run(ROOT, "classify", "--payload-json", compact({"file_count": 1, "acceptance_count": 1}))
    if small["shape"] != "small" or small["ledger"] != "off":
        raise AssertionError(f"small classification was not lean: {small}")

    medium = run(
        ROOT,
        "classify",
        "--payload-json",
        compact({"file_count": 4, "acceptance_count": 5, "agent_count": 2, "risk_signals": ["ui-parity"]}),
    )
    if medium["shape"] != "medium" or medium["ledger"] != "auto" or not medium["review_required"]:
        raise AssertionError(f"medium classification missed adaptive ledger/review: {medium}")

    signals = {
        "file_count": 10,
        "domain_count": 3,
        "acceptance_count": 4,
        "independent_groups": 2,
        "agent_count": 3,
        "resume_requested": True,
        "risk_signals": ["public-api"],
    }
    with tempfile.TemporaryDirectory(prefix="workctl-") as holder:
        root = Path(holder)
        base_payload = {
            "plan_ref": "native://plan/demo",
            "signals": signals,
            "repository": {"path": str(root), "branch": "main", "baseline_commit": "abc123"},
            "authorized_final_actions": ["edit", "commit"],
            "max_active_agents_including_main": 4,
            "max_delegation_depth": 1,
            "effort_cap": "medium",
            "source_history": [
                {
                    "id": "REQ-001",
                    "kind": "original",
                    "summary": "Implement the approved behavior.",
                    "captured_at": "2026-07-24T00:00:00+00:00",
                    "redacted": False,
                    "slice_ids": ["*"],
                },
                {
                    "id": "INJ-001",
                    "kind": "injection",
                    "summary": "Keep resumable source mapping.",
                    "captured_at": "2026-07-24T00:01:00+00:00",
                    "redacted": False,
                    "slice_ids": ["P1"],
                },
            ],
            "slices": [
                {
                    "id": "P1",
                    "name": "Core",
                    "status": "ready",
                    "depends_on": [],
                    "required": True,
                    "acceptance": [acceptance("AC1", "Core behavior works")],
                },
                {
                    "id": "P2",
                    "name": "Integration",
                    "status": "ready",
                    "depends_on": ["P1"],
                    "required": True,
                    "acceptance": [acceptance("AC2", "Integration works")],
                },
                {
                    "id": "P3",
                    "name": "Independent docs",
                    "status": "ready",
                    "depends_on": [],
                    "required": True,
                    "acceptance": [acceptance("AC3", "Independent behavior works")],
                },
            ],
        }

        invalid = {**base_payload, "max_active_agents_including_main": 99}
        expect_error(
            root,
            "init",
            "--work-id",
            "invalid-agents",
            "--payload-json",
            compact(invalid),
            contains="schema violation",
        )
        invalid = {**base_payload, "max_delegation_depth": -1}
        expect_error(
            root,
            "init",
            "--work-id",
            "invalid-depth",
            "--payload-json",
            compact(invalid),
            contains="schema violation",
        )
        invalid = {**base_payload, "authorized_final_actions": ["edit", "destroy-history"]}
        expect_error(
            root,
            "init",
            "--work-id",
            "invalid-action",
            "--payload-json",
            compact(invalid),
            contains="schema violation",
        )

        created = run(root, "init", "--work-id", "demo-work", "--payload-json", compact(base_payload))
        if created["classification"]["shape"] != "resumable":
            raise AssertionError(f"resumable ledger was not required: {created}")

        a1 = assignment("A1", "P1", "worker-1", "AC1", ["REQ-001", "INJ-001"], "rules/**")
        a2 = assignment("A2", "P2", "worker-2", "AC2", ["REQ-001"], "automation/**")
        a3 = assignment("A3", "P3", "worker-3", "AC3", ["REQ-001"], "guides/**")
        reviewer1 = assignment(
            "AR1", "P1", "review-1", "AC1", ["REQ-001", "INJ-001"], "", "reviewer",
        )
        reviewer2 = assignment("AR2", "P2", "review-2", "AC2", ["REQ-001"], "", "reviewer")
        reviewer3 = assignment("AR3", "P3", "review-3", "AC3", ["REQ-001"], "", "reviewer")
        for item in (a1, a2, a3, reviewer1, reviewer2, reviewer3):
            run(root, "assign", "--work-id", "demo-work", "--payload-json", compact(item))

        collision = {
            **a1,
            "id": "A4",
            "agent": "worker-4",
            "write_paths": ["rules/10-execution.md"],
        }
        expect_error(
            root,
            "assign",
            "--work-id",
            "demo-work",
            "--payload-json",
            compact(collision),
            contains="collision",
        )
        wrong_acceptance = {
            **a3,
            "id": "A5",
            "acceptance_ids": ["AC2"],
            "write_paths": ["notes/**"],
        }
        expect_error(
            root,
            "assign",
            "--work-id",
            "demo-work",
            "--payload-json",
            compact(wrong_acceptance),
            contains="does not belong",
        )
        high_effort = {
            **a3,
            "id": "A6",
            "effort": "high",
            "write_paths": ["notes/**"],
        }
        expect_error(
            root,
            "assign",
            "--work-id",
            "demo-work",
            "--payload-json",
            compact(high_effort),
            contains="exceeds work cap",
        )

        run(root, "start", "--work-id", "demo-work", "--slice", "P1")
        run(root, "start", "--work-id", "demo-work", "--slice", "P3")
        resumed = run(root, "resume", "--work-id", "demo-work")
        if set(resumed["active_slices"]) != {"P1", "P3"} or len(resumed["packets"]) != 2:
            raise AssertionError(f"parallel resume lost active work: {resumed}")

        blocked = run(
            root,
            "block",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            "--reason",
            "temporary dependency",
        )
        if not blocked["continue_independent"] or "P3" not in blocked["continuable_slices"]:
            raise AssertionError(f"local blocker stopped independent work: {blocked}")
        if run(root, "status", "--work-id", "demo-work")["status"] != "running":
            raise AssertionError("work was globally blocked while P3 was still running")
        run(root, "start", "--work-id", "demo-work", "--slice", "P1")

        build_only = {**verification("R-build", "AC1", "worker-1"), "proof_kind": "build"}
        expect_error(
            root,
            "verify",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            "--payload-json",
            compact(build_only),
            contains="does not satisfy",
        )

        artifact = root / "external-proof.txt"
        artifact.write_text("fresh proof", encoding="utf-8")
        forged = {
            "id": "R-forged",
            "acceptance_id": "AC1",
            "claim": "Wrong claim",
            "status": "PASS",
            "proof_kind": "integration",
            "dimensions": ["behavior", "negative-path"],
            "expected": "observable success",
            "observed": "agent says pass",
            "environment": "fixture",
            "artifact_paths": [str(artifact)],
            "verifier": "browser-qa",
            "agent": "worker-1",
            "model": "gpt-5.6-terra",
            "effort": "medium",
        }
        expect_error(
            root,
            "record-proof",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            "--payload-json",
            compact(forged),
            contains="exactly match",
        )
        no_artifact = {**forged, "id": "R-no-artifact", "claim": "Core behavior works", "artifact_paths": []}
        expect_error(
            root,
            "record-proof",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            "--payload-json",
            compact(no_artifact),
            contains="fresh artifact",
        )
        old_artifact = root / "old-proof.txt"
        old_artifact.write_text("stale proof", encoding="utf-8")
        os.utime(old_artifact, (1_600_000_000, 1_600_000_000))
        stale = {
            **no_artifact,
            "id": "R-stale",
            "artifact_paths": [str(old_artifact)],
        }
        expect_error(
            root,
            "record-proof",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            "--payload-json",
            compact(stale),
            contains="not fresh",
        )

        for slice_id, receipt_id, ac_id, agent in (
            ("P1", "R1", "AC1", "worker-1"),
            ("P3", "R3", "AC3", "worker-3"),
        ):
            proof = run(
                root,
                "verify",
                "--work-id",
                "demo-work",
                "--slice",
                slice_id,
                "--payload-json",
                compact(verification(receipt_id, ac_id, agent)),
            )
            if proof["proof_status"] != "PASS":
                raise AssertionError(f"runner proof failed: {proof}")

        expect_error(
            root,
            "close",
            "--work-id",
            "demo-work",
            "--slice",
            "P3",
            contains="independent PASS review",
        )
        self_review = {
            "id": "REV-self",
            "reviewer": "worker-1",
            "status": "PASS",
            "scope": "Proof and regression review",
            "observed": "No issue found",
            "receipt_ids": ["R1"],
            "model": "gpt-5.6-terra",
            "effort": "medium",
        }
        expect_error(
            root,
            "record-review",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            "--payload-json",
            compact(self_review),
            contains="reviewer assignment",
        )
        for slice_id, review_id, reviewer, receipt_id in (
            ("P1", "REV1", "review-1", "R1"),
            ("P3", "REV3", "review-3", "R3"),
        ):
            run(
                root,
                "record-review",
                "--work-id",
                "demo-work",
                "--slice",
                slice_id,
                "--payload-json",
                compact({
                    "id": review_id,
                    "reviewer": reviewer,
                    "status": "PASS",
                    "scope": "Proof and regression review",
                    "observed": "Evidence matches the acceptance contract.",
                    "receipt_ids": [receipt_id],
                    "model": "gpt-5.6-terra",
                    "effort": "medium",
                }),
            )

        run(
            root,
            "record-finding",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            "--payload-json",
            compact({"id": "F1", "severity": "medium", "summary": "Add negative proof.", "reviewer": "main"}),
        )
        expect_error(
            root,
            "close",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            contains="open review findings",
        )
        run(
            root,
            "resolve-review",
            "--work-id",
            "demo-work",
            "--finding",
            "F1",
            "--payload-json",
            compact({"resolution": "Negative fixture added and passed."}),
        )
        run(
            root,
            "checkpoint",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            "--payload-json",
            compact({"id": "C1", "commit": "abc124", "summary": "P1 verified", "next_action": "Start P2"}),
        )
        run(root, "close", "--work-id", "demo-work", "--slice", "P1")
        run(root, "close", "--work-id", "demo-work", "--slice", "P3")

        run(root, "start", "--work-id", "demo-work", "--slice", "P2")
        run(
            root,
            "verify",
            "--work-id",
            "demo-work",
            "--slice",
            "P2",
            "--payload-json",
            compact(verification("R2", "AC2", "worker-2")),
        )
        run(
            root,
            "record-review",
            "--work-id",
            "demo-work",
            "--slice",
            "P2",
            "--payload-json",
            compact({
                "id": "REV2",
                "reviewer": "review-2",
                "status": "PASS",
                "scope": "Integration proof review",
                "observed": "Evidence matches the acceptance contract.",
                "receipt_ids": ["R2"],
                "model": "gpt-5.6-terra",
                "effort": "medium",
            }),
        )
        run(root, "close", "--work-id", "demo-work", "--slice", "P2")
        usage = {
            "actor": "worker-2",
            "assignment_id": "A2",
            "input_tokens": 100,
            "cached_input_tokens": 40,
            "output_tokens": 25,
            "reasoning_tokens": 10,
            "agent_runs": 0,
            "tool_calls": 2,
        }
        recorded = run(
            root,
            "usage",
            "--work-id",
            "demo-work",
            "--payload-json",
            compact(usage),
        )
        if recorded["usage"]["records"][0]["assignment_id"] != "A2":
            raise AssertionError("usage lost per-assignment accountability")

        final = run(root, "finalize", "--work-id", "demo-work")
        if final["status"] != "WORK_PASS":
            raise AssertionError(f"work did not finalize: {final}")
        status = run(root, "status", "--work-id", "demo-work")
        if status["status"] != "passed" or list(root.rglob("*.lock")) or list(root.rglob("*.tmp")):
            raise AssertionError(f"atomic state cleanup failed: {status}")

        spec = importlib.util.spec_from_file_location("workctl_contract", WORKCTL)
        if spec is None or spec.loader is None:
            raise AssertionError("could not import workctl for lock test")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        portable_ledger = json.loads(
            (root / ".agent" / "work" / "demo-work" / "ledger.json").read_text(encoding="utf-8")
        )
        portable_ledger["slices"][0]["acceptance"][0]["required_proof_kinds"] = ["invented-proof"]
        original_jsonschema = module.jsonschema
        module.jsonschema = None
        try:
            module.validate_ledger(portable_ledger)
            raise AssertionError("portable schema fallback accepted an invalid nested proof kind")
        except module.WorkError as error:
            if "schema violation" not in str(error):
                raise
        finally:
            module.jsonschema = original_jsonschema

        lock_target = root / "stale" / "ledger.json"
        lock_target.parent.mkdir(parents=True)
        lock_file = lock_target.with_suffix(".json.lock")
        lock_file.write_text("999999 existing-owner", encoding="ascii")
        try:
            with module.state_lock(lock_target, timeout=0.1):
                raise AssertionError("existing lock was stolen")
        except module.WorkError:
            pass
        if lock_file.read_text(encoding="ascii") != "999999 existing-owner":
            raise AssertionError("timed-out contender modified existing lock")

    print(
        "PASS: classification, schema, source ownership, parallel resume, local blocking, "
        "runner-backed proof, review, usage and lock safety"
    )


if __name__ == "__main__":
    main()
