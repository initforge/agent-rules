#!/usr/bin/env python3
"""Domain-specific verification profile selection and evidence generation.

Loads verification-profiles.json, selects applicable profiles and checks from
changed files, claims, and risk signals, then produces structured evidence.
Missing required tools produce BLOCKED (never false PASS). Optional checks
with missing tools produce SKIPPED with recorded reason.

Provider adapters (REQ-009): claim-driven activation only. A provider is
activated when a claim actually needs it (claim-class keywords); it is never
globally exposed. A missing optional provider fails closed with explicit
UNAVAILABLE evidence, never PASS. k6 requires explicit thresholds/SLO claims.
Telemetry evidence (telemetry-diagnosis) can never substitute product
acceptance. Timed-out provider processes are terminated as a process group
and their logs are bounded.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import signal
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
PROVIDERS_DIR = ROOT / "integrations" / "providers"
SCHEMA_PATH = ROOT / "schemas" / "verification-profile.schema.json"
MAX_OUTPUT = 8000

# Statuses produced by provider-claim-driven activation.
STATUS_RUNNABLE = "RUNNABLE"
STATUS_UNAVAILABLE = "UNAVAILABLE"
STATUS_NOT_SELECTED = "NOT_SELECTED"
# k6 (and any future performance provider) activates only when the claim
# carries an explicit threshold/SLO budget. Generic performance wording alone
# never activates a performance provider.
THRESHOLD_CLAIM_KEYWORDS = [
    "threshold", "slo", "latency budget", "performance budget", "error rate",
    "p95", "p99", "p90", "rps", "tps", "requests per second",
]
# Telemetry evidence can never substitute product acceptance.
TELEMETRY_EVIDENCE_PROFILE = "telemetry-diagnosis"


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
    """Load and validate verification profiles (fail closed on incoherence)."""
    if not PROFILES_PATH.is_file():
        raise VerificationError(f"verification profiles not found: {PROFILES_PATH}")
    profiles = load_json(PROFILES_PATH)
    validate_profile_coherence(profiles)
    return profiles


def load_evidence_profiles() -> dict[str, Any]:
    """Load evidence profiles for validation."""
    if not EVIDENCE_PROFILES_PATH.is_file():
        return {}
    return load_json(EVIDENCE_PROFILES_PATH)


def load_provider_manifests() -> dict[str, dict[str, Any]]:
    """Load lifecycle adapter manifests from integrations/providers/, sorted for determinism.

    Each manifest binds effects, prerequisites, health, timeout, rollback,
    evidence kinds, host support, and claim classes for one provider-neutral
    capability edge.
    """
    manifests: dict[str, dict[str, Any]] = {}
    if not PROVIDERS_DIR.is_dir():
        return manifests
    for manifest_path in sorted(PROVIDERS_DIR.glob("*/manifest.json")):
        manifest = load_json(manifest_path)
        pid = manifest.get("id")
        if not pid:
            raise VerificationError(f"{manifest_path}: provider manifest missing id")
        manifests[pid] = manifest
    return manifests


def validate_profile_coherence(profiles: dict[str, Any]) -> None:
    """Fail closed when profiles reference unknown evidence profiles or providers.

    Every evidence_profile referenced by domain checks and provider adapters
    must exist in evidence-profiles.json, and every provider adapter must have
    a lifecycle manifest in integrations/providers/. This keeps the profiles,
    evidence kinds, manifests, and selection deterministic and coherent.
    """
    evidence = load_evidence_profiles()
    profiles_map = evidence.get("profiles", {})
    errors: list[str] = []

    for pid, profile in profiles.get("domain_profiles", {}).items():
        for check in profile.get("checks", []):
            ep = check.get("evidence_profile")
            if ep and ep not in profiles_map:
                errors.append(f"domain profile {pid}/{check.get('id', '')} references unknown evidence profile '{ep}'")

    manifests = load_provider_manifests()
    adapters = profiles.get("provider_adapters", {})
    for aid, adapter in adapters.items():
        ep = adapter.get("evidence_profile")
        if ep not in profiles_map:
            errors.append(f"provider adapter {aid} references unknown evidence profile '{ep}'")
        if aid not in manifests:
            errors.append(f"provider adapter {aid} missing lifecycle manifest integrations/providers/{aid}/manifest.json")
        if adapter.get("thresholds_required") and not manifests.get(aid, {}).get("thresholds_required"):
            errors.append(f"provider adapter {aid} declares thresholds_required but its manifest does not")
        if adapter.get("telemetry_only") != manifests.get(aid, {}).get("telemetry_only"):
            errors.append(f"provider adapter {aid} telemetry_only disagrees with its manifest")

    if errors:
        raise VerificationError("profile coherence failed: " + "; ".join(errors))


def provider_available(
    adapter: dict[str, Any],
    manifest: dict[str, Any],
    availability: dict[str, bool] | None = None,
) -> tuple[bool, str]:
    """Resolve provider runtime availability.

    An explicit availability override (fixtures) wins; otherwise real tool
    detection runs. CI-only providers (CodeQL) are unavailable outside a CI
    environment and must never be emulated locally as parity.
    """
    if availability and adapter.get("id") in availability:
        forced = availability[adapter["id"]]
        return forced, ("availability injected by fixture" if forced else "availability injected as unavailable by fixture")

    if not manifest:
        return False, f"no lifecycle manifest for provider {adapter.get('id')}"
    if manifest.get("hosts", {}).get("ci_only") and not os.environ.get("CI"):
        return False, "CI-only provider; no CI runner in this environment (never emulated locally)"

    tools = manifest.get("providers", [])
    tool_path, tool_name = any_tool_available(tools)
    if tool_path:
        return True, f"provider tool available: {tool_name}"
    return False, f"provider tool(s) not found: {', '.join(tools)}"


def select_providers(
    profiles: dict[str, Any],
    claims: list[str],
    changed_files: list[str] | None = None,
    availability: dict[str, bool] | None = None,
) -> list[dict[str, Any]]:
    """Claim-driven provider activation, deterministic and never global.

    A provider is activated only when an actual claim needs it (claim-class
    keyword match). File patterns alone never activate a provider. Activated
    providers resolve to RUNNABLE or explicit UNAVAILABLE; unactivated
    providers resolve to NOT_SELECTED. Availability never grants authority.
    """
    adapters = profiles.get("provider_adapters", {})
    manifests = load_provider_manifests()
    results: list[dict[str, Any]] = []

    for provider_id in sorted(adapters):
        adapter = adapters[provider_id]
        claim_classes = [str(k).lower() for k in adapter.get("claim_classes", [])]
        thresholds_required = bool(adapter.get("thresholds_required"))
        claim_hit = any(
            any(kw in claim.lower() for kw in claim_classes)
            for claim in claims
        ) if claims else False

        if not claim_hit:
            results.append({
                "provider_id": provider_id,
                "capability_class": adapter.get("capability_class", ""),
                "activated": False,
                "status": STATUS_NOT_SELECTED,
                "reason": "No applicable claim: provider present but no claim actually needs it (no activation)",
                "tool_path": None,
                "evidence_profile": adapter.get("evidence_profile", ""),
                "thresholds_required": thresholds_required,
                "telemetry_only": bool(adapter.get("telemetry_only")),
            })
            continue

        if thresholds_required and not any(
            kw in claim.lower() for kw in THRESHOLD_CLAIM_KEYWORDS
            for claim in claims
        ):
            results.append({
                "provider_id": provider_id,
                "capability_class": adapter.get("capability_class", ""),
                "activated": False,
                "status": STATUS_NOT_SELECTED,
                "reason": "Performance provider requires an explicit thresholds/SLO claim (e.g. p95 latency, error rate); generic performance wording never activates it",
                "tool_path": None,
                "evidence_profile": adapter.get("evidence_profile", ""),
                "thresholds_required": True,
                "telemetry_only": bool(adapter.get("telemetry_only")),
            })
            continue

        available, avail_reason = provider_available(adapter, manifests.get(provider_id, {}), availability)
        if not available:
            results.append({
                "provider_id": provider_id,
                "capability_class": adapter.get("capability_class", ""),
                "activated": True,
                "status": STATUS_UNAVAILABLE,
                "reason": adapter.get(
                    "missing_runtime_reason",
                    "provider activated by claim but runtime unavailable",
                ) + f" ({avail_reason})",
                "tool_path": None,
                "evidence_profile": adapter.get("evidence_profile", ""),
                "thresholds_required": thresholds_required,
                "telemetry_only": bool(adapter.get("telemetry_only")),
            })
            continue

        results.append({
            "provider_id": provider_id,
            "capability_class": adapter.get("capability_class", ""),
            "activated": True,
            "status": STATUS_RUNNABLE,
            "reason": avail_reason,
            "tool_path": None,
            "evidence_profile": adapter.get("evidence_profile", ""),
            "thresholds_required": thresholds_required,
            "telemetry_only": bool(adapter.get("telemetry_only")),
            "health": manifests.get(provider_id, {}).get("health", {}),
        })

    return results


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
            "verification_contract": profile.get("verification_contract", {}),
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


def terminate_process_group(proc: subprocess.Popen, grace_s: float = 5.0) -> str:
    """Terminate a timed-out provider process and its whole process group.

    POSIX: SIGTERM the process group, then SIGKILL after a short grace period,
    so children of the timed-out provider do not leak. Non-POSIX falls back to
    killing the leader. Returns a cleanup note retained in the bounded logs.
    """
    if os.name == "posix":
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            pass
        try:
            proc.wait(timeout=grace_s)
            return "process group terminated after timeout"
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                pass
    else:
        proc.kill()
    proc.wait(timeout=grace_s)
    return "process group terminated after timeout"


def run_check(root: Path, check: dict[str, Any], timeout: int = 300) -> dict[str, Any]:
    """Run a single verification check and produce structured evidence.

    Returns:
      - check_id: str
      - status: PASS | FAIL | BLOCKED | SKIPPED
      - evidence: dict with captured output, exit code, artifacts
      - skip_reason: str (when SKIPPED or BLOCKED)

    Provider processes that time out are terminated as a process group so
    children do not leak; captured output stays bounded (MAX_OUTPUT).
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

    proc: subprocess.Popen | None = None
    cleanup_note = ""
    try:
        proc = subprocess.Popen(
            command,
            cwd=root,
            shell=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf-8",
            errors="replace",
            start_new_session=True,
        )
        stdout, stderr = proc.communicate(timeout=timeout)
        output = (stdout + stderr)[-MAX_OUTPUT:]
        exit_code: int | None = proc.returncode
        expected = check.get("expected_exit_code", 0)
        status = "PASS" if proc.returncode == expected else "FAIL"
        stderr_bounded = stderr[-MAX_OUTPUT:]
    except subprocess.TimeoutExpired:
        if proc is not None:
            try:
                cleanup_note = terminate_process_group(proc)
            except Exception:  # noqa: BLE001 - cleanup must never mask the timeout evidence
                cleanup_note = "process cleanup attempted but failed"
        stdout = ""
        stderr = ""
        try:
            if proc is not None:
                stdout, stderr = proc.communicate(timeout=10)
        except (subprocess.TimeoutExpired, OSError):
            if proc is not None:
                try:
                    proc.kill()
                except OSError:
                    pass
        output = (stdout + stderr + f"\nTIMEOUT after {timeout}s ({cleanup_note})")[-MAX_OUTPUT:]
        exit_code = None
        status = "FAIL"
        stderr_bounded = stderr[-MAX_OUTPUT:]

    output_hash = hashlib.sha256(output.encode("utf-8")).hexdigest()

    evidence: dict[str, Any] = {
        "exit_code": exit_code,
        "stdout": output[-2000:],
        "stderr": stderr_bounded[-2000:],
        "output_hash": output_hash,
        "artifacts": [],
    }
    if cleanup_note:
        evidence["process_cleanup"] = cleanup_note

    return {
        "check_id": check["check_id"],
        "status": status,
        "evidence": evidence,
        "skip_reason": "",
    }


