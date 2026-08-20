#!/bin/sh
# Install the manifest-pinned Rust Token Killer release.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MANIFEST="$SCRIPT_DIR/manifest.json"
if [ ! -f "$MANIFEST" ]; then
  echo "FAIL: manifest.json is missing next to RTK installer" >&2
  exit 1
fi

VERSION=$(node -e 'const fs=require("fs"); const p=process.argv[1]; const m=JSON.parse(fs.readFileSync(p,"utf8")); if(!/^\\d+\\.\\d+\\.\\d+$/.test(m.version||"")) process.exit(2); process.stdout.write(m.version)' "$MANIFEST")
EXPECTED="rtk $VERSION"
if command -v rtk >/dev/null 2>&1; then
  INSTALLED=$(rtk --version 2>/dev/null || true)
  if printf '%s' "$INSTALLED" | grep -F "$EXPECTED" >/dev/null 2>&1; then
    echo "RTK already installed: $INSTALLED"
    exit 0
  fi
fi

TAG="v$VERSION"
URL="https://raw.githubusercontent.com/rtk-ai/rtk/refs/tags/$TAG/install.sh"
echo "Installing RTK $VERSION from pinned tag $TAG..."
curl -fsSL "$URL" | sh

if ! command -v rtk >/dev/null 2>&1; then
  echo "FAIL: RTK installer completed but rtk is not on PATH" >&2
  exit 1
fi
INSTALLED=$(rtk --version 2>&1)
if ! printf '%s' "$INSTALLED" | grep -F "$EXPECTED" >/dev/null 2>&1; then
  echo "FAIL: installed RTK version '$INSTALLED' does not match manifest $VERSION" >&2
  exit 1
fi
echo "RTK installed: $INSTALLED"
