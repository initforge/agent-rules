#!/usr/bin/env bash
# Fail if harness has legacy rules, missing active files, or skill drift
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=0

LEGACY=(
  00-hard-activation-contract.md
  00-antigravity-runtime-intent.md
  01-intent-contract.md
  prompt-intent-router.md
  quality-gates.md
  core.md
  planning.md
)

CODEX_ACTIVE=(
  00-runtime-and-intent.md
  01-agent-workflow-sop.md
  02-code-quality-and-debt.md
  03-context-and-tools.md
  04-skills-and-5fedu.md
  05-harness-mutation-gate.md
  06-opus-emulation-contract.md
  07-finish-to-completion.md
  codex-overlay.md
  platform-boundary.md
)

AG_ACTIVE=(
  00-runtime-and-intent.md
  01-agent-workflow-sop.md
  02-code-quality-and-debt.md
  03-context-and-tools.md
  04-skills-and-5fedu.md
  05-harness-mutation-gate.md
  06-opus-emulation-contract.md
  07-finish-to-completion.md
  antigravity-overlay.md
  platform-boundary.md
)

GROK_ACTIVE=(
  00-runtime-and-intent.md
  01-agent-workflow-sop.md
  02-code-quality-and-debt.md
  03-context-and-tools.md
  04-skills-and-5fedu.md
  05-harness-mutation-gate.md
  06-opus-emulation-contract.md
  07-finish-to-completion.md
  grok-overlay.md
  platform-boundary.md
)

fail() { echo "FAIL: $1"; FAILED=1; }
ok() { echo "OK: $1"; }

check_dir() {
  local label="$1" dir="$2"
  shift 2
  local -a required=("$@")
  local local_fail=0
  for f in "${LEGACY[@]}"; do
    if [[ -f "$dir/$f" ]]; then
      fail "$label legacy file still exists: $f"
      local_fail=1
    fi
  done
  for f in "${required[@]}"; do
    if [[ ! -f "$dir/$f" ]]; then
      fail "$label missing: $f"
      local_fail=1
    fi
  done
  if [[ $local_fail -eq 0 ]]; then
    ok "$label ($(ls -1 "$dir"/*.md 2>/dev/null | wc -l) md files)"
  fi
}

echo "== Validate harness =="

check_dir "grok master" "$ROOT/grok/rules" "${GROK_ACTIVE[@]}"
check_dir ".grok live" "$ROOT/.grok/rules" "${GROK_ACTIVE[@]}"
check_dir "codex/rules" "$ROOT/codex/rules" "${CODEX_ACTIVE[@]}"
check_dir ".agents/rules" "$ROOT/.agents/rules" "${AG_ACTIVE[@]}"

MASTER_SKILLS=$(find "$ROOT/grok/skills" -name SKILL.md | wc -l)
for label_path in ".grok/skills:$ROOT/.grok/skills" "codex/skills:$ROOT/codex/skills" ".agents/skills:$ROOT/.agents/skills"; do
  label="${label_path%%:*}"
  path="${label_path##*:}"
  count=$(find "$path" -name SKILL.md 2>/dev/null | wc -l)
  if [[ "$count" -ne "$MASTER_SKILLS" ]]; then
    fail "$label skill count $count != master $MASTER_SKILLS"
  else
    ok "$label skills ($count)"
  fi
done

if ! grep -q 'Iron Law' "$ROOT/grok/rules/07-finish-to-completion.md"; then
  fail "07-finish-to-completion missing Iron Law"
else
  ok "07-finish-to-completion contract"
fi

if [[ ! -f "$ROOT/grok/skills/finish-to-completion/SKILL.md" ]]; then
  fail "missing finish-to-completion skill"
else
  ok "finish-to-completion skill"
fi

if grep -rE 'cursor/scripts|đụng `cursor/`' "$ROOT/grok/rules" "$ROOT/.grok/rules" 2>/dev/null | grep -v 'cursor-pointer' | grep -q .; then
  fail "stale cursor/ path in grok rules"
else
  ok "no stale cursor/ in grok rules"
fi

if [[ $FAILED -ne 0 ]]; then
  echo ""
  echo "Harness validation: FAIL"
  exit 1
fi
echo ""
echo "Harness validation: PASS"