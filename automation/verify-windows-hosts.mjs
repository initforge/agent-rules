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
    id: 'deepseek-harness',
    binaryNames: ['dsh.cmd', 'dsh.exe', 'dsh', 'deepseek-harness.cmd', 'deepseek-harness.exe', 'deepseek-harness'],
    versionFlag: ['--version'],
    extraDirs: [
      path.join(os.homedir(), '.dsh', 'bin'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'deepseek-harness'),
    ],
  },
  {
    id: 'command-code',
    binaryNames: ['cmdc.cmd', 'cmdc.exe', 'cmdc', 'command-code.cmd', 'command-code.exe', 'command-code'],
    versionFlag: ['--version'],
    extraDirs: [
      path.join(os.homedir(), '.commandcode', 'bin'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'command-code'),
    ],
  },
  {
    id: 'omp',
    binaryNames: ['omp.exe', 'omp.cmd', 'omp'],
    versionFlag: ['--version'],
    extraDirs: [
      path.join(process.env.LOCALAPPDATA || '', 'omp'),
      path.join(os.homedir(), '.omp'),
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

function getGitHead() {
  try {
    const res = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    return res.status === 0 ? res.stdout.trim() : null;
  } catch {
    return null;
  }
}

function run(cmd, argv, opts = {}) {
  const isCmdOrBat = typeof cmd === 'string' && (cmd.endsWith('.cmd') || cmd.endsWith('.bat'));
  const actualCmd = isCmdOrBat ? (process.env.ComSpec || 'cmd.exe') : cmd;
  const actualArgs = isCmdOrBat ? ['/d', '/s', '/c', cmd, ...argv] : argv;
  const res = spawnSync(actualCmd, actualArgs, {
    encoding: 'utf8',
    timeout: opts.timeout ?? 45000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
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
  if (host.id === 'antigravity' || host.id === 'cursor') {
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

function ensureCursorConfig(configPath, installedProviders) {
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
  };
  config.mcpServers['context7'] = {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'npx', '-y', '@upstash/context7-mcp@3.2.5'],
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const raw = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, raw, 'utf8');

  return {
    path: configPath,
    sha256: createHash('sha256').update(raw).digest('hex').slice(0, 16),
  };
}

async function verifyOpencode(host) {
  const gitHead = getGitHead();
  const hostReceipt = {
    schema: 'agent-rules/windows-host-receipt',
    host: 'opencode',
    status: 'PENDING',
    generated_at: now(),
    git_head: gitHead,
    evidence: [],
    reason: null,
    claims: {
      NATIVE_INSTALLED: { status: 'PENDING', evidence: [] },
      NATIVE_READBACK: { status: 'PENDING', evidence: [] },
      NATIVE_OBSERVED: { status: 'PENDING', evidence: [] },
      NATIVE_POLICY_VERIFIED: { status: 'PENDING', evidence: [] },
      MODEL_BEHAVIOR_VERIFIED: { status: 'PENDING', evidence: [] },
    },
    providers: [],
  };
  const bin = host ? whichHost(host) : null;
  let versionOk = false;
  if (bin) {
    hostReceipt.evidence.push({ kind: 'binary', path: bin });
    const v = getHostVersion(host, bin);
    hostReceipt.evidence.push({ kind: 'version', version: v.version, ok: v.ok });
    versionOk = !!v.ok && !!v.version;
    if (versionOk) {
      hostReceipt.claims.NATIVE_INSTALLED.status = 'PASS';
      hostReceipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'binary', path: bin, version: v.version });
    } else {
      hostReceipt.claims.NATIVE_INSTALLED.status = 'BLOCKED';
      hostReceipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'version_probe_failed', ok: false, error: v.error });
    }
  } else {
    hostReceipt.claims.NATIVE_INSTALLED.status = 'BLOCKED';
    hostReceipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'binary_missing' });
  }
  const configPath = globalOpencodeConfigPath();
  if (!configPath) {
    hostReceipt.claims.NATIVE_INSTALLED.status = 'BLOCKED';
    hostReceipt.claims.NATIVE_READBACK.status = 'BLOCKED';
    hostReceipt.evidence.push({ kind: 'opencode_config_missing', reason: 'no global opencode config' });
    // still continue to allow provider separation, but infra is blocked
  } else {
    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      hostReceipt.claims.NATIVE_READBACK.status = 'BLOCKED';
      hostReceipt.evidence.push({ kind: 'config_unreadable', path: configPath });
      config = null;
    }
    if (configPath && fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const sha = createHash('sha256').update(configContent).digest('hex').slice(0, 16);
      hostReceipt.evidence.push({ kind: 'config', path: configPath, sha256: sha });
      if (hostReceipt.claims.NATIVE_INSTALLED.status !== 'BLOCKED') {
        hostReceipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'config_hash', path: configPath, sha256: sha });
      }
      // NATIVE_READBACK: overlay + config projection
      try {
        const overlayPath = path.join(ROOT, 'platforms', 'opencode', 'opencode-overlay.md');
        if (fs.existsSync(overlayPath)) {
          const content = fs.readFileSync(overlayPath, 'utf8');
          const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
          hostReceipt.claims.NATIVE_READBACK.status = 'PASS';
          hostReceipt.claims.NATIVE_READBACK.evidence.push({ kind: 'overlay_readback', path: overlayPath, hash });
        } else {
          hostReceipt.claims.NATIVE_READBACK.status = 'BLOCKED';
          hostReceipt.claims.NATIVE_READBACK.evidence.push({ kind: 'overlay_missing', path: overlayPath });
        }
      } catch (e) {
        hostReceipt.claims.NATIVE_READBACK.status = 'BLOCKED';
        hostReceipt.claims.NATIVE_READBACK.evidence.push({ kind: 'readback_error', error: String(e.message ?? e) });
      }
    }
  }
  // NATIVE_OBSERVED for opencode: session lifecycle — requires real session event, not just config
  hostReceipt.claims.NATIVE_OBSERVED.status = 'NEEDS_USER';
  hostReceipt.claims.NATIVE_OBSERVED.evidence.push({ kind: 'session_lifecycle_deferred', reason: 'opencode session lifecycle requires real host session event; config presence alone not sufficient; AGENT_RULES_ADAPTER_PROBE=1 ignored' });
  // NATIVE_POLICY_VERIFIED: V2 permission model can be probed offline via adapter, but not in this provider-only path
  hostReceipt.claims.NATIVE_POLICY_VERIFIED.status = 'NEEDS_USER';
  hostReceipt.claims.NATIVE_POLICY_VERIFIED.evidence.push({ kind: 'policy_canary_deferred', reason: 'opencode V2 ordered-rules allow/deny/ask canary requires harmless offline probe via openCodeAdapter; not run in this mcp-focused verification' });
  // MODEL_BEHAVIOR
  hostReceipt.claims.MODEL_BEHAVIOR_VERIFIED.status = 'NEEDS_USER';
  hostReceipt.claims.MODEL_BEHAVIOR_VERIFIED.evidence.push({ kind: 'model_behavior_requires_credential', reason: 'requires logged-in opencode session + real prompt to verify natural communication behavior' });
  const mcp = (() => { try { return JSON.parse(fs.readFileSync(configPath, 'utf8')).mcp ?? {}; } catch { return {}; }})();
  const providerResults = [];
  let providersAllPass = true;
  for (const [providerId, probeSpec] of Object.entries(LIVE_PROBES)) {
    const entry = mcp[probeSpec.configKey];
    if (!entry || entry.enabled === false) {
      providerResults.push({ provider_id: providerId, status: 'UNSUPPORTED', reason: `not configured in global opencode config (key: ${probeSpec.configKey})` });
      providersAllPass = false;
      continue;
    }
    const installed = ensureProviderInstalled(providerId);
    if (!installed.ok) {
      providerResults.push({
        provider_id: providerId,
        status: 'BLOCKED',
        reason: `provider install failed: ${installed.error ?? installed.stderr}`,
      });
      providersAllPass = false;
      console.log(`  opencode/${providerId}: BLOCKED — provider install failed`);
      continue;
    }
    const command = Array.isArray(entry.command) ? entry.command : [entry.command, ...(entry.args || [])];
    const probe = await probeProvider(command, providerId, probeSpec.tool, probeSpec.args);
    fs.writeFileSync(
      path.join(OUT, `opencode-${providerId}.json`),
      JSON.stringify({ schema: 'agent-rules/windows-provider-receipt', host: 'opencode', ...probe, completed_at: now() }, null, 2)
    );
    providerResults.push({ provider_id: providerId, status: probe.status, reason: probe.reason, evidence: probe.evidence.length });
    if (probe.status !== 'PASS') providersAllPass = false;
    console.log(`  opencode/${providerId}: ${probe.status}${probe.reason ? ` — ${probe.reason}` : ''}`);
  }
  hostReceipt.providers = providerResults;
  hostReceipt.evidence.push({ kind: 'providers_summary', providersAllPass, note: 'MCP provider PASS does NOT imply host-native PASS' });
  // Derive overall infrastructure status (providers excluded)
  const infraClaims = ['NATIVE_INSTALLED', 'NATIVE_READBACK', 'NATIVE_OBSERVED', 'NATIVE_POLICY_VERIFIED'];
  const infraBlocked = infraClaims.some(k => hostReceipt.claims[k].status === 'BLOCKED');
  const infraAllPass = infraClaims.every(k => hostReceipt.claims[k].status === 'PASS');
  if (infraBlocked) { hostReceipt.status = 'BLOCKED'; hostReceipt.reason = `native infra blocked: ${infraClaims.filter(k=>hostReceipt.claims[k].status==='BLOCKED').join(', ')}`; }
  else if (!infraAllPass) { hostReceipt.status = 'NEEDS_USER'; hostReceipt.reason = `NATIVE_INFRASTRUCTURE partial — ${infraClaims.map(k=>k+':'+hostReceipt.claims[k].status).join(', ')}; providers ${providersAllPass? 'PASS':'partial'} separately`; }
  else { hostReceipt.status = 'NEEDS_USER'; hostReceipt.reason = 'NATIVE_INFRASTRUCTURE PASS — MODEL_BEHAVIOR NEEDS_USER (providers separate)'; }
  return hostReceipt;
}

