#!/usr/bin/env python3
"""Regression for strict graph-backed live hooks and lean efficiency reminders."""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "platforms" / "codex" / "scripts" / "skill-gate.py"
ANTIGRAVITY_GATE = ROOT / "platforms" / "antigravity" / "scripts" / "antigravity-skill-gate.py"
CURSOR_GATE = ROOT / "platforms" / "cursor" / "scripts" / "cursor-hook.py"
DOCTOR = ROOT / "automation" / "09-doctor.ps1"
GRAPH = ROOT / "05-generated" / "context-graph.json"
SHARED = ROOT / "platforms" / "shared" / "scripts"
DEAD = ("e2e-qa", "product-ui-craft")


def load_gate():
    spec = importlib.util.spec_from_file_location("skill_gate", GATE)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {GATE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    codex_source = GATE.read_text(encoding="utf-8")
    antigravity_source = ANTIGRAVITY_GATE.read_text(encoding="utf-8")
    cursor_source = CURSOR_GATE.read_text(encoding="utf-8")
    for source in (codex_source, antigravity_source):
        for dead in DEAD:
            if dead in source:
                raise AssertionError(f"dead skill name still in hook source: {dead}")
        for forbidden_live_call in (
            "detect_signals(prompt)",
            "detect_signals(user_text)",
            "record_routing_comparison(",
            'routing_mode()',
        ):
            if forbidden_live_call in source:
                raise AssertionError(f"live hook still has phrase/shadow routing: {forbidden_live_call}")
    for source in (codex_source, antigravity_source, cursor_source):
        if '"NATIVE_LIVE"' in source or '"trust_state": "trusted"' in source:
            raise AssertionError("hook adapter can self-promote local observations to trusted native-live")
    doctor_source = DOCTOR.read_text(encoding="utf-8")
    if '$PlatformHomes["codex"]' not in doctor_source or '$PlatformHomes["grok"]' not in doctor_source:
        raise AssertionError("doctor ignores overridden Codex/Grok runtime homes")
    if '"NATIVE_OBSERVED"' not in doctor_source or '"unattested"' not in doctor_source:
        raise AssertionError("doctor does not preserve the native observation trust boundary")

    gate = load_gate()
    efficiency = gate.default_state("efficiency-test")
    efficiency["efficiency"].update({"tool_calls": 24, "tool_output_chars": 0})
    if not gate.efficiency_checkpoint(efficiency):
        raise AssertionError("normal work missed an efficiency checkpoint")
    gate.reset_efficiency(efficiency, "unit_test")
    if efficiency["efficiency"]["tool_calls"] != 0:
        raise AssertionError("efficiency counters did not reset")
    tiny = gate.default_state("efficiency-tiny")
    gate.reset_efficiency(tiny, "unit_test", "tiny")
    tiny["efficiency"].update({"tool_calls": 999, "tool_output_chars": 999999})
    if gate.efficiency_checkpoint(tiny) is not None:
        raise AssertionError("tiny work emitted unnecessary ceremony")

    sys.path.insert(0, str(SHARED))
    from context_router import load_graph, route  # noqa: E402

    graph = load_graph(GRAPH)
    pure = route("Giải thích cách xử lý đơn giản", [], graph)
    if pure["primary"] is not None:
        raise AssertionError(f"pure Q&A received a skill: {pure}")
    browser = route("Manual browser QA click-through", [], graph)
    if browser["primary"] != "browser-qa" or "qa-skills" not in browser["required_skills"]:
        raise AssertionError(f"browser graph contract mismatch: {browser}")
    generic = route("refactor module thanh toán Node.js", [], graph)
    if {"5fedu-project", "5fedu-module-parity"} & set(generic["stack"]):
        raise AssertionError(f"generic module falsely routed to 5fedu: {generic}")
    compare = route("so sánh hai cách đặt tên biến", [], graph)
    if "researcher" in compare["stack"]:
        raise AssertionError(f"ordinary comparison falsely routed to research: {compare}")
    harness = route("tinh gọn rules và skills của agent-rules", [ROOT], graph)
    if "context-evolution-protocol" not in harness["stack"]:
        raise AssertionError(f"harness route missed context evolution: {harness}")

    with tempfile.TemporaryDirectory(prefix="skill-gate-5fedu-") as holder:
        context = Path(holder) / "context" / "5fedu"
        context.mkdir(parents=True)
        (context / "00-context-map.md").write_text("fixture", encoding="utf-8")
        combined = route(
            "verify UI browser 5fedu module parity",
            [Path(holder)],
            graph,
        )
    blob = json.dumps(combined, ensure_ascii=False)
    if "browser-qa" not in blob or "5fedu-module-parity" not in blob:
        raise AssertionError(f"combined graph route lost required skills: {combined}")

    original_loader, original_router = gate.load_graph, gate.graph_route
    gate.load_graph = gate.graph_route = None
    try:
        if gate.graph_decision("browser QA") is not None:
            raise AssertionError("missing graph unexpectedly produced a route")
    finally:
        gate.load_graph, gate.graph_route = original_loader, original_router

    print(json.dumps({
        "primary": combined["primary"],
        "stack": combined["stack"],
        "routing": "strict-graph",
    }, ensure_ascii=False))
    print("PASS: live hooks use strict graph routing with no phrase/shadow fallback")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
