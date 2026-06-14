#!/usr/bin/env bash
# Antigravity hard-activation preflight (Linux/bash) — parity with antigravity-preflight.ps1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

required=(
  ".agents/AGENTS.md"
  ".agents/INTENT.md"
  ".agents/README.md"
  ".agents/rules/00-hard-activation-contract.md"
  ".agents/rules/00-antigravity-runtime-intent.md"
  ".agents/rules/01-intent-contract.md"
  ".agents/rules/10-fast-context.md"
  ".agents/rules/prompt-intent-router.md"
  ".agents/rules/quality-gates.md"
  ".agents/rules/technical-debt-control.md"
  ".agents/rules/clean-code.md"
  ".agents/workflows/5fedu-project.md"
  ".agents/workflows/researcher.md"
  ".agents/workflows/runtime-sync-audit.md"
)

missing=()
for item in "${required[@]}"; do
  [[ -f "$item" ]] || missing+=("$item")
done

json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

if ((${#missing[@]} > 0)); then
  msg="Antigravity hard activation missing: ${missing[*]}. Do not proceed as PASS until these guard files are restored."
  printf '%s' "$msg" | json_escape | python3 -c '
import json, sys
msg = json.loads(sys.stdin.read())
print(json.dumps({"injectSteps": [{"ephemeralMessage": msg}]}, ensure_ascii=False))
'
  exit 0
fi

msg="[frontier] Antigravity harness ready — same outcome bar as Grok/Codex (00-universal-frontier-contract). Turn-0: Skill scan + Skill activated before tools. Multi-skill stack + Primary when ≥2 domains. E2E: smoke → -g 1 test after spec edit → deep; self-checkpoint (no hook). Complex project OK on Antigravity alone. Read .agents/AGENTS.md, 00-hard-activation-contract, 10-fast-context. Final: Skill scan, Skills active, Verification, Technical debt check, Status PASS/PARTIAL/BLOCKED. 5fedu: mapping → /template → verify."
printf '%s' "$msg" | json_escape | python3 -c '
import json, sys
msg = json.loads(sys.stdin.read())
print(json.dumps({"injectSteps": [{"ephemeralMessage": msg}]}, ensure_ascii=False))
'