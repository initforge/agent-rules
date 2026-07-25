"""Export telemetry events to structured formats."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def export_jsonl(events: list[dict[str, Any]], path: str | Path) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(json.dumps(e, ensure_ascii=False, sort_keys=True) + "\n" for e in events)
    target.write_text(body, encoding="utf-8")


def export_json(events: list[dict[str, Any]], path: str | Path) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(events, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def aggregate_telemetry(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Produce aggregate statistics from telemetry events."""
    total = len(events)
    if total == 0:
        return {"total_events": 0}
    by_outcome: dict[str, int] = {}
    by_platform: dict[str, int] = {}
    by_event_type: dict[str, int] = {}
    total_input = total_output = total_cached = total_uncached = 0
    input_count = output_count = cached_count = uncached_count = 0
    subagent_spawns = 0
    tool_calls_total = 0
    for ev in events:
        o = ev.get("outcome", "UNKNOWN")
        by_outcome[o] = by_outcome.get(o, 0) + 1
        p = ev.get("platform", "unknown")
        by_platform[p] = by_platform.get(p, 0) + 1
        et = ev.get("event_type", "unknown")
        by_event_type[et] = by_event_type.get(et, 0) + 1
        gen_ai = ev.get("gen_ai") or {}
        if isinstance(gen_ai, dict):
            for key, count_key, cnt in [
                ("usage.input_tokens", "input", input_count),
                ("usage.output_tokens", "output", output_count),
                ("usage.cached_input_tokens", "cached", cached_count),
                ("usage.uncached_input_tokens", "uncached", uncached_count),
            ]:
                val = gen_ai.get(key)
                if val is not None:
                    total_input += val if key == "usage.input_tokens" else 0
                    total_output += val if key == "usage.output_tokens" else 0
                    total_cached += val if key == "usage.cached_input_tokens" else 0
                    total_uncached += val if key == "usage.uncached_input_tokens" else 0
        sa = ev.get("subagent") or {}
        if isinstance(sa, dict):
            subagent_spawns += sa.get("spawned", 0)
        for tool in ev.get("tools") or []:
            tool_calls_total += tool.get("calls", 0)
    return {
        "total_events": total,
        "by_outcome": by_outcome,
        "by_platform": by_platform,
        "by_event_type": by_event_type,
        "total_main_input_tokens": total_input,
        "total_main_output_tokens": total_output,
        "total_main_cached_input_tokens": total_cached,
        "total_main_uncached_input_tokens": total_uncached,
        "total_subagent_spawns": subagent_spawns,
        "total_tool_calls": tool_calls_total,
    }
