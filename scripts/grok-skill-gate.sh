#!/usr/bin/env bash
# Wrapper for Grok hooks — delegates to grok-skill-gate.py (fail-open).
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$DIR/grok-skill-gate.py"