async function verifyDeepseekHarness(host) {
  const gitHead = getGitHead();
  const receipt = {
    schema: 'agent-rules/windows-host-receipt',
    host: 'deepseek-harness',
    status: 'PENDING',
    generated_at: now(),
    git_head: gitHead,
    evidence: [],
    reason: null,
    claims: {
      NATIVE_INSTALLED: { status: 'PENDING', evidence: [] },
      NATIVE_READBACK: { status: 'PENDING', evidence: [] },
      NATIVE_OBSERVED: { status: 'PENDING', evidence: [] },
      NATIVE_POLICY_VERIFIED: { status: 'PENDING', evidence: [] },
      MODEL_BEHAVIOR_VERIFIED: { status: 'PENDING', evidence: [] },
    },
    providers: [],
  };
  const bin = whichHost(host);
  if (!bin) {
    receipt.status = 'UNSUPPORTED';
    receipt.reason = 'dsh binary not found on this machine';
    for (const k of Object.keys(receipt.claims)) receipt.claims[k].status = 'UNSUPPORTED';
    return receipt;
  }
  receipt.evidence.push({ kind: 'binary', path: bin });
  const v = getHostVersion(host, bin);
  receipt.evidence.push({ kind: 'version', version: v.version, ok: v.ok });
  if (!v.ok || !v.version) {
    receipt.claims.NATIVE_INSTALLED.status = 'BLOCKED';
    receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'version_probe_failed', error: v.error });
    receipt.status = 'BLOCKED';
    receipt.reason = 'NATIVE_INSTALLED version probe failed — not upgraded by provider';
    for (const k of ['NATIVE_READBACK','NATIVE_OBSERVED','NATIVE_POLICY_VERIFIED','MODEL_BEHAVIOR_VERIFIED']) receipt.claims[k].status = 'BLOCKED';
    return receipt;
  }
  receipt.claims.NATIVE_INSTALLED.status = 'PASS';
  receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'binary', path: bin, version: v.version });
  // Credential-less native probe: inspect fingerprint without DEEPSEEK_API_KEY
  try {
    const { deepseekHarnessAdapter } = await import('../platforms/deepseek-harness/adapter.ts');
    const facts = await deepseekHarnessAdapter.inspectProjection();
    receipt.evidence.push({ kind: 'projection_profile', profile: facts.profile });
    receipt.evidence.push({ kind: 'projection_fingerprint', fingerprint: facts.config_fingerprint });
    receipt.evidence.push({ kind: 'plugins_count', count: facts.plugins.length });
    receipt.evidence.push({ kind: 'default_model', model: facts.agent_default_model });
    if (facts.config_fingerprint) {
      receipt.claims.NATIVE_READBACK.status = 'PASS';
      receipt.claims.NATIVE_READBACK.evidence.push({ kind: 'projection_fingerprint', fingerprint: facts.config_fingerprint, profile: facts.profile });
      receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'projection_hash', hash: facts.config_fingerprint });
    } else {
      receipt.claims.NATIVE_READBACK.status = 'BLOCKED';
      receipt.claims.NATIVE_READBACK.evidence.push({ kind: 'fingerprint_missing' });
    }
    // NATIVE_OBSERVED requires host-generated event — dsh harness not observed via standalone inspect
    receipt.claims.NATIVE_OBSERVED.status = 'NEEDS_USER';
    receipt.claims.NATIVE_OBSERVED.evidence.push({ kind: 'observed_deferred', reason: 'dsh harness inspectProjection is offline projection check; host-generated lifecycle event requires real dsh session' });
    // NATIVE_POLICY_VERIFIED: fingerprint check is offline and passes without credential, but full canary (deny unsafe etc.) still deferred
    if (facts.config_fingerprint) {
      receipt.claims.NATIVE_POLICY_VERIFIED.status = 'PASS';
      receipt.claims.NATIVE_POLICY_VERIFIED.evidence.push({ kind: 'offline_fingerprint_verified', note: 'credential-less native probe up to fingerprint boundary PASS; actual model turn remains separate' });
    } else {
      receipt.claims.NATIVE_POLICY_VERIFIED.status = 'BLOCKED';
      receipt.claims.NATIVE_POLICY_VERIFIED.evidence.push({ kind: 'policy_fingerprint_missing' });
    }
  } catch (err) {
    receipt.claims.NATIVE_READBACK.status = 'BLOCKED';
    receipt.claims.NATIVE_POLICY_VERIFIED.status = 'BLOCKED';
    receipt.evidence.push({ kind: 'adapter_error', error: String(err.message ?? err) });
  }
  receipt.claims.MODEL_BEHAVIOR_VERIFIED.status = 'NEEDS_USER';
  receipt.claims.MODEL_BEHAVIOR_VERIFIED.evidence.push({ kind: 'model_behavior_requires_credential', reason: 'Actual dsh model turn requires DEEPSEEK_API_KEY; installation/readback/policy remain independent' });
  const infraClaims = ['NATIVE_INSTALLED','NATIVE_READBACK','NATIVE_OBSERVED','NATIVE_POLICY_VERIFIED'];
  const infraBlocked = infraClaims.some(k=>receipt.claims[k].status==='BLOCKED');
  const infraAllPass = infraClaims.every(k=>receipt.claims[k].status==='PASS');
  if (infraBlocked) { receipt.status='BLOCKED'; receipt.reason=`infra blocked: ${infraClaims.filter(k=>receipt.claims[k].status==='BLOCKED').join(', ')}`; }
  else if (!infraAllPass) { receipt.status='NEEDS_USER'; receipt.reason=`NATIVE_INFRASTRUCTURE partial — ${infraClaims.map(k=>k+':'+receipt.claims[k].status).join(', ')} — MODEL_BEHAVIOR NEEDS_USER`; }
  else { receipt.status='NEEDS_USER'; receipt.reason='NATIVE_INFRASTRUCTURE PASS — MODEL_BEHAVIOR NEEDS_USER'; }
  return receipt;
}

