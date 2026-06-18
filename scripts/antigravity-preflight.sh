#!/usr/bin/env bash
# Antigravity hard-activation preflight (Linux/bash) — parity with antigravity-preflight.ps1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

required=(
  ".agents/AGENTS.md"
  ".agents/INTENT.md"
  ".agents/README.md"
  ".agents/rules/00-runtime-and-intent.md"
  ".agents/rules/00-universal-frontier-contract.md"
  ".agents/rules/01-agent-workflow-sop.md"
  ".agents/rules/02-code-quality-and-debt.md"
  ".agents/rules/03-context-and-tools.md"
  ".agents/rules/04-skills-and-5fedu.md"
  ".agents/rules/05-harness-mutation-gate.md"
  ".agents/rules/06-opus-emulation-contract.md"
  ".agents/rules/07-finish-to-completion.md"
  ".agents/rules/antigravity-overlay.md"
  ".agents/rules/platform-boundary.md"
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

msg="[frontier] Antigravity harness ready — same outcome bar as Grok/Codex (00-universal-frontier-contract). Turn-0: Skill scan + Skill activated before tools. 07-finish-to-completion: scope lock N/N — no GAP footer, no false choice, no handoff. Multi-skill stack + Primary when ≥2 domains. E2E: smoke → -g 1 test after spec edit → deep; self-checkpoint (no hook). Complex project OK on Antigravity alone. Read .agents/AGENTS.md, 07-finish-to-completion, 00-universal-frontier-contract.md, 03-context-and-tools.md. Final: Scope lock N/N, Verification, Technical debt check, Status PASS/PARTIAL/BLOCKED. 5fedu: mapping → /template → verify."
printf '%s' "$msg" | json_escape | python3 -c '
import json, sys
msg = json.loads(sys.stdin.read())
print(json.dumps({"injectSteps": [{"ephemeralMessage": msg}]}, ensure_ascii=False))
'