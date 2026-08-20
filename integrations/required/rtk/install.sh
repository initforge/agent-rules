#!/bin/sh
# Install RTK — Rust Token Killer
# Reduces LLM token consumption by 60-90% on common dev commands
set -e

if command -v rtk >/dev/null 2>&1; then
  echo "RTK already installed: $(rtk --version)"
  exit 0
fi

echo "Installing RTK..."
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

# Verify
if command -v rtk >/dev/null 2>&1; then
  echo "RTK installed: $(rtk --version)"
else
  echo "WARNING: RTK installed but not on PATH. Add ~/.local/bin to PATH."
  exit 1
fi