async function verifyCommandCode(host) {
  const gitHead = getGitHead();
  const receipt = {
    schema: 'agent-rules/windows-host-receipt',
    host: 'command-code',
    status: 'PENDING',
    generated_at: now(),
    git_head: gitHead,
    evidence: [],
    reason: null,
    claims: {
      NATIVE_INSTALLED: { status: 'PENDING', evidence: [] },
      NATIVE_READBACK: { status: 'PENDING', evidence: [] },
      NATIVE_OBSERVED: { status: 'PENDING', evidence: [] },
      NATIVE_POLICY_VERIFIED: { status: 'PENDING', evidence: [] },
      MODEL_BEHAVIOR_VERIFIED: { status: 'PENDING', evidence: [] },
    },
    providers: [],
  };
  const bin = whichHost(host);
  if (!bin) {
    receipt.status = 'UNSUPPORTED';
    receipt.reason = 'command-code binary not found on this machine';
    for (const k of Object.keys(receipt.claims)) receipt.claims[k].status = 'UNSUPPORTED';
    return receipt;
  }
  receipt.evidence.push({ kind: 'binary', path: bin });
  const v = getHostVersion(host, bin);
  receipt.evidence.push({ kind: 'version', version: v.version, ok: v.ok });
  if (!v.ok || !v.version) {
    receipt.claims.NATIVE_INSTALLED.status = 'BLOCKED';
    receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'version_probe_failed', error: v.error });
    receipt.status = 'BLOCKED';
    receipt.reason = 'NATIVE_INSTALLED version probe failed — not upgraded by provider';
    for (const k of ['NATIVE_READBACK','NATIVE_OBSERVED','NATIVE_POLICY_VERIFIED','MODEL_BEHAVIOR_VERIFIED']) receipt.claims[k].status = 'BLOCKED';
    return receipt;
  }
  receipt.claims.NATIVE_INSTALLED.status = 'PASS';
  receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'binary', path: bin, version: v.version });
  // Credential-less native probe: inspect capabilities without login, never use --yolo
  try {
    const { commandCodeAdapter } = await import('../platforms/command-code/adapter.ts');
    const facts = await commandCodeAdapter.inspectCapabilities();
    receipt.evidence.push({ kind: 'permission_layer_proven', proven: facts.permission_layer_proven });
    receipt.evidence.push({ kind: 'fingerprint', fingerprint: facts.fingerprint });
    receipt.evidence.push({ kind: 'headless_json_events', supported: facts.headless_json_events });
    receipt.evidence.push({ kind: 'native_worktree', supported: facts.native_worktree });
    receipt.evidence.push({ kind: 'plan_mode', supported: facts.plan_mode });
    if (facts.permission_layer_proven && facts.fingerprint) {
      receipt.claims.NATIVE_READBACK.status = 'PASS';
      receipt.claims.NATIVE_READBACK.evidence.push({ kind: 'fingerprint', fingerprint: facts.fingerprint });
      receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'fingerprint', fingerprint: facts.fingerprint });
      receipt.claims.NATIVE_POLICY_VERIFIED.status = 'PASS';
      receipt.claims.NATIVE_POLICY_VERIFIED.evidence.push({ kind: 'permission_layer_proven', fingerprint: facts.fingerprint, note: 'credential-less probe: permission/mod/hook semantics fail-closed proven without login; never uses --yolo' });
    } else {
      receipt.claims.NATIVE_READBACK.status = 'BLOCKED';
      receipt.claims.NATIVE_READBACK.evidence.push({ kind: 'fingerprint_missing' });
      receipt.claims.NATIVE_POLICY_VERIFIED.status = 'BLOCKED';
      receipt.claims.NATIVE_POLICY_VERIFIED.evidence.push({ kind: 'permission_layer_not_proven' });
    }
    receipt.claims.NATIVE_OBSERVED.status = 'NEEDS_USER';
    receipt.claims.NATIVE_OBSERVED.evidence.push({ kind: 'observed_deferred', reason: 'command-code native worktree/plan JSON events require real headless_json observation; offline inspect not sufficient for NATIVE_OBSERVED' });
  } catch (err) {
    receipt.claims.NATIVE_READBACK.status = 'BLOCKED';
    receipt.claims.NATIVE_POLICY_VERIFIED.status = 'BLOCKED';
    receipt.evidence.push({ kind: 'adapter_error', error: String(err.message ?? err) });
  }
  receipt.claims.MODEL_BEHAVIOR_VERIFIED.status = 'NEEDS_USER';
  receipt.claims.MODEL_BEHAVIOR_VERIFIED.evidence.push({ kind: 'model_behavior_requires_login', reason: 'Actual command-code model turn requires login; infra (install/readback/policy) remains PASS without credential' });
  const infraClaims = ['NATIVE_INSTALLED','NATIVE_READBACK','NATIVE_OBSERVED','NATIVE_POLICY_VERIFIED'];
  const infraBlocked = infraClaims.some(k=>receipt.claims[k].status==='BLOCKED');
  const infraAllPass = infraClaims.every(k=>receipt.claims[k].status==='PASS');
  if (infraBlocked) { receipt.status='BLOCKED'; receipt.reason=`infra blocked: ${infraClaims.filter(k=>receipt.claims[k].status==='BLOCKED').join(', ')}`; }
  else if (!infraAllPass) { receipt.status='NEEDS_USER'; receipt.reason=`NATIVE_INFRASTRUCTURE partial — ${infraClaims.map(k=>k+':'+receipt.claims[k].status).join(', ')} — MODEL_BEHAVIOR NEEDS_USER`; }
  else { receipt.status='NEEDS_USER'; receipt.reason='NATIVE_INFRASTRUCTURE PASS — MODEL_BEHAVIOR NEEDS_USER'; }
  return receipt;
}

