#!/usr/bin/env node
/**
 * session-launch.mjs — AM-0006 OpenCode session-launch wrapper.
 *
 * Launches an interactive OpenCode session with a runtime-injected
 * focus/workspace binding so GUI MCP servers (Playwright, Chrome DevTools,
 * Pencil) open on THIS session's virtual desktop without stealing focus.
 *
 * Flow:
 *   1. Resolve the source binding for the terminal this wrapper runs in
 *      (exact window via --window, or single-candidate auto-resolution).
 *   2. Resolved:
 *        - generate a per-session id;
 *        - read the global opencode config and inject
 *          AGENT_RULES_SOURCE_WINDOW_ID / AGENT_RULES_TARGET_WORKSPACE /
 *          AGENT_RULES_MCP_SESSION_ID into the managed MCP entries'
 *          environment (playwright, chrome-devtools, pencil);
 *        - write a per-session config under
 *          ~/.config/opencode/agent-rules-sessions/;
 *        - launch `opencode` with OPENCODE_CONFIG pointing at it.
 *   3. Needs-user / blocked (multiple candidate windows, no trustworthy
 *      binding): launch opencode WITHOUT a per-session config and print clear
 *      guidance. No guessing, no first-window heuristic. GUI MCPs will fail
 *      closed (NEEDS_USER) at use time.
 *
 * The global config itself never contains a hardcoded source window or
 * workspace — the binding is always session-local.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WRAPPER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BINDING_MODULE = path.join(WRAPPER_ROOT, 'automation', 'session-binding.mjs');
const resolvedBinding = await import(pathToFileURL(BINDING_MODULE).href).then((m) => m.resolveBinding);

const SESSION_DIR = path.join(os.homedir(), '.config', 'opencode', 'agent-rules-sessions');
const GLOBAL_CONFIG = process.env.AGENT_RULES_OPENCODE_CONFIG
  ? path.resolve(process.env.AGENT_RULES_OPENCODE_CONFIG)
  : path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
const MANAGED_MCP_KEYS = ['playwright', 'chrome-devtools', 'pencil'];

export function buildSessionConfig(binding, sessionId, globalConfigPath = GLOBAL_CONFIG) {
  if (!fs.existsSync(globalConfigPath)) throw new Error(`global opencode config missing: ${globalConfigPath}`);
  const config = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
  const env = {
    AGENT_RULES_SOURCE_WINDOW_ID: binding.windowId,
    AGENT_RULES_TARGET_WORKSPACE: String(binding.workspace),
    AGENT_RULES_MCP_SESSION_ID: sessionId,
  };
  for (const key of MANAGED_MCP_KEYS) {
    const entry = config.mcp?.[key];
    if (entry && typeof entry === 'object') {
      entry.environment = { ...(entry.environment ?? {}), ...env };
    }
  }
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const file = path.join(SESSION_DIR, `opencode.${sessionId}.json`);
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return file;
}

function main() {
  const argv = process.argv.slice(2);
  const explicit = argv.indexOf('--window') >= 0 ? argv[argv.indexOf('--window') + 1] : undefined;
  const extra = explicit ? argv.filter((arg) => arg !== '--window' && arg !== explicit) : argv;

  const binding = resolvedBinding({ window: explicit });
  let sessionEnv = { ...process.env };
  if (binding.status === 'resolved') {
    const sessionId = randomUUID().slice(0, 8);
    const configPath = buildSessionConfig(binding, sessionId);
    sessionEnv.OPENCODE_CONFIG = configPath;
    console.error(`[session-launch] binding window=${binding.windowHash} workspace=${binding.workspace} session=${sessionId} config=${configPath}`);
  } else {
    console.error(`[session-launch] NO binding (${binding.status}): ${binding.reason}`);
    console.error('[session-launch] Launching unbound. GUI MCPs (Playwright/Chrome DevTools/Pencil) will fail closed with NEEDS_USER. To bind this session: node automation/session-binding.mjs --window <id>');
  }
  const child = spawn('opencode', extra.length > 0 ? extra : undefined, { stdio: 'inherit', env: sessionEnv });
  child.on('error', (error) => {
    console.error(`[session-launch] failed to launch opencode: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
