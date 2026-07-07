#!/usr/bin/env bash
# Wrapper for skill orchestrator hooks — delegates to skill-gate.py (fail-open).
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
GATE="$DIR/skill-gate.py"
# Fallback tên cũ nếu tồn tại; không thì dùng skill-gate.py.
[ -f "$DIR/grok-skill-gate.py" ] && GATE="$DIR/grok-skill-gate.py"
exec python3 "$GATE"