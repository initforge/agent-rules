#!/usr/bin/env bash
# install-pre-commit-hook — cài git pre-commit audit context (per-repo hoặc global).
# Usage:
#   ./automation/install-pre-commit-hook.sh              # repo hiện tại
#   ./automation/install-pre-commit-hook.sh --global     # mọi repo (core.hooksPath)
#   ./automation/install-pre-commit-hook.sh /path/repo   # repo chỉ định
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIT_SRC="$SCRIPT_DIR/audit-context-pre-commit.sh"
GLOBAL_DIR="${HOME}/.config/agent-rules/git-hooks"
MODE="repo"
TARGET=""

for arg in "$@"; do
  case "$arg" in
    --global) MODE="global" ;;
    --help|-h)
      sed -n '1,8p' "$0"
      exit 0
      ;;
    *)
      [ -d "$arg/.git" ] && TARGET="$arg"
      ;;
  esac
done

chmod +x "$AUDIT_SRC"

install_repo_hook() {
  local repo="$1"
  local hooks="$repo/.git/hooks"
  local hook="$hooks/pre-commit"
  mkdir -p "$hooks"

  local previous="$hooks/pre-commit.agent-rules.previous"
  if [ -f "$hook" ] && ( ! grep -q 'audit-context-pre-commit' "$hook" 2>/dev/null || ! grep -q 'pre-commit.agent-rules.previous' "$hook" 2>/dev/null ); then
    cp "$hook" "$previous"
    printf '# Existing pre-commit backed up before agent-rules audit install.\n' >> "$previous"
  fi

  cat > "$hook" << EOF
#!/usr/bin/env bash
# agent-rules context audit (auto-installed). Chain-safe: preserves prior hook as pre-commit.agent-rules.previous.
set -uo pipefail
AUDIT="$AUDIT_SRC"
if [ -x "\$AUDIT" ]; then
  "\$AUDIT"
  audit_status=\$?
  [ "\$audit_status" -eq 0 ] || exit "\$audit_status"
fi
PREV="\$(dirname "\$0")/pre-commit.agent-rules.previous"
if [ -x "\$PREV" ]; then
  "\$PREV"
  prev_status=\$?
  [ "\$prev_status" -eq 0 ] || exit "\$prev_status"
fi
exit 0
EOF
  chmod +x "$hook"
  echo "Installed pre-commit → $hook"
}

if [ "$MODE" = "global" ]; then
  mkdir -p "$GLOBAL_DIR"
  cp "$AUDIT_SRC" "$GLOBAL_DIR/audit-context-pre-commit.sh"
  chmod +x "$GLOBAL_DIR/audit-context-pre-commit.sh"
  cat > "$GLOBAL_DIR/pre-commit" << EOF
#!/usr/bin/env bash
set -uo pipefail
AUDIT="$GLOBAL_DIR/audit-context-pre-commit.sh"
if [ -x "\$AUDIT" ]; then
  "\$AUDIT"
  exit \$?
fi
exit 0
EOF
  chmod +x "$GLOBAL_DIR/pre-commit"
  git config --global core.hooksPath "$GLOBAL_DIR"
  echo "Global hooksPath → $GLOBAL_DIR"
  exit 0
fi

if [ -n "$TARGET" ]; then
  install_repo_hook "$TARGET"
  exit 0
fi

REPO="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$REPO" ] && { echo "Not inside a git repo. Pass repo path or use --global." >&2; exit 1; }
install_repo_hook "$REPO"
