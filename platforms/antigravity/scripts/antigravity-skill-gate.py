#!/usr/bin/env python3
"""
Antigravity skill orchestrator hook — advisory + unattended progress (fail-open).
Events via argv[1]: PreInvocation | PreToolUse | PostToolUse | Stop
Contract: https://antigravity.google/docs/hooks
"""
from __future__ import annotations

import json
import hashlib
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

MAX_STOP_CONTINUES = 15
RUNTIME_HOME = Path(
    os.environ.get("GEMINI_CONFIG_HOME")
    or os.environ.get("HARNESS_RUNTIME_HOME")
    or Path.home() / ".gemini" / "config"
)
STATE_DIR = RUNTIME_HOME / "skill-state"


def routing_mode() -> str:
    """Read the explicit cutover mode, defaulting safely to shadow."""
    raw = os.environ.get("AGENT_RULES_ROUTING_MODE")
    if raw:
        return raw.lower()
    mode_file = STATE_DIR / "routing-mode.json"
    try:
        mode = json.loads(mode_file.read_text(encoding="utf-8-sig")).get("mode", "shadow")
    except (OSError, ValueError, TypeError):
        mode = "shadow"
    return str(mode).lower() if mode else "shadow"


SCRIPT_DIR = Path(__file__).resolve().parent
for _shared in (
    SCRIPT_DIR,
    SCRIPT_DIR.parents[1] / "shared" / "scripts",
):
    if str(_shared) not in sys.path:
        sys.path.insert(0, str(_shared))
try:
    from context_router import load_graph, route as graph_route, route_signature
except ImportError:  # pragma: no cover - legacy installs use the old gate
    load_graph = graph_route = route_signature = None  # type: ignore[assignment]
try:
    from plan_guard import evaluate_stop as evaluate_plan_stop, write_admission
except ImportError:  # pragma: no cover - staged rollout keeps older runtimes usable
    evaluate_plan_stop = write_admission = None  # type: ignore[assignment]

