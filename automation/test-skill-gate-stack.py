#!/usr/bin/env python3
"""Regression for strict graph-backed live hooks and lean efficiency reminders."""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "platforms" / "codex" / "scripts" / "skill-gate.py"
ANTIGRAVITY_GATE = ROOT / "platforms" / "antigravity" / "scripts" / "antigravity-skill-gate.py"
CURSOR_GATE = ROOT / "platforms" / "cursor" / "scripts" / "cursor-hook.py"
DOCTOR = ROOT / "automation" / "09-doctor.ps1"
GRAPH = ROOT / "generated" / "context-graph.json"
SHARED = ROOT / "platforms" / "shared" / "scripts"
OPENCODE_PROBE = ROOT / "platforms" / "opencode" / "scripts" / "adapter-probe.py"
DEAD = ("e2e-qa", "product-ui-craft")
MANAGED_LEAN_PACK = {
    "README.md": "profiles/5fedu/README.md",
    "behaviors/activation.md": "profiles/5fedu/behaviors/activation.md",
    "rules/business.md": "profiles/5fedu/rules/business.md",
    "rules/data-auth.md": "profiles/5fedu/rules/data-auth.md",
    "rules/permissions.md": "profiles/5fedu/rules/permissions.md",
    "module-mapping/modules.yaml": "profiles/5fedu/module-mapping/modules.yaml",
    "module-mapping/ui-contracts.md": "profiles/5fedu/module-mapping/ui-contracts.md",
}


