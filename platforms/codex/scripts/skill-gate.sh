#!/usr/bin/env bash
# Wrapper for skill orchestrator hooks - delegates to skill-gate.py (fail-open).
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
GATE="$DIR/skill-gate.py"
# Fallback ten cu neu ton tai; khong thi dung skill-gate.py.
[ -f "$DIR/grok-skill-gate.py" ] && GATE="$DIR/grok-skill-gate.py"

# The same canonical gate is copied to Codex and Grok. Set an explicit mode so
# the Python process can emit each platform's hook wire format correctly.
case "$DIR" in
  */.codex/*) export CODEX_HOME="$(cd "$DIR/.." && pwd)"; export AGENT_RULES_HOOK_PLATFORM="codex" ;;
  */.grok/*) export GROK_HOME="$(cd "$DIR/.." && pwd)"; export AGENT_RULES_HOOK_PLATFORM="grok" ;;
esac

# Windows: `python3` often resolves to Microsoft Store stub - prefer real installs.
resolve_python() {
  local cand
  for cand in \
    "${HARNESS_PYTHON:-}" \
    "${PYTHON_BIN:-}" \
    python3 \
    python \
    py
  do
    [ -z "$cand" ] && continue
    if command -v "$cand" >/dev/null 2>&1; then
      # Reject WindowsApps Store stub (opens Store, no real interpreter).
      local resolved
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
  # Common Windows install path (Git Bash often has USERNAME, not USER)
  local win_user="${USER:-${USERNAME:-}}"
  for cand in \
    "/c/Users/${win_user}/AppData/Local/Programs/Python/Python312/python.exe" \
    "/c/Users/${win_user}/AppData/Local/Programs/Python/Python311/python.exe" \
    "/c/Python312/python.exe" \
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
  # Fail-open: never block the agent if Python missing
  echo '{"decision":"allow","note":"skill-gate: python not found (fail-open)"}'
  exit 0
}

exec "$PY" "$GATE"
