#!/usr/bin/env python3
"""Focused contract test for the single portable model-policy source."""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "automation" / "model-policy.json"


def main() -> int:
    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    assert policy["version"] == 5
    assert set(policy["logical_classes"]) == {"utility", "economy", "standard", "expert"}

    routing = policy["routing_inputs"]
    assert "uncertainty" in routing
    assert "blast_radius" in routing
    assert "repeated_failure" in routing

    evidence = policy["evidence_contract"]
    assert set(evidence) == {"requested", "resolved", "observed", "fail_honest"}
    assert "not observed evidence" in evidence["fail_honest"]

    telemetry = policy["telemetry_contract"]
    assert telemetry["unknown_actor_outcome"] == "UNVERIFIED"
    assert telemetry["hook_error_behavior"] == "fail_open"

    platforms = policy["platforms"]
    assert set(platforms) == {"codex", "cursor", "antigravity", "grok", "opencode"}

    cdx = platforms["codex"]
    ms = cdx["adapter_defaults"]["model_selectors"]
    assert ms["standard"]["selector"] == "gpt-5.6-terra"
    assert ms["standard"]["effort"] == "medium"
    assert ms["expert"]["selector"] == "gpt-5.6-sol"
    assert ms["expert"]["effort"] == "medium"

    cursor = platforms["cursor"]
    cms = cursor["adapter_defaults"]["model_selectors"]
    assert cms["implementation"]["display"] == "Composer 2.5 Standard"
    assert cms["research_review"]["display"] == "Grok 4.5 base"
    assert cms["implementation"]["selector"] == "composer-2.5[fast=false]"
    assert "Fast" in cursor["denied_modes"]
    assert cursor["denial_behavior"] == "fail_closed"
    assert cursor["subagent_model_override"] == "supported"

    ag = platforms["antigravity"]
    agms = ag["adapter_defaults"]["model_selectors"]
    assert agms["standard"]["family"] == "Gemini"
    assert agms["standard"]["minimum_effort"] == "medium"
    assert ag["adapter_defaults"]["denied_models"] == [{"family": "Gemini", "version": "3.6", "channel": "Flash"}]
    assert ag["adapter_defaults"]["exceptional_expert"]["family"] == "Claude"
    assert ag["adapter_defaults"]["exceptional_expert"]["effort"] == "high"
    assert ag["subagent_model_override"] == "unconfirmed"

    grok = platforms["grok"]
    gms = grok["adapter_defaults"]["model_selectors"]
    assert gms["base"]["selector"] == "grok-4.5"
    assert grok["adapter_defaults"]["minimum_effort"] == "medium"
    assert "Fast" in grok["denied_modes"]
    assert grok["subagent_model_override"] == "supported"
    assert "Per-role and spawn-time effort overrides are supported" in grok["adapter_defaults"]["effort_evidence"]

    opencode = platforms["opencode"]
    assert opencode["economy"]["family"] == "user-configured"
    assert opencode["standard"]["family"] == "user-configured"
    assert opencode["expert"]["family"] == "user-configured"
    mc = opencode["mapping_contract"]
    assert mc["missing_mapping_behavior"].startswith("visible")
    assert set(mc["classes"]) == {"economy", "standard", "expert"}
    assert "requested" in opencode["recorded_evidence"]
    assert "resolved" in opencode["recorded_evidence"]
    assert "observed" in opencode["recorded_evidence"]

    assert all(
        item.get("denial_behavior") == "fail_closed"
        for item in platforms.values()
        if "denial_behavior" in item
    )

    assert "gemini" not in platforms or platforms["gemini"].get("denial_behavior") == "not_supported"
    print("PASS: model policy contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
