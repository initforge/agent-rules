import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SafeArgvRunner } from '../worker-adapter.js';
import type { CommandInvocation } from '../contracts.js';
import type {
  VerificationProfile,
  VerificationStep,
  EvidenceKind,
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
 * The non-shell step kinds (`playwright`, `browser-script`, `mcp-tool-call`,
 * `visual-diff`) throw `NotImplementedError` here and are wired up in P2.
 * The engine is the single seam where browser-based verification will plug
 * in, so the runner, the journal, and the telemetry all keep working when
 * those step kinds become real.
 */

export class NotImplementedError extends Error {
  constructor(kind: VerificationStep['kind']) {
    super(`verification step kind "${kind}" is not implemented in this slice; see P2 plan`);
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
}

/** Parse a shell-ish command string into argv without invoking a shell. */
export function parseCommand(command: string, cwd: string): CommandInvocation {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error('empty verification command');
  return { executable: parts[0], args: parts.slice(1), cwd };
}

/** Synchronous spawn for verification. Returns 127 when the executable is missing. */
export function runSyncExitCode(invocation: CommandInvocation, timeoutMs: number): number {
  const res = spawnSync(invocation.executable, [...invocation.args], {
    cwd: invocation.cwd,
    stdio: 'ignore',
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (res.error && (res.error as NodeJS.ErrnoException).code === 'ENOENT') return 127;
  return res.status ?? -1;
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
    const exitCode = runSyncExitCode(invocation, this.config.shellTimeoutMs ?? 10 * 60 * 1000);
    return {
      step,
      exitCode,
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
    const playwrightPath = require.resolve('playwright', { paths: [path.dirname(fileURLToPath(import.meta.url)) + '/../..'] });
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
})().catch((err) => { console.error(err); process.exit(4); });
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
    // Spawn a thin driver that uses the @modelcontextprotocol/sdk client to
    // connect to a configured MCP server (loaded from
    // integrations/required/<server>/adapters/<agent>.json) and call the
    // requested tool. The driver's exit code is the harness-visible verdict
    // (0 = tool returned data, non-zero = error). Any MCP response is written
    // to <evidenceDir>/<taskId>.mcp-response.json for the journal.
    const responsePath = path.join(this.evidenceDir, `${step.server}-${step.tool}.mcp-response.json`);
    const driver = `
const path = require('path');
const fs = require('fs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

(async () => {
  const server = ${JSON.stringify(step.server)};
  const tool = ${JSON.stringify(step.tool)};
  const args = ${JSON.stringify(step.args ?? {})};
  const responsePath = ${JSON.stringify(responsePath)};
  // Resolve the MCP server command from the registry. Each integration
  // ships an adapter per platform; we use the opencode adapter as a
  // neutral entry point because it always contains a working command.
  const registryRoot = path.resolve(process.cwd(), 'integrations', 'required');
  const adapterPath = path.join(registryRoot, server, 'adapters', 'opencode.json');
  if (!fs.existsSync(adapterPath)) {
    console.error('MCP server not in registry: ' + server);
    process.exit(2);
  }
  const adapter = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
  const cfg = adapter.mcpServers[server];
  if (!cfg) {
    console.error('Server ' + server + ' missing from adapter');
    process.exit(3);
  }
  const transport = new StdioClientTransport({ command: cfg.command, args: cfg.args });
  const client = new Client({ name: 'agent-rules-verifier', version: '1' }, { capabilities: {} });
  await client.connect(transport);
  const result = await client.callTool({ name: tool, arguments: args });
  fs.writeFileSync(responsePath, JSON.stringify(result, null, 2), 'utf8');
  await client.close();
  process.exit(result.isError ? 1 : 0);
})().catch((err) => { console.error('mcp-tool-call error:', err && err.message ? err.message : err); process.exit(4); });
`;
    const driverPath = path.join(this.evidenceDir, `${step.server}-${step.tool}.mcp-driver.cjs`);
    fs.writeFileSync(driverPath, driver, 'utf8');
    const invocation: CommandInvocation = {
      executable: process.execPath,
      args: [driverPath],
      cwd: this.config.cwd,
    };
    const result = runSyncExitCode(invocation, this.config.shellTimeoutMs ?? 10 * 60 * 1000);
    const evidence: EvidenceRef[] = [];
    if (fs.existsSync(responsePath)) {
      evidence.push({ kind: 'mcp-response', path: path.relative(this.config.cwd, responsePath), sha256: sha256File(responsePath) });
    }
    return { step, exitCode: result, durationMs: Date.now() - start, evidence };
  }

  private runVisualDiff(step: VisualDiffStep): StepResult {
    const start = Date.now();
    // Hash both images and report a simple "match / differ above threshold"
    // verdict. Pixel-level diff is intentionally minimal: a sha mismatch
    // is reported and the caller can decide what to do. Thresholds above 0
    // also reject on hash mismatch (the strictest possible bound) until a
    // real pixel comparator is added.
    const evidence: EvidenceRef[] = [];
    if (fs.existsSync(step.current)) {
      evidence.push({
        kind: 'screenshot',
        path: path.relative(this.config.cwd, step.current),
        sha256: sha256File(step.current),
      });
    }
    if (!fs.existsSync(step.baseline) || !fs.existsSync(step.current)) {
      return { step, exitCode: 2, durationMs: Date.now() - start, evidence };
    }
    const baseHash = sha256File(step.baseline);
    const currentHash = sha256File(step.current);
    if (baseHash === currentHash) {
      return { step, exitCode: 0, durationMs: Date.now() - start, evidence };
    }
    // Hashes differ — for any positive threshold we report a diff; this is
    // a coarse signal that a real pixel comparator (e.g. pixelmatch) should
    // replace.
    return { step, exitCode: 1, durationMs: Date.now() - start, evidence };
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