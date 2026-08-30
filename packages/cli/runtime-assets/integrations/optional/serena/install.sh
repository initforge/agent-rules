#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.json"
[[ -f "$MANIFEST" ]] || { echo "Manifest missing: $MANIFEST" >&2; exit 1; }
command -v python >/dev/null 2>&1 || { echo 'python is required to read Serena manifest' >&2; exit 1; }
VERSION="$(python - "$MANIFEST" <<'PY'
import json, sys
m=json.load(open(sys.argv[1], encoding='utf-8'))
v=m.get('version')
if not v: raise SystemExit('Serena manifest missing version')
print(v)
PY
)"
command -v uv >/dev/null 2>&1 || { echo 'uv is required for Serena' >&2; exit 1; }
uv tool install "serena-agent==$VERSION"
