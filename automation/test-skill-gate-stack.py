#!/usr/bin/env python3
"""Regression: skill-gate maps live skills only (no e2e-qa / product-ui-craft)."""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "platforms" / "codex" / "scripts" / "skill-gate.py"
GRAPH = ROOT / "05-generated" / "context-graph.json"
DEAD = ("e2e-qa", "product-ui-craft")
LIVE_UI = ("qa-skills", "browser-qa")
LIVE_5FEDU = ("5fedu-module-parity",)


def load_gate():
    spec = importlib.util.spec_from_file_location("skill_gate", GATE)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    src = GATE.read_text(encoding="utf-8")
    for dead in DEAD:
        if dead in src:
            print(f"FAIL: dead skill name still in source: {dead}")
            return 1

    mod = load_gate()
    efficiency = mod.default_state("efficiency-test")
    efficiency["efficiency"].update({"tool_calls": 24, "tool_output_chars": 0})
    hint = mod.efficiency_checkpoint(efficiency)
    if not hint or "without reducing verification" not in hint:
        print(f"FAIL: efficiency checkpoint missing or unsafe: {hint}")
        return 1
    mod.reset_efficiency(efficiency, "unit_test")
    if efficiency["efficiency"]["tool_calls"] != 0 or efficiency["efficiency"]["last_reset_reason"] != "unit_test":
        print("FAIL: efficiency checkpoint did not reset at phase boundary")
        return 1
    tiny = mod.default_state("efficiency-tiny")
    mod.reset_efficiency(tiny, "unit_test", "tiny")
    tiny["efficiency"].update({"tool_calls": 999, "tool_output_chars": 999999})
    if mod.efficiency_checkpoint(tiny) is not None:
        print("FAIL: tiny work emitted an unnecessary checkpoint")
        return 1
    continuous = mod.default_state("efficiency-continuous")
    mod.reset_efficiency(continuous, "unit_test", "continuous")
    continuous["efficiency"].update({"tool_calls": 12, "tool_output_chars": 0})
    if mod.efficiency_checkpoint(continuous) is None:
        print("FAIL: continuous plan did not checkpoint early")
        return 1
    if GRAPH.is_file():
        sys.path.insert(0, str(ROOT / "platforms" / "shared" / "scripts"))
        from context_router import load_graph, route  # noqa: E402

        graph = load_graph(GRAPH)
        if route("Giải thích cách xử lý đơn giản", [], graph)["primary"] is not None:
            print("FAIL: graph assigned a capability to pure Q&A")
            return 1
        browser = route("Manual browser QA click-through", [], graph)
        if browser["primary"] != "browser-qa" or "qa-skills" not in browser["required_skills"]:
            print(f"FAIL: graph browser contract mismatch: {browser}")
            return 1
    ui_signals = mod.detect_signals("verify UI browser click-through")
    ui_stack = mod.build_stack(ui_signals)
    if not any(s in ui_stack for s in LIVE_UI):
        print(f"FAIL: UI stack missing live skills: {ui_stack}")
        return 1
    if any(s in ui_stack for s in DEAD):
        print(f"FAIL: UI stack has dead skills: {ui_stack}")
        return 1

    f_signals = mod.detect_signals("sửa module 5fedu parity drawer")
    f_stack = mod.build_stack(f_signals)
    if not any(s in f_stack for s in LIVE_5FEDU):
        print(f"FAIL: 5fedu stack missing parity: {f_stack}")
        return 1
    if any(s in f_stack for s in DEAD):
        print(f"FAIL: 5fedu stack has dead skills: {f_stack}")
        return 1

    # Precision guards: generic product work must not inherit 5fedu or
    # unrelated research/docs capabilities merely because it says "module".
    generic_signals = mod.detect_signals("refactor module thanh toán Node.js")
    generic_stack = mod.build_stack(generic_signals)
    if any(s in generic_stack for s in ("5fedu-project", "5fedu-module-parity")):
        print(f"FAIL: generic module falsely routed to 5fedu: {generic_stack}")
        return 1

    compare_signals = mod.detect_signals("so sánh hai cách đặt tên biến")
    compare_stack = mod.build_stack(compare_signals)
    if "researcher" in compare_stack:
        print(f"FAIL: generic comparison falsely routed to researcher: {compare_stack}")
        return 1

    harness_signals = mod.detect_signals("tinh gọn rules và skills của agent-rules")
    harness_stack = mod.build_stack(harness_signals)
    if "docs-style" in harness_stack or "researcher" in harness_stack:
        print(f"FAIL: harness task picked unrelated skills: {harness_stack}")
        return 1

    # Live path: UserPromptSubmit handler produces context without dead names
    payload = {
        "hookEventName": "UserPromptSubmit",
        "prompt": "verify UI browser 5fedu module",
        "session_id": "unit-test",
    }
    # exercise detect/build/primary only (no stdin)
    signals = mod.detect_signals(payload["prompt"])
    stack = mod.build_stack(signals)
    primary = mod.pick_primary(stack, signals)
    out = {"signals": signals, "stack": stack, "primary": primary}
    print(json.dumps(out, ensure_ascii=False))
    blob = json.dumps(out)
    for dead in DEAD:
        if dead in blob:
            print(f"FAIL: dead in runtime stack: {dead}")
            return 1
    if "browser-qa" not in blob and "qa-skills" not in blob:
        print("FAIL: expected browser-qa or qa-skills in combined prompt")
        return 1
    if "5fedu-module-parity" not in blob:
        print("FAIL: expected 5fedu-module-parity in combined prompt")
        return 1

    hook_src = src
    for noisy in ("Skill scan + Skill activated", "Skills active + Skill activated"):
        if noisy in hook_src:
            print(f"FAIL: visible skill ceremony remains: {noisy}")
            return 1

    print("PASS: skill-gate live stack regression")
    return 0


if __name__ == "__main__":
    sys.exit(main())
