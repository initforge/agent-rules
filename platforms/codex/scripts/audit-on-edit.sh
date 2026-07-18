#!/usr/bin/env bash
# audit-on-edit — Codex PostToolUse backstop for context/harness edits.
# Fail-open: chỉ CẢNH BÁO, không bao giờ block. Kích khi Write/Edit chạm rule/skill/AGENTS/overlay.
# Chuẩn: rules/40-harness-governance.md + skills/context-evolution-protocol §Auto-audit on edit.
set -uo pipefail

payload="$(cat 2>/dev/null || true)"

# Trích path bị sửa từ payload JSON (grep, không cần jq).
paths="$(printf '%s' "$payload" | grep -oE '(/[A-Za-z0-9._/-]+)+\.(md|json|ya?ml)' | sort -u)"
[ -z "$paths" ] && exit 0

# Chỉ quan tâm file context/harness.
ctx_re='(/rules/|/skills/|/platforms/|/projects/|/automation/|AGENTS\.md|AGENTS\.core\.md|GEMINI\.md|-overlay\.md|/context/5fedu/)'

warns=""
for f in $paths; do
  printf '%s' "$f" | grep -qE "$ctx_re" || continue
  [ -f "$f" ] || continue

  base="$(basename "$f")"
  lines="$(wc -l < "$f" 2>/dev/null || echo 0)"

  # Oversize theo loại — ngưỡng warn = bloat THẬT (target ~40 rule là aspirational ở 16-context-style).
  if printf '%s' "$f" | grep -q '/rules/'; then
    [ "$lines" -gt 90 ] && warns="${warns}\n  - OVERSIZE rule ${base}: ${lines} dòng (>90) → tách / đẩy chi tiết ra references/"
  elif [ "$base" = "SKILL.md" ]; then
    [ "$lines" -gt 350 ] && warns="${warns}\n  - OVERSIZE ${f}: ${lines} dòng (>350) → chỉ tách nếu workflow không liền mạch (16-context-style)"
  fi

  # Dead @import / link tới file không tồn tại (chỉ path tuyệt đối cho chắc).
  while IFS= read -r imp; do
    [ -n "$imp" ] && [ ! -e "$imp" ] && warns="${warns}\n  - DEAD IMPORT trong ${base}: ${imp} không tồn tại"
  done < <(grep -oE '^@[A-Za-z]:[^[:space:])\],>]+|^@/[A-Za-z0-9._/-]+' "$f" 2>/dev/null | sed 's/^@//')
done

if [ -n "$warns" ]; then
  printf '[audit-on-edit] Context/harness vừa đổi — cần Auto-audit on edit (context-evolution-protocol):%b\n' "$warns"
  printf '  Nhắc: chạy dedup rg, kiểm mirror drift 4 runtime, xác nhận Placement + 1-concept-1-nơi trước khi PASS.\n'
fi
exit 0
