"""Plan-level admission and Stop enforcement shared by runtime hook adapters."""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


EXECUTION_RE = re.compile(
    r"\b(implement|execute|apply\s+plan|ship\s+it|do\s+this|"
    r"làm\s+đi|làm\s+hết|làm\s+toàn\s+bộ|xử\s*lý|thực\s+thi|"
    r"triển\s+khai|hoàn\s+thành|tiếp\s+tục\s+làm|ok\s+làm)\b",
    re.I,
)
FULL_RUN_RE = re.compile(
    r"(?:\b(?:làm\s+hết|làm\s+toàn\s+bộ|xử\s*lý\s+hết|"
    r"execute\s+full\s+plan|complete\s+the\s+full\s+plan|finish\s+(?:the\s+)?(?:full|entire)\s+plan|"
    r"do\s+all|full\s+plan|one[- ]pass(?:\s+completion)?|one\s+continuous\s+(?:task|plan)|"
    r"continuous\s+(?:task|plan)|full[- ]plan\s+completion|to\s+completion)\b|"
    r"\b(?:no|without)\s+hand[- ]?off\b|\b(?:một\s+(?:task|nhiệm\s+vụ)\s+liên\s+tục|"
    r"không\s+(?:handoff|hand[- ]?off)|chạy\s+liên\s+tục\s+đến\s+PLAN_PASS)\b)",
    re.I,
)
PHASE_RE = re.compile(r"(?im)^\s{0,3}#{1,6}\s*(?:phase|step|p\d+|s\d+|checkpoint|milestone|workstream)\b")
PHASE_ITEM_RE = re.compile(
    r"(?im)^\s{0,3}#{1,6}\s*(?P<text>(?:phase|step|p\d+|s\d+|checkpoint|milestone|workstream)\b.*?)\s*$"
)
PHASE_RANGE_RE = re.compile(
    r"\b(?:phase(?:s)?|p)\s*(?P<start>\d+)\s*(?:[-\u2013\u2014]|\.\.|to)\s*(?P<end>\d+)\b", re.I
)
PHASE_SINGLE_RE = re.compile(r"\b(?:phase|p|step|s)\s*(?P<number>\d+)\b", re.I)
PLAN_HEADING_RE = re.compile(
    r"^(?:plan|phase|step|task|p\d+|s\d+|checkpoint|milestone|workstream|implementation|changes?|contract|state|cli|admission|source\s+coverage|"
    r"tests?|acceptance|rollout|scope|phạm\s+vi|mục\s+tiêu|trạng\s+thái|chuỗi\s+thực\s+thi|"
    r"qa|release|deploy(?:ment)?|blockers?|blocker|commit\s+policy|assumptions?|giả\s+định|"
    r"triển\s+khai|thay\s+đổi|kiểm\s+thử)\b",
    re.I,
)
CHECKBOX_RE = re.compile(r"^\s*[-*]\s+\[[ xX]\]\s*(?P<text>\S.*)$")
ORDERED_RE = re.compile(r"^\s*\d+[.)]\s+(?P<text>\S.*)$")
TOP_BULLET_RE = re.compile(r"^\s{0,3}[-*]\s+(?P<text>\S.*)$")
FILE_RE = re.compile(
    r"(?<![\w.-])(?:[\w.-]+[\\/])*[\w.-]+\."
    r"(?:py|ps1|sh|md|json|ya?ml|toml|ts|tsx|js|jsx|mjs|cjs|css|scss|html|sql|go|rs|java|kt|cs|cpp|c|h|txt|csv)\b",
    re.I,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_text(value: str) -> str:
    return " ".join(value.strip().split())


def text_hash(value: str) -> str:
    return hashlib.sha256(canonical_text(value).encode("utf-8")).hexdigest()


def without_code_fences(prompt: str) -> str:
    return re.sub(r"(?ms)^\s*```.*?^\s*```\s*$", "", prompt)


def actionable_items(prompt: str) -> list[str]:
    clean = without_code_fences(prompt)
    items: list[str] = []
    in_action_section = False
    for line in clean.splitlines():
        heading = re.match(r"^\s{0,3}#{1,6}\s+(?P<title>.+?)\s*$", line)
        if heading:
            in_action_section = bool(PLAN_HEADING_RE.match(canonical_text(heading.group("title"))))
            continue
        match = CHECKBOX_RE.match(line) or ORDERED_RE.match(line)
        if match is None and in_action_section:
            match = TOP_BULLET_RE.match(line)
        if match is None:
            continue
        item = canonical_text(match.group("text"))
        # Preserve repeated source lines.  Silently deduplicating them is a
        # lost-in-the-middle hole: the author may intentionally require the
        # same operation in two phases.  Admission/PAF can then classify an
        # explicit duplicate instead of losing source coverage.
        if item:
            items.append(item)
    return items


def detect_mega_plan(prompt: str) -> dict[str, Any] | None:
    clean = without_code_fences(prompt)
    if not EXECUTION_RE.search(clean):
        return None
    items = actionable_items(clean)
    phase_items = [canonical_text(match.group("text")) for match in PHASE_ITEM_RE.finditer(clean)]
    phase_count = len(phase_items)
    declared_range = None
    range_match = PHASE_RANGE_RE.search(clean)
    if range_match:
        start = int(range_match.group("start"))
        end = int(range_match.group("end"))
        if end >= start:
            declared_range = {"start": start, "end": end, "count": end - start + 1}
    actual_phase_ids: list[int] = []
    for item in phase_items:
        if PHASE_RANGE_RE.search(item):
            continue
        match = PHASE_SINGLE_RE.search(item)
        if match:
            actual_phase_ids.append(int(match.group("number")))
    actual_phase_ids = sorted(set(actual_phase_ids))
    structural_anomalies: list[str] = []
    if declared_range and len(actual_phase_ids) != declared_range["count"]:
        structural_anomalies.append(
            f"declared_phase_range_{declared_range['start']}_{declared_range['end']}_actual_{len(actual_phase_ids)}"
        )
    if actual_phase_ids and declared_range:
        expected = set(range(declared_range["start"], declared_range["end"] + 1))
        missing = sorted(expected.difference(actual_phase_ids))
        extra = sorted(set(actual_phase_ids).difference(expected))
        if missing:
            structural_anomalies.append("missing_declared_phase_ids:" + ",".join(map(str, missing)))
        if extra:
            structural_anomalies.append("unexpected_phase_ids:" + ",".join(map(str, extra)))
    file_count = len({match.group(0).casefold() for match in FILE_RE.finditer(clean)})
    full_run = bool(FULL_RUN_RE.search(clean))
    reasons = []
    if phase_count >= 2:
        reasons.append("phase_count")
    if len(items) >= 9:
        reasons.append("actionable_items")
    if file_count > 5:
        reasons.append("file_count")
    if full_run and len(items) >= 3:
        reasons.append("explicit_full_run")
    if not reasons:
        return None
    if not items:
        items = phase_items
    source_items = []
    first_by_hash: dict[str, str] = {}
    for index, item in enumerate(items, start=1):
        item_hash = text_hash(item)
        source_id = f"S{index:03d}"
        record = {
            "id": source_id,
            "ordinal": index,
            "kind": "actionable",
            "sha256": item_hash,
        }
        # Repeated source text is retained as a distinct occurrence.  The
        # admission artifact gives the PAF author a deterministic way to
        # reconcile it without silently dropping an occurrence.
        if item_hash in first_by_hash:
            record["duplicate_of"] = first_by_hash[item_hash]
        else:
            first_by_hash[item_hash] = source_id
        source_items.append(record)
    source_set_hash = hashlib.sha256(
        "|".join(f"{item['id']}:{item['sha256']}" for item in source_items).encode("utf-8")
    ).hexdigest()
    duplicate_hashes = sorted(
        hash_value
        for hash_value in {item["sha256"] for item in source_items}
        if sum(1 for item in source_items if item["sha256"] == hash_value) > 1
    )
    if duplicate_hashes:
        structural_anomalies.extend(f"duplicate_source_hash:{value}" for value in duplicate_hashes)
    return {
        "execution_mode": "continuous" if full_run else "phase",
        "reasons": reasons,
        "phase_count": phase_count,
        "declared_phase_range": declared_range,
        "actual_phase_ids": actual_phase_ids,
        "structural_anomalies": structural_anomalies,
        "file_count": file_count,
        "source_item_count": len(source_items),
        "source_set_hash": source_set_hash,
        "duplicate_source_hashes": duplicate_hashes,
        "source_items": source_items,
    }


def admission_path(workspace: Path, session_id: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", session_id)[:128] or "unknown"
    return workspace / ".agent" / "plans" / "_admission" / f"{safe}.json"


def _safe_workspace_path(workspace: Path, path: Path) -> Path:
    base = workspace.resolve()
    candidate = path.resolve()
    try:
        candidate.relative_to(base)
    except ValueError as exc:
        raise ValueError(f"plan state path escapes workspace: {candidate}") from exc
    return candidate


def write_admission(workspace: Path, session_id: str, prompt: str) -> Path | None:
    detected = detect_mega_plan(prompt)
    if not detected:
        return None
    prompt_hash = text_hash(prompt)
    admission_id = hashlib.sha256(f"{session_id}:{prompt_hash}".encode("utf-8")).hexdigest()[:20]
    record = {
        "version": 1,
        "admission_id": admission_id,
        "session_id": session_id,
        "prompt_hash": prompt_hash,
        "source_set_hash": detected.get("source_set_hash", ""),
        "execution_mode": detected["execution_mode"],
        "reasons": detected["reasons"],
        "phase_count": detected["phase_count"],
        "declared_phase_range": detected.get("declared_phase_range"),
        "actual_phase_ids": detected.get("actual_phase_ids", []),
        "structural_anomalies": detected.get("structural_anomalies", []),
        "duplicate_source_hashes": detected.get("duplicate_source_hashes", []),
        "file_count": detected["file_count"],
        "source_item_count": detected.get("source_item_count", len(detected["source_items"])),
        "source_items": detected["source_items"],
        "created_at": now_iso(),
    }
    path = admission_path(workspace, session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with _plan_lock(path):
        _atomic_write(path, record)
    return path


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise ValueError(f"expected object: {path}")
    return value


def _matching_admission(workspace: Path, session_id: str) -> tuple[Path, dict[str, Any]] | None:
    direct = admission_path(workspace, session_id)
    if direct.is_file():
        return direct, load_json(direct)
    return None


def _plan_states(workspace: Path) -> tuple[list[tuple[Path, dict[str, Any]]], list[Path]]:
    root = workspace / ".agent" / "plans"
    states: list[tuple[Path, dict[str, Any]]] = []
    corrupt: list[Path] = []
    if not root.is_dir():
        return states, corrupt
    for path in root.glob("*/state.json"):
        try:
            states.append((path, load_json(path)))
        except (OSError, ValueError, json.JSONDecodeError):
            corrupt.append(path)
    return states, corrupt


def _focused_plan_id(workspace: Path) -> str:
    focus = workspace / ".agent" / "plans" / "active-plan.json"
    try:
        value = load_json(focus) if focus.is_file() else {}
        return str(value.get("plan_id", ""))
    except (OSError, ValueError, json.JSONDecodeError):
        return ""


def _legacy_open_artifacts(workspace: Path) -> list[Path]:
    """Find legacy progress/ledger files that could otherwise bypass tracking.

    This is deliberately conservative: only well-known plan locations are
    inspected, and a file is considered open when it contains unchecked ACs or
    an explicit non-terminal status.  The guard never imports their contents;
    it only asks the agent to run ``planctl adopt`` and reconcile them.
    """
    candidates: list[Path] = []
    roots = [workspace / ".agent" / "plans", workspace / ".agent" / "ledger", workspace / ".cursor" / "plans"]
    for root in roots:
        if not root.is_dir():
            continue
        files = [p for p in root.glob("*.md") if p.is_file()]
        if root.name == "plans":
            files += [p for p in root.glob("*/progress.md") if p.is_file()]
        for path in files:
            try:
                text = path.read_text(encoding="utf-8-sig", errors="replace")[:256_000]
            except OSError:
                continue
            if re.search(r"(?im)^\s*[-*]\s+\[\s\]\s+\S|\b(?:status|state)\s*:\s*(?:READY|IN_PROGRESS|OPEN|DRAFT)\b", text):
                candidates.append(path)
    return sorted(set(candidates))


def _mark_enforcement_exhausted(admission_pair: tuple[Path, dict[str, Any]] | None, reason: str) -> None:
    if not admission_pair:
        return
    path, admission = admission_pair
    admission["enforcement_status"] = "ENFORCEMENT_EXHAUSTED"
    admission["enforcement_reason"] = reason
    _write_state(path, admission)


def _progress_token(state: dict[str, Any]) -> str:
    # Include only explicit progress markers.  Do not hash the whole state (timestamps
    # and hook bookkeeping would make every Stop look like progress), but do include
    # receipts/ledger markers so a phase that remains IN_PROGRESS can still reset the
    # anti-loop counter after real work.
    phases = [
        ":".join(
            str(item.get(key, ""))
            for key in (
                "id",
                "status",
                "contract_hash",
                "ledger_path",
                "completed_at",
                "receipt_hash",
                "evidence_hash",
                "progress_marker",
            )
        )
        for item in state.get("phases") or []
    ]
    body = "|".join(
        [
            str(state.get("plan_hash", "")),
            str(state.get("revision", "")),
            str(state.get("current_phase", "")),
            str(state.get("progress_marker", "")),
            *phases,
        ]
    )
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def _active_blockers(state: dict[str, Any]) -> list[dict[str, Any]]:
    active: list[dict[str, Any]] = []
    for item in state.get("blockers") or []:
        if not isinstance(item, dict):
            continue
        if not str(item.get("reason", "")).strip() or not str(item.get("evidence", "")).strip():
            continue
        if item.get("resolved") is True or str(item.get("resolved_at", "")).strip():
            continue
        active.append(item)
    return active


def _open_phase_ids(state: dict[str, Any]) -> list[str]:
    return [
        str(item.get("id"))
        for item in state.get("phases") or []
        if isinstance(item, dict) and str(item.get("status", "")).upper() != "DONE" and item.get("id")
    ]


def _blocked_phase_ids(state: dict[str, Any], blockers: list[dict[str, Any]] | None = None) -> set[str]:
    return {
        str(item.get("phase"))
        for item in blockers if str(item.get("phase", "")).strip()
    } if blockers is not None else {
        str(item.get("phase"))
        for item in _active_blockers(state) if str(item.get("phase", "")).strip()
    }


def _all_open_phases_blocked(state: dict[str, Any], blockers: list[dict[str, Any]] | None = None) -> bool:
    active = blockers if blockers is not None else _active_blockers(state)
    if not active:
        return False
    if any(not str(item.get("phase", "")).strip() for item in active):
        return True  # explicit plan-wide blocker (legacy states remain safe)
    open_ids = _open_phase_ids(state)
    return bool(open_ids) and set(open_ids).issubset(_blocked_phase_ids(state, active))


@contextmanager
def _plan_lock(path: Path, timeout: float = 8.0):
    """Acquire a per-plan lock without leaving partially written JSON behind."""
    lock = path.with_name(path.name + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + timeout
    handle = None
    while handle is None:
        try:
            handle = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(handle, f"{os.getpid()}:{uuid.uuid4()}\n".encode("ascii"))
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > 600:
                    lock.unlink()
                    continue
            except FileNotFoundError:
                continue
            if time.monotonic() >= deadline:
                raise TimeoutError(f"timed out acquiring plan lock: {lock}")
            time.sleep(0.05)
    try:
        yield
    finally:
        os.close(handle)
        try:
            lock.unlink()
        except FileNotFoundError:
            pass


def _atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(temp, path)
    finally:
        try:
            temp.unlink()
        except FileNotFoundError:
            pass


def _write_state(path: Path, state: dict[str, Any]) -> None:
    with _plan_lock(path):
        current_generation = 0
        if path.is_file():
            current = load_json(path)
            current_generation = int(current.get("generation", 0))
        expected = int(state.get("generation", 0))
        if expected != current_generation:
            raise RuntimeError(
                f"stale plan state generation: expected {expected}, current {current_generation}"
            )
        state["generation"] = current_generation + 1
        state["updated_at"] = now_iso()
        _atomic_write(path, state)


def evaluate_stop(workspace: Path, session_id: str, hook_state: dict[str, Any]) -> dict[str, Any]:
    try:
        admission_pair = _matching_admission(workspace, session_id)
        states, corrupt = _plan_states(workspace)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        return {"action": "allow", "reason": f"Plan guard fail-open: {exc}", "warning": True}
    admission = admission_pair[1] if admission_pair else None
    if str((admission or {}).get("enforcement_status", "")).upper() == "ENFORCEMENT_EXHAUSTED":
        return {
            "action": "allow",
            "reason": "Plan guard already exhausted; fail-open is allowed but PLAN_PASS remains forbidden.",
            "warning": True,
        }
    admission_id = str((admission or {}).get("admission_id", ""))
    matching = [(path, state) for path, state in states if admission_id and state.get("admission_id") == admission_id]
    if not admission:
        # Legacy/adopted plans may predate an admission artifact.  Track every
        # non-terminal lifecycle state so a short "continue" turn cannot bypass
        # an open plan; DONE is deliberately excluded below by the terminal check.
        active_statuses = {
            "ADMITTED",
            "READY",
            "RECONCILE_REQUIRED",
            "IN_PROGRESS",
            "READY_TO_FINALIZE",
            "BLOCKED",
            "PENDING",
        }
        matching = [(path, state) for path, state in states if str(state.get("status", "")).upper() in active_statuses]
    if corrupt and not matching:
        reason = "corrupt plan state: " + ", ".join(str(path) for path in corrupt)
        _mark_enforcement_exhausted(admission_pair, reason)
        return {
            "action": "allow",
            "reason": f"Plan guard fail-open ({reason}); ENFORCEMENT_EXHAUSTED recorded and PLAN_PASS is forbidden.",
            "warning": True,
        }
    if admission and not matching:
        return _continue_without_progress(
            hook_state,
            f"Mega-plan admission {admission_id} has no initialized PAF state; create source coverage and run planctl init before stopping.",
            admission_pair,
        )
    focused_id = _focused_plan_id(workspace)
    if focused_id and len(matching) > 1:
        focused = [(path, state) for path, state in matching if str(state.get("plan_id", "")) == focused_id]
        if focused:
            matching = focused
    if not matching:
        if not admission:
            legacy = _legacy_open_artifacts(workspace)
            if legacy:
                names = ", ".join(str(path.relative_to(workspace)) for path in legacy[:4])
                return _continue_without_progress(
                    hook_state,
                    f"Legacy open plan artifacts detected ({names}); run planctl adopt and reconcile before stopping.",
                    admission_pair,
                )
        hook_state.pop("plan_guard", None)
        return {"action": "allow", "reason": "No active tracked plan."}
    if len(matching) > 1:
        return _continue_without_progress(
            hook_state, "Multiple active plan states found; select one plan before stopping.", admission_pair
        )
    state_path, state = matching[0]
    status = str(state.get("status", "")).upper()
    if str(state.get("enforcement_status", "")).upper() == "ENFORCEMENT_EXHAUSTED":
        return {
            "action": "allow",
            "reason": "Plan guard already exhausted; fail-open is allowed but PLAN_PASS remains forbidden.",
            "warning": True,
        }
    if status == "DONE":
        hook_state.pop("plan_guard", None)
        return {"action": "allow", "reason": "PLAN_PASS state is DONE."}
    active_blockers = _active_blockers(state)
    if status == "BLOCKED" and active_blockers and _all_open_phases_blocked(state, active_blockers):
        hook_state.pop("plan_guard", None)
        return {"action": "allow", "reason": "Plan is BLOCKED with recorded evidence; no unblocked phase remains."}
    if str(state.get("execution_mode", (admission or {}).get("execution_mode", "phase"))) != "continuous":
        return {"action": "allow", "reason": "Phase-by-phase plan may stop after SLICE_PASS."}
    token = _progress_token(state)
    guard = hook_state.setdefault("plan_guard", {})
    if guard.get("progress_token") != token:
        guard["progress_token"] = token
        guard["no_progress_stops"] = 0
    guard["no_progress_stops"] = int(guard.get("no_progress_stops", 0)) + 1
    if guard["no_progress_stops"] >= 3:
        state["enforcement_status"] = "ENFORCEMENT_EXHAUSTED"
        state["enforcement_reason"] = "three consecutive Stop attempts without plan-state progress"
        _write_state(state_path, state)
        return {"action": "allow", "reason": "Plan guard fail-open after three no-progress continuations; PLAN_PASS is forbidden.", "warning": True}
    open_phases = _open_phase_ids(state)
    blocked_ids = _blocked_phase_ids(state, active_blockers)
    runnable_phases = [phase_id for phase_id in open_phases if phase_id not in blocked_ids]
    next_phase = str(state.get("current_phase") or (runnable_phases[0] if runnable_phases else (open_phases[0] if open_phases else "finalize")))
    return {
        "action": "continue",
        "reason": f"Continuous plan is {status}; next={next_phase}; open_phases={len(open_phases)}; blocked_phases={len(blocked_ids)}. Continue until planctl finalize emits PLAN_PASS.",
    }


def _continue_without_progress(
    hook_state: dict[str, Any], reason: str, admission_pair: tuple[Path, dict[str, Any]] | None = None
) -> dict[str, Any]:
    guard = hook_state.setdefault("plan_guard", {})
    guard["no_progress_stops"] = int(guard.get("no_progress_stops", 0)) + 1
    if guard["no_progress_stops"] >= 3:
        _mark_enforcement_exhausted(admission_pair, "three consecutive Stop attempts without initialized plan-state progress")
        return {"action": "allow", "reason": f"{reason} Guard exhausted; PLAN_PASS is forbidden.", "warning": True}
    return {"action": "continue", "reason": reason}
