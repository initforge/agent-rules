#!/usr/bin/env python3
"""Domain-specific verification profile selection and evidence generation.

Loads verification-profiles.json, selects applicable profiles and checks from
changed files, claims, and risk signals, then produces structured evidence.
Missing required tools produce BLOCKED (never false PASS). Optional checks
with missing tools produce SKIPPED with recorded reason.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

try:
    import fnmatch
except ImportError:
    fnmatch = None


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
PROFILES_PATH = SCRIPT_DIR / "verification-profiles.json"
EVIDENCE_PROFILES_PATH = SCRIPT_DIR / "evidence-profiles.json"
MAX_OUTPUT = 8000


class VerificationError(RuntimeError):
    """A verification selection or execution contract is invalid."""


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise VerificationError(f"{path}: expected JSON object")
    return value


def find_tool(name: str) -> str | None:
    """Resolve a tool name to its executable path, or None if missing."""
    if not name:
        return None
    parts = name.split()
    candidate = shutil.which(parts[0])
    if candidate:
        return candidate
    extra = shutil.which(parts[0] + ".exe")
    if extra:
        return extra
    return None


def any_tool_available(tools: list[str]) -> tuple[str | None, str | None]:
    """Return (resolved_path, tool_name) for first available tool, or (None, None)."""
    for tool in tools:
        path = find_tool(tool)
        if path:
            return path, tool
    return None, None


def file_matches_any(file_path: str, patterns: list[str]) -> bool:
    """Check if a file path matches any glob pattern."""
    normalized = file_path.replace("\\", "/")
    for pattern in patterns:
        if fnmatch and fnmatch.fnmatch(normalized, pattern):
            return True
        try:
            if re.search(pattern.replace("**", ".*").replace("*", "[^/]*"), normalized):
                return True
        except re.error:
            if fnmatch.fnmatch(normalized, pattern):
                return True
    return False


def claim_matches_any(claim: str, keywords: list[str]) -> bool:
    """Check if a claim text contains any keyword."""
    lower = claim.lower()
    return any(kw.lower() in lower for kw in keywords)


def load_profiles() -> dict[str, Any]:
    """Load and validate verification profiles."""
    if not PROFILES_PATH.is_file():
        raise VerificationError(f"verification profiles not found: {PROFILES_PATH}")
    return load_json(PROFILES_PATH)


def load_evidence_profiles() -> dict[str, Any]:
    """Load evidence profiles for validation."""
    if not EVIDENCE_PROFILES_PATH.is_file():
        return {}
    return load_json(EVIDENCE_PROFILES_PATH)


def select_profiles(
    profiles: dict[str, Any],
    changed_files: list[str],
    claims: list[str],
    domains: list[str] | None = None,
    risk_signals: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Select matching domain profiles based on context.

    Returns list of selected profile dicts each with:
      - profile_id: str
      - profile: dict (the full profile definition)
      - check_results: list[dict] (selected check verdicts)
    """
    domain_profiles = profiles.get("domain_profiles", {})
    selected: list[dict[str, Any]] = []

    for profile_id, profile in domain_profiles.items():
        signals = profile.get("signals", {})
        file_patterns = signals.get("file_patterns", [])
        claim_keywords = signals.get("claim_keywords", [])
        profile_domains = signals.get("domains", [])

        # Check for domain match first, then files, then claims
        file_hit = any(file_matches_any(f, file_patterns) for f in changed_files) if changed_files else False
        claim_hit = any(claim_matches_any(c, claim_keywords) for c in claims) if claims else False
        domain_hit = (
            any(d.lower() in [pd.lower() for pd in profile_domains] for d in domains)
            if domains
            else False
        )

        if not file_hit and not claim_hit and not domain_hit:
            continue

        # Select checks for this profile
        check_results = select_checks(
            profile,
            changed_files,
            claims,
            risk_signals or [],
        )

        selected.append({
            "profile_id": profile_id,
            "description": profile.get("description", ""),
            "matched_by": {
                "files": file_hit,
                "claims": claim_hit,
                "domains": domain_hit,
            },
            "check_count": len(check_results),
            "checks": check_results,
        })

    return selected


