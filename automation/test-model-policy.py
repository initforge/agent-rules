#!/usr/bin/env python3
"""Focused contract test for the portable model-policy source with capability/risk routing."""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "automation" / "model-policy.json"


def main() -> int:
    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    assert policy["version"] == 5

    # Logical classes
    classes = set(policy["logical_classes"])
    assert classes == {"utility", "economy", "standard", "expert"}, f"Got {classes}"
    assert "Deterministic commands" in policy["logical_classes"]["utility"]
    assert "retrieval" in policy["logical_classes"]["economy"].lower()
    assert "ordinary implementation" in policy["logical_classes"]["standard"].lower()
    assert "unresolved risk" in policy["logical_classes"]["expert"]

    # Routing inputs
    inputs = set(policy["routing_inputs"])
    for required in {"uncertainty", "dependency_breadth", "shared_contract_changes",
                     "blast_radius", "reversibility", "security_and_data_risk",
                     "cross_layer_state", "architecture_ambiguity", "proof_difficulty",
                     "repeated_failure", "user_model_override"}:
        assert required in inputs, f"Missing routing input: {required}"

    # Role defaults
    roles = set(policy["role_defaults"])
    for required in {"command_search_inventory", "bounded_mechanical_implementation",
                     "normal_feature_implementation", "architecture_shared_contract_integration",
                     "security_migration_concurrency_review", "deterministic_verifier",
                     "vision_dependent_parity_review"}:
        assert required in roles, f"Missing role default: {required}"

    assert policy["role_defaults"]["command_search_inventory"] == "utility"
    assert policy["role_defaults"]["bounded_mechanical_implementation"] == "economy"
    assert policy["role_defaults"]["normal_feature_implementation"] == "standard"
    assert policy["role_defaults"]["architecture_shared_contract_integration"] == "expert"

    # Escalation policy
    assert "triggers" in policy["escalation_policy"]
    triggers = policy["escalation_policy"]["triggers"]
    assert len(triggers) >= 8
    assert "uncertainty rated high" in triggers
    assert "repeated failure count >= 2" in triggers
    assert policy["escalation_policy"]["cost_savings_cannot_override_capability"] is True
    assert "error, not silent fallback" in policy["escalation_policy"]["unmapped_class_behavior"]
    assert "UNVERIFIED" in policy["escalation_policy"]["unverified_behavior"]

    # Evidence contract
    evidence = policy["evidence_contract"]
    assert set(evidence) == {"requested", "resolved", "observed", "fail_honest"}
    assert "not observed evidence" in evidence["fail_honest"]
    assert "config file" in evidence["fail_honest"]

    # Telemetry contract
    telemetry = policy["telemetry_contract"]
    assert "logical_class" in telemetry["event_fields"]
    assert "requested_class" in telemetry["event_fields"]
    assert "resolved_model" in telemetry["event_fields"]
    assert "attestation_status" in telemetry["event_fields"]
    assert "escalation_reason" in telemetry["event_fields"]
    assert "fallback_reason" in telemetry["event_fields"]
    assert telemetry["actors"] == ["main", "worker", "unknown"]
    assert telemetry["unknown_actor_outcome"] == "UNVERIFIED"
    assert telemetry["hook_error_behavior"] == "fail_open"

    # Platform sections use capability-class keys
    platforms = policy["platforms"]
    assert set(platforms) == {"codex", "cursor", "antigravity", "grok"}

    for name, plat in platforms.items():
        assert "capabilities" in plat, f"{name} missing capabilities"
        assert "denial_behavior" in plat, f"{name} missing denial_behavior"
        assert "subagent_model_override" in plat, f"{name} missing subagent_model_override"
        assert "model_attestation" in plat, f"{name} missing model_attestation"

    # Each platform has at least one capability
    for name, plat in platforms.items():
        caps = plat["capabilities"]
        assert len(caps) >= 1, f"{name} has no capabilities"
        for cname, cval in caps.items():
            assert "effort" in cval, f"{name}.{cname} missing effort"

    # Codex has economy, standard, expert
    assert "economy" in platforms["codex"]["capabilities"]
    assert "standard" in platforms["codex"]["capabilities"]
    assert "expert" in platforms["codex"]["capabilities"]

    # Cursor denied modes
    assert {"Fast", "Auto"} <= set(platforms["cursor"]["denied_modes"])
    assert platforms["cursor"]["denial_behavior"] == "fail_closed_partial"

    # Antigravity denied models
    ant = platforms["antigravity"]
    assert ant["adapter_defaults"]["denied_models"] == [{"family": "Gemini", "version": "3.6", "channel": "Flash"}]

    # Grok effort evidence
    grok = platforms["grok"]
    assert "Fast" in grok["denied_modes"]
    assert "requested, resolved, and observed effort separately" in grok["adapter_defaults"]["effort_evidence"]

    # All platforms have consistent denial_behavior
    assert all(p["denial_behavior"] == "fail_closed_partial" for p in platforms.values())

    print("PASS: model policy contract (v5 capability/risk routing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