def repair_gate(attempts: int, max_attempts: int = 2) -> dict[str, Any]:
    """Bounded repair: at most two attempts per claim (REQ-019). The third
    failure is terminal and never weakens verification."""
    if not isinstance(attempts, int) or attempts < 0:
        raise AssertionError("repair attempts must be a non-negative integer")
    if not isinstance(max_attempts, int) or max_attempts < 1:
        raise AssertionError("max_attempts must be a positive integer")
    return {
        "attempts": attempts,
        "max_attempts": max_attempts,
        "may_repair": attempts < max_attempts,
        "terminal": attempts >= max_attempts,
        "proof_weakening_forbidden": True,
    }


def freshness_verdict(observed_ms_ago: float, freshness_ms: float) -> str:
    """Evidence freshness gate (REQ-019): stale evidence cannot satisfy acceptance."""
    if freshness_ms <= 0:
        return "fresh"
    return "fresh" if observed_ms_ago <= freshness_ms else "stale"


def workaround_status(expires_at: str | None, retired: bool, retirement_evidence: str | None) -> str:
    """Model/provider workaround lifecycle (REQ-019): a retired workaround is
    terminal; an unexpired active workaround stays bounded."""
    if retired:
        return "retired"
    if expires_at is None:
        return "active"
    from datetime import datetime, timezone
    try:
        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if expiry <= datetime.now(timezone.utc):
            return "expired"
    except ValueError:
        return "active"
    return "active" if retirement_evidence is None else "retired"


