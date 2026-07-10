#!/usr/bin/env python3
"""Regression: skill-gate maps live skills only (no e2e-qa / product-ui-craft)."""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "platforms" / "codex" / "scripts" / "skill-gate.py"
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

    print("PASS: skill-gate live stack regression")
    return 0


if __name__ == "__main__":
    sys.exit(main())
