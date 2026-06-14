#!/usr/bin/env bash
# Unit smoke for grok-skill-gate.py — advisory mode (no command deny)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export GROK_HOME="${GROK_HOME:-$HOME/.grok}"
export GROK_SESSION_ID="test-gate-$(date +%s)"
GATE="$ROOT/scripts/grok-skill-gate.sh"

fail() { echo "GATE TEST FAIL: $1" >&2; exit 1; }
ok() { echo "GATE TEST OK: $1"; }

STATE="$GROK_HOME/skill-state/${GROK_SESSION_ID}.json"
rm -f "$STATE" 2>/dev/null || true

# 1) deep allowed without smoke + advisory hint
OUT=$(echo '{"hookEventName":"pre_tool_use","sessionId":"'"$GROK_SESSION_ID"'","toolName":"run_terminal_command","toolInput":{"command":"npm run test:e2e:prod:deep"}}' \
  | GROK_HOOK_EVENT=pre_tool_use GROK_SESSION_ID="$GROK_SESSION_ID" "$GATE")
echo "$OUT" | grep -q '"decision": "allow"' || fail "deep should allow (no deny)"
echo "$OUT" | grep -q 'E2E advisory' || fail "deep without smoke should inject advisory"
ok "allows deep with advisory when no smoke"

# 2) smoke pass via post_tool_use
echo '{"hookEventName":"post_tool_use","sessionId":"'"$GROK_SESSION_ID"'","toolName":"run_terminal_command","toolInput":{"command":"npm run test:e2e:prod:smoke"},"toolOutput":"2 passed, 0 failed"}' \
  | GROK_HOOK_EVENT=post_tool_use GROK_SESSION_ID="$GROK_SESSION_ID" "$GATE" >/dev/null
grep -q '"smoke_passed": true' "$STATE" || fail "smoke_passed not set"
ok "records smoke pass"

# 3) deep allowed after smoke (no smoke advisory)
OUT=$(echo '{"hookEventName":"pre_tool_use","sessionId":"'"$GROK_SESSION_ID"'","toolName":"run_terminal_command","toolInput":{"command":"npm run test:e2e:prod:deep"}}' \
  | GROK_HOOK_EVENT=pre_tool_use GROK_SESSION_ID="$GROK_SESSION_ID" "$GATE")
echo "$OUT" | grep -q '"decision": "allow"' || fail "deep should allow after smoke"
echo "$OUT" | grep -q 'chưa smoke' && fail "should not advise smoke after smoke passed" || true
ok "allows deep after smoke"

# 4) spec edit → deep allowed with spec advisory
echo '{"hookEventName":"post_tool_use","sessionId":"'"$GROK_SESSION_ID"'","toolName":"search_replace","toolInput":{"path":"output/playwright/foo.spec.ts"}}' \
  | GROK_HOOK_EVENT=post_tool_use GROK_SESSION_ID="$GROK_SESSION_ID" "$GATE" >/dev/null
OUT=$(echo '{"hookEventName":"pre_tool_use","sessionId":"'"$GROK_SESSION_ID"'","toolName":"run_terminal_command","toolInput":{"command":"npm run test:e2e:prod:deep"}}' \
  | GROK_HOOK_EVENT=pre_tool_use GROK_SESSION_ID="$GROK_SESSION_ID" "$GATE")
echo "$OUT" | grep -q '"decision": "allow"' || fail "deep should allow after spec edit"
echo "$OUT" | grep -q 'spec.ts' || fail "should inject spec advisory"
ok "allows deep after spec edit with advisory"

# 5) single test clears spec advisory path
echo '{"hookEventName":"post_tool_use","sessionId":"'"$GROK_SESSION_ID"'","toolName":"run_terminal_command","toolInput":{"command":"npx playwright test foo.spec.ts -g testname"},"toolOutput":"1 passed"}' \
  | GROK_HOOK_EVENT=post_tool_use GROK_SESSION_ID="$GROK_SESSION_ID" "$GATE" >/dev/null
OUT=$(echo '{"hookEventName":"pre_tool_use","sessionId":"'"$GROK_SESSION_ID"'","toolName":"run_terminal_command","toolInput":{"command":"npm run test:e2e:prod:deep"}}' \
  | GROK_HOOK_EVENT=pre_tool_use GROK_SESSION_ID="$GROK_SESSION_ID" "$GATE")
echo "$OUT" | grep -q '"decision": "allow"' || fail "deep should allow after single -g test"
ok "allows deep after single -g test"

# 6) harness commit allowed (advisory only)
export GROK_WORKSPACE_ROOT="/home/linhnxdeveloper/Projects/agent-rules"
echo '{"hookEventName":"post_tool_use","sessionId":"'"$GROK_SESSION_ID"'","toolName":"search_replace","toolInput":{"path":"codex/rules/10-fast-context.md"}}' \
  | GROK_HOOK_EVENT=post_tool_use GROK_SESSION_ID="$GROK_SESSION_ID" GROK_WORKSPACE_ROOT="$GROK_WORKSPACE_ROOT" "$GATE" >/dev/null
OUT=$(echo '{"hookEventName":"pre_tool_use","sessionId":"'"$GROK_SESSION_ID"'","toolName":"run_terminal_command","toolInput":{"command":"git commit -m test"}}' \
  | GROK_HOOK_EVENT=pre_tool_use GROK_SESSION_ID="$GROK_SESSION_ID" GROK_WORKSPACE_ROOT="$GROK_WORKSPACE_ROOT" "$GATE")
echo "$OUT" | grep -q '"decision": "allow"' || fail "git commit should allow"
echo "$OUT" | grep -q 'Harness advisory' || fail "harness commit should inject advisory"
ok "allows harness git commit with advisory"

# 7) git diff always allowed (e2e signal, no deny ever)
SID_GIT="test-git-$(date +%s)"
rm -f "$GROK_HOME/skill-state/${SID_GIT}.json" 2>/dev/null || true
echo '{"hookEventName":"user_prompt_submit","sessionId":"'"$SID_GIT"'","prompt":"playwright e2e báo cáo diff"}' \
  | GROK_HOOK_EVENT=user_prompt_submit GROK_SESSION_ID="$SID_GIT" "$GATE" >/dev/null
OUT=$(echo '{"hookEventName":"pre_tool_use","sessionId":"'"$SID_GIT"'","toolName":"Shell","toolInput":{"command":"git diff --stat && git status -s"}}' \
  | GROK_HOOK_EVENT=pre_tool_use GROK_SESSION_ID="$SID_GIT" "$GATE")
echo "$OUT" | grep -q '"decision": "allow"' || fail "git diff must allow"
echo "$OUT" | grep -q 'deny' && fail "must never deny" || true
ok "always allows git diff/status"

# 8) user_prompt_submit injects e2e anti-stuck reminder
OUT=$(echo '{"hookEventName":"user_prompt_submit","sessionId":"'"$SID_GIT"'","prompt":"tiếp tục e2e playwright test"}' \
  | GROK_HOOK_EVENT=user_prompt_submit GROK_SESSION_ID="$SID_GIT" "$GATE")
echo "$OUT" | grep -q 'anti-stuck\|E2E' || fail "e2e prompt should inject anti-stuck context"
ok "user prompt injects e2e anti-stuck"

echo ""
echo "grok-skill-gate tests: PASS (advisory-only)"