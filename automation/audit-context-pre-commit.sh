#!/usr/bin/env bash
# audit-context-pre-commit — git pre-commit backstop for context/harness staged files.
# Fail-open by default (exit 0 + WARN). Set CONTEXT_AUDIT_STRICT=1 to block commit on findings.
# Chuẩn: context-evolution-protocol §Auto-audit on edit + rules/40-harness-governance.md
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 0

# Optional: --files "a b c" for smoke tests (bypass git index).
declare -a FILES=()
if [ "${1:-}" = "--files" ] && [ -n "${2:-}" ]; then
  read -r -a FILES <<< "$2"
else
  while IFS= read -r line; do
    [ -n "$line" ] && FILES+=("$line")
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

[ "${#FILES[@]}" -eq 0 ] && exit 0

is_context_path() {
  local f="$1"
  case "$f" in
    rules/*|skills/*|platforms/*|projects/*|guides/*)
      return 0 ;;
    context/5fedu/*|.agents/*|automation/trigger-audit.json)
      return 0 ;;
    AGENTS.md|AGENTS.core.md|GEMINI.md)
      return 0 ;;
    *-overlay.md)
      return 0 ;;
  esac
  return 1
}

warns=""
checked=0

for rel in "${FILES[@]}"; do
  is_context_path "$rel" || continue
  f="$ROOT/$rel"
  [ -f "$f" ] || continue
  checked=$((checked + 1))

  base="$(basename "$f")"
  lines="$(wc -l < "$f" 2>/dev/null || echo 0)"

  if printf '%s' "$rel" | grep -q '^rules/'; then
    [ "$lines" -gt 90 ] && warns="${warns}\n  - OVERSIZE rule ${rel}: ${lines} dòng (>90) → tách references/"
  elif [ "$base" = "SKILL.md" ]; then
    [ "$lines" -gt 350 ] && warns="${warns}\n  - OVERSIZE ${rel}: ${lines} dòng (>350) → chỉ tách nếu workflow không liền mạch (16-context-style)"
  fi

  if grep -qE 'C:\\Users' "$f" 2>/dev/null; then
    warns="${warns}\n  - DEAD PATH ${rel}: còn C:\\Users... → sửa Linux/relative"
  fi

  while IFS= read -r imp; do
    [ -n "$imp" ] && [ ! -e "$imp" ] && warns="${warns}\n  - DEAD IMPORT ${rel}: ${imp} không tồn tại"
  done < <(grep -oE '^@(/[A-Za-z0-9._/-]+)' "$f" 2>/dev/null | sed 's/^@//')

  # Runtime drift: canonical agent-rules vs ~/.codex|gemini|grok|cursor (chỉ khi file tồn tại ở runtime).
  if [ -f "$ROOT/automation/run.sh" ] && command -v sha256sum >/dev/null 2>&1; then
    src_hash="$(sha256sum "$f" 2>/dev/null | awk '{print $1}')"
    for rt in "${HOME}/.codex" "${HOME}/.gemini/config" "${HOME}/.grok" "${HOME}/.cursor"; do
      dst="$rt/$rel"
      [ -f "$dst" ] || continue
      dst_hash="$(sha256sum "$dst" 2>/dev/null | awk '{print $1}')"
      [ -n "$src_hash" ] && [ -n "$dst_hash" ] && [ "$src_hash" != "$dst_hash" ] && \
        warns="${warns}\n  - MIRROR DRIFT ${rel} vs $(basename "$rt") → chạy ./automation/run.sh 02-install-runtime"
    done
  fi
done

[ "$checked" -eq 0 ] && exit 0

if [ -n "$warns" ]; then
  printf '[audit-context-pre-commit] %d context file staged — auto-audit findings:\n' "$checked"
  # echo -e: tránh printf %%b hiểu nhầm \\U trong C:\\Users thành unicode escape
  echo -e "$warns"
  printf '  Nhắc: dedup rg, mirror drift 4 runtime, Placement + 1-concept-1-nơi.\n'
  if [ -f "$ROOT/automation/run.sh" ]; then
    printf '  Sync: ./automation/run.sh 02-install-runtime && ./automation/run.sh 04-verify-mirrors\n'
  fi
  if [ "${CONTEXT_AUDIT_STRICT:-0}" = "1" ]; then
    printf '  STRICT=1 → chặn commit. Sửa findings hoặc unset CONTEXT_AUDIT_STRICT.\n'
    exit 1
  fi
fi

exit 0
