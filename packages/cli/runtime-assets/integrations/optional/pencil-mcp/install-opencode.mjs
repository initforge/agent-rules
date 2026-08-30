#!/usr/bin/env node
// OpenCode Pencil MCP installer for the agent-rules harness.
//
// Idempotently sets the `pencil` entry in ~/.config/opencode/opencode.json to
// the harness's stable launcher (node <launcher>). Preserves all unrelated
// user configuration. Creates a timestamped backup before any change.
// Detects a missing Pencil desktop install and reports BLOCKED/NEEDS_USER with
// the official installation link instead of silently falling back.
//
// Usage: node install-opencode.mjs <launcher> [opencodeConfigPath]
// Exit codes: 0 = ok (no-op or updated), 2 = BLOCKED/NEEDS_USER, 1 = error

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PENCIL_INSTALL_URL = 'https://docs.pencil.dev/getting-started/ai-integration';
const PENCIL_MCP_NAME = 'pencil';

function appImageCandidates() {
  const home = os.homedir();
  return [process.env.PENCIL_APPIMAGE, path.join(home, 'Applications', 'Pen.AppImage'), path.join(home, 'Applications', 'Pencil.AppImage')].filter(Boolean);
}

function main() {
  const launcher = process.argv[2];
  if (!launcher || !fs.existsSync(launcher)) {
    console.error(`BLOCKED/NEEDS_USER: launcher not found: ${launcher}`);
    process.exit(2);
  }
  const configPath = process.argv[3] || process.env.OPENCODE_CONFIG || path.join(os.homedir(), '.config', 'opencode', 'opencode.json');

  const appImage = appImageCandidates().find((candidate) => fs.existsSync(candidate));
  if (!appImage) {
    console.error(`BLOCKED/NEEDS_USER: Pencil desktop is not installed. Expected one of: ${appImageCandidates().join(', ')}.`);
    console.error(`Install Pencil from ${PENCIL_INSTALL_URL} or set PENCIL_APPIMAGE to the AppImage path, then re-run the installer.`);
    process.exit(2);
  }

  const entry = {
    command: [process.execPath, launcher, '--app', 'desktop', '--agent', 'openCodeCLI'],
    enabled: true,
    type: 'local',
  };

  let config = {};
  let existed = false;
  if (fs.existsSync(configPath)) {
    existed = true;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.error(`BLOCKED/NEEDS_USER: cannot parse existing ${configPath}: ${error.message}. Fix the config or move it away, then re-run.`);
      process.exit(2);
    }
  }
  config.mcp ??= {};
  const current = config.mcp[PENCIL_MCP_NAME];
  const same = current
    && Array.isArray(current.command)
    && current.command[0] === process.execPath
    && current.command[1] === launcher
    && current.enabled === true
    && current.type === 'local';

  if (same) {
    console.log(JSON.stringify({ status: 'ok', changed: false, configPath, reason: 'already installed (idempotent no-op)' }, null, 2));
    process.exit(0);
  }

  const backupPath = existed ? `${configPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-pencil-mcp` : null;
  if (backupPath) fs.copyFileSync(configPath, backupPath);

  const before = current ? JSON.stringify(current) : '(absent)';
  config.mcp[PENCIL_MCP_NAME] = entry;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  console.log(JSON.stringify({
    status: 'ok',
    changed: true,
    configPath,
    backupPath,
    before,
    after: entry,
    note: 'The Pencil app may overwrite this entry with its own mount path when a new app instance starts; re-run this installer afterwards or use the launcher diagnostics.',
  }, null, 2));
  process.exit(0);
}

main();
