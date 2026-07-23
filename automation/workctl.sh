#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    exec "$candidate" "$SCRIPT_DIR/workctl.py" "$@"
  fi
done

echo "Python 3 is required for workctl." >&2
exit 1
