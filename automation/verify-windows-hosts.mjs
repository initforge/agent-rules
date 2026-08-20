#!/usr/bin/env node
/**
 * verify-windows-hosts.mjs — Windows live-host MCP verification (owner §XV,
 * post-broker-removal).
 *
 * NOT run in CI. CI-safe checks live in `verify:ci` / `verify:all`; this
 * runner executes only on a real Windows desktop with live hosts.
 *
 * For every host in the canonical host matrix (host-adapters.ts) this runner:
 *   1. detects the host binary + version + Windows config path;
 *   2. installs/refreshes pinned providers (user scope) when needed;
 *   3. regenerates/validates the host MCP config from the canonical registry
 *      (owner overrides, e.g. the global opencode bypass, are recorded and
 *      respected — never silently reverted);
 *   4. performs a LIVE MCP handshake (initialize -> tools/list -> real
 *      tools/call) over the exact command lines the host would spawn;
 *   5. writes per-host + per-provider receipts (no secrets) to
 *      `.agent/tmp/host-receipts/`;
 *   6. exit code: 0 only when every PRESENT host is PASS. Hosts without a
 *      binary are recorded UNSUPPORTED and skipped (owner: "không có host nào
 *      thì bỏ qua thôi"). BLOCKED/NEEDS_USER for a present host => exit 1.
 *
 * Usage:
 *   node automation/verify-windows-hosts.mjs            # full run
 *   node automation/verify-windows-hosts.mjs --reinstall   # force provider refresh
 *   node automation/verify-windows-hosts.mjs --host opencode
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.agent', 'tmp', 'host-receipts');
const now = () => new Date().toISOString();
const args = new Set(process.argv.slice(2));
const REINSTALL = args.has('--reinstall');
const HOST_FILTER = [...args].find((a) => a.startsWith('--host='))?.slice(7) ?? null;

fs.mkdirSync(OUT, { recursive: true });

const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'integrations', 'registry.json'), 'utf8'));
const providerById = new Map(REGISTRY.integrations.map((i) => [i.id, i]));

const LIVE_PROBES = {
  'codebase-memory-mcp': {
    configKey: 'codebase-memory',
    tool: 'list_projects',
    args: {},
  },
  'playwright-mcp': {
    configKey: 'playwright',
    tool: 'browser_navigate',
    args: { url: 'about:blank' },
  },
  'chrome-devtools-mcp': {
    configKey: 'chrome-devtools',
    tool: 'list_pages',
    args: {},
  },
  context7: {
    configKey: 'context7',
    tool: 'resolve-library-id',
    args: { libraryName: 'lodash', query: 'map' },
  },
};

const HOSTS = [
  {
    id: 'opencode',
    binaryNames: ['opencode.exe', 'opencode'],
    versionFlag: ['--version'],
    extraDirs: [
      path.join(os.homedir(), '.opencode', 'bin'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'opencode'),
    ],
  },
  {
    id: 'codex',
    binaryNames: ['codex.exe', 'codex'],
    versionFlag: ['-V'],
    extraDirs: [
      path.join(os.homedir(), '.codex', 'plugins', '.plugin-appserver'),
      path.join(os.homedir(), '.codex', 'bin'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Codex'),
      path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin'),
      path.join(os.homedir(), '.codex'),
    ],
  },
  {
    id: 'antigravity',
    binaryNames: ['Antigravity.exe', 'antigravity.exe', 'antigravity'],
    versionFlag: ['--version'],
    extraDirs: [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'antigravity'),
      path.join(os.homedir(), '.gemini', 'antigravity', 'bin'),
      path.join(os.homedir(), '.gemini', 'config'),
    ],
  },
  {
    id: 'claude',
    binaryNames: ['claude.exe', 'claude'],
    versionFlag: ['--version'],
    extraDirs: [
      path.join(os.homedir(), '.claude', 'bin'),
      path.join(os.homedir(), '.claude'),
    ],
  },
  {
    id: 'cursor',
    binaryNames: ['cursor.exe', 'Cursor.exe', 'cursor'],
    versionFlag: ['--version'],
    extraDirs: [
      path.join(os.homedir(), '.cursor', 'bin'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor'),
    ],
  },
  {
    id: 'grok',
    binaryNames: ['grok.exe', 'grok'],
    versionFlag: ['--version'],
    extraDirs: [
      path.join(os.homedir(), '.grok', 'bin'),
    ],
  },
  {
    id: 'mimocode',
    binaryNames: ['mimocode.exe', 'mimocode'],
    versionFlag: ['--version'],
    extraDirs: [
      path.join(os.homedir(), '.mimocode', 'bin'),
    ],
  },
];

const GLOBAL_EXTRA_DIRS = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity'),
  path.join(os.homedir(), '.codex', 'plugins', '.plugin-appserver'),
  path.join(os.homedir(), '.codex', 'bin'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Codex'),
  path.join(os.homedir(), '.gemini', 'antigravity', 'bin'),
  path.join(os.homedir(), '.local', 'bin'),
  path.join(process.env.APPDATA || '', 'npm'),
];

function findChromiumOrEdge() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1232', 'chrome-win64', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function whichHost(host) {
  const pathEnv = process.env.PATH ?? '';
  const dirs = [
    ...(host.extraDirs ?? []),
    ...pathEnv.split(path.delimiter).filter(Boolean),
    ...GLOBAL_EXTRA_DIRS,
  ];

  if (host.id === 'codex') {
    const codexCfg = path.join(os.homedir(), '.codex', 'config.toml');
    if (fs.existsSync(codexCfg)) {
      try {
        const text = fs.readFileSync(codexCfg, 'utf8');
        const match = text.match(/CODEX_CLI_PATH\s*=\s*['"]([^'"]+)['"]/);
        if (match && fs.existsSync(match[1])) return match[1];
      } catch { /* ignore */ }
    }
  }

  for (const name of host.binaryNames) {
    for (const d of dirs) {
      try {
        const p = path.join(d, name);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      } catch { /* not here */ }
    }
  }
  return null;
}

