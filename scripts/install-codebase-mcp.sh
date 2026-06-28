#!/usr/bin/env bash
# Installs the DeusData codebase-memory-mcp binary for Linux.
set -euo pipefail

REPO="DeusData/codebase-memory-mcp"
INSTALL_DIR="$HOME/.gemini/bin"
BIN_NAME="codebase-memory-mcp"
TARGET_PATH="$INSTALL_DIR/$BIN_NAME"
CONFIG_PATH="$HOME/.gemini/config/mcp_config.json"

echo "== Fetching latest release of $REPO... =="
RELEASE_URL="https://api.github.com/repos/$REPO/releases/latest"
RELEASE_JSON=$(curl -s "$RELEASE_URL")

# Identify the correct asset for Linux amd64
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | python3 -c '
import json, sys
data = json.load(sys.stdin)
assets = data.get("assets", [])
for a in assets:
    name = a.get("name", "")
    if "linux-amd64.tar.gz" in name and "ui-linux" not in name and "portable" not in name:
        print(a.get("browser_download_url"))
        sys.exit(0)
print("")
')

if [[ -z "$DOWNLOAD_URL" ]]; then
    echo "Error: Could not find a Linux amd64 tar.gz asset in the latest release." >&2
    exit 1
fi

TEMP_TAR=$(mktemp)
echo "Downloading from $DOWNLOAD_URL..."
curl -L -o "$TEMP_TAR" "$DOWNLOAD_URL"

echo "Creating directory $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

echo "Extracting codebase-memory-mcp to $INSTALL_DIR..."
# The tarball might contain codebase-memory-mcp directly or inside a folder
# Let's extract it to a temporary directory first
TEMP_EXTRACT_DIR=$(mktemp -d)
tar -xzf "$TEMP_TAR" -C "$TEMP_EXTRACT_DIR"

# Find the binary
EXTRACTED_BIN=$(find "$TEMP_EXTRACT_DIR" -type f -name "$BIN_NAME" | head -n 1)

if [[ -f "$EXTRACTED_BIN" ]]; then
    mv "$EXTRACTED_BIN" "$TARGET_PATH"
    chmod +x "$TARGET_PATH"
    echo "Installation successful! Binary placed at: $TARGET_PATH"
    
    # Try to verify version
    if "$TARGET_PATH" --version &>/dev/null; then
        echo "Installed Version: $("$TARGET_PATH" --version)"
    else
        echo "Could not print version, but binary is placed and executable."
    fi
else
    echo "Error: Extraction failed or could not find codebase-memory-mcp binary." >&2
    rm -rf "$TEMP_EXTRACT_DIR" "$TEMP_TAR"
    exit 1
fi

rm -rf "$TEMP_EXTRACT_DIR" "$TEMP_TAR"

# Auto-configure mcp_config.json if it exists
if [[ -f "$CONFIG_PATH" ]]; then
    echo "Updating MCP configuration: $CONFIG_PATH..."
    python3 -c '
import json, os, sys
config_path = sys.argv[1]
target_path = sys.argv[2]

with open(config_path, "r") as f:
    try:
        data = json.load(f)
    except Exception:
        data = {}

if "mcpServers" not in data:
    data["mcpServers"] = {}

data["mcpServers"]["codebase-memory"] = {
    "command": target_path,
    "args": []
}

with open(config_path, "w") as f:
    json.dump(data, f, indent=2)
print("Updated mcp_config.json successfully!")
' "$CONFIG_PATH" "$TARGET_PATH"
else
    echo "Warning: $CONFIG_PATH not found. Please configure your MCP client manually."
fi