def select_checks(
    profile: dict[str, Any],
    changed_files: list[str],
    claims: list[str],
    risk_signals: list[str],
) -> list[dict[str, Any]]:
    """Select and evaluate checks for a profile.

    Each check result:
      - check_id: str
      - name: str
      - status: RUNNABLE | BLOCKED | SKIPPED | NOT_SELECTED
      - skip_reason: str (when status is SKIPPED or BLOCKED)
      - proof_kind: str
      - evidence_profile: str
      - required_dimensions: list[str]
      - tool_path: str | None
      - command: str
      - expected_exit_code: int
      - mandatory: bool
    """
    results: list[dict[str, Any]] = []
    available_checks = profile.get("checks", [])

    for check in available_checks:
        affected_by = check.get("affected_by", [])
        mandatory = check.get("mandatory", False)
        missing_action = check.get("missing_tool_action", "blocked")
        tools = check.get("tools", [])

        # Determine if this check is applicable based on changed files and claims
        file_applicable = False
        if affected_by and changed_files:
            file_applicable = any(file_matches_any(f, affected_by) for f in changed_files)
        elif not affected_by:
            # No file filter means always applicable when profile is selected
            file_applicable = True

        claim_applicable = False
        check_keywords = profile.get("signals", {}).get("claim_keywords", [])
        if check_keywords and claims:
            claim_applicable = any(claim_matches_any(c, check_keywords) for c in claims)
        elif claims:
            claim_applicable = True

        # Risk-triggered: mandate checks for high-risk signals
        risk_triggers = {"security": ["security"], "migration": ["database", "migration"],
                         "auth": ["security"], "permission": ["security"]}
        risk_mandated = False
        for risk in risk_signals:
            for trigger, profiles_list in risk_triggers.items():
                if trigger == risk and profile.get("signals", {}).get("domains", []) and any(
                    d in profiles_list for d in profile.get("signals", {}).get("domains", [])
                ):
                    risk_mandated = True

        if not file_applicable and not claim_applicable and not risk_mandated:
            continue

        # Check tool availability
        tool_path, tool_name = any_tool_available(tools)

        if tool_path:
            command = check.get("command_template", "").replace("{tool}", tool_path) if check.get("command_template") else ""
            status = "RUNNABLE"
            skip_reason = ""
        elif missing_action == "blocked":
            command = ""
            status = "BLOCKED"
            skip_reason = f"Required tool(s) not found: {', '.join(tools)}"
        else:
            command = ""
            status = "SKIPPED"
            skip_reason = f"Tool(s) not found: {', '.join(tools)}; check skipped per profile"

        result = {
            "check_id": check.get("id", ""),
            "name": check.get("name", ""),
            "status": status,
            "skip_reason": skip_reason,
            "proof_kind": check.get("proof_kind", ""),
            "evidence_profile": check.get("evidence_profile", ""),
            "required_dimensions": check.get("required_dimensions", []),
            "tool_path": tool_path,
            "tool_name": tool_name,
            "command": command,
            "expected_exit_code": check.get("expected_exit_code", 0),
            "mandatory": mandatory or risk_mandated,
        }
        results.append(result)

    return results


