#!/usr/bin/env bash
set -euo pipefail
# agent-device install script (recipe; run only under install authority)
# pinned: c7565cb1f8c34f6dae5b5abb8a7e2facf0674ef6 (v0.20.8)
echo "[recipe] agent-device install requires owner-approved install authority; preflight with: agent-device --version"
# load manifest metadata for provenance (see manifest.json in this directory)
MANIFEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$MANIFEST_DIR/manifest.json" ]; then
  echo "[recipe] loading manifest.json metadata from $MANIFEST_DIR"
fi
