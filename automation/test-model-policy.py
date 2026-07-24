#!/usr/bin/env python3
"""Focused contract test for the single portable model-policy source."""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "automation" / "model-policy.json"


def main() -> int:
    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    assert policy["version"] == 1
    assert set(policy["capability_classes"]) == {"economy", "standard", "expert"}
    evidence = policy["evidence_contract"]
    assert set(evidence) == {"requested", "resolved", "observed", "fail_honest"}
    assert "not observed evidence" in evidence["fail_honest"]
    platforms = policy["platforms"]
    assert set(platforms) == {"codex", "cursor", "antigravity", "grok"}

    assert platforms["codex"]["standard"] == {"family": "Terra", "effort": "medium"}
    assert platforms["codex"]["expert"] == {"family": "Sol", "effort": "medium"}
    cursor = platforms["cursor"]
    assert cursor["implementation"]["display"] == "latest verified Composer Standard"
    assert cursor["research_review"]["display"] == "latest verified Grok base"
    assert cursor["implementation"]["selector"] == "latest_verified"
    assert {"Fast", "Auto"} <= set(cursor["denied_modes"])
    assert cursor["denial_behavior"] == "fail_closed_partial"

    antigravity = platforms["antigravity"]
    assert antigravity["standard"] == {"family": "Gemini", "channel": "Flash-to-Pro", "minimum_effort": "medium"}
    assert antigravity["denied_models"] == [{"family": "Gemini", "version": "3.6", "channel": "Flash"}]
    assert antigravity["exceptional_expert"]["family"] == "Claude"
    assert antigravity["exceptional_expert"]["effort"] == "high"
    assert antigravity["subagent_model_override"] == "unconfirmed"

    grok = platforms["grok"]
    assert grok["base"] == {"selector": "latest_verified", "channel": "base"}
    assert grok["minimum_effort"] == "medium"
    assert "Fast" in grok["denied_modes"]
    assert grok["subagent_model_override"] == "supported"
    assert grok["subagent_effort_override"] == "supported/per_role_and_spawn"
    assert "Per-role and spawn-time effort overrides are supported" in grok["effort_evidence"]
    assert "requested, resolved, and observed effort separately" in grok["effort_evidence"]
    assert "observed effort unknown" in grok["effort_evidence"]
    assert all(item["denial_behavior"] == "fail_closed_partial" for item in platforms.values() if "denial_behavior" in item)
    print("PASS: model policy contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