def run_check(root: Path, check: dict[str, Any], timeout: int = 300) -> dict[str, Any]:
    """Run a single verification check and produce structured evidence.

    Returns:
      - check_id: str
      - status: PASS | FAIL | BLOCKED | SKIPPED
      - evidence: dict with captured output, exit code, artifacts
      - skip_reason: str (when SKIPPED or BLOCKED)
    """
    if check["status"] == "BLOCKED":
        return {
            "check_id": check["check_id"],
            "status": "BLOCKED",
            "evidence": {
                "exit_code": None,
                "stdout": "",
                "stderr": check["skip_reason"],
                "output_hash": "",
                "artifacts": [],
            },
            "skip_reason": check["skip_reason"],
        }

    if check["status"] == "SKIPPED":
        return {
            "check_id": check["check_id"],
            "status": "SKIPPED",
            "evidence": {
                "exit_code": None,
                "stdout": "",
                "stderr": check["skip_reason"],
                "output_hash": "",
                "artifacts": [],
            },
            "skip_reason": check["skip_reason"],
        }

    command = check.get("command", "")
    if not command:
        return {
            "check_id": check["check_id"],
            "status": "SKIPPED",
            "evidence": {"exit_code": None, "stdout": "", "stderr": "No command template", "output_hash": "", "artifacts": []},
            "skip_reason": "No command defined for this check",
        }

    try:
        completed = subprocess.run(
            command,
            cwd=root,
            shell=True,
            text=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        output = (completed.stdout + completed.stderr)[-MAX_OUTPUT:]
        exit_code: int | None = completed.returncode
        expected = check.get("expected_exit_code", 0)
        status = "PASS" if completed.returncode == expected else "FAIL"
        stderr = completed.stderr[-MAX_OUTPUT:]
    except subprocess.TimeoutExpired as exc:
        raw_stdout = exc.stdout.decode("utf-8", "replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        raw_stderr = exc.stderr.decode("utf-8", "replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        output = (raw_stdout + raw_stderr + f"\nTIMEOUT after {timeout}s")[-MAX_OUTPUT:]
        exit_code = None
        status = "FAIL"
        stderr = raw_stderr[-MAX_OUTPUT:]

    import hashlib
    output_hash = hashlib.sha256(output.encode("utf-8")).hexdigest()

    return {
        "check_id": check["check_id"],
        "status": status,
        "evidence": {
            "exit_code": exit_code,
            "stdout": output[-2000:],
            "stderr": stderr[-2000:],
            "output_hash": output_hash,
            "artifacts": [],
        },
        "skip_reason": "",
    }


def summarize(selection: list[dict[str, Any]]) -> dict[str, Any]:
    """Produce a structured verification summary from profile selections."""
    total_checks = 0
    by_status: dict[str, int] = {}
    by_profile: dict[str, dict[str, int]] = {}
    skipped_reasons: list[dict[str, str]] = []
    manual_checks: list[dict[str, str]] = []
    all_pass = True

    for profile_result in selection:
        pid = profile_result["profile_id"]
        profile_counts: dict[str, int] = {}
        for check in profile_result.get("checks", []):
            total_checks += 1
            s = check["status"]
            profile_counts[s] = profile_counts.get(s, 0) + 1
            by_status[s] = by_status.get(s, 0) + 1

            if s in ("SKIPPED", "BLOCKED") and check.get("mandatory"):
                all_pass = False

            if check.get("skip_reason"):
                skipped_reasons.append({
                    "check_id": check["check_id"],
                    "profile": pid,
                    "reason": check["skip_reason"],
                })

            if s == "SKIPPED" and check.get("mandatory"):
                manual_checks.append({
                    "check_id": check["check_id"],
                    "profile": pid,
                    "name": check.get("name", ""),
                    "reason": "Mandatory check skipped; requires manual verification",
                })

        by_profile[pid] = profile_counts

    return {
        "total_checks": total_checks,
        "by_status": by_status,
        "by_profile": by_profile,
        "all_automated_pass": all_pass,
        "skipped_checks": skipped_reasons,
        "manual_checks_remaining": manual_checks,
        "has_blocked_required_tool": any(
            c["status"] == "BLOCKED" and c.get("mandatory")
            for pr in selection for c in pr.get("checks", [])
        ),
    }


def command_select(args: argparse.Namespace) -> dict[str, Any]:
    """Select verification profiles from context and produce verification plan."""
    data = json.loads(args.payload) if args.payload else {}
    profiles = load_profiles()

    changed_files = data.get("changed_files", [])
    claims = data.get("claims", [])
    domains = data.get("domains", None)
    risk_signals = data.get("risk_signals", [])

    selection = select_profiles(profiles, changed_files, claims, domains, risk_signals)
    summary = summarize(selection)

    evidence_profiles = load_evidence_profiles()

    return {
        "status": "VERIFICATION_PLAN",
        "profiles_count": len(selection),
        "profiles_selected": [s["profile_id"] for s in selection],
        "profile_details": selection,
        "summary": summary,
        "evidence_profiles_available": list(evidence_profiles.get("profiles", {}).keys()),
    }


def command_run(args: argparse.Namespace) -> dict[str, Any]:
    """Run selected checks and produce structured evidence results."""
    data = json.loads(args.payload) if args.payload else {}
    root = Path(args.root).resolve()
    timeout = args.timeout

    profiles = load_profiles()
    changed_files = data.get("changed_files", [])
    claims = data.get("claims", [])
    domains = data.get("domains", None)
    risk_signals = data.get("risk_signals", [])

    selection = select_profiles(profiles, changed_files, claims, domains, risk_signals)

    all_results: list[dict[str, Any]] = []
    run_results: list[dict[str, Any]] = []

    for profile_result in selection:
        for check in profile_result.get("checks", []):
            result = run_check(root, check, timeout)
            all_results.append(result)
            run_results.append({
                "profile_id": profile_result["profile_id"],
                "check_id": result["check_id"],
                "status": result["status"],
                "evidence": result["evidence"],
                "skip_reason": result.get("skip_reason", ""),
            })

    summary = summarize(selection)

    return {
        "status": "VERIFICATION_RUN",
        "results_count": len(run_results),
        "results": run_results,
        "summary": summary,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(ROOT))
    commands = parser.add_subparsers(dest="command", required=True)

    select_parser = commands.add_parser("select", help="Select verification profiles from context")
    select_parser.add_argument("--payload", default="", help="JSON context payload string")

    run_parser = commands.add_parser("run", help="Select and run verification checks")
    run_parser.add_argument("--payload", default="", help="JSON context payload string")
    run_parser.add_argument("--timeout", type=int, default=300, help="Per-check timeout in seconds")

    return parser


def emit(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def main() -> int:
    args = build_parser().parse_args()
    handlers = {
        "select": command_select,
        "run": command_run,
    }
    try:
        emit(handlers[args.command](args))
        return 0
    except (VerificationError, OSError, json.JSONDecodeError, ValueError) as exc:
        emit({"status": "ERROR", "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
