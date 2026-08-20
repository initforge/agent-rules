import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { SafeArgvRunner } from '../worker-adapter.js';
import type { CommandInvocation } from '../contracts.js';
import type {
  VerificationProfile,
  VerificationStep,
  EvidenceKind,
  ArgvStep,
  ShellStep,
  PlaywrightStep,
  BrowserScriptStep,
  McpToolCallStep,
  VisualDiffStep,
} from './profile.js';

/**
 * The verification engine — extracted from `loop.ts` so the runner can stay
 * focused on claim/diff/repair and the verifier can grow independently.
 *
 * Backward-compatible: a profile whose `steps` are all `shell` behaves
 * identically to the pre-extraction runner, including the same
 * `COMMAND_REJECTED` journal event for `SafeArgvRunner` violations.
 *
 * All declared step kinds have an executable implementation here. Browser
 * kinds still fail closed when their external runtime/provider is unavailable.
 */

/** @deprecated Kept only for source compatibility with older consumers. */
export class NotImplementedError extends Error {
  constructor(kind: VerificationStep['kind']) {
    super(`verification step kind "${kind}" is unavailable`);
    this.name = 'NotImplementedError';
  }
}

export interface EvidenceRef {
  readonly kind: EvidenceKind;
  readonly path: string;
  readonly sha256: string;
}

export interface StepResult {
  readonly step: VerificationStep;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly evidence: readonly EvidenceRef[];
  /** Bounded failure-only output used to drive targeted repair context. Never populated on PASS. */
  readonly diagnostic?: string;
}

export interface VerificationOutcome {
  readonly passed: boolean;
  readonly stepResults: readonly StepResult[];
  readonly evidence: readonly EvidenceRef[];
  readonly totalDurationMs: number;
}

export interface VerifierConfig {
  /** Repo the agent operated in. Verification commands run there. */
  readonly cwd: string;
  /** Where evidence files are written. Defaults to cwd. */
  readonly evidenceDir?: string;
  /** Override shell sync timeout (default 10 minutes). */
  readonly shellTimeoutMs?: number;
  /** Central agent-rules MCP registry. Never assume the target project vendors integrations. */
  readonly mcpRegistryRoot?: string;
}

/** Parse a shell-ish command string into argv without invoking a shell. */
export function parseCommand(command: string, cwd: string): CommandInvocation {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error('empty verification command');
  return { executable: parts[0], args: parts.slice(1), cwd };
}

const MAX_FAILURE_DIAGNOSTIC_CHARS = 8_000;
const ANSI_ESCAPE = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

