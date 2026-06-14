#!/usr/bin/env bash
# Healthcheck skill-gate hook — chạy sau install và trong validate (R-H3)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GROK_HOME="${GROK_HOME:-$HOME/.grok}"
OUT="$GROK_HOME/skill-state/health.json"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

fail=0
notes=()

check() {
  if eval "$2" >/dev/null 2>&1; then
    notes+=("\"$1\":\"ok\"")
  else
    notes+=("\"$1\":\"fail\"")
    fail=1
  fi
}

check hook_json "test -f '$GROK_HOME/hooks/skill-orchestrator.json'"
check hook_bin "test -x '$GROK_HOME/hooks/bin/grok-skill-gate.sh'"
check hook_py "python3 -m py_compile '$ROOT/scripts/grok-skill-gate.py'"
check unit_tests "'$ROOT/scripts/test-grok-skill-gate.sh'"

mkdir -p "$GROK_HOME/skill-state"
{
  echo "{"
  echo "  \"checked_at\": \"$TS\","
  echo "  \"status\": \"$([ "$fail" -eq 0 ] && echo PASS || echo FAIL)\","
  echo "  $(IFS=,; echo "  \"checks\": {${notes[*]}}")"
  echo "}"
} > "$OUT"

if [[ "$fail" -ne 0 ]]; then
  echo "hook healthcheck: FAIL — see $OUT" >&2
  exit 1
fi
echo "hook healthcheck: PASS ($OUT)"