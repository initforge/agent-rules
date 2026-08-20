#!/bin/sh
# Install the manifest-pinned Rust Token Killer release.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MANIFEST="$SCRIPT_DIR/manifest.json"
if [ ! -f "$MANIFEST" ]; then
  echo "FAIL: manifest.json is missing next to RTK installer" >&2
  exit 1
fi

VERSION=$(node -e 'const fs=require("fs"); const p=process.argv[1]; const m=JSON.parse(fs.readFileSync(p,"utf8")); if(!/^\d+\.\d+\.\d+$/.test(m.version||"")) process.exit(2); process.stdout.write(m.version)' "$MANIFEST")
EXPECTED="rtk $VERSION"
if command -v rtk >/dev/null 2>&1; then
  INSTALLED=$(rtk --version 2>/dev/null || true)
  if printf '%s' "$INSTALLED" | grep -F "$EXPECTED" >/dev/null 2>&1; then
    echo "RTK already installed: $INSTALLED"
    exit 0
  fi
fi

TAG="v$VERSION"
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ASSET="rtk-x86_64-unknown-linux-musl.tar.gz" ;;
  aarch64) ASSET="rtk-aarch64-unknown-linux-gnu.tar.gz" ;;
  *) echo "FAIL: unsupported architecture $ARCH" >&2; exit 1 ;;
esac
URL="https://github.com/rtk-ai/rtk/releases/download/$TAG/$ASSET"
echo "Installing RTK $VERSION from pinned release asset $ASSET..."
TMPDIR_TAR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_TAR"' EXIT
curl -fsSL -o "$TMPDIR_TAR/rtk.tar.gz" "$URL"
tar -xzf "$TMPDIR_TAR/rtk.tar.gz" -C "$TMPDIR_TAR" rtk
BINDIR="${RTK_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BINDIR"
install -m 0755 "$TMPDIR_TAR/rtk" "$BINDIR/rtk"

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