function boundedDiagnostic(value: string): string | undefined {
  const normalized = value.replace(ANSI_ESCAPE, '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return undefined;
  if (normalized.length <= MAX_FAILURE_DIAGNOSTIC_CHARS) return normalized;
  return `${normalized.slice(0, MAX_FAILURE_DIAGNOSTIC_CHARS)}\n...[diagnostic truncated]`;
}

interface SyncVerificationResult {
  exitCode: number;
  diagnostic?: string;
  timedOut: boolean;
}

/** Synchronous spawn for verification with bounded output captured only on failure. */
function runSyncVerification(invocation: CommandInvocation, timeoutMs: number): SyncVerificationResult {
  const res = spawnSync(invocation.executable, [...invocation.args], {
    cwd: invocation.cwd,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    windowsHide: true,
  });
  if (res.error && (res.error as NodeJS.ErrnoException).code === 'ENOENT') {
    return { exitCode: 127, diagnostic: `executable not found: ${invocation.executable}`, timedOut: false };
  }
  const exitCode = res.status ?? -1;
  const timedOut = (res.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
  if (exitCode === 0) return { exitCode, timedOut: false };
  const stderr = typeof res.stderr === 'string' ? res.stderr : '';
  const stdout = typeof res.stdout === 'string' ? res.stdout : '';
  const error = res.error ? `${res.error.name}: ${res.error.message}` : '';
  return {
    exitCode,
    diagnostic: boundedDiagnostic([stderr, stdout, error, timedOut ? `verification timed out after ${timeoutMs}ms` : ''].filter(Boolean).join('\n')),
    timedOut,
  };
}

/** Synchronous spawn for verification. Returns 127 when the executable is missing. */
export function runSyncExitCode(invocation: CommandInvocation, timeoutMs: number): number {
  return runSyncVerification(invocation, timeoutMs).exitCode;
}

/**
 * Spawn a verification driver that needs extra NODE_PATH entries (e.g. to
 * resolve `playwright` from the engine's own node_modules). Returns 127
 * when the executable is missing, mirroring `runSyncExitCode`.
 */
export function runDriverExitCode(
  invocation: CommandInvocation,
  nodeModulesPath: string,
  timeoutMs: number,
): number {
  const res = spawnSync(invocation.executable, [...invocation.args], {
    cwd: invocation.cwd,
    stdio: 'ignore',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    windowsHide: true,
    env: {
      ...process.env,
      NODE_PATH: nodeModulesPath,
    },
  });
  if (res.error && (res.error as NodeJS.ErrnoException).code === 'ENOENT') return 127;
  return res.status ?? -1;
}

function sha256File(filePath: string): string {
  try {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch {
    return createHash('sha256').update('').digest('hex');
  }
}


interface DecodedPng { width: number; height: number; rgba: Buffer }

/** Minimal deterministic PNG decoder for 8-bit, non-interlaced screenshots. */
function decodePngRgba(buffer: Buffer): DecodedPng {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(signature)) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  const idat: Buffer[] = [];
  let hasTransparencyChunk = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error('truncated PNG chunk');
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      if (length !== 13) throw new Error('invalid IHDR');
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      if (data[10] !== 0 || data[11] !== 0) throw new Error('unsupported PNG compression/filter method');
      interlace = data[12]!;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'tRNS') hasTransparencyChunk = true;
    else if (type === 'IEND') break;
    offset = dataEnd + 4;
  }
  if (!width || !height || idat.length === 0) throw new Error('incomplete PNG');
  if (bitDepth !== 8 || interlace !== 0) throw new Error('unsupported PNG bit depth/interlace');
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (!channels || hasTransparencyChunk) throw new Error('unsupported PNG color/transparency mode');
  const rowBytes = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  if (inflated.length !== height * (rowBytes + 1)) throw new Error('unexpected PNG payload size');
  const raw = Buffer.alloc(height * rowBytes);
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const inRow = y * (rowBytes + 1);
    const filter = inflated[inRow]!;
    const outRow = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const value = inflated[inRow + 1 + x]!;
      const left = x >= channels ? raw[outRow + x - channels]! : 0;
      const up = y > 0 ? raw[outRow - rowBytes + x]! : 0;
      const upLeft = y > 0 && x >= channels ? raw[outRow - rowBytes + x - channels]! : 0;
      let decoded: number;
      switch (filter) {
        case 0: decoded = value; break;
        case 1: decoded = (value + left) & 0xff; break;
        case 2: decoded = (value + up) & 0xff; break;
        case 3: decoded = (value + Math.floor((left + up) / 2)) & 0xff; break;
        case 4: decoded = (value + paeth(left, up, upLeft)) & 0xff; break;
        default: throw new Error(`unsupported PNG filter ${filter}`);
      }
      raw[outRow + x] = decoded;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i += 1, p += channels) {
    const out = i * 4;
    if (colorType === 0) {
      const g = raw[p]!; rgba[out] = g; rgba[out + 1] = g; rgba[out + 2] = g; rgba[out + 3] = 255;
    } else if (colorType === 2) {
      rgba[out] = raw[p]!; rgba[out + 1] = raw[p + 1]!; rgba[out + 2] = raw[p + 2]!; rgba[out + 3] = 255;
    } else if (colorType === 4) {
      const g = raw[p]!; rgba[out] = g; rgba[out + 1] = g; rgba[out + 2] = g; rgba[out + 3] = raw[p + 1]!;
    } else {
      rgba[out] = raw[p]!; rgba[out + 1] = raw[p + 1]!; rgba[out + 2] = raw[p + 2]!; rgba[out + 3] = raw[p + 3]!;
    }
  }
  return { width, height, rgba };
}

export class VerificationEngine {
  private readonly evidenceDir: string;

  constructor(private readonly config: VerifierConfig) {
    this.evidenceDir = config.evidenceDir ?? config.cwd;
    fs.mkdirSync(this.evidenceDir, { recursive: true });
  }

  /** Evaluate the full profile, returning the outcome. */
  async evaluate(profile: VerificationProfile): Promise<VerificationOutcome> {
    const start = Date.now();
    const stepResults: StepResult[] = [];
    const evidence: EvidenceRef[] = [];
    for (const step of profile.steps) {
      const result = await this.runStep(step);
      stepResults.push(result);
      evidence.push(...result.evidence);
      // North-Star profiles opt into fail-fast after ordering the verification
      // DAG cheap→deep. Legacy profiles preserve historical run-all behavior.
      if (profile.failFast && result.exitCode !== 0) break;
    }
    const passed = stepResults.every((r) => r.exitCode === 0);
    return {
      passed,
      stepResults,
      evidence,
      totalDurationMs: Date.now() - start,
    };
  }

