#!/usr/bin/env bash
# 11-install-runtime-hooks — Codex + Antigravity + Grok live hooks + pre-commit.
# Idempotent. Dual-OS: run ONCE PER MACHINE (Linux host + Windows host separate).
# Writes absolute paths for THIS host only — do not copy hooks.json across machines.
# Linux: python3 + /home/... paths. Windows: real Python (not Store stub) + Git Bash.
# Usage: ./automation/11-install-runtime-hooks.sh [--skip-precommit]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
USER_HOME="${HOME:?}"
SKIP_PRECOMMIT=0

for arg in "$@"; do
  [ "$arg" = "--skip-precommit" ] && SKIP_PRECOMMIT=1
done

CODEX_HOME="${CODEX_HOME:-$USER_HOME/.codex}"
ANTIGRAVITY_HOME="${ANTIGRAVITY_HOME:-$USER_HOME/.gemini/config}"
GROK_HOME="${GROK_HOME:-$USER_HOME/.grok}"

# Resolve a real Python interpreter (skip WindowsApps Store stub).
resolve_python() {
  local cand resolved win_user
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
        # Prefer absolute path so hooks work regardless of PATH
        if [ -n "$resolved" ] && [ -x "$resolved" ]; then
          echo "$resolved"
        else
          echo "$cand"
        fi
        return 0
      fi
    fi
  done
  win_user="${USER:-${USERNAME:-}}"
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

# Convert Git-Bash /c/Users/... or /home/... path to a form safe in JSON hooks.
# Prefer mixed Windows path with forward slashes for Grok/Codex on Windows.
to_hook_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p" 2>/dev/null && return 0
  fi
  # /c/Users/x -> C:/Users/x
  if [[ "$p" =~ ^/([a-zA-Z])/(.*)$ ]]; then
    echo "${BASH_REMATCH[1]^}:/${BASH_REMATCH[2]}"
    return 0
  fi
  echo "$p"
}

PY="$(resolve_python)" || {
  echo "[11] WARN: no real Python found — hooks will fail-open at runtime" >&2
  PY="python3"
}
PY_HOOK="$(to_hook_path "$PY")"

subst_file() {
  local template="$1" dest="$2" codex_path="$3" agy_path="$4" py_path="$5"
  # Also support direct python invocation tokens
  sed \
    -e "s|__CODEX_HOME__|${codex_path//|/\\|}|g" \
    -e "s|__ANTIGRAVITY_HOME__|${agy_path//|/\\|}|g" \
    -e "s|__PYTHON__|${py_path//|/\\|}|g" \
    "$template" > "$dest"
  if grep -qE '__CODEX_HOME__|__ANTIGRAVITY_HOME__|__PYTHON__' "$dest"; then
    echo "[11] FAIL: unsubstituted placeholder remains in $dest" >&2
    exit 1
  fi
}