READ_TOOLS = {"view_file"}
WRITE_TOOLS = {
    "write_to_file",
    "replace_file_content",
    "multi_replace_file_content",
}
BASH_TOOLS = {"run_command"}
DEEP_PATTERNS = re.compile(
    r"test:e2e:prod:deep|production-multi-role\.spec\.ts|production-transport-deep",
    re.I,
)
SMOKE_PATTERNS = re.compile(r"test:e2e:prod:smoke|production-full-app-smoke", re.I)
SINGLE_TEST_PATTERNS = re.compile(r"playwright\s+test\b.*(-g|--grep)", re.I)
DESTRUCTIVE_PATTERNS = re.compile(
    r"\brm\s+-[^\s]*f|\bgit\s+push\b[^\n]*--force|\bgit\s+reset\s+--hard\b",
    re.I,
)
OPEN_CHECKBOX = re.compile(r"^- \[ \]")
STALE_EVIDENCE = re.compile(r"evidence:\s*<chưa chạy>", re.I)
HARNESS_PATH_MARKERS = (
    "/rules/",
    "/skills/",
    "GEMINI.md",
    "-overlay.md",
    "/platforms/",
    "/context/5fedu/",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def record_native_receipt(event: str, cid: str) -> None:
    if os.environ.get("AGENT_RULES_ADAPTER_PROBE") == "1":
        return
    try:
        path = STATE_DIR / "hook-health.json"
        current = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        current.update({
            "platform": "antigravity",
            "status": "NATIVE_LIVE",
            "trust_state": "trusted",
            "native_receipt": {"event": event, "session_id": cid, "at": now_iso(), "script_hash": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        })
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError:
        pass


def conversation_id(payload: dict[str, Any]) -> str:
    return str(
        payload.get("conversationId")
        or os.environ.get("GEMINI_SESSION_ID")
        or "unknown"
    )


def state_path(cid: str) -> Path:
    safe = re.sub(r"[^\w.-]", "_", cid)[:128]
    return STATE_DIR / f"{safe}.json"


def default_state(cid: str) -> dict[str, Any]:
    return {
        "conversation_id": cid,
        "updated_at": now_iso(),
        "signals": [],
        "stack": [],
        "primary": None,
        "routing": {"mode": "fallback", "graph": None},
        "stop_continues": 0,
        "e2e": {
            "smoke_passed": False,
            "spec_edited_at": None,
            "single_test_passed_at": None,
            "deep_override": False,
            "deep_runs": 0,
        },
    }


def load_state(cid: str) -> dict[str, Any]:
    p = state_path(cid)
    if not p.exists():
        return default_state(cid)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        base = default_state(cid)
        base["e2e"].update(data.get("e2e") or {})
        base.update({k: v for k, v in data.items() if k != "e2e"})
        return base
    except (json.JSONDecodeError, OSError):
        return default_state(cid)


def save_state(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = now_iso()
    state_path(state["conversation_id"]).write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def emit(obj: dict[str, Any]) -> None:
    print(json.dumps(obj, ensure_ascii=False))


def fail_open(default: dict[str, Any] | None = None) -> None:
    emit(default or {})


def workspace_paths(payload: dict[str, Any]) -> list[Path]:
    out: list[Path] = []
    for raw in payload.get("workspacePaths") or []:
        try:
            out.append(Path(str(raw)))
        except (TypeError, ValueError):
            pass
    env = os.environ.get("GEMINI_PROJECT_DIR") or os.environ.get("GEMINI_CWD")
    if env:
        p = Path(env)
        if p not in out:
            out.append(p)
    return out


def graph_decision(prompt: str, paths: list[Path]) -> dict[str, Any] | None:
    if load_graph is None or graph_route is None:
        return None
    candidates = [
        RUNTIME_HOME / "context-graph.json",
        Path(__file__).resolve().parents[3] / "05-generated" / "context-graph.json",
    ]
    graph_path = next((p for p in candidates if p.is_file()), None)
    if not graph_path:
        return None
    try:
        graph = load_graph(graph_path)
        decision = graph_route(prompt, paths, graph)
        decision["graph_path"] = str(graph_path)
        return decision
    except (OSError, ValueError, json.JSONDecodeError):
        return None


def record_routing_comparison(state: dict[str, Any], legacy: dict[str, Any], graph: dict[str, Any] | None) -> None:
    if not graph:
        state["routing"] = {"mode": "fallback", "graph": None}
        return
    legacy_sig = (legacy.get("primary"), tuple(legacy.get("stack") or []), tuple())
    graph_sig = route_signature(graph) if route_signature else ()
    state["routing"] = {
        "mode": routing_mode(),
        "legacy": {"primary": legacy.get("primary"), "stack": legacy.get("stack") or []},
        "graph": {
            "primary": graph.get("primary"),
            "stack": graph.get("stack") or [],
            "required_skills": graph.get("required_skills") or [],
            "supporting_skills": graph.get("supporting_skills") or [],
            "context_nodes": graph.get("context_nodes") or [],
            "intent_signals": graph.get("intent_signals") or graph.get("signals") or [],
            "matched_phrases": graph.get("matched_phrases") or [],
            "workspace_facts": graph.get("workspace_facts") or {},
        },
        "match": legacy_sig == graph_sig,
        "graph_hash": graph.get("graph_hash"),
    }


def skill_exists(slug: str) -> bool:
    # __file__ = …/platforms/antigravity/scripts/… → parents[3] = repo root
    repo_skills = Path(__file__).resolve().parents[3] / "skills" / slug / "SKILL.md"
    candidates = [
        RUNTIME_HOME / "skills" / slug / "SKILL.md",
        repo_skills,
        Path.home() / ".grok" / "skills" / slug / "SKILL.md",
        Path.home() / ".codex" / "skills" / slug / "SKILL.md",
        Path.home() / ".gemini" / "config" / "skills" / slug / "SKILL.md",
    ]
    return any(p.is_file() for p in candidates)


def detect_signals(text: str) -> list[str]:
    rules = [
        (
            "e2e",
            r"\be2e\b|playwright|\.spec\.ts|test:e2e|browser.?qa|verify\s+ui|"
            r"click-through|exploratory|test như user|chrome-devtools",
        ),
        (
            "ui",
            r"\bui\b|giao diện|frontend|\.tsx|css|làm module|sửa module|sua module|"
            r"lam module|refactor module|\bmodule\b|parity|lệch template|drawer|toolbar|listview",
        ),
        ("research", r"research|tìm hiểu|changelog|release notes|latest|external|stuck|stall"),
        ("5fedu", r"5fedu|context/5fedu|tah-app|nostime|module-parity|nhân viên|phòng ban"),
        (
            "context-evolution",
            r"ghi nhớ|bổ sung context|sửa rule|sửa skill|dọn context|AGENTS\.md",
        ),
        ("harness", r"harness|agent-rules|validate-harness"),
        ("goal", r"/goal\b|autopilot|unattended|treo máy"),
        ("docs", r"\breadme\b|/docs/|tài liệu"),
    ]
    out: list[str] = []
    for name, pat in rules:
        if re.search(pat, text, re.I):
            out.append(name)
    return out


def _append_live(order: list[str], slug: str) -> None:
    if slug not in order and skill_exists(slug):
        order.append(slug)


def build_stack(signals: list[str]) -> list[str]:
    order: list[str] = []
    if "context-evolution" in signals:
        _append_live(order, "context-evolution-protocol")
    if "harness" in signals:
        _append_live(order, "context-evolution-protocol")
    if "5fedu" in signals:
        _append_live(order, "5fedu-project")
        if "ui" in signals or "e2e" in signals:
            _append_live(order, "5fedu-module-parity")
    if "research" in signals:
        _append_live(order, "researcher")
    if "ui" in signals:
        if "5fedu" in signals:
            _append_live(order, "5fedu-module-parity")
        else:
            _append_live(order, "frontend-architect")
    if "e2e" in signals:
        _append_live(order, "qa-skills")
        _append_live(order, "browser-qa")
    if "goal" in signals:
        _append_live(order, "plan-and-handoff")
    if "docs" in signals:
        _append_live(order, "docs-style")
    return order


def pick_primary(stack: list[str], signals: list[str]) -> str | None:
    if not stack:
        return None
    if "goal" in signals and "plan-and-handoff" in stack:
        return "plan-and-handoff"
    if "e2e" in signals:
        for pref in ("browser-qa", "qa-skills"):
            if pref in stack:
                return pref
    if "ui" in signals:
        for pref in ("5fedu-module-parity", "frontend-architect"):
            if pref in stack:
                return pref
    if "5fedu" in signals and "5fedu-module-parity" in stack:
        return "5fedu-module-parity"
    if "context-evolution" in signals:
        return "context-evolution-protocol"
    return stack[-1]


def read_transcript_user_text(transcript_path: str, tail: int = 80) -> str:
    p = Path(transcript_path.replace("~", str(Path.home())))
    if not p.is_file():
        return ""
    chunks: list[str] = []
    try:
        lines = p.read_text(encoding="utf-8", errors="replace").splitlines()[-tail:]
        for line in lines:
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            for key in ("userMessage", "prompt", "text", "content", "message"):
                val = obj.get(key)
                if isinstance(val, str) and val.strip():
                    chunks.append(val)
                    break
            role = str(obj.get("role", "")).lower()
            if role == "user":
                for key in ("content", "text", "message"):
                    val = obj.get(key)
                    if isinstance(val, str) and val.strip():
                        chunks.append(val)
    except OSError:
        return ""
    return "\n".join(chunks[-5:])


def scan_open_ledger_items(workspaces: list[Path]) -> list[str]:
    hits: list[str] = []
    for ws in workspaces:
        ledger = ws / ".agent" / "ledger"
        if not ledger.is_dir():
            continue
        for md in sorted(ledger.glob("*.md")):
            try:
                for i, line in enumerate(md.read_text(encoding="utf-8").splitlines(), 1):
                    if OPEN_CHECKBOX.search(line) or STALE_EVIDENCE.search(line):
                        hits.append(f"{md.name}:{i}: {line.strip()[:120]}")
            except OSError:
                continue
    return hits[:12]


def tool_name(payload: dict[str, Any]) -> str:
    tc = payload.get("toolCall") or {}
    return str(tc.get("name") or "")


def tool_args(payload: dict[str, Any]) -> dict[str, Any]:
    tc = payload.get("toolCall") or {}
    args = tc.get("args")
    return args if isinstance(args, dict) else {}


def extract_command(args: dict[str, Any]) -> str:
    return str(args.get("CommandLine") or args.get("command") or "")


def extract_file_path(args: dict[str, Any]) -> str:
    for key in ("TargetFile", "AbsolutePath", "DirectoryPath", "path", "file_path"):
        if args.get(key):
            return str(args[key])
    return ""


def is_harness_path(path: str) -> bool:
    norm = path.replace("\\", "/").lower()
    return any(m.lower() in norm for m in HARNESS_PATH_MARKERS)


def run_audit_on_edit(file_path: str) -> None:
    if not file_path:
        return
    audit = SCRIPT_DIR / "audit-on-edit.sh"
    if not audit.is_file():
        return
    import subprocess

    payload = json.dumps({"toolCall": {"args": {"TargetFile": file_path}}})
    try:
        subprocess.run(
            [str(audit)],
            input=payload,
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


def handle_preinvocation(payload: dict[str, Any]) -> None:
    cid = conversation_id(payload)
    st = load_state(cid)
    messages: list[str] = []

    inv = int(payload.get("invocationNum") or 0)
    transcript = str(payload.get("transcriptPath") or "")
    user_text = read_transcript_user_text(transcript)
    if user_text:
        paths = workspace_paths(payload)
        if write_admission is not None and paths:
            admission = write_admission(paths[0], cid, user_text)
            if admission is not None:
                st["plan_admission_path"] = str(admission)
                messages.append(
                    f"Mega-plan admitted at {admission}. Before edits, create exact Source coverage and init planctl state; "
                    "continuous mode may stop only after PLAN_PASS."
                )
        legacy_signals = detect_signals(user_text)
        legacy_stack = build_stack(legacy_signals)
        legacy_primary = pick_primary(legacy_stack, legacy_signals)
        legacy = {"signals": legacy_signals, "stack": legacy_stack, "primary": legacy_primary}
        graph = graph_decision(user_text, workspace_paths(payload))
        record_routing_comparison(st, legacy, graph)
        use_graph = bool(graph) and routing_mode() == "strict"
        signals = (graph or {}).get("signals", []) if use_graph else legacy_signals
        st["signals"] = signals
        st["stack"] = (graph or {}).get("stack", []) if use_graph else legacy_stack
        st["primary"] = (graph or {}).get("primary") if use_graph else legacy_primary
        save_state(st)

    if inv == 0:
        # Skill selection is handled by the native catalog. Keep this hook
        # silent unless a tool-specific guard has actionable advice.
        pass

    stack = st.get("stack") or []
    primary = st.get("primary")
    if not messages:
        fail_open()
        return

    emit({"injectSteps": [{"ephemeralMessage": " ".join(messages)}]})


def e2e_advisory(st: dict[str, Any], cmd: str) -> str | None:
    if not DEEP_PATTERNS.search(cmd):
        return None
    e2e = st["e2e"]
    if e2e.get("deep_override"):
        return None
    if not e2e.get("smoke_passed"):
        return "[E2E advisory] Chưa smoke — chạy test:e2e:prod:smoke trước deep."
    if e2e.get("deep_runs", 0) >= 3:
        return "[E2E advisory] Deep ≥3 lần — ưu tiên -g 1 test hoặc DEEP_OK."
    return None


def handle_pretooluse(payload: dict[str, Any]) -> None:
    cid = conversation_id(payload)
    st = load_state(cid)
    name = tool_name(payload)
    args = tool_args(payload)
    hints: list[str] = []

    if name in BASH_TOOLS:
        cmd = extract_command(args)
        if cmd:
            if DESTRUCTIVE_PATTERNS.search(cmd):
                hints.append(
                    "[Safety advisory] Lệnh có thể phá hủy dữ liệu — xác nhận owner trước khi chạy."
                )
            adv = e2e_advisory(st, cmd)
            if adv:
                hints.append(adv)
            if DEEP_PATTERNS.search(cmd):
                st["e2e"]["deep_runs"] = int(st["e2e"].get("deep_runs", 0)) + 1
                save_state(st)

    if hints:
        emit({"decision": "allow", "reason": " ".join(hints)})
    else:
        emit({"decision": "allow"})


def handle_posttooluse(payload: dict[str, Any]) -> None:
    cid = conversation_id(payload)
    st = load_state(cid)
    name = tool_name(payload)
    args = tool_args(payload)
    st["activity_epoch"] = int(st.get("activity_epoch", 0)) + 1
    record_native_receipt("PostToolUse", cid)

    if name in WRITE_TOOLS:
        path = extract_file_path(args)
        if path:
            run_audit_on_edit(path)
            norm = path.replace("\\", "/")
            if norm.endswith(".spec.ts") or "/playwright/" in norm:
                st["e2e"]["spec_edited_at"] = now_iso()

    if name in BASH_TOOLS:
        cmd = extract_command(args)
        err = str(payload.get("error") or "")
        ok = not err.strip()
        if ok and SMOKE_PATTERNS.search(cmd):
            st["e2e"]["smoke_passed"] = True
        if ok and SINGLE_TEST_PATTERNS.search(cmd):
            st["e2e"]["single_test_passed_at"] = now_iso()

    save_state(st)
    fail_open()


def handle_stop(payload: dict[str, Any]) -> None:
    cid = conversation_id(payload)
    st = load_state(cid)
    record_native_receipt("Stop", cid)
    reason = str(payload.get("terminationReason") or "")
    fully_idle = payload.get("fullyIdle") is True

    if not fully_idle or reason not in ("model_stop", ""):
        fail_open()
        return

    paths = workspace_paths(payload)
    if evaluate_plan_stop is not None and paths:
        decision = evaluate_plan_stop(paths[0], cid, st)
        save_state(st)
        if decision.get("action") == "continue":
            emit({"decision": "continue", "reason": str(decision.get("reason") or "Continue active plan.")})
            return
        if decision.get("warning"):
            emit({"decision": "allow", "reason": str(decision.get("reason") or "Plan enforcement exhausted; PLAN_PASS is forbidden.")})
            return

    open_items = scan_open_ledger_items(paths)
    if not open_items:
        st["stop_continues"] = 0
        save_state(st)
        fail_open()
        return

    continues = int(st.get("stop_continues") or 0) + 1
    st["stop_continues"] = continues
    save_state(st)

    if continues > MAX_STOP_CONTINUES:
        fail_open()
        return

    sample = "\n".join(f"  - {x}" for x in open_items[:5])
    msg = (
        f"[skill-gate Stop] Còn {len(open_items)} mục chưa đóng trong .agent/ledger/. "
        f"Tiếp tục execute — tick AC + chạy verify trước PASS.\n{sample}"
    )
    emit({"decision": "continue", "reason": msg})


def main() -> None:
    event = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
    if not event:
        fail_open()
        return

    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        fail_open()
        return

    key = re.sub(r"[^a-z0-9]", "", event.lower())
    handlers = {
        "preinvocation": handle_preinvocation,
        "pretooluse": handle_pretooluse,
        "posttooluse": handle_posttooluse,
        "stop": handle_stop,
    }
    for name, fn in handlers.items():
        if name in key:
            fn(payload)
            return
    fail_open()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log = STATE_DIR / "fail-open.log"
        try:
            STATE_DIR.mkdir(parents=True, exist_ok=True)
            with log.open("a", encoding="utf-8") as f:
                f.write(f"{now_iso()} fail-open: {exc!r}\n")
        except OSError:
            pass
        fail_open()