  private async runStep(step: VerificationStep): Promise<StepResult> {
    const start = Date.now();
    switch (step.kind) {
      case 'argv':
        return this.runArgv(step);
      case 'shell':
        return this.runShell(step);
      case 'playwright':
        return this.runPlaywright(step);
      case 'browser-script':
        return this.runBrowserScript(step);
      case 'mcp-tool-call':
        return this.runMcpToolCall(step);
      case 'visual-diff':
        return this.runVisualDiff(step);
    }
  }

  /** Canonical exact-argv verification. No shell parsing or quoting ambiguity. */
  private runArgv(step: ArgvStep): StepResult {
    const start = Date.now();
    const repoRoot = path.resolve(this.config.cwd);
    const cwd = step.cwd === undefined ? repoRoot : path.isAbsolute(step.cwd) ? path.resolve(step.cwd) : path.resolve(repoRoot, step.cwd);
    const canonicalCwd = process.platform === 'win32' ? cwd.toLowerCase() : cwd;
    const canonicalRepoRoot = process.platform === 'win32' ? repoRoot.toLowerCase() : repoRoot;
    const insideRepo = canonicalCwd === canonicalRepoRoot || canonicalCwd.startsWith(`${canonicalRepoRoot}${path.sep}`);
    if (!insideRepo) return { step, exitCode: -1, durationMs: Date.now() - start, evidence: [] };
    const invocation: CommandInvocation = { executable: step.executable, args: [...step.args], cwd };
    // Exact argv goes directly to spawnSync (shell=false). Metacharacters in an
    // argument are data, not shell syntax. Reject only values spawn cannot accept.
    if (invocation.executable.includes('\0') || invocation.args.some((arg) => arg.includes('\0'))) {
      return { step, exitCode: -1, durationMs: Date.now() - start, evidence: [] };
    }
    const result = runSyncVerification(invocation, step.timeoutMs ?? this.config.shellTimeoutMs ?? 10 * 60 * 1000);
  return { step, exitCode: result.exitCode, diagnostic: result.diagnostic, durationMs: Date.now() - start, evidence: [] };
  }

  /** Shell command. Exit 0 = pass. SafeArgvRunner rejects unsafe argv. */
  private runShell(step: ShellStep): StepResult {
    const start = Date.now();
    let invocation: CommandInvocation;
    try {
      invocation = parseCommand(step.command, this.config.cwd);
    } catch {
      return {
        step,
        exitCode: -1,
        durationMs: Date.now() - start,
        evidence: [],
      };
    }
    const validation = SafeArgvRunner.validateCommand(invocation);
    if (!validation.valid) {
      // Same shape the loop.ts journal expects; the runner logs COMMAND_REJECTED
      // on its own when the verifier returns -1.
      return {
        step,
        exitCode: -1,
        durationMs: Date.now() - start,
        evidence: [],
      };
    }
    const result = runSyncVerification(invocation, this.config.shellTimeoutMs ?? 10 * 60 * 1000);
    return {
      step,
      exitCode: result.exitCode,
      diagnostic: result.diagnostic,
      durationMs: Date.now() - start,
      evidence: [],
    };
  }