function run(cmd, argv, opts = {}) {
  const res = spawnSync(cmd, argv, {
    encoding: 'utf8',
    timeout: opts.timeout ?? 45000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  return {
    ok: res.status === 0 && !res.error,
    status: res.status,
    stdout: String(res.stdout ?? ''),
    stderr: String(res.stderr ?? ''),
    error: res.error ? res.error.message : null,
  };
}

function getHostVersion(host, bin) {
  if (host.id === 'antigravity') {
    try {
      const ps = spawnSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Item "${bin}").VersionInfo.ProductVersion`], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (ps.status === 0 && ps.stdout.trim()) {
        return { ok: true, version: ps.stdout.trim() };
      }
    } catch { /* ignore */ }
  }
  const v = run(bin, host.versionFlag, { timeout: 10000 });
  if (v.ok && v.stdout.trim()) {
    return { ok: true, version: v.stdout.trim().split('\n')[0].trim() };
  }
  if (v.ok) {
    return { ok: true, version: 'installed' };
  }
  return { ok: false, version: null, error: v.stderr || v.error };
}

/** MCP stdio live probe over the exact command a host config declares. */
function probeProvider(command, providerId, toolCallName, toolCall, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    let buffer = '';
    let stderrTail = '';
    const pending = new Map();
    const receipt = {
      provider_id: providerId,
      status: 'PENDING',
      transport: 'stdio',
      command: command,
      evidence: [],
      reason: null,
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      receipt.status = 'BLOCKED';
      receipt.reason = 'handshake timeout';
      resolve(receipt);
    }, timeoutMs);
    child.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-1500); });
    child.stdout.on('data', (d) => {
      buffer += d.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && msg.id !== null && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      receipt.status = 'BLOCKED';
      receipt.reason = `spawn failed: ${err.message}`;
      resolve(receipt);
    });
    child.on('exit', (code) => {
      if (receipt.status === 'PENDING') {
        clearTimeout(timer);
        receipt.status = 'BLOCKED';
        receipt.reason = `provider exited early (code ${code})`;
        if (stderrTail) receipt.evidence.push({ kind: 'stderr_tail', text: stderrTail.slice(-600) });
        resolve(receipt);
      }
    });
    const send = (m) => child.stdin.write(JSON.stringify(m) + '\n');
    const req = (method, params) => new Promise((res) => {
      const id = `${providerId}-${Math.random().toString(36).slice(2, 8)}`;
      pending.set(id, res);
      send({ jsonrpc: '2.0', id, method, params });
    });
    (async () => {
      try {
        const init = await req('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'agent-rules-verify-windows-hosts', version: '1' }
        });
        if (init.error) throw new Error(`initialize error: ${JSON.stringify(init.error)}`);
        send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
        receipt.evidence.push({ kind: 'handshake', server_info: init.result?.serverInfo ?? null, protocol_version: init.result?.protocolVersion ?? null });
        const tools = await req('tools/list', {});
        if (tools.error) throw new Error(`tools/list error: ${JSON.stringify(tools.error)}`);
        const list = tools.result?.tools ?? [];
        receipt.evidence.push({ kind: 'tools_list', count: list.length, sample: list.slice(0, 10).map((t) => t.name) });
        const call = await req('tools/call', { name: toolCallName, arguments: toolCall });
        if (call.error) throw new Error(`${toolCallName} error: ${JSON.stringify(call.error)}`);
        const content = call.result?.content ?? [];
        const text = content.filter((c) => c.type === 'text').map((c) => String(c.text ?? '')).join(' ').slice(0, 300);
        const images = content.filter((c) => c.type === 'image');
        if (images.length > 0 && images[0]?.data) {
          const file = path.join(OUT, `${providerId}-screenshot-${Date.now()}.png`);
          fs.writeFileSync(file, Buffer.from(images[0].data, 'base64'));
        }
        if (call.result?.isError) throw new Error(`${toolCallName} returned isError=true: ${text}`);
        receipt.evidence.push({ kind: 'tools_call', tool: toolCallName, args: toolCall, text_preview: text, content_types: content.map((c) => c.type) });
        receipt.status = 'PASS';
      } catch (e) {
        receipt.status = 'BLOCKED';
        receipt.reason = String(e.message ?? e);
        if (stderrTail) receipt.evidence.push({ kind: 'stderr_tail', text: stderrTail.slice(-600) });
      }
      clearTimeout(timer);
      try { child.kill(); } catch { /* ignore */ }
      resolve(receipt);
    })();
  });
}

function globalOpencodeConfigPath() {
  for (const candidate of ['opencode.jsonc', 'opencode.json']) {
    const p = path.join(os.homedir(), '.config', 'opencode', candidate);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function ensureProviderInstalled(id) {
  const entry = providerById.get(id);
  if (!entry) return { ok: false, error: `unknown provider ${id}` };
  if (entry.source?.type === 'binary' || entry.install?.type === 'binary') {
    const target = path.join(process.env.LOCALAPPDATA || '', 'Programs', id, `${id}.exe`);
    if (!REINSTALL && fs.existsSync(target)) {
      const v = run(target, ['--version']);
      if (v.ok) {
        return { ok: true, binary: target, version: v.stdout.trim() };
      }
    }
    const script = path.join(ROOT, entry.install.script);
    const res = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Force'], {
      encoding: 'utf8',
      timeout: 300000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exists = fs.existsSync(target);
    const v = exists ? run(target, ['--version']) : { ok: false };
    return {
      ok: res.status === 0 && exists && v.ok,
      binary: target,
      version: v.stdout ? v.stdout.trim() : null,
      stderr: String(res.stderr ?? '').slice(-400),
      error: !exists ? 'binary missing after install' : (!v.ok ? 'binary version probe failed' : null),
    };
  }
  // npm/npx providers: warm the user-scope npx cache with the pinned version.
  const pkg = entry.source.package;
  const ver = entry.source.version;
  const fullPkg = `${pkg}@${ver}`;
  if (!REINSTALL) {
    const warm = run('cmd.exe', ['/d', '/s', '/c', 'npx', '-y', fullPkg, '--version'], { timeout: 120000 });
    if (warm.ok) return { ok: true, package: fullPkg, version: warm.stdout.trim() };
  }
  const res = run('cmd.exe', ['/d', '/s', '/c', 'npx', '-y', fullPkg, '--version'], { timeout: 300000 });
  return { ok: res.ok, package: fullPkg, stderr: res.stderr.slice(-400), error: res.ok ? null : (res.error || res.stderr) };
}

function resolveHostProviderCommand(hostId, providerId, installed) {
  const probeSpec = LIVE_PROBES[providerId];
  const browserBin = findChromiumOrEdge();
  const entry = providerById.get(providerId);

  if (providerId === 'codebase-memory-mcp') {
    const bin = installed.binary || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'codebase-memory-mcp', 'codebase-memory-mcp.exe');
    return [bin];
  }
  if (providerId === 'playwright-mcp') {
    const ver = entry?.source?.version ?? '0.0.78';
    const pkg = entry?.source?.package ?? '@playwright/mcp';
    return ['cmd.exe', '/d', '/s', '/c', 'npx', '-y', `${pkg}@${ver}`, '--isolated', ...(browserBin ? ['--executable-path', browserBin] : [])];
  }
  if (providerId === 'chrome-devtools-mcp') {
    const ver = entry?.source?.version ?? '1.7.0';
    const pkg = entry?.source?.package ?? 'chrome-devtools-mcp';
    return ['cmd.exe', '/d', '/s', '/c', 'npx', '-y', `${pkg}@${ver}`, '--isolated', ...(browserBin ? ['--executablePath', browserBin] : [])];
  }
  if (providerId === 'context7') {
    const ver = entry?.source?.version ?? '3.2.5';
    const pkg = entry?.source?.package ?? '@upstash/context7-mcp';
    return ['cmd.exe', '/d', '/s', '/c', 'npx', '-y', `${pkg}@${ver}`];
  }
  return null;
}

function ensureCodexConfig(configPath, installedProviders) {
  let content = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const backupPath = `${configPath}.bak`;
  if (!fs.existsSync(backupPath) && content) {
    try { fs.writeFileSync(backupPath, content, 'utf8'); } catch { /* ignore */ }
  }

  const browserBin = findChromiumOrEdge();
  const cbBin = installedProviders['codebase-memory-mcp']?.binary || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'codebase-memory-mcp', 'codebase-memory-mcp.exe');

  const requiredSections = {
    'codebase-memory': `[mcp_servers.codebase-memory]\ncommand = '${cbBin.replace(/\\/g, '\\\\')}'\nargs = []\nstartup_timeout_sec = 120\n`,
    'playwright': `[mcp_servers.playwright]\ncommand = 'cmd.exe'\nargs = ['/d', '/s', '/c', 'npx', '-y', '@playwright/mcp@0.0.78', '--isolated'${browserBin ? `, '--executable-path', '${browserBin.replace(/\\/g, '\\\\')}'` : ''}]\nstartup_timeout_sec = 120\n`,
    'chrome-devtools': `[mcp_servers.chrome-devtools]\ncommand = 'cmd.exe'\nargs = ['/d', '/s', '/c', 'npx', '-y', 'chrome-devtools-mcp@1.7.0', '--isolated'${browserBin ? `, '--executablePath', '${browserBin.replace(/\\/g, '\\\\')}'` : ''}]\nstartup_timeout_sec = 120\n`,
    'context7': `[mcp_servers.context7]\ncommand = 'cmd.exe'\nargs = ['/d', '/s', '/c', 'npx', '-y', '@upstash/context7-mcp@3.2.5']\nstartup_timeout_sec = 120\n`,
  };

  let changed = false;
  for (const [key, section] of Object.entries(requiredSections)) {
    const pattern = new RegExp(`\\[mcp_servers\\.${key}\\][\\s\\S]*?(?=\\n\\[|$)`, 'm');
    if (!pattern.test(content)) {
      content = content.trimEnd() + '\n\n' + section;
      changed = true;
    }
  }

  if (changed) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, content, 'utf8');
  }

  return {
    path: configPath,
    sha256: createHash('sha256').update(content).digest('hex').slice(0, 16),
  };
}

function ensureAntigravityConfig(configPath, installedProviders) {
  let config = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && typeof parsed === 'object') config = parsed;
      if (!config.mcpServers) config.mcpServers = {};
    } catch { /* ignore */ }
  }

  const browserBin = findChromiumOrEdge();
  const cbBin = installedProviders['codebase-memory-mcp']?.binary || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'codebase-memory-mcp', 'codebase-memory-mcp.exe');

  config.mcpServers['codebase-memory'] = {
    command: cbBin,
    args: [],
  };
  config.mcpServers['playwright'] = {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'npx', '-y', '@playwright/mcp@0.0.78', '--isolated', ...(browserBin ? ['--executable-path', browserBin] : [])],
  };
  config.mcpServers['chrome-devtools'] = {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'npx', '-y', 'chrome-devtools-mcp@1.7.0', '--isolated', ...(browserBin ? ['--executablePath', browserBin] : [])],
    env: {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
      CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1',
    },
  };
  config.mcpServers['context7'] = {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'npx', '-y', '@upstash/context7-mcp@3.2.5'],
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const raw = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, raw, 'utf8');

  // Also update antigravity config in ~/.gemini/antigravity if it exists
  const altPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');
  if (fs.existsSync(path.dirname(altPath))) {
    try { fs.writeFileSync(altPath, raw, 'utf8'); } catch { /* ignore */ }
  }

  return {
    path: configPath,
    sha256: createHash('sha256').update(raw).digest('hex').slice(0, 16),
  };
}

async function verifyOpencode() {
  const hostReceipt = {
    schema: 'agent-rules/windows-host-receipt',
    host: 'opencode',
    status: 'PENDING',
    generated_at: now(),
    evidence: [],
    reason: null,
  };
  const configPath = globalOpencodeConfigPath();
  if (!configPath) {
    hostReceipt.status = 'BLOCKED';
    hostReceipt.reason = 'no global opencode config found (~/.config/opencode/opencode.jsonc)';
    return hostReceipt;
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    hostReceipt.status = 'BLOCKED';
    hostReceipt.reason = `global opencode config unreadable: ${configPath}`;
    return hostReceipt;
  }
  const configContent = fs.readFileSync(configPath, 'utf8');
  hostReceipt.evidence.push({
    kind: 'config',
    path: configPath,
    sha256: createHash('sha256').update(configContent).digest('hex').slice(0, 16),
  });
  const mcp = config.mcp ?? {};
  const providerResults = [];
  let allPass = true;
  for (const [providerId, probeSpec] of Object.entries(LIVE_PROBES)) {
    const entry = mcp[probeSpec.configKey];
    if (!entry || entry.enabled === false) {
      providerResults.push({ provider_id: providerId, status: 'UNSUPPORTED', reason: `not configured in global opencode config (key: ${probeSpec.configKey})` });
      allPass = false;
      continue;
    }
    const installed = ensureProviderInstalled(providerId);
    if (!installed.ok) {
      providerResults.push({
        provider_id: providerId,
        status: 'BLOCKED',
        reason: `provider install failed: ${installed.error ?? installed.stderr}`,
      });
      allPass = false;
      console.log(`  opencode/${providerId}: BLOCKED — provider install failed`);
      continue;
    }
    const command = entry.command;
    const probe = await probeProvider(command, providerId, probeSpec.tool, probeSpec.args);
    fs.writeFileSync(
      path.join(OUT, `opencode-${providerId}.json`),
      JSON.stringify({ schema: 'agent-rules/windows-provider-receipt', host: 'opencode', ...probe, completed_at: now() }, null, 2)
    );
    providerResults.push({ provider_id: providerId, status: probe.status, reason: probe.reason, evidence: probe.evidence.length });
    if (probe.status !== 'PASS') allPass = false;
    console.log(`  opencode/${providerId}: ${probe.status}${probe.reason ? ` — ${probe.reason}` : ''}`);
  }
  hostReceipt.providers = providerResults;
  hostReceipt.status = allPass ? 'PASS' : 'BLOCKED';
  if (!allPass) hostReceipt.reason = 'one or more opencode MCP providers are not live';
  return hostReceipt;
}

async function verifyHostWithProviders(host, providerIds) {
  const receipt = {
    schema: 'agent-rules/windows-host-receipt',
    host: host.id,
    status: 'PENDING',
    generated_at: now(),
    evidence: [],
    reason: null,
  };
  const bin = whichHost(host);
  if (!bin) {
    receipt.status = 'UNSUPPORTED';
    receipt.reason = `host binary not found on this machine (searched PATH + user dirs) — skipped per owner policy`;
    return receipt;
  }
  receipt.evidence.push({ kind: 'binary', path: bin });
  const v = getHostVersion(host, bin);
  receipt.evidence.push({ kind: 'version', version: v.version, ok: v.ok });

  const installedProviders = {};
  for (const id of providerIds) {
    const installed = ensureProviderInstalled(id);
    installedProviders[id] = installed;
  }

  // Update & verify host config
  if (host.id === 'codex') {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    const cfgInfo = ensureCodexConfig(configPath, installedProviders);
    receipt.evidence.push({ kind: 'config', path: cfgInfo.path, sha256: cfgInfo.sha256 });
    receipt.evidence.push({ kind: 'host_observation', note: 'Codex provides host-level/provider-level evidence without exposing per-chat/session identity.' });
  } else if (host.id === 'antigravity') {
    const configPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
    const cfgInfo = ensureAntigravityConfig(configPath, installedProviders);
    receipt.evidence.push({ kind: 'config', path: cfgInfo.path, sha256: cfgInfo.sha256 });
  }

  const providerResults = [];
  let allPass = true;
  for (const id of providerIds) {
    const entry = providerById.get(id);
    if (!entry) continue;
    if (!(entry.nativeHosts ?? []).includes(host.id)) continue;
    const probeSpec = LIVE_PROBES[id];
    if (!probeSpec) continue;

    const installed = installedProviders[id];
    if (!installed.ok) {
      providerResults.push({ provider_id: id, status: 'BLOCKED', reason: `provider install failed: ${installed.error ?? installed.stderr}` });
      allPass = false;
      console.log(`  ${host.id}/${id}: BLOCKED — provider install failed`);
      continue;
    }

    const command = resolveHostProviderCommand(host.id, id, installed);
    if (!command) {
      providerResults.push({ provider_id: id, status: 'BLOCKED', reason: `cannot resolve host provider command for ${id}` });
      allPass = false;
      continue;
    }

    const probe = await probeProvider(command, id, probeSpec.tool, probeSpec.args);
    fs.writeFileSync(
      path.join(OUT, `${host.id}-${id}.json`),
      JSON.stringify({ schema: 'agent-rules/windows-provider-receipt', host: host.id, ...probe, completed_at: now() }, null, 2)
    );
    providerResults.push({ provider_id: id, status: probe.status, reason: probe.reason, evidence: probe.evidence.length });
    if (probe.status !== 'PASS') allPass = false;
    console.log(`  ${host.id}/${id}: ${probe.status}${probe.reason ? ` — ${probe.reason}` : ''}`);
  }
  receipt.providers = providerResults;
  receipt.status = allPass ? 'PASS' : 'BLOCKED';
  if (!allPass) receipt.reason = 'host present but one or more providers not live';
  return receipt;
}

async function main() {
  if (process.platform !== 'win32') {
    console.error('verify:windows-hosts only runs on Windows (live host verification). CI uses verify:ci.');
    process.exit(78);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const receipts = [];
  const order = HOSTS.map((h) => h.id);
  const filtered = HOST_FILTER ? order.filter((id) => id === HOST_FILTER) : order;
  for (const id of filtered) {
    const host = HOSTS.find((h) => h.id === id);
    console.log(`\n=== host ${id} ===`);
    let receipt;
    if (id === 'opencode') {
      receipt = await verifyOpencode();
    } else {
      receipt = await verifyHostWithProviders(host, ['codebase-memory-mcp', 'playwright-mcp', 'chrome-devtools-mcp', 'context7']);
    }
    fs.writeFileSync(path.join(OUT, `host-${id}.json`), JSON.stringify(receipt, null, 2));
    receipts.push({ host: id, status: receipt.status, reason: receipt.reason });
    console.log(`${id}: ${receipt.status}${receipt.reason ? ` — ${receipt.reason}` : ''}`);
  }
  const summary = {
    schema: 'agent-rules/windows-hosts-summary',
    generated_at: now(),
    platform: process.platform,
    receipts_dir: OUT,
    hosts: receipts,
    passed: receipts.filter((r) => r.status === 'PASS').length,
    unsupported: receipts.filter((r) => r.status === 'UNSUPPORTED').length,
    blocked: receipts.filter((r) => ['BLOCKED', 'NEEDS_USER'].includes(r.status)).length,
    note: 'CI does not run live host verification; this runner is Windows-local only.',
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n' + JSON.stringify(summary, null, 2));
  const failed = receipts.filter((r) => ['BLOCKED', 'NEEDS_USER'].includes(r.status));
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
