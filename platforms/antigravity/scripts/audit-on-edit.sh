#!/usr/bin/env bash
# audit-on-edit — Antigravity PostToolUse backstop for context/harness edits.
# Fail-open: chỉ CẢNH BÁO qua stderr. Chuẩn: context-evolution-protocol §Auto-audit on edit.
set -uo pipefail

payload="$(cat 2>/dev/null || true)"
path="$(printf '%s' "$payload" | grep -oE '"(TargetFile|AbsolutePath)"\s*:\s*"[^"]+"' | head -1 | sed -E 's/.*:\s*"([^"]+)"/\1/')"
[ -z "$path" ] && exit 0

ctx_re='(/rules/|/skills/|/platforms/|/projects/|AGENTS\.md|GEMINI\.md|-overlay\.md|/context/5fedu/)'
printf '%s' "$path" | grep -qE "$ctx_re" || exit 0
[ -f "$path" ] || exit 0

base="$(basename "$path")"
lines="$(wc -l < "$path" 2>/dev/null || echo 0)"
warns=""

if printf '%s' "$path" | grep -q '/rules/'; then
  [ "$lines" -gt 90 ] && warns="${warns} OVERSIZE rule ${base}: ${lines} dòng (>90)."
  elif [ "$base" = "SKILL.md" ]; then
    [ "$lines" -gt 350 ] && warns="${warns} OVERSIZE SKILL ${base}: ${lines} dòng (>350) — chỉ tách nếu workflow không còn liền mạch."
fi

if grep -qE 'C:\\\\Users' "$path" 2>/dev/null; then
  warns="${warns} DEAD PATH Windows trong ${base}."
fi

if [ -n "$warns" ]; then
  printf '[audit-on-edit] Context/harness vừa đổi:%s\n' "$warns" >&2
fi
exit 0