def load_gate():
    spec = importlib.util.spec_from_file_location("skill_gate", GATE)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {GATE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_opencode_probe():
    spec = importlib.util.spec_from_file_location("opencode_adapter_probe", OPENCODE_PROBE)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {OPENCODE_PROBE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def materialize_lean_pack(workspace: Path) -> None:
    for relative, source in MANAGED_LEAN_PACK.items():
        target = workspace / "context" / "5fedu" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / source, target)


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

    # REQ-017: PreToolUse returns deny/ask/force_ask per the execution policy
    # instead of always allowing; without a policy it stays advisory-only.
    os.environ.pop("AGENT_RULES_EXECUTION_POLICY", None)
    if gate.pre_tool_policy_decision("npm run test", "Bash") is not None:
        raise AssertionError("PreToolUse must remain advisory without an execution policy")
    os.environ["AGENT_RULES_EXECUTION_POLICY"] = json.dumps({
        "pre_tool": {"mode": "deny", "deny_patterns": [r"git push|npm publish"]},
    })
    deny = gate.pre_tool_policy_decision("git push origin main", "Bash")
    if deny is None:
        raise AssertionError("deny policy did not produce a decision")
    import contextlib
    import io
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        deny()
    if "block" not in buf.getvalue():
        raise AssertionError(f"deny decision did not block: {buf.getvalue()}")
    if gate.pre_tool_policy_decision("npm test", "Bash") is not None:
        raise AssertionError("non-matching command should not block under deny mode")
    os.environ["AGENT_RULES_EXECUTION_POLICY"] = json.dumps({
        "pre_tool": {"mode": "ask", "deny_patterns": [r"git push"]},
    })
    ask = gate.pre_tool_policy_decision("git push", "Bash")
    buf2 = io.StringIO()
    with contextlib.redirect_stdout(buf2):
        ask()
    if "ask" not in buf2.getvalue().lower():
        raise AssertionError(f"ask decision did not surface ask: {buf2.getvalue()}")
    os.environ["AGENT_RULES_EXECUTION_POLICY"] = json.dumps({
        "pre_tool": {"mode": "allow", "deny_patterns": [r"git push"]},
    })
    if gate.pre_tool_policy_decision("git push", "Bash") is not None:
        raise AssertionError("allow mode must never block")
    os.environ.pop("AGENT_RULES_EXECUTION_POLICY", None)

    sys.path.insert(0, str(SHARED))
    from context_router import load_graph, route  # noqa: E402

    graph = load_graph(GRAPH)
    if any(str(node.get("source", "")).startswith("skills/ui-taste/references/upstream/") for node in graph["nodes"]):
        raise AssertionError("pinned ui-taste upstream pack leaked into graph routing or token accounting")
    pure = route("Giải thích cách xử lý đơn giản", [], graph)
    if pure["primary"] is not None:
        raise AssertionError(f"pure Q&A received a skill: {pure}")
    browser = route("Manual browser QA click-through", [], graph)
    if browser["primary"] != "browser-qa" or "qa-skills" in browser["required_skills"]:
        raise AssertionError(f"browser graph contract mismatch (qa-skills must be conditional, not required): {browser}")
    generic = route("refactor module thanh toán Node.js", [], graph)
    if {"5fedu-project", "5fedu-module-parity"} & set(generic["stack"]):
        raise AssertionError(f"generic module falsely routed to 5fedu: {generic}")
    compare = route("so sánh hai cách đặt tên biến", [], graph)
    if "researcher" in compare["stack"]:
        raise AssertionError(f"ordinary comparison falsely routed to research: {compare}")
    harness = route("tinh gọn rules và skills của agent-rules", [ROOT], graph)
    if "context-evolution-protocol" not in harness["stack"]:
        raise AssertionError(f"harness route missed context evolution: {harness}")
    broad_ui = route("frontend UI/UX redesign", [], graph)
    if (
        broad_ui["primary"] != "frontend-architect"
        or broad_ui["supporting_skills"] != ["ui-taste"]
        or broad_ui["selected_reference"].get("original_path") != "redesign-skill/SKILL.md"
        or any("upstream" in skill for skill in broad_ui["stack"])
    ):
        raise AssertionError(f"explicit frontend direction did not add one taste lens: {broad_ui}")
    control_plane = route("Apple-inspired Control Plane UI", [ROOT], graph)
    if control_plane["primary"] != "ui-taste":
        raise AssertionError(f"Control Plane taste precedence mismatch: {control_plane}")
    explicit_taste = route("Minimalist Control Plane UI", [ROOT], graph)
    reference = explicit_taste["selected_reference"]
    if (
        explicit_taste["primary"] != "ui-taste"
        or not isinstance(reference, dict)
        or reference.get("original_path") != "minimalist-skill/SKILL.md"
        or reference.get("packaged_path") != "minimalist-skill/SKILL.md.source"
        or explicit_taste["reference_token_charge"] != reference.get("token_charge")
        or explicit_taste["reference_token_charge"] <= 0
    ):
        raise AssertionError(f"explicit ui-taste reference selection mismatch: {explicit_taste}")
    ambiguous_taste = route("Minimalist brutalist Control Plane UI", [ROOT], graph)
    if ambiguous_taste["selected_reference"] is not None or ambiguous_taste["reference_token_charge"] != 0:
        raise AssertionError(f"ambiguous taste directions must not select a reference: {ambiguous_taste}")
    unknown_taste = route("Art deco Control Plane UI", [ROOT], graph)
    if unknown_taste["selected_reference"] is not None or unknown_taste["reference_token_charge"] != 0:
        raise AssertionError(f"unknown taste direction must not select a reference: {unknown_taste}")

    with tempfile.TemporaryDirectory(prefix="skill-gate-5fedu-") as holder:
        workspace = Path(holder)
        materialize_lean_pack(workspace)
        combined = route(
            "verify UI browser 5fedu module parity",
            [workspace],
            graph,
        )
        taste_review = route(
            "Sửa drawer module 5fedu và thực hiện taste review theo phong cách minimalist",
            [workspace],
            graph,
        )
        payload_workspace = gate.payload_workspace({"cwd": str(workspace)})
        payload_route = gate.graph_decision("Sửa module 5fedu lệch pattern drawer", payload_workspace)
        inactive_route = gate.graph_decision("Sửa module 5fedu lệch pattern drawer", Path(holder) / "missing")
        previous_root = os.environ.get("CODEX_WORKSPACE_ROOT")
        os.environ["CODEX_WORKSPACE_ROOT"] = str(workspace)
        try:
            if gate.payload_workspace({"cwd": str(Path(holder) / "missing")}) != workspace:
                raise AssertionError("invalid payload cwd did not retain environment-root compatibility")
            for relative_root in (".", "platforms/codex"):
                if gate.valid_payload_workspace(relative_root) is not None:
                    raise AssertionError(f"relative payload workspace was accepted: {relative_root}")
                if gate.payload_workspace({"cwd": relative_root}) != workspace:
                    raise AssertionError(
                        f"relative payload workspace did not fall back to the environment root: {relative_root}"
                    )
            symlink_root = Path(holder) / "workspace-link"
            symlink_supported = True
            try:
                symlink_root.symlink_to(workspace, target_is_directory=True)
            except OSError:
                symlink_supported = False
            if symlink_supported:
                if gate.valid_payload_workspace(str(symlink_root)) is not None:
                    raise AssertionError("symlink payload workspace was accepted")
                if gate.payload_workspace({"cwd": str(symlink_root)}) != workspace:
                    raise AssertionError("symlink payload workspace did not retain environment-root compatibility")
            if (gate.graph_decision("Sửa module 5fedu lệch pattern drawer") or {}).get("primary") != "5fedu-module-parity":
                raise AssertionError("environment workspace root no longer routes a canonical pack")
        finally:
            if previous_root is None:
                os.environ.pop("CODEX_WORKSPACE_ROOT", None)
            else:
                os.environ["CODEX_WORKSPACE_ROOT"] = previous_root
    if payload_workspace != workspace or (payload_route or {}).get("primary") != "5fedu-module-parity":
        raise AssertionError(f"Codex payload workspace was not routed: {payload_route}")
    if (inactive_route or {}).get("primary") is not None:
        raise AssertionError(f"prompt text activated 5fedu without context: {inactive_route}")
    with tempfile.TemporaryDirectory(prefix="skill-gate-payload-") as holder:
        payload_root = Path(holder)
        captured: list[Path | None] = []
        original_graph_decision = gate.graph_decision
        original_load_state, original_save_state = gate.load_state, gate.save_state
        original_receipt, original_cache, original_allow = gate.record_native_receipt, gate.apply_e2e_cache, gate.allow
        try:
            gate.graph_decision = lambda prompt, workspace=None: captured.append(workspace) or {"signals": [], "stack": [], "primary": None}
            gate.load_state = lambda sid: gate.default_state(sid)
            gate.save_state = gate.record_native_receipt = gate.apply_e2e_cache = gate.allow = lambda *args, **kwargs: None
            gate.handle_user_prompt_submit({"prompt": "5fedu", "cwd": str(payload_root), "sessionId": "payload-workspace"})
        finally:
            gate.graph_decision = original_graph_decision
            gate.load_state, gate.save_state = original_load_state, original_save_state
            gate.record_native_receipt, gate.apply_e2e_cache, gate.allow = original_receipt, original_cache, original_allow
        if captured != [payload_root]:
            raise AssertionError(f"Codex handler ignored payload workspace: {captured}")
    blob = json.dumps(combined, ensure_ascii=False)
    # AM-0002/invariant 16: generic words like "browser" alone no longer load
    # browser-qa; a 5fedu parity task keeps the profile procedure only.
    if "5fedu-module-parity" not in blob:
        raise AssertionError(f"combined graph route lost required skills: {combined}")
    if "ui-taste" in combined["stack"]:
        raise AssertionError(f"5fedu parity must not auto-load ui-taste: {combined}")
    if (
        taste_review["primary"] != "5fedu-module-parity"
        or taste_review["supporting_skills"][-1:] != ["ui-taste"]
        or taste_review["stack"][-1:] != ["ui-taste"]
        or taste_review["selected_reference"].get("original_path") != "minimalist-skill/SKILL.md"
    ):
        raise AssertionError(f"explicit 5fedu taste review did not preserve parity precedence: {taste_review}")

    with tempfile.TemporaryDirectory(prefix="skill-gate-invalid-taste-lock-") as holder:
        workspace = Path(holder)
        lock = workspace / "skills" / "ui-taste" / "references" / "upstream-lock.json"
        lock.parent.mkdir(parents=True)
        lock.write_text(json.dumps({"content": {"packaged_paths": {
            "minimalist-skill/SKILL.md": "../escape/SKILL.md.source",
        }}}), encoding="utf-8")
        unsafe = route("Minimalist Control Plane UI", [workspace], graph)
        if unsafe["selected_reference"] is not None or unsafe["reference_token_charge"] != 0:
            raise AssertionError(f"unsafe taste lock path must not fall through: {unsafe}")

    with tempfile.TemporaryDirectory(prefix="skill-gate-tampered-taste-lock-") as holder:
        workspace = Path(holder)
        references = workspace / "skills" / "ui-taste" / "references"
        source = references / "upstream" / "minimalist-skill" / "SKILL.md.source"
        source.parent.mkdir(parents=True)
        source.write_text("tampered", encoding="utf-8")
        (references / "upstream-lock.json").write_text(json.dumps({"content": {
            "packaged_paths": {
                "minimalist-skill/SKILL.md": "minimalist-skill/SKILL.md.source",
            },
            "files": {
                "minimalist-skill/SKILL.md": "0" * 64,
            },
        }}), encoding="utf-8")
        tampered = route("Minimalist Control Plane UI", [workspace], graph)
        if tampered["selected_reference"] is not None or tampered["reference_token_charge"] != 0:
            raise AssertionError(f"tampered taste source must fail closed: {tampered}")

    opencode_probe = load_opencode_probe()
    if "import yaml" in OPENCODE_PROBE.read_text(encoding="utf-8").lower():
        raise AssertionError("OpenCode probe must not depend on PyYAML")
    with tempfile.TemporaryDirectory(prefix="opencode-public-skills-") as holder:
        skills = Path(holder) / "skills"
        (skills / "ui-taste" / "references" / "upstream" / "nested").mkdir(parents=True)
        (skills / "ui-taste" / "SKILL.md").write_text("public", encoding="utf-8")
        (skills / "ui-taste" / "references" / "upstream" / "nested" / "SKILL.md").write_text("hidden", encoding="utf-8")
        public = opencode_probe.discover_public_skills(skills)
        if [path.name for path in public] != ["ui-taste"]:
            raise AssertionError(f"OpenCode probe discovered nested reference as public skill: {public}")
        agent = Path(holder) / "agent.md"
        agent.write_text("---\nname: test\npermission:\n  edit: allow\n---\n", encoding="utf-8")
        parsed = opencode_probe.try_load_frontmatter_metadata(agent)
        if not parsed or "permission" not in parsed:
            raise AssertionError("OpenCode compact frontmatter parser lost permission metadata")

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