  private runPlaywright(step: PlaywrightStep): StepResult {
    const start = Date.now();
    // Build a small driver script that uses the playwright npm package to
    // launch chromium with a per-task user-data dir (tab/profile isolation
    // so two concurrent tasks cannot steal each other's cookies/storage),
    // navigate to the page, take a screenshot, and dump console errors.
    // The spec is intentionally small — Playwright test-runner is not a
    // runtime dep here, only the lower-level `playwright` package.
    const profileDir = step.tabProfile
      ? path.join(this.evidenceDir, 'browser-profiles', step.tabProfile)
      : path.join(this.evidenceDir, 'browser-profiles', 'default');
    fs.mkdirSync(profileDir, { recursive: true });
    const screenshot = path.join(this.evidenceDir, `${path.basename(step.spec, '.spec.ts')}.png`);
    const consoleLog = path.join(this.evidenceDir, `${path.basename(step.spec, '.spec.ts')}.console.log`);
    // Absolute path to playwright so the driver does not depend on
    // NODE_PATH resolution (which behaves inconsistently when the spawn
    // cwd has no resolving node_modules tree of its own).
    const req = createRequire(fileURLToPath(import.meta.url));
    const playwrightPath = req.resolve('playwright', { paths: [path.dirname(fileURLToPath(import.meta.url)) + '/../..'] });
    const driver = `
const { chromium } = require(${JSON.stringify(playwrightPath)});
(async () => {
  const browser = await chromium.launch({
    headless: !${step.headed ?? false},
    args: ['--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  let exitCode = 0;
  try {
    const target = ${JSON.stringify(step.baseUrl ?? 'about:blank')};
    await page.goto(target, { waitUntil: 'load', timeout: 15_000 });
    await page.screenshot({ path: ${JSON.stringify(screenshot)} });
    if (consoleErrors.length > 0) exitCode = 2;
  } catch (err) {
    consoleErrors.push('navigation: ' + err.message);
    exitCode = 3;
  } finally {
    require('fs').writeFileSync(${JSON.stringify(consoleLog)}, consoleErrors.join('\\n'), 'utf8');
    await browser.close();
    process.exit(exitCode);
  }
})().catch((err) => { process.stderr.write(String(err) + '\\n'); process.exit(4); });
`;
    const driverPath = path.join(this.evidenceDir, `${path.basename(step.spec, '.spec.ts')}.driver.cjs`);
    fs.writeFileSync(driverPath, driver, 'utf8');
    const engineNodeModules = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..', '..', 'node_modules'
    );
    const invocation: CommandInvocation = {
      executable: process.execPath,
      args: [driverPath],
      cwd: this.config.cwd,
    };
// Spawn the driver directly with NODE_PATH set so its `require()` calls
// resolve `playwright` from the engine's own node_modules, even when the
// spawn cwd has no resolving node_modules tree.
    const spawnRes = spawnSync(invocation.executable, [driverPath], {
      cwd: invocation.cwd,
      stdio: 'ignore',
      timeout: this.config.shellTimeoutMs ?? 10 * 60 * 1000,
      windowsHide: true,
      killSignal: 'SIGKILL',
      env: {
        ...process.env,
        NODE_PATH: engineNodeModules,
      },
    });
    const exitCode = spawnRes.error
      ? (spawnRes.error as NodeJS.ErrnoException).code === 'ENOENT' ? 127 : -1
      : spawnRes.status ?? -1;
    const evidence: EvidenceRef[] = [];
    if (fs.existsSync(screenshot)) {
      evidence.push({ kind: 'screenshot', path: path.relative(this.config.cwd, screenshot), sha256: sha256File(screenshot) });
    }
    if (fs.existsSync(consoleLog)) {
      evidence.push({ kind: 'console', path: path.relative(this.config.cwd, consoleLog), sha256: sha256File(consoleLog) });
    }
    return { step, exitCode, durationMs: Date.now() - start, evidence };
  }

  private runBrowserScript(step: BrowserScriptStep): StepResult {
    const start = Date.now();
    // A browser-script step is an arbitrary Node script the operator writes
    // that drives a real browser through MCP. The script is responsible for
    // writing whatever evidence it wants to `evidence/` and for exiting 0
    // on success. The harness only collects `*.screenshot.png` and
    // `*.console.log` files that the script drops in this directory so
    // downstream consumers can attach them to the journal.
    const profileDir = step.tabProfile
      ? path.join(this.evidenceDir, 'browser-profiles', step.tabProfile)
      : path.join(this.evidenceDir, 'browser-profiles', 'default');
    fs.mkdirSync(profileDir, { recursive: true });
    const invocation: CommandInvocation = {
      executable: process.execPath,
      args: [step.path],
      cwd: this.config.cwd,
    };
    const result = runSyncExitCode(invocation, this.config.shellTimeoutMs ?? 10 * 60 * 1000);
    const evidence: EvidenceRef[] = [];
    // Scan for evidence files the script wrote. Match on suffix so the
    // step can produce any combination of screenshot / console / network.
    const stem = path.basename(step.path, path.extname(step.path));
    for (const [suffix, kind] of [
      ['.screenshot.png', 'screenshot'],
      ['.console.log', 'console'],
      ['.network.log', 'network'],
      ['.a11y.json', 'a11y'],
    ] as const) {
      const file = path.join(this.evidenceDir, `${stem}${suffix}`);
      if (fs.existsSync(file)) {
        evidence.push({ kind: kind as EvidenceKind, path: path.relative(this.config.cwd, file), sha256: sha256File(file) });
      }
    }
    return { step, exitCode: result, durationMs: Date.now() - start, evidence };
  }

  private runMcpToolCall(step: McpToolCallStep): StepResult {
    const start = Date.now();
    const responsePath = path.join(this.evidenceDir, `${step.server}-${step.tool}.mcp-response.json`);
    const registryRoot = path.resolve(this.config.mcpRegistryRoot ?? path.join(this.config.cwd, 'integrations'));
    // Keep the MCP client self-contained. The old driver imported
    // @modelcontextprotocol/sdk even though the engine did not declare that
    // dependency, so every real tool call failed before reaching the registry.
    const driver = `
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const serverName = ${JSON.stringify(step.server)};
const toolName = ${JSON.stringify(step.tool)};
const toolArgs = ${JSON.stringify(step.args ?? {})};
const responsePath = ${JSON.stringify(responsePath)};
const registryRoot = ${JSON.stringify(registryRoot)};
const timeoutMs = ${JSON.stringify(Math.min(this.config.shellTimeoutMs ?? 10 * 60 * 1000, 120_000))};
function adapterForServer() {
  const direct = path.join(registryRoot, serverName, 'adapters', 'opencode.json');
  const candidates = fs.existsSync(direct) ? [direct] : [];
  if (fs.existsSync(registryRoot)) {
    for (const entry of fs.readdirSync(registryRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(registryRoot, entry.name, 'adapters', 'opencode.json');
      if (file !== direct && fs.existsSync(file)) candidates.push(file);
    }
  }
  for (const file of candidates) {
    try {
      const body = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (body && body.mcpServers && body.mcpServers[serverName]) return body.mcpServers[serverName];
    } catch {}
  }
  return null;
}
function expand(value) {
  return String(value).replace(/\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}/g, (_, name) => process.env[name] || '');
}
const cfg = adapterForServer();
if (!cfg || typeof cfg.command !== 'string' || !Array.isArray(cfg.args)) {
  process.stderr.write('MCP server not in central registry: ' + serverName + '\\n');
  process.exit(2);
}
let command = expand(cfg.command);
let args = cfg.args.map(expand);
if (!command) { process.stderr.write('MCP command resolves empty\\n'); process.exit(3); }
if (process.platform === 'win32' && /\\.(cmd|bat)$/i.test(command)) {
  args = ['/d', '/s', '/c', command, ...args]; command = 'cmd.exe';
}
const child = spawn(command, args, { cwd: ${JSON.stringify(this.config.cwd)}, stdio: ['pipe','pipe','pipe'], windowsHide: true, env: { ...process.env, ...(cfg.env || {}) } });
let buffer = '';
let settled = false;
let era = 'probing';
let probeTimer = null;
const clientInfo = { name: 'agent-rules-verifier', version: '2' };
const modernMeta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': clientInfo,
  'io.modelcontextprotocol/clientCapabilities': {},
};
function finish(code, result) {
  if (settled) return; settled = true;
  clearTimeout(timer); if (probeTimer) clearTimeout(probeTimer);
  if (result !== undefined) fs.writeFileSync(responsePath, JSON.stringify(result, null, 2), 'utf8');
  try { child.stdin.end(); } catch {}
  try { child.kill('SIGTERM'); } catch {}
  setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1000).unref();
  process.exit(code);
}
function send(message) { child.stdin.write(JSON.stringify(message) + '\\n'); }
function startLegacy() {
  if (era === 'legacy' || settled) return;
  era = 'legacy'; if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
  send({ jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo } });
}
function startModern() {
  if (settled) return;
  era = 'modern'; if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: toolArgs, _meta: modernMeta } });
}
function handleToolResult(message) {
  if (message.error) return finish(5, message);
  const result = message.result;
  if (result && result.resultType === 'input_required') return finish(8, result);
  return finish(result && result.isError ? 1 : 0, result);
}
function onMessage(message) {
  if (!message || message.jsonrpc !== '2.0') return;
  if (message.id === 1 && era === 'probing') {
    if (message.error) return startLegacy();
    const versions = Array.isArray(message.result && message.result.supportedVersions) ? message.result.supportedVersions : [];
    if (versions.includes('2026-07-28')) return startModern();
    // Some pre-discovery MCP servers answer the first request as if it were the
    // legacy initialize handshake. Preserve compatibility without a second
    // initialize round-trip: acknowledge initialization and issue tools/call.
    if (message.result && typeof message.result.protocolVersion === 'string') {
      era = 'legacy-preinitialized';
      if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
      send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: toolArgs } });
      return;
    }
    return startLegacy();
  }
  if (message.id === 2 && (era === 'modern' || era === 'legacy-preinitialized')) return handleToolResult(message);
  if (message.id === 3 && era === 'legacy') {
    if (message.error) {
      send({ jsonrpc: '2.0', id: 4, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo } });
      return;
    }
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: toolName, arguments: toolArgs } });
    return;
  }
  if (message.id === 4 && era === 'legacy') {
    if (message.error) return finish(4, message);
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: toolName, arguments: toolArgs } });
    return;
  }
  if (message.id === 5 && era === 'legacy') return handleToolResult(message);
}
child.stdout.setEncoding('utf8');
child.stdout.on('data', chunk => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) break;
    const line = buffer.slice(0, idx).trim(); buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try { onMessage(JSON.parse(line)); } catch {}
  }
});
child.stderr.on('data', d => process.stderr.write(d));
child.on('error', err => { process.stderr.write('MCP spawn error: ' + err.message + '\\n'); finish(127); });
child.on('close', code => { if (!settled) finish(code ?? 6); });
const timer = setTimeout(() => { process.stderr.write('MCP tool call timed out\\n'); finish(124); }, timeoutMs);
send({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: modernMeta } });
probeTimer = setTimeout(startLegacy, Math.min(1000, Math.max(200, Math.floor(timeoutMs / 10))));
`;
    const driverPath = path.join(this.evidenceDir, `${step.server}-${step.tool}.mcp-driver.cjs`);
    fs.writeFileSync(driverPath, driver, 'utf8');
    const invocation: CommandInvocation = { executable: process.execPath, args: [driverPath], cwd: this.config.cwd };
    const result = runSyncExitCode(invocation, this.config.shellTimeoutMs ?? 10 * 60 * 1000);
    const evidence: EvidenceRef[] = [];
    if (fs.existsSync(responsePath)) evidence.push({ kind: 'mcp-response', path: path.relative(this.config.cwd, responsePath), sha256: sha256File(responsePath) });
    return { step, exitCode: result, durationMs: Date.now() - start, evidence };
  }

  private runVisualDiff(step: VisualDiffStep): StepResult {
    const start = Date.now();
    const baseline = path.isAbsolute(step.baseline) ? step.baseline : path.resolve(this.config.cwd, step.baseline);
    const current = path.isAbsolute(step.current) ? step.current : path.resolve(this.config.cwd, step.current);
    const evidence: EvidenceRef[] = [];
    if (fs.existsSync(current)) {
      evidence.push({ kind: 'screenshot', path: path.relative(this.config.cwd, current), sha256: sha256File(current) });
    }
    if (!fs.existsSync(baseline) || !fs.existsSync(current)) {
      return { step, exitCode: 2, durationMs: Date.now() - start, evidence };
    }
    if (sha256File(baseline) === sha256File(current)) {
      return { step, exitCode: 0, durationMs: Date.now() - start, evidence };
    }
    try {
      const a = decodePngRgba(fs.readFileSync(baseline));
      const b = decodePngRgba(fs.readFileSync(current));
      if (a.width !== b.width || a.height !== b.height) {
        return { step, exitCode: 1, durationMs: Date.now() - start, evidence };
      }
      let different = 0;
      const pixels = a.width * a.height;
      for (let i = 0; i < pixels; i += 1) {
        const offset = i * 4;
        if (a.rgba[offset] !== b.rgba[offset]
          || a.rgba[offset + 1] !== b.rgba[offset + 1]
          || a.rgba[offset + 2] !== b.rgba[offset + 2]
          || a.rgba[offset + 3] !== b.rgba[offset + 3]) different += 1;
      }
      const ratio = pixels === 0 ? 0 : different / pixels;
      const threshold = step.threshold ?? 0.01;
      return { step, exitCode: ratio <= threshold ? 0 : 1, durationMs: Date.now() - start, evidence };
    } catch {
      // Unsupported/corrupt image data is not evidence of visual parity.
      return { step, exitCode: 3, durationMs: Date.now() - start, evidence };
    }
  }

  /** Convenience: validate a single shell command without running it. */
  static validateShell(command: string, cwd: string): { valid: boolean; reason?: string } {
    try {
      const invocation = parseCommand(command, cwd);
      const v = SafeArgvRunner.validateCommand(invocation);
      return { valid: v.valid, reason: v.reason };
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