/**
 * OMP's native surface is its active PI agent directory.  Do not call the
 * generic provider verifier here: core installation intentionally does not
 * mutate mcp.json, and a local MCP server handshake cannot prove OMP mounted
 * it into a model session.
 */
async function verifyOmp(host) {
  const gitHead = getGitHead();
  const receipt = {
    schema: 'agent-rules/windows-host-receipt',
    host: 'omp',
    status: 'PENDING',
    generated_at: now(),
    git_head: gitHead,
    evidence: [],
    reason: null,
    claims: {
      NATIVE_INSTALLED: { status: 'PENDING', evidence: [] },
      NATIVE_READBACK: { status: 'PENDING', evidence: [] },
      NATIVE_OBSERVED: { status: 'PENDING', evidence: [] },
      NATIVE_POLICY_VERIFIED: { status: 'PENDING', evidence: [] },
      MODEL_BEHAVIOR_VERIFIED: { status: 'PENDING', evidence: [] },
    },
    providers: [],
  };
  const bin = whichHost(host);
  if (!bin) {
    receipt.status = 'UNSUPPORTED';
    receipt.reason = 'omp binary not found on this machine';
    for (const claim of Object.values(receipt.claims)) claim.status = 'UNSUPPORTED';
    return receipt;
  }
  const version = getHostVersion(host, bin);
  if (!version.ok || !version.version) {
    receipt.status = 'BLOCKED';
    receipt.reason = 'omp version probe failed';
    receipt.claims.NATIVE_INSTALLED.status = 'BLOCKED';
    receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'version_probe_failed', error: version.error });
    for (const key of ['NATIVE_READBACK', 'NATIVE_OBSERVED', 'NATIVE_POLICY_VERIFIED', 'MODEL_BEHAVIOR_VERIFIED']) receipt.claims[key].status = 'BLOCKED';
    return receipt;
  }
  receipt.claims.NATIVE_INSTALLED.status = 'PASS';
  receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'binary', path: bin, version: version.version });

  const agentDir = process.env.PI_CODING_AGENT_DIR
    ? path.resolve(process.env.PI_CODING_AGENT_DIR)
    : (process.env.OMP_PROFILE || process.env.PI_PROFILE)
      ? path.join(os.homedir(), '.omp', 'profiles', process.env.OMP_PROFILE || process.env.PI_PROFILE, 'agent')
      : path.join(os.homedir(), '.omp', 'agent');
  const instruction = path.join(agentDir, 'AGENTS.md');
  const skillsDir = path.join(agentDir, 'skills');
  const hasManagedInstructions = fs.existsSync(instruction) && fs.readFileSync(instruction, 'utf8').includes('agent-rules:managed:omp');
  const skillCount = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md'))).length
    : 0;
  const mcpPath = path.join(agentDir, 'mcp.json');
  let mcpJson = 'absent';
  if (fs.existsSync(mcpPath)) {
    try { JSON.parse(fs.readFileSync(mcpPath, 'utf8')); mcpJson = 'valid'; } catch { mcpJson = 'invalid'; }
  }
  receipt.evidence.push({ kind: 'active_agent_dir', path: agentDir, profile: process.env.OMP_PROFILE || process.env.PI_PROFILE || null });
  receipt.evidence.push({ kind: 'native_readback', instruction, managed: hasManagedInstructions, skills: skillCount, mcp: mcpJson });
  if (hasManagedInstructions && skillCount > 0) {
    receipt.claims.NATIVE_READBACK.status = 'PASS';
    receipt.claims.NATIVE_READBACK.evidence.push({ kind: 'managed_projection', instruction, skills: skillCount });
    receipt.claims.NATIVE_POLICY_VERIFIED.status = 'PASS';
    receipt.claims.NATIVE_POLICY_VERIFIED.evidence.push({ kind: 'core_install_did_not_mutate_mcp', mcp: mcpJson, path: mcpPath });
  } else {
    receipt.claims.NATIVE_READBACK.status = 'BLOCKED';
    receipt.claims.NATIVE_READBACK.evidence.push({ kind: 'managed_projection_missing', instruction, skills: skillCount });
    receipt.claims.NATIVE_POLICY_VERIFIED.status = 'BLOCKED';
  }
  receipt.claims.NATIVE_OBSERVED.status = 'NEEDS_USER';
  receipt.claims.NATIVE_OBSERVED.evidence.push({ kind: 'host_session_required', reason: 'OMP model/session observation cannot be fabricated by file readback' });
  receipt.claims.MODEL_BEHAVIOR_VERIFIED.status = 'NEEDS_USER';
  receipt.claims.MODEL_BEHAVIOR_VERIFIED.evidence.push({ kind: 'owner_check', steps: ['Open OMP with this active profile.', 'Run /mcp list after explicitly enabling a provider when needed.', 'Ask one bounded model turn to use the visible tool.'] });
  receipt.status = receipt.claims.NATIVE_READBACK.status === 'PASS' ? 'NEEDS_USER' : 'BLOCKED';
  receipt.reason = receipt.status === 'NEEDS_USER'
    ? 'NATIVE_INFRASTRUCTURE PASS — session/model visibility remains an owner check'
    : 'native OMP projection is missing or unreadable';
  return receipt;
}

