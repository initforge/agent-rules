#!/usr/bin/env python3
"""Adversarial contract tests for automatic work orchestration."""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
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


def run_launcher(root: Path, launcher: Path, *args: str, expect: int = 0) -> dict:
    command = (
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(launcher)]
        if os.name == "nt"
        else ["sh", str(launcher)]
    )
    result = subprocess.run(
        [*command, "--root", str(root), *args], text=True, capture_output=True, encoding="utf-8",
    )
    if result.returncode != expect:
        raise AssertionError(
            f"launcher exit={result.returncode}, expected={expect}\n"
            f"stdout={result.stdout}\nstderr={result.stderr}"
        )
    return json.loads(result.stdout)


def compact(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def observed_model_evidence() -> dict:
    return {
        "requested_model": "gpt-5.6-terra", "requested_effort": "medium",
        "resolved_model": "gpt-5.6-terra", "resolved_effort": "medium",
        "observed_model": "gpt-5.6-terra", "observed_effort": "medium",
        "status": "observed", "fallback_reason": "", "main_direct_exception_reason": "",
    }


def unobserved_model_evidence(status: str = "unobserved") -> dict:
    return {
        "requested_model": "gpt-5.6-terra", "requested_effort": "medium",
        "resolved_model": "gpt-5.6-terra", "resolved_effort": "medium",
        "observed_model": None, "observed_effort": None,
        "status": status,
        "fallback_reason": "host did not expose model telemetry" if status == "fallback" else "",
        "main_direct_exception_reason": "",
    }


def observed_completion(attestation: str) -> dict:
    return {
        "status": "done",
        "observed_model": "gpt-5.6-terra",
        "observed_effort": "medium",
        "host_attestation_ref": attestation,
    }


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
        "model_evidence": observed_model_evidence(),
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

    file_only = run(ROOT, "classify", "--payload-json", compact({"file_count": 20}))
    if file_only["shape"] != "small" or file_only["ledger"] != "off":
        raise AssertionError(f"file count incorrectly became a risk classifier: {file_only}")
    migration_risk = run(ROOT, "classify", "--payload-json", compact({
        "file_count": 1, "risk_signals": ["migration"],
    }))
    if migration_risk["shape"] != "resumable" or migration_risk["ledger"] != "required" or not migration_risk["review_required"]:
        raise AssertionError(f"material risk did not dominate classification: {migration_risk}")

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
        cancelled_executor = assignment(
            "A-cancelled", "P3", "cancelled-worker", "AC3", ["REQ-001"], "",
        )
        cancelled_executor["status"] = "cancelled"
        run(root, "assign", "--work-id", "demo-work", "--payload-json", compact(cancelled_executor))
        expect_error(
            root, "complete-assignment", "--work-id", "demo-work",
            "--assignment", "missing-assignment", "--payload-json",
            compact(observed_completion("host://missing")), contains="unknown assignment",
        )
        expect_error(
            root, "complete-assignment", "--work-id", "demo-work",
            "--assignment", "A-cancelled", "--payload-json",
            compact(observed_completion("host://cancelled")), contains="cancelled assignment",
        )
        expect_error(
            root, "complete-assignment", "--work-id", "demo-work",
            "--assignment", "A1", "--payload-json",
            compact({"status": "done", "observed_model": "gpt-5.6-terra", "observed_effort": "medium"}),
            contains="host_attestation_ref",
        )

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

        expect_error(
            root, "start", "--work-id", "demo-work", "--slice", "P1",
            contains="require acknowledgement",
        )
        for assignment_id in ("A1", "A2", "A3", "AR1", "AR2", "AR3"):
            acknowledged = run(
                root, "ack-assignment", "--work-id", "demo-work", "--assignment", assignment_id,
            )
            if acknowledged["status"] != "ASSIGNMENT_ACKNOWLEDGED":
                raise AssertionError(f"assignment acknowledgement was not recorded: {acknowledged}")

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
        spoofed = verification("R-spoofed", "AC1", "review-1")
        expect_error(
            root,
            "verify",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            "--payload-json",
            compact(spoofed),
            contains="eligible executor assignment",
        )
        spoof_marker = root / "spoof-command-ran.txt"
        unbound = {
            **verification("R-unbound", "AC1", "intruder"),
            "command": (
                f'"{sys.executable}" -c "from pathlib import Path; '
                f"Path('{spoof_marker.as_posix()}').write_text('ran')\""
            ),
        }
        expect_error(
            root,
            "verify",
            "--work-id",
            "demo-work",
            "--slice",
            "P1",
            "--payload-json",
            compact(unbound),
            contains="eligible executor assignment",
        )
        if spoof_marker.exists():
            raise AssertionError("unbound proof command executed before assignment validation")

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

        historical = verification("R1-historical", "AC1", "worker-1")
        historical["model_evidence"] = unobserved_model_evidence()
        run(
            root, "verify", "--work-id", "demo-work", "--slice", "P1",
            "--payload-json", compact(historical),
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
        run(
            root, "record-review", "--work-id", "demo-work", "--slice", "P3",
            "--payload-json", compact({
                "id": "REV3-fail", "reviewer": "review-3", "status": "FAIL",
                "scope": "Current proof review", "observed": "Current proof needs follow-up.",
                "receipt_ids": ["R3"], "model": "gpt-5.6-terra", "effort": "medium",
                "model_evidence": observed_model_evidence(),
            }),
        )
        expect_error(
            root, "close", "--work-id", "demo-work", "--slice", "P3",
            contains="latest applicable independent review is FAIL",
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
                    "model_evidence": observed_model_evidence(),
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
        fallback_completion = run(
            root, "complete-assignment", "--work-id", "demo-work", "--assignment", "A1",
            "--payload-json", compact({
                "status": "done",
                "fallback_reason": "host did not expose model telemetry",
                "host_attestation_ref": "host://fallback/A1",
            }),
        )
        if fallback_completion["model_evidence_status"] != "fallback":
            raise AssertionError(f"assignment fallback was not preserved: {fallback_completion}")
        completed_ledger = json.loads(
            (root / ".agent" / "work" / "demo-work" / "ledger.json").read_text(encoding="utf-8")
        )
        completed_a1 = next(item for item in completed_ledger["assignments"] if item["id"] == "A1")
        immutable_fields = (
            "slice_id", "agent", "role", "source_ids", "write_paths", "context_paths",
            "forbidden_paths", "acceptance_ids",
        )
        if any(completed_a1[key] != a1[key] for key in immutable_fields):
            raise AssertionError("assignment completion changed ownership or acceptance scope")
        if not completed_a1.get("completed_at") or completed_a1.get("host_attestation_ref") != "host://fallback/A1":
            raise AssertionError("assignment completion lost timestamp or host attestation reference")
        run(
            root, "complete-assignment", "--work-id", "demo-work", "--assignment", "A3",
            "--payload-json", compact(observed_completion("host://observed/A3")),
        )
        expect_error(
            root, "complete-assignment", "--work-id", "demo-work", "--assignment", "A3",
            "--payload-json", compact({"status": "blocked", "fallback_reason": "late block"}),
            contains="done assignment cannot transition to blocked",
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
                "model_evidence": observed_model_evidence(),
                }),
        )
        run(
            root, "complete-assignment", "--work-id", "demo-work", "--assignment", "A2",
            "--payload-json", compact(observed_completion("host://observed/A2")),
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

        fallback_final = run(root, "finalize", "--work-id", "demo-work")
        if fallback_final["status"] != "WORK_PARTIAL" or not any(
            reason.startswith("assignment A1 ")
            for reason in fallback_final["model_policy_reasons"]
        ):
            raise AssertionError(f"fallback assignment incorrectly permitted PASS: {fallback_final}")
        upgraded = run(
            root, "complete-assignment", "--work-id", "demo-work", "--assignment", "A1",
            "--payload-json", compact(observed_completion("host://observed/A1")),
        )
        if upgraded["model_evidence_status"] != "observed":
            raise AssertionError(f"assignment observation upgrade failed: {upgraded}")
        final = run(root, "finalize", "--work-id", "demo-work")
        if final["status"] != "WORK_PASS":
            raise AssertionError(f"work did not finalize: {final}")
        status = run(root, "status", "--work-id", "demo-work")
        if status["status"] != "passed" or list(root.rglob("*.lock")) or list(root.rglob("*.tmp")):
            raise AssertionError(f"atomic state cleanup failed: {status}")

        latest_fallback = verification("R2-latest-fallback", "AC2", "worker-2")
        latest_fallback["model_evidence"] = unobserved_model_evidence("fallback")
        run(
            root, "verify", "--work-id", "demo-work", "--slice", "P2",
            "--payload-json", compact(latest_fallback),
        )
        run(
            root, "record-review", "--work-id", "demo-work", "--slice", "P2",
            "--payload-json", compact({
                "id": "REV2-latest-fallback", "reviewer": "review-2", "status": "PASS",
                "scope": "Latest fallback proof review", "observed": "Current proof set reviewed.",
                "receipt_ids": ["R2-latest-fallback"], "model": "gpt-5.6-terra",
                "effort": "medium", "model_evidence": observed_model_evidence(),
            }),
        )
        latest_partial = run(root, "finalize", "--work-id", "demo-work")
        if latest_partial["status"] != "WORK_PARTIAL" or not any(
            reason.startswith("proof R2-latest-fallback ")
            for reason in latest_partial["model_policy_reasons"]
        ):
            raise AssertionError(f"historical observed proof laundered latest fallback: {latest_partial}")

        run(
            root, "verify", "--work-id", "demo-work", "--slice", "P2",
            "--payload-json", compact(verification("R2-recovered", "AC2", "worker-2")),
        )
        run(
            root, "record-review", "--work-id", "demo-work", "--slice", "P2",
            "--payload-json", compact({
                "id": "REV2-recovered", "reviewer": "review-2", "status": "PASS",
                "scope": "Recovered current proof review", "observed": "Current proof set reviewed.",
                "receipt_ids": ["R2-recovered"], "model": "gpt-5.6-terra",
                "effort": "medium", "model_evidence": observed_model_evidence(),
            }),
        )
        if run(root, "finalize", "--work-id", "demo-work")["status"] != "WORK_PASS":
            raise AssertionError("observed rerun and current review did not recover WORK_PASS")

        ledger_path = root / ".agent" / "work" / "demo-work" / "ledger.json"
        unobserved = json.loads(ledger_path.read_text(encoding="utf-8"))
        current_p1_review = next(review for review in unobserved["reviews"] if review["id"] == "REV1")
        current_p1_review["model_evidence"] = {
            "requested_model": "gpt-5.6-terra", "requested_effort": "medium",
            "resolved_model": "gpt-5.6-terra", "resolved_effort": "medium",
            "observed_model": None, "observed_effort": None, "status": "unobserved",
            "fallback_reason": "", "main_direct_exception_reason": "main direct review had no host telemetry",
        }
        unobserved["assignments"][0]["model_evidence"] = {
            "requested_model": "gpt-5.6-terra", "requested_effort": "medium",
            "resolved_model": "gpt-5.6-terra", "resolved_effort": "medium",
            "observed_model": None, "observed_effort": None, "status": "fallback",
            "fallback_reason": "executor route was not observed", "main_direct_exception_reason": "",
        }
        ledger_path.write_text(json.dumps(unobserved), encoding="utf-8")
        partial = run(root, "finalize", "--work-id", "demo-work")
        if partial["status"] != "WORK_PARTIAL" or len(partial["model_policy_reasons"]) < 2:
            raise AssertionError(f"unobserved/fallback evidence incorrectly permitted PASS: {partial}")
        if not any(reason.startswith("assignment A1 ") for reason in partial["model_policy_reasons"]):
            raise AssertionError(f"executor assignment evidence was not terminally enforced: {partial}")
        if run(root, "status", "--work-id", "demo-work")["status"] != "partial":
            raise AssertionError("partial terminal result was not persisted")

        spec = importlib.util.spec_from_file_location("workctl_contract", WORKCTL)
        if spec is None or spec.loader is None:
            raise AssertionError("could not import workctl for lock test")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        portable_ledger = json.loads(
            (root / ".agent" / "work" / "demo-work" / "ledger.json").read_text(encoding="utf-8")
        )
        telemetry = {
            "schema_version": 1, "platform": "codex", "event": "PostToolUse",
            "session_id": "session-1", "actor": "worker", "assignment_id": "A1",
            "tool": "shell_command", "tool_class": "shell", "timestamp": "2026-07-24T00:00:00+00:00",
            "outcome": "ALLOW",
        }
        telemetry["event_id"] = module.sha256_text(module.canonical_json(telemetry))
        telemetry_ref = f"skill-state/telemetry-events.jsonl#{telemetry['event_id']}"
        portable_ledger["telemetry_events"] = [telemetry]
        portable_ledger["assignments"][0]["actor_telemetry_refs"] = [telemetry_ref]
        module.validate_ledger(portable_ledger)
        portable_ledger["assignments"][0]["actor_telemetry_refs"] = [
            "skill-state/telemetry-events.jsonl#" + "0" * 64
        ]
        try:
            module.validate_ledger(portable_ledger)
            raise AssertionError("unknown telemetry event ref was accepted")
        except module.WorkError as error:
            if "ledger-known canonical event" not in str(error):
                raise
        portable_ledger["assignments"][0]["actor_telemetry_refs"] = [telemetry_ref]
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

    with tempfile.TemporaryDirectory(prefix="workctl-adopt-") as holder:
        root = Path(holder)
        subprocess.run(["git", "init", "-q"], cwd=root, check=True)
        subprocess.run(["git", "config", "user.email", "workctl@example.test"], cwd=root, check=True)
        subprocess.run(["git", "config", "user.name", "Workctl test"], cwd=root, check=True)
        marker = root / "marker.txt"
        marker.write_text("baseline", encoding="utf-8")
        subprocess.run(["git", "add", "marker.txt"], cwd=root, check=True)
        subprocess.run(["git", "commit", "-qm", "baseline"], cwd=root, check=True)
        plan = root / "plan.json"
        plan.write_text('{"outcome":"portable ledger"}\n', encoding="utf-8")
        adopt_payload = {
            "signals": {"resume_requested": True},
            "execute_authorization": {"authorized": True, "source": "owner-execute"},
            "host_refs": {"host": "test-host", "task_ref": "task-1", "session_ref": "session-1"},
            "source_history": [{"id": "REQ-001", "kind": "original", "summary": "Adopt plan.", "captured_at": "2026-07-24T00:00:00+00:00", "redacted": False, "slice_ids": ["*"]}],
        }
        created = run(root, "adopt", "--work-id", "adopt-work", "--plan-file", str(plan), "--payload-json", compact(adopt_payload))
        if created["status"] != "LEDGER_CREATED":
            raise AssertionError(f"adopt did not create: {created}")
        resumed = run(root, "adopt", "--work-id", "adopt-work", "--plan-file", str(plan), "--payload-json", compact(adopt_payload))
        if resumed["status"] != "LEDGER_RESUMED":
            raise AssertionError(f"adopt did not resume atomically: {resumed}")
        concurrent = [
            subprocess.Popen([sys.executable, str(WORKCTL), "--root", str(root), "adopt", "--work-id", "concurrent-work", "--plan-file", str(plan), "--payload-json", compact(adopt_payload)], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8")
            for _ in range(2)
        ]
        concurrent_results = [json.loads(process.communicate(timeout=20)[0]) for process in concurrent]
        if sorted(result["status"] for result in concurrent_results) != ["LEDGER_CREATED", "LEDGER_RESUMED"]:
            raise AssertionError(f"concurrent adopt was not atomic: {concurrent_results}")
        plan.write_text('{"outcome":"different plan"}\n', encoding="utf-8")
        expect_error(root, "adopt", "--work-id", "adopt-work", "--plan-file", str(plan), "--payload-json", compact(adopt_payload), contains="plan identity mismatch")
        wrong_baseline = {**adopt_payload, "repository": {"baseline_commit": "not-the-current-commit"}}
        expect_error(root, "adopt", "--work-id", "baseline-work", "--plan-file", str(plan), "--payload-json", compact(wrong_baseline), contains="baseline mismatch")

        v2 = root / ".agent" / "work" / "adopt-work" / "ledger.json"
        migrated = json.loads(v2.read_text(encoding="utf-8"))
        migrated.pop("model_policy_reasons")
        v2.write_text(json.dumps(migrated), encoding="utf-8")
        run(root, "add-source", "--work-id", "adopt-work", "--payload-json", compact({"id": "INJ-001", "kind": "injection", "summary": "Persist v3 terminal defaults.", "slice_ids": ["*"]}))
        if "model_policy_reasons" not in json.loads(v2.read_text(encoding="utf-8")):
            raise AssertionError("pre-policy v3 ledger did not normalize on mutation")
        migrated = json.loads(v2.read_text(encoding="utf-8"))
        migrated["schema_version"] = 2
        migrated["plan_ref"] = migrated.pop("plan")["ref"]
        migrated.pop("host_refs")
        migrated["execution_contract"].pop("execute_authorization")
        v2.write_text(json.dumps(migrated), encoding="utf-8")
        if run(root, "status", "--work-id", "adopt-work")["status"] != "planned":
            raise AssertionError("v2 ledger did not migrate safely in memory")

        evidence = {"requested_model": "economy", "requested_effort": "low", "resolved_model": "standard", "resolved_effort": "medium", "observed_model": None, "observed_effort": None, "status": "fallback", "fallback_reason": "host did not expose economy route", "main_direct_exception_reason": ""}
        if evidence["status"] == "observed":
            raise AssertionError("test fixture must retain honest unobserved host evidence")

    with tempfile.TemporaryDirectory(prefix="workctl-bundle-") as holder:
        holder_path = Path(holder)
        project = holder_path / "arbitrary-project"
        bundle = holder_path / "runtime" / "agent-rules-tools"
        project.mkdir()
        bundle.mkdir(parents=True)
        for name in ("workctl.py", "work-ledger.schema.json", "workctl.ps1", "workctl.sh"):
            shutil.copy2(ROOT / "automation" / name, bundle / name)
        launcher = bundle / ("workctl.ps1" if os.name == "nt" else "workctl.sh")
        init_payload = project / "init.json"
        init_payload.write_text(json.dumps({
            "signals": {"resume_requested": True},
            "slices": [{
                "id": "P1", "name": "Optional portable smoke", "status": "ready",
                "depends_on": [], "required": False,
                "acceptance": [acceptance("AC1", "Portable launcher resolves sibling schema")],
            }],
        }), encoding="utf-8")
        created = run_launcher(project, launcher, "init", "--work-id", "bundle-work", "--payload-file", str(init_payload))
        if created["status"] != "LEDGER_CREATED":
            raise AssertionError(f"installed bundle init failed: {created}")
        if run_launcher(project, launcher, "status", "--work-id", "bundle-work")["status"] != "planned":
            raise AssertionError("installed bundle status failed")
        resumed = run_launcher(project, launcher, "resume", "--work-id", "bundle-work")
        if resumed["active_slices"] != ["P1"]:
            raise AssertionError(f"installed bundle resume failed: {resumed}")
        finalized = run_launcher(project, launcher, "finalize", "--work-id", "bundle-work")
        if finalized["status"] != "WORK_PASS":
            raise AssertionError(f"installed bundle finalize failed: {finalized}")

    print(
        "PASS: portable installed bundle, legacy commands, v2 migration, assignment completion, "
        "adopt/resume/baseline checks, assignment-bound proof, model evidence, schema, review, "
        "usage and lock safety"
    )


if __name__ == "__main__":
    main()