def summarize(selection: list[dict[str, Any]]) -> dict[str, Any]:
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

            if s in ("SKIPPED", "BLOCKED", "UNAVAILABLE") and check.get("mandatory"):
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
            c["status"] in ("BLOCKED", "UNAVAILABLE") and c.get("mandatory")
            for pr in selection for c in pr.get("checks", [])
        ),
    }


def reduce_run_results(
    selection: list[dict[str, Any]],
    run_results: list[dict[str, Any]],
) -> dict[str, Any]:
    """Reduce executed evidence, never the pre-run plan, into acceptance state.

    A selection status such as RUNNABLE only means that a check *could* run.
    It is not evidence and must not appear as a passing acceptance result.  The
    reducer joins each planned check to its actual result and fails closed when
    a required result is missing, blocked, skipped, unavailable, or failed.

    Invariants enforced here:
      - UNAVAILABLE evidence is explicit and never counts as PASS.
      - Telemetry evidence (telemetry-diagnosis) can never substitute product
        acceptance: a run whose only PASS evidence is telemetry stays non-green.
    """
    result_by_key = {
        (result.get("profile_id", ""), result.get("check_id", "")): result
        for result in run_results
    }
    total_checks = 0
    by_status: dict[str, int] = {}
    by_profile: dict[str, dict[str, int]] = {}
    skipped_reasons: list[dict[str, str]] = []
    manual_checks: list[dict[str, str]] = []
    required_failures: list[dict[str, str]] = []
    human_residuals: list[dict[str, str]] = []
    telemetry_only_evidence: list[dict[str, str]] = []
    non_telemetry_pass = False
    telemetry_pass = False
    all_pass = bool(selection)

    for profile_result in selection:
        pid = profile_result["profile_id"]
        profile_counts: dict[str, int] = {}
        contract = profile_result.get("verification_contract", {})
        for residual in contract.get("human_residuals", []):
            human_residuals.append({"profile": pid, "residual": str(residual)})
        for check in profile_result.get("checks", []):
            total_checks += 1
            key = (pid, check["check_id"])
            result = result_by_key.get(key)
            actual_status = result.get("status") if result else "MISSING"
            profile_counts[actual_status] = profile_counts.get(actual_status, 0) + 1
            by_status[actual_status] = by_status.get(actual_status, 0) + 1

            if actual_status == "PASS":
                if check.get("evidence_profile") == TELEMETRY_EVIDENCE_PROFILE:
                    telemetry_pass = True
                    telemetry_only_evidence.append({
                        "check_id": check["check_id"],
                        "profile": pid,
                        "reason": "Telemetry evidence cannot substitute product acceptance",
                    })
                else:
                    non_telemetry_pass = True

            if actual_status != "PASS":
                if check.get("mandatory"):
                    all_pass = False
                    reason = (
                        result.get("skip_reason", "") if result else "No execution result recorded"
                    ) or f"Executed check status: {actual_status}"
                    required_failures.append({
                        "check_id": check["check_id"],
                        "profile": pid,
                        "status": actual_status,
                        "reason": reason,
                    })
                elif actual_status == "FAIL":
                    all_pass = False

            if actual_status in ("SKIPPED", "BLOCKED", "UNAVAILABLE", "MISSING"):
                reason = (
                    result.get("skip_reason", "") if result else "No execution result recorded"
                ) or f"Executed check status: {actual_status}"
                skipped_reasons.append({
                    "check_id": check["check_id"],
                    "profile": pid,
                    "reason": reason,
                })
                if check.get("mandatory"):
                    manual_checks.append({
                        "check_id": check["check_id"],
                        "profile": pid,
                        "name": check.get("name", ""),
                        "reason": "Mandatory check has no passing execution evidence",
                    })

        by_profile[pid] = profile_counts

    telemetry_substitution = telemetry_pass and not non_telemetry_pass and bool(selection)

    return {
        "total_checks": total_checks,
        "by_status": by_status,
        "by_profile": by_profile,
        "all_automated_pass": all_pass and not required_failures and not telemetry_substitution,
        "skipped_checks": skipped_reasons,
        "manual_checks_remaining": manual_checks,
        "has_blocked_required_tool": any(
            failure["status"] in ("BLOCKED", "UNAVAILABLE") for failure in required_failures
        ),
        "required_failures": required_failures,
        "human_residuals": human_residuals,
        "telemetry_substitution_blocked": telemetry_substitution,
        "telemetry_only_evidence": telemetry_only_evidence,
        "phase": "ACCEPTANCE_REDUCTION",
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
    provider_results = select_providers(profiles, claims, changed_files, data.get("provider_availability"))

    evidence_profiles = load_evidence_profiles()

    return {
        "status": "VERIFICATION_PLAN",
        "profiles_count": len(selection),
        "profiles_selected": [s["profile_id"] for s in selection],
        "profile_details": selection,
        "summary": summary,
        "provider_results": provider_results,
        "providers_activated": [r["provider_id"] for r in provider_results if r["activated"]],
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
    provider_results = select_providers(profiles, claims, changed_files, data.get("provider_availability"))

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

    plan_summary = summarize(selection)
    summary = reduce_run_results(selection, run_results)

    return {
        "status": "VERIFICATION_RUN",
        "phase": "ACCEPTANCE_REDUCTION",
        "results_count": len(run_results),
        "results": run_results,
        "plan_summary": plan_summary,
        "summary": summary,
        "provider_results": provider_results,
        "providers_activated": [r["provider_id"] for r in provider_results if r["activated"]],
    }


def command_fixtures(args: argparse.Namespace) -> dict[str, Any]:
    """Deterministically exercise provider fixtures (positive/negative/unavailable).

    Each provider adapter carries one positive, one important negative, and one
    unavailable/recovery fixture. Availability is injected per fixture so the
    assertions are machine-independent: positive -> RUNNABLE, negative -> no
    activation (NOT_SELECTED), unavailable -> explicit UNAVAILABLE evidence.
    """
    profiles = load_profiles()
    adapters = profiles.get("provider_adapters", {})
    all_ids = sorted(adapters)
    failures: list[dict[str, Any]] = []
    ran = 0
    for provider_id in all_ids:
        adapter = adapters[provider_id]
        for fixture in adapter.get("fixtures", []):
            ran += 1
            # Inject availability for every adapter: fixtures are deterministic.
            availability = {other: True for other in all_ids}
            availability.update(fixture.get("availability") or {})
            results = select_providers(
                profiles,
                [fixture["claim"]],
                fixture.get("changed_files", []),
                availability,
            )
            result = next((r for r in results if r["provider_id"] == provider_id), None)
            actual = result["status"] if result else "MISSING"
            expected = fixture["expected"]
            if actual != expected:
                failures.append({
                    "provider_id": provider_id,
                    "fixture_kind": fixture["kind"],
                    "claim": fixture["claim"],
                    "expected": expected,
                    "actual": actual,
                    "reason": (result or {}).get("reason", "no result"),
                    "fixture_reason": fixture.get("reason", ""),
                })
    return {
        "status": "PROVIDER_FIXTURES",
        "fixtures_ran": ran,
        "fixtures_failed": len(failures),
        "fixtures": [
            {"provider_id": pid, "fixtures": adapters[pid].get("fixtures", [])}
            for pid in all_ids
        ],
        "failures": failures,
    }


def command_validate(args: argparse.Namespace) -> dict[str, Any]:
    """Validate provider adapter verification profiles against the JSON schema."""
    try:
        from jsonschema import ValidationError
        from jsonschema import validate as js_validate
    except ImportError:
        raise VerificationError("jsonschema required for validate (pip install jsonschema)")

    profiles = load_profiles()
    if not SCHEMA_PATH.is_file():
        raise VerificationError(f"schema not found: {SCHEMA_PATH}")
    schema = load_json(SCHEMA_PATH)
    adapters = profiles.get("provider_adapters", {})
    results: list[dict[str, Any]] = []
    for provider_id in sorted(adapters):
        vp = adapters[provider_id].get("verification_profile", {})
        try:
            js_validate(vp, schema)
            results.append({"provider_id": provider_id, "schema_valid": True})
        except ValidationError as exc:
            results.append({"provider_id": provider_id, "schema_valid": False, "error": exc.message})
    invalid = [r for r in results if not r["schema_valid"]]
    return {
        "status": "SCHEMA_VALIDATION",
        "profiles_validated": len(results),
        "invalid_count": len(invalid),
        "results": results,
        "invalid": invalid,
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

    fixtures_parser = commands.add_parser(
        "fixtures", help="Exercise provider positive/negative/unavailable fixtures deterministically"
    )

    validate_parser = commands.add_parser(
        "validate", help="Validate provider adapter verification profiles against the JSON schema"
    )

    return parser


def emit(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def main() -> int:
    args = build_parser().parse_args()
    handlers = {
        "select": command_select,
        "run": command_run,
        "fixtures": command_fixtures,
        "validate": command_validate,
    }
    try:
        emit(handlers[args.command](args))
        return 0
    except (VerificationError, OSError, json.JSONDecodeError, ValueError) as exc:
        emit({"status": "ERROR", "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
