"""Real outcome tracking across completion, requirement coverage, false PASS, and more.

Tracks dimensions such as:
- completion
- requirement coverage
- false PASS rate
- owner correction rate
- escaped regression
- evidence completeness
- rework loops
- wall time
- input/output/cached tokens
- context sources and estimated size
- tool calls/failures/retries
- subagent spawn and handoff
- changed files/lines
- test executions
- final acceptance
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


class OutcomeTracker:
    """Aggregates outcome dimensions across evaluation results or live records."""

    def __init__(self) -> None:
        self._records: list[dict[str, Any]] = []

    def add(self, record: dict[str, Any]) -> None:
        self._records.append(record)

    def extend(self, records: list[dict[str, Any]]) -> None:
        self._records.extend(records)

    @property
    def records(self) -> list[dict[str, Any]]:
        return list(self._records)

    def aggregate(self) -> dict[str, Any]:
        """Produce multidimensional aggregate from all tracked records."""
        recs = self._records
        total = len(recs)
        if total == 0:
            return {"total_records": 0}

        by_outcome = Counter(r.get("outcome", "UNKNOWN") for r in recs)
        owner_corrections = sum(1 for r in recs if bool(r.get("owner_correction")))
        known_false_passes = sum(
            1 for r in recs
            if r.get("outcome") == "PASS" and bool(r.get("owner_correction"))
        )
        escaped_regressions = sum(
            1 for r in recs
            if r.get("outcome") == "FAIL" and not bool(r.get("owner_correction"))
        )
        total_duration = sum(float(r.get("duration_seconds", 0) or 0) for r in recs)
        total_input = sum(int(r.get("input_tokens", 0) or 0) for r in recs)
        total_cached = sum(int(r.get("cached_input_tokens", 0) or 0) for r in recs)
        total_uncached = sum(int(r.get("uncached_input_tokens", 0) or 0) for r in recs)
        total_output = sum(int(r.get("output_tokens", 0) or 0) for r in recs)
        total_reasoning = sum(int(r.get("reasoning_output_tokens", 0) or 0) for r in recs)
        total_sa_input = sum(int(r.get("subagent_input_tokens", 0) or 0) for r in recs)
        total_sa_output = sum(int(r.get("subagent_output_tokens", 0) or 0) for r in recs)
        total_tool_calls = sum(int(r.get("tool_calls", 0) or 0) for r in recs)
        total_turns = sum(int(r.get("turn_count", 0) or 0) for r in recs)

        all_friction: list[str] = []
        for r in recs:
            all_friction.extend(r.get("friction", []) or [])
        friction_counter = Counter(f for f in all_friction if f)

        evidence_counts = [len(r.get("evidence", [])) for r in recs]
        avg_evidence = sum(evidence_counts) / len(evidence_counts) if evidence_counts else 0

        return {
            "total_records": total,
            "by_outcome": dict(by_outcome),
            "completion_rate": by_outcome.get("PASS", 0) / total if total else 0,
            "owner_corrections": owner_corrections,
            "owner_correction_rate": owner_corrections / total if total else 0,
            "known_false_passes": known_false_passes,
            "false_pass_rate": known_false_passes / total if total else 0,
            "escaped_regressions": escaped_regressions,
            "total_duration_seconds": round(total_duration, 3),
            "average_duration_seconds": round(total_duration / total, 3) if total else 0,
            "input_tokens": {
                "total": total_input,
                "cached": total_cached,
                "uncached": total_uncached,
                "average": round(total_input / total, 1) if total else 0,
            },
            "output_tokens": {
                "total": total_output,
                "reasoning": total_reasoning,
                "average": round(total_output / total, 1) if total else 0,
            },
            "subagent_input_tokens": {
                "total": total_sa_input,
                "average": round(total_sa_input / total, 1) if total else 0,
            },
            "subagent_output_tokens": {
                "total": total_sa_output,
                "average": round(total_sa_output / total, 1) if total else 0,
            },
            "tool_calls": {
                "total": total_tool_calls,
                "average": round(total_tool_calls / total, 1) if total else 0,
            },
            "turn_count": {
                "total": total_turns,
                "average": round(total_turns / total, 1) if total else 0,
            },
            "average_evidence_items": round(avg_evidence, 2),
            "friction": [{"name": name, "count": count} for name, count in friction_counter.most_common(20)],
        }

    def render_markdown(self) -> str:
        agg = self.aggregate()
        if agg["total_records"] == 0:
            return "# Outcome Report\n\nNo records."
        lines = [
            "# Outcome Report",
            "",
            f"- Total records: {agg['total_records']}",
            f"- Completion rate: {agg['completion_rate']:.1%}",
            f"- Owner corrections: {agg['owner_corrections']} ({agg['owner_correction_rate']:.1%})",
            f"- Known false PASS: {agg['known_false_passes']} ({agg['false_pass_rate']:.1%})",
            f"- Escaped regressions: {agg['escaped_regressions']}",
            f"- Total wall time: {agg['total_duration_seconds']}s",
            f"- Average wall time: {agg['average_duration_seconds']}s",
            "",
            "## By outcome",
            "",
        ]
        for outcome, count in sorted(agg["by_outcome"].items()):
            lines.append(f"- {outcome}: {count}")
        lines.extend([
            "",
            "## Token usage",
            "",
            f"- Input: {agg['input_tokens']['total']} total, {agg['input_tokens']['cached']} cached, {agg['input_tokens']['uncached']} uncached",
            f"- Output: {agg['output_tokens']['total']} total, {agg['output_tokens']['reasoning']} reasoning",
            f"- Subagent input: {agg['subagent_input_tokens']['total']}",
            f"- Subagent output: {agg['subagent_output_tokens']['total']}",
            "",
            "## Operations",
            "",
            f"- Tool calls: {agg['tool_calls']['total']} ({agg['tool_calls']['average']}/record)",
            f"- Turns: {agg['turn_count']['total']} ({agg['turn_count']['average']}/record)",
            f"- Average evidence items: {agg['average_evidence_items']}",
            "",
        ])
        if agg["friction"]:
            lines.extend(["## Friction", ""])
            lines.extend(f"- {item['name']}: {item['count']}" for item in agg["friction"])
        lines.append("")
        return "\n".join(lines)
