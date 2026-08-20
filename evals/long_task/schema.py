"""Schema for long-task evaluation results."""
from __future__ import annotations

LONG_TASK_RESULT_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://initforge.github.io/agent-rules/long-task-result.schema.json",
    "title": "Long-task evaluation result (SS-15 / R-027)",
    "type": "object",
    "required": [
        "run_id", "case_id", "variant", "plan_files",
        "defects_seeded", "defects_found", "defects_repaired",
        "verification_passed", "checkpoint_resume_ok", "outcome", "ts"
    ],
    "properties": {
        "run_id": {"type": "string", "minLength": 1},
        "case_id": {"type": "string", "minLength": 1},
        "variant": {"type": "string"},
        "plan_files": {"type": "integer", "minimum": 10},
        "defects_seeded": {"type": "integer", "minimum": 0},
        "defects_found": {"type": "integer", "minimum": 0},
        "defects_repaired": {"type": "integer", "minimum": 0},
        "verification_passed": {"type": "boolean"},
        "checkpoint_resume_ok": {"type": "boolean"},
        "duration_ms": {"type": "integer", "minimum": 0},
        "ts": {"type": "string", "format": "date-time"},
        "outcome": {"enum": ["PASS", "FAIL", "NOT_RUN"]},
        "evidence": {
            "type": "object",
            "properties": {
                "phase": {"type": "string"},
                "plan_steps": {"type": "integer"},
                "files_in_fixture": {"type": "integer"},
                "checkpoint_path": {"type": "string"},
                "output_dir": {"type": "string"},
            },
        },
    },
}
