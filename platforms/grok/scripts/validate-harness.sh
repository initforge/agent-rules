#!/usr/bin/env bash
# Compatibility wrapper. Canonical script lives at scripts/validate-harness.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
exec "$ROOT/scripts/validate-harness.sh" "$@"
