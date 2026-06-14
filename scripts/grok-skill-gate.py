#!/usr/bin/env python3
"""
Grok skill orchestrator hook — advisory + state (fail-open, never deny commands).
PreToolUse: allow always; inject E2E ladder hints when deep would be risky.
PostToolUse: track smoke/spec/deep_runs for reminders.
UserPromptSubmit / SessionStart: stack inject + anti-stuck context.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

def runtime_home() -> Path:
    for key in ("GROK_HOME", "CODEX_HOME", "HARNESS_RUNTIME_HOME"):
        val = os.environ.get(key)
        if val:
            return Path(val)
    return Path.home() / ".grok"


RUNTIME_HOME = runtime_home()
GROK_HOME = Path(os.environ.get("GROK_HOME") or RUNTIME_HOME)
STATE_DIR = RUNTIME_HOME / "skill-state"
E2E_CACHE_DIR = STATE_DIR / "e2e-cache"
E2E_CACHE_TTL_SEC = 4 * 3600
READ_TOOLS = {"read_file", "Read", "skill", "Skill"}
GIT_COMMIT_RE = re.compile(r"\bgit\b.{0,40}\bcommit\b", re.I | re.S)
DEEP_PATTERNS = re.compile(
    r"test:e2e:prod:deep|"
    r"production-multi-role\.spec\.ts.*production-transport-deep|"
    r"production-transport-deep\.spec\.ts.*production-business-coverage",
    re.I,
)
SMOKE_PATTERNS = re.compile(
    r"test:e2e:prod:smoke|production-full-app-smoke\.spec", re.I
)
SINGLE_TEST_PATTERNS = re.compile(
    r"playwright\s+test\b.*(-g|--grep)", re.I
)
SPEC_EDIT_TOOLS = {"search_replace", "Edit", "Write", "MultiEdit"}
BASH_TOOLS = {"run_terminal_command", "Bash", "Shell", "bash"}



def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def session_id_from_env(payload: dict[str, Any]) -> str:
    return (
        os.environ.get("GROK_SESSION_ID")
        or payload.get("sessionId")
        or "unknown"
    )


def state_path(sid: str) -> Path:
    safe = re.sub(r"[^\w.-]", "_", sid)[:128]
    return STATE_DIR / f"{safe}.json"


def default_state(sid: str) -> dict[str, Any]:
    return {
        "session_id": sid,
        "updated_at": now_iso(),
        "signals": [],
        "stack": [],
        "primary": None,
        "e2e": {
            "smoke_passed": False,
            "smoke_passed_at": None,
            "single_test_passed": False,
            "single_test_passed_at": None,
            "spec_edited_at": None,
            "deep_override": False,
            "deep_runs": 0,
        },
        "harness_task": False,
        "harness": {
            "files_touched": False,
            "validated": False,
            "validated_at": None,
            "validate_ok_override": False,
        },
        "skill_read_required": False,
        "skills_read": [],
    }


def load_state(sid: str) -> dict[str, Any]:
    p = state_path(sid)
    if not p.exists():
        return default_state(sid)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        base = default_state(sid)
        for key in ("e2e", "harness"):
            sub = base.get(key, {})
            if isinstance(sub, dict):
                sub.update((data.get(key) or {}))
                base[key] = sub
        base.update({k: v for k, v in data.items() if k not in ("e2e", "harness")})
        return base
    except (json.JSONDecodeError, OSError):
        return default_state(sid)


def save_state(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = now_iso()
    state_path(state["session_id"]).write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def allow() -> None:
    print(json.dumps({"decision": "allow"}))


def allow_with_hint(hint: str | None) -> None:
    if not hint:
        allow()
        return
    esc = hint.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    print(
        json.dumps(
            {"decision": "allow", "additionalContext": esc},
            ensure_ascii=False,
        )
    )


def inject_context(message: str) -> None:
    """Passive hook: inject Turn-0 / stack reminder into agent context."""
    esc = message.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    print(json.dumps({"additionalContext": esc}, ensure_ascii=False))


HARNESS_PATH_MARKERS = (
    "codex/rules/",
    "codex/skills/",
    "scripts/validate-harness",
    "scripts/grok-skill-gate",
    "grok/hooks/",
    "scripts/install-grok-global",
    "scripts/install-codex-global",
    "scripts/sync-all-harness",
)


def is_harness_path(path: str) -> bool:
    p = path.replace("\\", "/").lower()
    return any(m in p for m in HARNESS_PATH_MARKERS)


def workspace_root() -> Path | None:
    raw = (
        os.environ.get("GROK_WORKSPACE_ROOT")
        or os.environ.get("CLAUDE_PROJECT_DIR")
        or ""
    )
    if not raw:
        return None
    return Path(raw)


def is_harness_workspace() -> bool:
    root = workspace_root()
    if not root:
        return False
    return (root / "codex" / "rules" / "00-hard-activation-contract.md").is_file()


def workspace_cache_key() -> str:
    root = workspace_root()
    if not root:
        return "global"
    return hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:16]


def load_e2e_cache() -> dict[str, Any]:
    p = E2E_CACHE_DIR / f"{workspace_cache_key()}.json"
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        ts = data.get("smoke_passed_at")
        if ts:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - dt).total_seconds() > E2E_CACHE_TTL_SEC:
                return {}
        return data
    except (json.JSONDecodeError, OSError, ValueError):
        return {}


def save_e2e_cache(e2e: dict[str, Any]) -> None:
    if not e2e.get("smoke_passed"):
        return
    E2E_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    p = E2E_CACHE_DIR / f"{workspace_cache_key()}.json"
    p.write_text(
        json.dumps(
            {
                "smoke_passed": True,
                "smoke_passed_at": e2e.get("smoke_passed_at"),
                "workspace": str(workspace_root() or ""),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def apply_e2e_cache(state: dict[str, Any]) -> None:
    cache = load_e2e_cache()
    if cache.get("smoke_passed"):
        state["e2e"]["smoke_passed"] = True
        state["e2e"]["smoke_passed_at"] = cache.get("smoke_passed_at")


def skill_md_read(path: str) -> str | None:
    norm = path.replace("\\", "/")
    m = re.search(r"/skills/([^/]+)/SKILL\.md$", norm, re.I)
    if m:
        return m.group(1)
    m2 = re.search(r"\.grok/skills/([^/]+)/SKILL\.md$", norm, re.I)
    if m2:
        return m2.group(1)
    m3 = re.search(r"\.codex/skills/([^/]+)/SKILL\.md$", norm, re.I)
    return m3.group(1) if m3 else None


def extract_command(payload: dict[str, Any]) -> str:
    ti = payload.get("toolInput") or {}
    if isinstance(ti, dict):
        return str(ti.get("command") or ti.get("cmd") or "")
    return ""


def extract_file_path(payload: dict[str, Any]) -> str:
    ti = payload.get("toolInput") or {}
    if not isinstance(ti, dict):
        return ""
    for key in ("path", "file_path", "filePath", "target_file"):
        if ti.get(key):
            return str(ti[key])
    return ""


def extract_prompt(payload: dict[str, Any]) -> str:
    for key in ("prompt", "userMessage", "message", "content", "text"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return ""


def detect_signals(text: str) -> list[str]:
    t = text.lower()
    signals: list[str] = []
    rules = [
        ("e2e", r"\be2e\b|playwright|\.spec\.ts|test:e2e|kiểm thử|npm run test"),
        ("ui", r"\bui\b|giao diện|frontend|\.tsx|css|layout|component"),
        ("research", r"research|tìm hiểu|so sánh|stuck|stall"),
        ("5fedu", r"5fedu|\.agents/5fedu|tah-app|/template"),
        ("harness", r"harness|agent-rules|validate-harness|sync-all-harness|install-grok"),
        ("docs", r"\breadme\b|/docs/|tài liệu|\bspecs?\b"),
    ]
    for name, pat in rules:
        if re.search(pat, t, re.I):
            signals.append(name)
    return signals


def build_stack(signals: list[str]) -> list[str]:
    stack: list[str] = []
    if "harness" in signals:
        stack.extend(["researcher", "docs-style"])
    if "5fedu" in signals:
        stack.append("5fedu-project")
    if "research" in signals:
        stack.append("researcher")
    if "ui" in signals:
        stack.append("product-ui-craft")
    if "e2e" in signals:
        stack.append("e2e-qa")
    if "docs" in signals and "docs-style" not in stack:
        stack.append("docs-style")
    # dedupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for s in stack:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def pick_primary(stack: list[str], signals: list[str]) -> str | None:
    if not stack:
        return None
    if "e2e" in signals and "e2e-qa" in stack:
        return "e2e-qa"
    if "ui" in signals and "product-ui-craft" in stack:
        return "product-ui-craft"
    if "harness" in signals:
        return stack[-1]
    return stack[-1]


def tool_output_text(payload: dict[str, Any]) -> str:
    chunks: list[str] = []
    for key in ("toolOutput", "output", "result", "stdout", "stderr", "content"):
        val = payload.get(key)
        if isinstance(val, str):
            chunks.append(val)
        elif isinstance(val, dict):
            for k2 in ("stdout", "stderr", "content", "text", "output"):
                if val.get(k2):
                    chunks.append(str(val[k2]))
    return "\n".join(chunks)


def looks_like_test_success(output: str, exit_ok: bool = True) -> bool:
    if not output and not exit_ok:
        return False
    low = output.lower()
    if re.search(r"\b\d+\s+failed\b", low) and not re.search(r"\b0\s+failed\b", low):
        return False
    if re.search(r"(error|failed|timeout exceeded)", low) and "0 failed" not in low:
        if "passed" not in low and exit_ok is False:
            return False
    return bool(
        re.search(r"\bpassed\b|\bok\b|✓|0 failed|tests? passed", low, re.I)
        or exit_ok
    )


def handle_session_start(payload: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - 7 * 86400
    for p in STATE_DIR.glob("*.json"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except OSError:
            pass
    sid = session_id_from_env(payload)
    st = load_state(sid)
    apply_e2e_cache(st)
    save_state(st)
    parts = [
        "[skill-gate] Turn-0: Skill scan + Skill activated trong message đầu (visible).",
        "Đọc SKILL.md trước test/sửa spec (rule — không chặn lệnh).",
        "E2E anti-stuck: smoke → -g 1 test sau edit spec → deep; ≥3 deep/session → dùng -g hoặc DEEP_OK.",
    ]
    if st.get("stack"):
        parts.append(
            f"State file stack: {' → '.join(st['stack'])} | primary: {st.get('primary')}."
        )
    if st["e2e"].get("smoke_passed"):
        parts.append("E2E cache: smoke đã pass (session hoặc 4h cache workspace).")
    inject_context(" ".join(parts))


def handle_user_prompt_submit(payload: dict[str, Any]) -> None:
    sid = session_id_from_env(payload)
    st = load_state(sid)
    prompt = extract_prompt(payload)
    if prompt:
        signals = detect_signals(prompt)
        if signals:
            st["signals"] = signals
            st["stack"] = build_stack(signals)
            st["primary"] = pick_primary(st["stack"], signals)
        st["harness_task"] = "harness" in signals
        st["harness"]["task"] = st["harness_task"]
        e2e = st["e2e"]
        if re.search(r"force deep|deep_ok|bỏ qua ladder|deep cuối|full deep regression", prompt, re.I):
            e2e["deep_override"] = True
        if re.search(r"smoke trước|chạy smoke|test:e2e:prod:smoke", prompt, re.I):
            e2e["deep_override"] = False
        if re.search(r"validate_ok|harness_ok|đã validate", prompt, re.I):
            st["harness"]["validate_ok_override"] = True
            st["harness"]["validated"] = True
            st["harness"]["validated_at"] = now_iso()
        if st.get("stack"):
            st["skill_read_required"] = True
            st["skills_read"] = []
    apply_e2e_cache(st)
    save_state(st)
    stack = st.get("stack") or []
    primary = st.get("primary")
    hints: list[str] = []
    if stack:
        hints.append(
            f"[skill-gate] Signals: {', '.join(st.get('signals', []))}. "
            f"Skill stack: {' → '.join(stack)}. Primary: {primary}. "
            f"Đọc ~/.grok/skills/{primary}/SKILL.md trước test/sửa spec. "
            "Message đầu: Skill scan + Skills active + Skill activated."
        )
    if "e2e" in st.get("signals", []):
        hints.append(e2e_session_reminder(st))
    if hints:
        inject_context(" ".join(h for h in hints if h))
    else:
        allow()


def e2e_ladder_advisory(state: dict[str, Any], command: str) -> str | None:
    """Advisory only — PreToolUse never denies."""
    if os.environ.get("GROK_SKILL_GATE_DISABLE") == "1":
        return None
    if not DEEP_PATTERNS.search(command):
        return None
    e2e = state["e2e"]
    if e2e.get("deep_override"):
        return None
    if not e2e.get("smoke_passed"):
        return (
            "[E2E advisory] Chưa smoke session — nên chạy "
            "`npm run test:e2e:prod:smoke` trước `test:e2e:prod:deep` (anti-stuck)."
        )
    spec_at = e2e.get("spec_edited_at")
    single_at = e2e.get("single_test_passed_at")
    if spec_at and (not single_at or single_at < spec_at):
        return (
            "[E2E advisory] Vừa sửa *.spec.ts — nên `npx playwright test <file> -g \"<name>\"` "
            "trước deep."
        )
    if e2e.get("deep_runs", 0) >= 3:
        return (
            "[E2E advisory] Deep ≥3 lần/session — ưu tiên `-g` 1 test; "
            "hoặc `DEEP_OK` nếu cố ý full regression."
        )
    return None


def e2e_session_reminder(state: dict[str, Any]) -> str:
    e2e = state.get("e2e") or {}
    parts: list[str] = []
    if not e2e.get("smoke_passed"):
        parts.append("chưa smoke")
    spec_at = e2e.get("spec_edited_at")
    single_at = e2e.get("single_test_passed_at")
    if spec_at and (not single_at or single_at < spec_at):
        parts.append("spec vừa sửa — cần -g 1 test")
    if e2e.get("deep_runs", 0) >= 2:
        parts.append(f"deep_runs={e2e.get('deep_runs')}")
    if not parts:
        return "E2E state OK — vẫn ưu tiên -g sau mỗi sửa spec nhỏ."
    return "E2E anti-stuck: " + "; ".join(parts) + "."


def harness_commit_advisory(state: dict[str, Any], command: str) -> str | None:
    if not is_harness_workspace() or not GIT_COMMIT_RE.search(command):
        return None
    h = state.get("harness") or {}
    if not h.get("files_touched") or h.get("validated") or h.get("validate_ok_override"):
        return None
    return (
        "[Harness advisory] Đã sửa rules/skills/hooks — nên "
        "`bash scripts/validate-harness.sh` trước commit."
    )


def handle_pre_tool_use(payload: dict[str, Any]) -> None:
    tool = payload.get("toolName") or ""
    sid = session_id_from_env(payload)
    st = load_state(sid)
    hints: list[str] = []
    if tool in BASH_TOOLS:
        cmd = extract_command(payload)
        if cmd:
            adv = e2e_ladder_advisory(st, cmd)
            if adv:
                hints.append(adv)
            hadv = harness_commit_advisory(st, cmd)
            if hadv:
                hints.append(hadv)
            if DEEP_PATTERNS.search(cmd):
                st["e2e"]["deep_runs"] = int(st["e2e"].get("deep_runs", 0)) + 1
                save_state(st)
    allow_with_hint(" ".join(hints) if hints else None)


def handle_post_tool_use(payload: dict[str, Any]) -> None:
    sid = session_id_from_env(payload)
    st = load_state(sid)
    tool = payload.get("toolName") or ""
    out = tool_output_text(payload)
    exit_ok = payload.get("toolSuccess", True) is not False

    if tool in READ_TOOLS:
        path = extract_file_path(payload)
        if path:
            skill = skill_md_read(path)
            if skill:
                read_list = st.setdefault("skills_read", [])
                if skill not in read_list:
                    read_list.append(skill)
                stack = st.get("stack") or []
                primary = st.get("primary")
                needed = {primary} if primary else set(stack)
                if not needed or needed.issubset(set(read_list)):
                    st["skill_read_required"] = False

    if tool in SPEC_EDIT_TOOLS:
        path = extract_file_path(payload)
        norm = path.replace("\\", "/")
        if path.endswith(".spec.ts") or "/playwright/" in norm:
            st["e2e"]["spec_edited_at"] = now_iso()
            st["e2e"]["single_test_passed"] = False
            st["e2e"]["single_test_passed_at"] = None
        if is_harness_path(norm):
            st["harness"]["files_touched"] = True
            st["harness_task"] = True

    if tool in BASH_TOOLS:
        cmd = extract_command(payload)
        if cmd and re.search(r"validate-harness(-behaviors)?\.sh", cmd) and looks_like_test_success(out, exit_ok):
            st["harness"]["validated"] = True
            st["harness"]["validated_at"] = now_iso()
        if cmd and SMOKE_PATTERNS.search(cmd) and looks_like_test_success(out, exit_ok):
            st["e2e"]["smoke_passed"] = True
            st["e2e"]["smoke_passed_at"] = now_iso()
            save_e2e_cache(st["e2e"])
        if cmd and SINGLE_TEST_PATTERNS.search(cmd) and looks_like_test_success(out, exit_ok):
            st["e2e"]["single_test_passed"] = True
            st["e2e"]["single_test_passed_at"] = now_iso()
        if cmd and DEEP_PATTERNS.search(cmd) and looks_like_test_success(out, exit_ok):
            st["e2e"]["deep_override"] = False

    save_state(st)
    allow()


def handle_stop(payload: dict[str, Any]) -> None:
    sid = session_id_from_env(payload)
    st = load_state(sid)
    if st.get("harness_task"):
        log = RUNTIME_HOME / "skill-state" / "harness-reminders.log"
        try:
            with log.open("a", encoding="utf-8") as f:
                f.write(
                    f"{now_iso()} session={sid} "
                    "reminder: run scripts/validate-harness.sh before PASS\n"
                )
        except OSError:
            pass
    allow()


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        allow()
        return

    event = (
        os.environ.get("GROK_HOOK_EVENT")
        or payload.get("hookEventName")
        or ""
    ).lower().replace("-", "_")

    handlers = {
        "session_start": handle_session_start,
        "user_prompt_submit": handle_user_prompt_submit,
        "pre_tool_use": handle_pre_tool_use,
        "post_tool_use": handle_post_tool_use,
        "stop": handle_stop,
        "session_end": lambda p: allow(),
    }

    for key, fn in handlers.items():
        if key in event:
            fn(payload)
            return
    allow()


def log_fail_open(exc: BaseException) -> None:
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        log = STATE_DIR / "fail-open.log"
        with log.open("a", encoding="utf-8") as f:
            f.write(f"{now_iso()} fail-open: {exc!r}\n")
    except OSError:
        pass


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # fail-open per Grok hooks spec
        log_fail_open(exc)
        print(json.dumps({"decision": "allow", "note": f"skill-gate fail-open: {exc}"}))
        sys.exit(0)