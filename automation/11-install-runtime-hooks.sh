#!/usr/bin/env bash
# 11-install-runtime-hooks — cài Codex + Antigravity hooks + git pre-commit audit.
# Runtime-only scripts; không qua 01-build-runtime. Idempotent.
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

subst() {
  local template="$1" dest="$2" codex="$3" agy="$4"
  sed \
    -e "s|__CODEX_HOME__|${codex//|/\\|}|g" \
    -e "s|__ANTIGRAVITY_HOME__|${agy//|/\\|}|g" \
    "$template" > "$dest"
}

echo "[11] Installing Codex hooks → $CODEX_HOME"
mkdir -p "$CODEX_HOME/scripts" "$CODEX_HOME/hooks" "$CODEX_HOME/skill-state"
cp "$ROOT/platforms/codex/scripts/"* "$CODEX_HOME/scripts/"
chmod +x "$CODEX_HOME/scripts/"*.sh "$CODEX_HOME/scripts/"*.py 2>/dev/null || true
subst "$ROOT/platforms/codex/hooks/skill-orchestrator.json.template" \
  "$CODEX_HOME/hooks/skill-orchestrator.json" "$CODEX_HOME" "$ANTIGRAVITY_HOME"

echo "[11] Installing Antigravity hooks → $ANTIGRAVITY_HOME"
mkdir -p "$ANTIGRAVITY_HOME/scripts" "$ANTIGRAVITY_HOME/skill-state"
cp "$ROOT/platforms/antigravity/scripts/"* "$ANTIGRAVITY_HOME/scripts/"
chmod +x "$ANTIGRAVITY_HOME/scripts/"*.sh "$ANTIGRAVITY_HOME/scripts/"*.py 2>/dev/null || true
subst "$ROOT/platforms/antigravity/hooks.json.template" \
  "$ANTIGRAVITY_HOME/hooks.json" "$CODEX_HOME" "$ANTIGRAVITY_HOME"

# Grok dùng chung skill-gate.py (wrapper trỏ skill-gate.py)
if [ -d "$GROK_HOME" ]; then
  echo "[11] Syncing Grok skill-gate → $GROK_HOME/scripts"
  mkdir -p "$GROK_HOME/scripts" "$GROK_HOME/skill-state"
  cp "$CODEX_HOME/scripts/skill-gate.py" "$CODEX_HOME/scripts/skill-gate.sh" "$GROK_HOME/scripts/"
  chmod +x "$GROK_HOME/scripts/"*.sh "$GROK_HOME/scripts/"*.py 2>/dev/null || true
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

test_codex() {
  local out exit_code
  out="$(printf '{"hookEventName":"SessionStart","session_id":"install-smoke"}' | "$CODEX_HOME/scripts/skill-gate.sh" 2>&1)" || true
  if printf '%s' "$out" | grep -q 'additionalContext\|"decision"'; then
    echo "  Codex SessionStart: OK"
  else
    echo "  Codex SessionStart: FAIL ($out)" >&2
    FAIL=1
  fi
}

test_antigravity() {
  local out
  out="$(printf '{"invocationNum":0,"conversationId":"install-smoke"}' | python3 "$ANTIGRAVITY_HOME/scripts/antigravity-skill-gate.py" PreInvocation 2>&1)" || true
  if printf '%s' "$out" | grep -q 'injectSteps'; then
    echo "  Antigravity PreInvocation: OK"
  else
    echo "  Antigravity PreInvocation: FAIL ($out)" >&2
    FAIL=1
  fi
}

test_precommit() {
  if [ -x "$ROOT/.git/hooks/pre-commit" ]; then
    echo "  Git pre-commit hook: OK"
  else
    echo "  Git pre-commit hook: MISSING" >&2
    FAIL=1
  fi
}

test_codex
test_antigravity
[ "$SKIP_PRECOMMIT" -eq 0 ] && test_precommit

if [ "$FAIL" -ne 0 ]; then
  echo "[11] FAIL — xem lỗi trên" >&2
  exit 1
fi

echo "[11] PASS — runtime hooks installed"
