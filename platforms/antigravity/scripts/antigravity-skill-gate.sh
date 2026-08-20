#!/usr/bin/env bash
# Wrapper for antigravity-skill-gate.py — resolves real Python on Windows (fail-open).
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
GATE="$DIR/antigravity-skill-gate.py"
EVENT="${1:-}"

resolve_python() {
  local cand resolved
  for cand in \
    "${HARNESS_PYTHON:-}" \
    "${PYTHON_BIN:-}" \
    python3 \
    python \
    py
  do
    [ -z "$cand" ] && continue
    if command -v "$cand" >/dev/null 2>&1; then
      resolved="$(command -v "$cand" 2>/dev/null || true)"
      case "$resolved" in
        *WindowsApps*) continue ;;
      esac
      if "$cand" -c "import sys" >/dev/null 2>&1; then
        echo "$cand"
        return 0
      fi
    fi
  done
  local win_user="${USER:-${USERNAME:-}}"
  for cand in \
    "/c/Users/${win_user}/AppData/Local/Programs/Python/Python312/python.exe" \
    "/c/Users/${win_user}/AppData/Local/Programs/Python/Python311/python.exe" \
    "/usr/bin/python3" \
    "/usr/local/bin/python3"
  do
    if [ -x "$cand" ] && "$cand" -c "import sys" >/dev/null 2>&1; then
      echo "$cand"
      return 0
    fi
  done
  return 1
}

PY="$(resolve_python)" || {
  echo '{"decision":"allow","note":"antigravity-skill-gate: python not found (fail-open)"}'
  exit 0
}

if [ -n "$EVENT" ]; then
  exec "$PY" "$GATE" "$EVENT"
else
  exec "$PY" "$GATE"
fi