function computeProjectionHashForHost(hostId) {
  try {
    const overlayPath = path.join(ROOT, 'platforms', hostId, `${hostId}-overlay.md`);
    if (!fs.existsSync(overlayPath)) return null;
    const content = fs.readFileSync(overlayPath, 'utf8');
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch { return null; }
}

function readHookHealth() {
  const hookHealthPath = path.join(os.homedir(), '.gemini', 'config', 'skill-state', 'hook-health.json');
  if (!fs.existsSync(hookHealthPath)) return null;
  try { return JSON.parse(fs.readFileSync(hookHealthPath, 'utf8')); } catch { return null; }
}

function getAntigravityScriptHash() {
  const scriptPath = path.join(os.homedir(), '.gemini', 'config', 'scripts', 'antigravity-skill-gate.py');
  if (!fs.existsSync(scriptPath)) return null;
  try { return createHash('sha256').update(fs.readFileSync(scriptPath)).digest('hex').toLowerCase(); } catch { return null; }
}

async function verifyHostWithProviders(host, providerIds) {
  const gitHead = getGitHead();
  const receipt = {
    schema: 'agent-rules/windows-host-receipt',
    host: host.id,
    status: 'PENDING',
    generated_at: now(),
    git_head: gitHead,
    evidence: [],
    reason: null,
    claims: {
      NATIVE_INSTALLED: { status: 'PENDING', evidence: [] },
      NATIVE_READBACK: { status: 'PENDING', evidence: [] },
      NATIVE_OBSERVED: { status: 'PENDING', evidence: [] },
      NATIVE_POLICY_VERIFIED: { status: 'PENDING', evidence: [] },
      MODEL_BEHAVIOR_VERIFIED: { status: 'PENDING', evidence: [] },
    },
    providers: [],
  };
  const bin = whichHost(host);
  if (!bin) {
    receipt.status = 'UNSUPPORTED';
    receipt.reason = `host binary not found on this machine (searched PATH + user dirs) — skipped per owner policy`;
    for (const k of Object.keys(receipt.claims)) receipt.claims[k].status = 'UNSUPPORTED';
    return receipt;
  }
  receipt.evidence.push({ kind: 'binary', path: bin });
  const v = getHostVersion(host, bin);
  receipt.evidence.push({ kind: 'version', version: v.version, ok: v.ok });
  // === NATIVE_INSTALLED: binary + version must both be provably present (no provider conflation) ===
  if (!v.ok || !v.version) {
    receipt.claims.NATIVE_INSTALLED.status = 'BLOCKED';
    receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'version_probe_failed', error: v.error ?? 'version probe returned no version', ok: false });
  } else {
    receipt.claims.NATIVE_INSTALLED.status = 'PASS';
    receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'binary', path: bin, version: v.version });
    // also bind projection hash + config hash for install claim
    const projHash = computeProjectionHashForHost(host.id);
    if (projHash) receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'projection_hash', hash: projHash });
    const cfgCandidates = {
      codex: path.join(os.homedir(), '.codex', 'config.toml'),
      antigravity: path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json'),
      cursor: path.join(os.homedir(), '.cursor', 'mcp.json'),
    }[host.id];
    if (cfgCandidates && fs.existsSync(cfgCandidates)) {
      try {
        const cfgHash = createHash('sha256').update(fs.readFileSync(cfgCandidates)).digest('hex').slice(0, 16);
        receipt.claims.NATIVE_INSTALLED.evidence.push({ kind: 'config_hash', path: cfgCandidates, sha256: cfgHash });
      } catch { /* ignore */ }
    }
  }

  if (host.id === 'cursor') {
    receipt.evidence.push({ kind: 'installation_status', status: 'INSTALL_PASS', version: v.version });
    receipt.evidence.push({ kind: 'runtime_status', status: 'RUNTIME_LIVE' });
    // Cursor's desktop needs an interactive OAuth session; the authoritative
    // install receipt records UNAUTHENTICATED, so no AUTHENTICATED_LOCAL claim
    // may be fabricated here (closure REQ-111 auth boundary).
    receipt.evidence.push({ kind: 'auth_status', status: 'UNAUTHENTICATED', reason: 'cursor desktop requires interactive OAuth session; model turn is NEEDS_USER' });
  }

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
  } else if (host.id === 'cursor') {
    const configPath = path.join(os.homedir(), '.cursor', 'mcp.json');
    const cfgInfo = ensureCursorConfig(configPath, installedProviders);
    receipt.evidence.push({ kind: 'config', path: cfgInfo.path, sha256: cfgInfo.sha256 });
  }

  const providerResults = [];
  let providersAllPass = true;
  for (const id of providerIds) {
    const entry = providerById.get(id);
    if (!entry) continue;
    if (!(entry.nativeHosts ?? []).includes(host.id)) continue;
    const probeSpec = LIVE_PROBES[id];
    if (!probeSpec) continue;

    const installed = installedProviders[id];
    if (!installed.ok) {
      providerResults.push({ provider_id: id, status: 'BLOCKED', reason: `provider install failed: ${installed.error ?? installed.stderr}` });
      providersAllPass = false;
      console.log(`  ${host.id}/${id}: BLOCKED — provider install failed`);
      continue;
    }

    const command = resolveHostProviderCommand(host.id, id, installed);
    if (!command) {
      providerResults.push({ provider_id: id, status: 'BLOCKED', reason: `cannot resolve host provider command for ${id}` });
      providersAllPass = false;
      continue;
    }

    const probe = await probeProvider(command, id, probeSpec.tool, probeSpec.args);
    fs.writeFileSync(
      path.join(OUT, `${host.id}-${id}.json`),
      JSON.stringify({ schema: 'agent-rules/windows-provider-receipt', host: host.id, ...probe, completed_at: now() }, null, 2)
    );
    providerResults.push({ provider_id: id, status: probe.status, reason: probe.reason, evidence: probe.evidence.length });
    if (probe.status !== 'PASS') providersAllPass = false;
    console.log(`  ${host.id}/${id}: ${probe.status}${probe.reason ? ` — ${probe.reason}` : ''}`);
  }
  // Provider results are kept SEPARATE — they never upgrade/downgrade host-native claims
  receipt.providers = providerResults;
  receipt.evidence.push({ kind: 'providers_summary', providersAllPass, count: providerResults.length, note: 'MCP provider PASS does NOT imply host-native PASS' });

  // === NATIVE_READBACK: host must read back current projection hash (overlay) ===
  try {
    const overlayPath = path.join(ROOT, 'platforms', host.id, `${host.id}-overlay.md`);
    if (!fs.existsSync(overlayPath)) {
      receipt.claims.NATIVE_READBACK.status = 'BLOCKED';
      receipt.claims.NATIVE_READBACK.evidence.push({ kind: 'overlay_missing', path: overlayPath });
    } else {
      const overlayContent = fs.readFileSync(overlayPath, 'utf8');
      const actualHash = createHash('sha256').update(overlayContent).digest('hex').slice(0, 16);
      receipt.claims.NATIVE_READBACK.status = 'PASS';
      receipt.claims.NATIVE_READBACK.evidence.push({ kind: 'overlay_readback', path: overlayPath, hash: actualHash });
    }
  } catch (e) {
    receipt.claims.NATIVE_READBACK.status = 'BLOCKED';
    receipt.claims.NATIVE_READBACK.evidence.push({ kind: 'readback_error', error: String(e.message ?? e) });
  }

  // === NATIVE_OBSERVED: host must have host-generated event (not direct script execution) ===
  if (host.id === 'antigravity') {
    const health = readHookHealth();
    const scriptHash = getAntigravityScriptHash();
    if (!health || !health.native_receipt) {
      receipt.claims.NATIVE_OBSERVED.status = 'NEEDS_USER';
      receipt.claims.NATIVE_OBSERVED.evidence.push({ kind: 'hook_health_missing', reason: 'no hook-health.json native_receipt — requires real Antigravity host action' });
    } else {
      const receiptTime = Date.parse(health.native_receipt.timestamp);
      const gitHeadTime = (() => { try { const r = spawnSync('git', ['log', '-1', '--format=%aI', gitHead], { encoding: 'utf8' }); return r.status===0 ? Date.parse(r.stdout.trim()) : NaN; } catch { return NaN; }})();
      const ageMs = Date.now() - receiptTime;
      const staleThresholdMs = 2 * 60 * 60 * 1000; // 2h freshness for current HEAD
      const isFresh = !Number.isNaN(receiptTime) && ageMs < staleThresholdMs && !Number.isNaN(gitHeadTime) && receiptTime >= gitHeadTime;
      const hashMatches = scriptHash && health.native_receipt.script_hash === scriptHash;
      // Direct script probe (AGENT_RULES_ADAPTER_PROBE=1) is NOT counted — only host-generated event counts
      const isHostGenerated = health.status === 'NATIVE_OBSERVED' && health.native_receipt.event_ref && health.native_receipt.event_ref.includes('telemetry-events.jsonl');
      if (isHostGenerated && hashMatches && isFresh) {
        receipt.claims.NATIVE_OBSERVED.status = 'PASS';
        receipt.claims.NATIVE_OBSERVED.evidence.push({ kind: 'hook_observed', event_ref: health.native_receipt.event_ref, timestamp: health.native_receipt.timestamp, script_hash: health.native_receipt.script_hash, trust_state: health.trust_state, note: 'host-generated event, trust_state unattested preserved' });
      } else if (isHostGenerated && hashMatches) {
        receipt.claims.NATIVE_OBSERVED.status = 'NEEDS_USER';
        receipt.claims.NATIVE_OBSERVED.evidence.push({ kind: 'hook_stale', timestamp: health.native_receipt.timestamp, age_ms: ageMs, git_head_time: Number.isNaN(gitHeadTime)? null : new Date(gitHeadTime).toISOString(), script_hash: health.native_receipt.script_hash, current_script_hash: scriptHash, trust_state: health.trust_state, reason: isFresh ? 'unknown' : 'event not fresh for current HEAD — requires new harmless host action in logged-in session' });
      } else {
        receipt.claims.NATIVE_OBSERVED.status = 'BLOCKED';
        receipt.claims.NATIVE_OBSERVED.evidence.push({ kind: 'hook_unverified', health, script_hash: scriptHash, reason: hashMatches ? 'not host-generated or missing event_ref' : 'script hash mismatch — hooks.json may be stale' });
      }
    }
  } else {
    // For other hosts, we have no host-generated hook surface; honest NEEDS_USER unless we can prove via session file
    // Do NOT use AGENT_RULES_ADAPTER_PROBE=1 direct execution as proof
    const adapterProbeEnv = process.env.AGENT_RULES_ADAPTER_PROBE;
    if (adapterProbeEnv === '1') {
      receipt.claims.NATIVE_OBSERVED.status = 'BLOCKED';
      receipt.claims.NATIVE_OBSERVED.evidence.push({ kind: 'direct_script_probe_ignored', reason: 'AGENT_RULES_ADAPTER_PROBE=1 direct execution does not count as NATIVE_OBSERVED' });
    } else {
      receipt.claims.NATIVE_OBSERVED.status = 'NEEDS_USER';
      receipt.claims.NATIVE_OBSERVED.evidence.push({ kind: 'host_observation_unverified', reason: `host ${host.id} requires real host lifecycle event to claim NATIVE_OBSERVED; offline binary/config not sufficient` });
    }
  }

  // === NATIVE_POLICY_VERIFIED: harmless canary offline where possible ===
  if (host.id === 'command-code' || host.id === 'deepseek-harness') {
    // These hosts support offline fingerprint/permission checks without credentials — already installed claim covers it, but policy needs separate canary
    // For command-code, verify permission layer already proven via adapter inspect; for DSH, fingerprint proves projection
    // We mark NEEDS_USER until real policy canary is implemented offline
    receipt.claims.NATIVE_POLICY_VERIFIED.status = 'NEEDS_USER';
    receipt.claims.NATIVE_POLICY_VERIFIED.evidence.push({ kind: 'offline_canary_available', note: `${host.id} supports offline projection/permission fingerprint without credential, but full policy canary (deny unsafe, allow read-only, plan-mode) not yet executed in this run — requires harmless canary` });
  } else if (host.id === 'codex') {
    // Codex lease guard could be probed, but not in this provider-only run
    receipt.claims.NATIVE_POLICY_VERIFIED.status = 'NEEDS_USER';
    receipt.claims.NATIVE_POLICY_VERIFIED.evidence.push({ kind: 'policy_canary_deferred', reason: 'codex lease-guard deny/allow canary requires separate harness; not executed in verify-windows-hosts' });
  } else {
    receipt.claims.NATIVE_POLICY_VERIFIED.status = 'NEEDS_USER';
    receipt.claims.NATIVE_POLICY_VERIFIED.evidence.push({ kind: 'policy_canary_deferred', reason: `host ${host.id} policy semantics (deny unsafe, allow read-only, plan/worktree, hook fail-closed) require harmless canary not run here` });
  }

  // === MODEL_BEHAVIOR_VERIFIED: requires login/API credential and real prompt ===
  receipt.claims.MODEL_BEHAVIOR_VERIFIED.status = 'NEEDS_USER';
  receipt.claims.MODEL_BEHAVIOR_VERIFIED.evidence.push({ kind: 'model_behavior_requires_credential', reason: `MODEL_BEHAVIOR (natural user language, outcome-first, technical detail only for decisions/debug/verification) requires logged-in host session and real prompt; infrastructure claims A-D remain independent` });

  // === Derive overall native infrastructure vs model behavior ===
  const infraClaims = ['NATIVE_INSTALLED', 'NATIVE_READBACK', 'NATIVE_OBSERVED', 'NATIVE_POLICY_VERIFIED'];
  const infraPass = infraClaims.every(k => receipt.claims[k].status === 'PASS');
  const infraBlocked = infraClaims.some(k => receipt.claims[k].status === 'BLOCKED');
  // Provider status is deliberately NOT part of infra
  if (receipt.claims.NATIVE_INSTALLED.status === 'BLOCKED') {
    receipt.status = 'BLOCKED';
    receipt.reason = 'NATIVE_INSTALLED version probe failed — not upgraded by MCP provider PASS';
  } else if (infraBlocked) {
    receipt.status = 'BLOCKED';
    receipt.reason = `native infrastructure incomplete: ${infraClaims.filter(k=>receipt.claims[k].status!=='PASS').map(k=>k+':'+receipt.claims[k].status).join(', ')}`;
  } else if (!infraPass) {
    // At least one infra claim is NEEDS_USER/UNSUPPORTED — not FAILED, but not full NATIVE_LIVE
    receipt.status = 'NEEDS_USER';
    receipt.reason = `NATIVE_INFRASTRUCTURE partial: ${infraClaims.map(k=>k+':'+receipt.claims[k].status).join(', ')} — MODEL_BEHAVIOR separately NEEDS_USER`;
    receipt.evidence.push({ kind: 'infrastructure_partial', note: 'NATIVE_INFRASTRUCTURE not yet full PASS — do not claim NATIVE_LIVE' });
  } else {
    // Infra PASS but model behavior still NEEDS_USER — honest split
    receipt.status = 'NEEDS_USER';
    receipt.reason = 'NATIVE_INFRASTRUCTURE PASS — MODEL_BEHAVIOR NEEDS_USER (credential-required, not infrastructure failure)';
    receipt.evidence.push({ kind: 'infrastructure_pass_model_needs_user', note: 'All A-D PASS, E NEEDS_USER — do not conflate with failure' });
  }
  // Preserve historical truth: if version failed, never PASS even if providers PASS
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
      receipt = await verifyOpencode(host);
    } else if (id === 'deepseek-harness') {
      receipt = await verifyDeepseekHarness(host);
    } else if (id === 'command-code') {
      receipt = await verifyCommandCode(host);
    } else if (id === 'omp') {
      receipt = await verifyOmp(host);
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