copy_scripts() {
  local src="$1" dest="$2"
  mkdir -p "$dest"
  find "$src" -maxdepth 1 -type f \( -name '*.py' -o -name '*.sh' \) -exec cp {} "$dest/" \;
  chmod +x "$dest"/*.sh "$dest"/*.py 2>/dev/null || true
}

echo "[11] Python for hooks: $PY_HOOK"

echo "[11] Installing Codex hooks → $CODEX_HOME"
mkdir -p "$CODEX_HOME/scripts" "$CODEX_HOME/hooks" "$CODEX_HOME/skill-state"
copy_scripts "$ROOT/platforms/codex/scripts" "$CODEX_HOME/scripts"
CODEX_HOOK_HOME="$(to_hook_path "$CODEX_HOME")"
AGY_HOOK_HOME="$(to_hook_path "$ANTIGRAVITY_HOME")"
subst_file \
  "$ROOT/platforms/codex/hooks/skill-orchestrator.json.template" \
  "$CODEX_HOME/hooks/skill-orchestrator.json" \
  "$CODEX_HOOK_HOME" "$AGY_HOOK_HOME" "$PY_HOOK"

echo "[11] Installing Antigravity hooks → $ANTIGRAVITY_HOME"
mkdir -p "$ANTIGRAVITY_HOME/scripts" "$ANTIGRAVITY_HOME/skill-state"
copy_scripts "$ROOT/platforms/antigravity/scripts" "$ANTIGRAVITY_HOME/scripts"
# Prefer template that invokes Python directly (no bash path fragility on Windows).
if [ -f "$ROOT/platforms/antigravity/hooks.json.template" ]; then
  # Rewrite template commands to python absolute if template still uses bash wrapper.
  subst_file \
    "$ROOT/platforms/antigravity/hooks.json.template" \
    "$ANTIGRAVITY_HOME/hooks.json" \
    "$CODEX_HOOK_HOME" "$AGY_HOOK_HOME" "$PY_HOOK"
  # Post-process: if commands still start with "bash ", rewrite to python gate
  if grep -q 'bash .*antigravity-skill-gate' "$ANTIGRAVITY_HOME/hooks.json" 2>/dev/null; then
    # shellcheck disable=SC2002
    cat "$ANTIGRAVITY_HOME/hooks.json" | \
      sed -e "s|bash ${AGY_HOOK_HOME//\//\\/}/scripts/antigravity-skill-gate.sh|\"${PY_HOOK}\" \"${AGY_HOOK_HOME}/scripts/antigravity-skill-gate.py\"|g" \
          -e "s|bash ${AGY_HOOK_HOME//\//\\/}/scripts/antigravity-skill-gate.sh |\"${PY_HOOK}\" \"${AGY_HOOK_HOME}/scripts/antigravity-skill-gate.py\" |g" \
      > "$ANTIGRAVITY_HOME/hooks.json.tmp" || true
    # Safer rewrite with python one-liner
    "$PY" - "$ANTIGRAVITY_HOME/hooks.json" "$PY_HOOK" "$AGY_HOOK_HOME" <<'PY'
import json, sys
path, py, home = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, encoding="utf-8") as f:
    data = json.load(f)

def fix_cmd(cmd: str) -> str:
    if "antigravity-skill-gate" not in cmd:
        return cmd
    # Extract event arg if present
    parts = cmd.strip().split()
    event = parts[-1] if parts and parts[-1] in (
        "PreInvocation", "PreToolUse", "PostToolUse", "Stop"
    ) else ""
    gate = f'{home}/scripts/antigravity-skill-gate.py'.replace("\\", "/")
    py_path = py.replace("\\", "/")
    return f'"{py_path}" "{gate}" {event}'.strip()

def walk(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "command" and isinstance(v, str):
                obj[k] = fix_cmd(v)
            else:
                walk(v)
    elif isinstance(obj, list):
        for i in obj:
            walk(i)

walk(data)
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
    rm -f "$ANTIGRAVITY_HOME/hooks.json.tmp" 2>/dev/null || true
  fi
fi

# Grok LIVE path is hooks/bin/grok-skill-gate.* (not only scripts/)
if [ -d "$GROK_HOME" ]; then
  echo "[11] Syncing Grok live hooks → $GROK_HOME/hooks/bin + scripts"
  mkdir -p "$GROK_HOME/scripts" "$GROK_HOME/skill-state" "$GROK_HOME/hooks/bin"
  cp "$CODEX_HOME/scripts/skill-gate.py" "$GROK_HOME/scripts/skill-gate.py"
  cp "$CODEX_HOME/scripts/skill-gate.sh" "$GROK_HOME/scripts/skill-gate.sh"
  # Live names Grok skill-orchestrator expects
  cp "$CODEX_HOME/scripts/skill-gate.py" "$GROK_HOME/hooks/bin/grok-skill-gate.py"
  cp "$CODEX_HOME/scripts/skill-gate.sh" "$GROK_HOME/hooks/bin/grok-skill-gate.sh"
  # Ensure sh delegates to same-dir .py with resolve_python (already in skill-gate.sh)
  # Patch shebang target name inside bin wrapper for local py name
  cat > "$GROK_HOME/hooks/bin/grok-skill-gate.sh" <<'EOS'
#!/usr/bin/env bash
# Grok live hook wrapper — resolve real Python on Windows (fail-open).
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
GATE="$DIR/grok-skill-gate.py"
[ -f "$DIR/skill-gate.py" ] && GATE="$DIR/skill-gate.py"

resolve_python() {
  local cand resolved win_user
  for cand in "${HARNESS_PYTHON:-}" "${PYTHON_BIN:-}" python3 python py; do
    [ -z "$cand" ] && continue
    if command -v "$cand" >/dev/null 2>&1; then
      resolved="$(command -v "$cand" 2>/dev/null || true)"
      case "$resolved" in *WindowsApps*) continue ;; esac
      if "$cand" -c "import sys" >/dev/null 2>&1; then
        echo "$cand"; return 0
      fi
    fi
  done
  win_user="${USER:-${USERNAME:-}}"
  for cand in \
    "/c/Users/${win_user}/AppData/Local/Programs/Python/Python312/python.exe" \
    "/c/Users/${win_user}/AppData/Local/Programs/Python/Python311/python.exe" \
    "/usr/bin/python3"; do
    if [ -x "$cand" ] && "$cand" -c "import sys" >/dev/null 2>&1; then
      echo "$cand"; return 0
    fi
  done
  return 1
}

PY="$(resolve_python)" || {
  echo '{"decision":"allow","note":"grok-skill-gate: python not found (fail-open)"}'
  exit 0
}
exec "$PY" "$GATE"
EOS
  chmod +x "$GROK_HOME/hooks/bin/"*.sh "$GROK_HOME/hooks/bin/"*.py \
           "$GROK_HOME/scripts/"*.sh "$GROK_HOME/scripts/"*.py 2>/dev/null || true

  GROK_BIN_HOOK="$(to_hook_path "$GROK_HOME/hooks/bin/grok-skill-gate.sh")"
  # Write skill-orchestrator pointing at LIVE bin path (Windows-friendly)
  cat > "$GROK_HOME/hooks/skill-orchestrator.json" <<EOF
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "${GROK_BIN_HOOK}", "timeout": 5 } ] }
    ],
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "${GROK_BIN_HOOK}", "timeout": 5 } ] }
    ],
    "PreToolUse": [
      {
        "matcher": "run_terminal_command|Bash|Shell",
        "hooks": [ { "type": "command", "command": "${GROK_BIN_HOOK}", "timeout": 8 } ]
      },
      {
        "matcher": "search_replace|Edit|Write",
        "hooks": [ { "type": "command", "command": "${GROK_BIN_HOOK}", "timeout": 5 } ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "run_terminal_command|Bash|Shell|search_replace|Edit|Write",
        "hooks": [ { "type": "command", "command": "${GROK_BIN_HOOK}", "timeout": 8 } ]
      }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "${GROK_BIN_HOOK}", "timeout": 5 } ] }
    ]
  }
}
EOF
  if grep -qE '__CODEX_HOME__|__ANTIGRAVITY_HOME__' "$GROK_HOME/hooks/skill-orchestrator.json"; then
    echo "[11] FAIL: placeholder in Grok skill-orchestrator" >&2
    exit 1
  fi
fi

if [ "$SKIP_PRECOMMIT" -eq 0 ]; then
  echo "[11] Installing git pre-commit → agent-rules"
  "$SCRIPT_DIR/install-pre-commit-hook.sh" "$ROOT"
  if [ -d "$ROOT/../ZaloAI-Ecommerce/.git" ]; then
    echo "[11] Installing git pre-commit → ZaloAI-Ecommerce"
    "$SCRIPT_DIR/install-pre-commit-hook.sh" "$ROOT/../ZaloAI-Ecommerce"
  fi
fi

echo "[11] Smoke tests"
FAIL=0

test_pipe() {
  local label="$1" cmd="$2"
  local out
  out="$(printf '{"hookEventName":"UserPromptSubmit","prompt":"verify UI browser","session_id":"install-smoke"}' | eval "$cmd" 2>&1)" || true
  if printf '%s' "$out" | grep -q 'additionalContext\|"decision"\|injectSteps'; then
    if printf '%s' "$out" | grep -qE '__ANTIGRAVITY_HOME__|__CODEX_HOME__|e2e-qa|product-ui-craft'; then
      echo "  $label: FAIL (dead name or placeholder in output)" >&2
      echo "    $out" >&2
      FAIL=1
    else
      echo "  $label: OK"
    fi
  else
    echo "  $label: FAIL ($out)" >&2
    FAIL=1
  fi
}

test_pipe "Codex skill-gate.sh" "\"$CODEX_HOME/scripts/skill-gate.sh\""
test_pipe "Grok scripts/skill-gate.sh" "\"$GROK_HOME/scripts/skill-gate.sh\""
test_pipe "Grok LIVE hooks/bin/grok-skill-gate.sh" "\"$GROK_HOME/hooks/bin/grok-skill-gate.sh\""

# Antigravity PreInvocation via python (live)
if [ -f "$ANTIGRAVITY_HOME/scripts/antigravity-skill-gate.py" ]; then
  out="$(printf '{"invocationNum":0,"conversationId":"install-smoke"}' | "$PY" "$ANTIGRAVITY_HOME/scripts/antigravity-skill-gate.py" PreInvocation 2>&1)" || true
  if printf '%s' "$out" | grep -q 'injectSteps\|"decision"'; then
    echo "  Antigravity PreInvocation: OK"
  else
    echo "  Antigravity PreInvocation: FAIL ($out)" >&2
    FAIL=1
  fi
fi

# Assert installed JSON has no placeholders
for f in \
  "$CODEX_HOME/hooks/skill-orchestrator.json" \
  "$ANTIGRAVITY_HOME/hooks.json" \
  "$GROK_HOME/hooks/skill-orchestrator.json"
do
  if [ -f "$f" ] && grep -qE '__CODEX_HOME__|__ANTIGRAVITY_HOME__|__PYTHON__' "$f"; then
    echo "  Placeholder check $f: FAIL" >&2
    FAIL=1
  fi
done
echo "  Placeholder check installed JSON: OK (or missing file skipped)"

if [ "$SKIP_PRECOMMIT" -eq 0 ]; then
  if [ -x "$ROOT/.git/hooks/pre-commit" ]; then
    echo "  Git pre-commit hook: OK"
  else
    echo "  Git pre-commit hook: MISSING" >&2
    FAIL=1
  fi
fi

if [ "$FAIL" -ne 0 ]; then
  echo "[11] FAIL — xem lỗi trên" >&2
  exit 1
fi

echo "[11] PASS — runtime hooks installed (Codex + Antigravity + Grok LIVE path)"
