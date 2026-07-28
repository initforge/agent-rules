#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

cd "$SCRIPT_DIR/.."

npm run build
npm run test -w packages/engine
npm run test -w packages/cli
npm run test -w packages/control-plane

export HOST_PARAM="${HOST:-}"
HEAD_COMMIT=$(git rev-parse HEAD)

node -e "
const g = require('./packages/engine/dist/terminal-gate.js');
const host = process.env.HOST_PARAM || '';
const ledgerPath = host ? '.agent/ledger/agent-rules-harness-v3-rearchitecture-20260726-r1--' + host + '.json' : '.agent/ledger/agent-rules-harness-v3-rearchitecture-20260726-r1.json';
const headCommit = require('child_process').execSync('git rev-parse HEAD').toString().trim();
console.log('Terminal gate - ledger:', ledgerPath, 'host:', host || '(all)');
const r = g.verifyTerminalGate(ledgerPath, headCommit);
console.log('Terminal gate:', r.passed ? 'PASS' : 'FAIL');
process.exit(r.passed ? 0 : 1);
"
