/**
 * Verification profile — the type a task's evidence contract resolves to.
 *
 * This is the bridge between the runner's `task.verification: string[]` (kept
 * for backward compatibility — every string is lifted to a `shell` step) and
 * the richer evidence surface that DoD §37 ("Browser, accessibility, console,
 * network verification exists") and SS-13 ("Verification and evidence engine")
 * require.
 *
 * Five step kinds cover the realistic surface of "is this change correct":
 *
 *  - `shell`           — exit-0 only; the historical runner behaviour.
 *  - `playwright`      — run a Playwright spec, capture screenshot + console.
 *  - `browser-script`  — run a Node script that drives a real browser via MCP.
 *  - `mcp-tool-call`   — invoke a tool on a configured MCP server deterministically.
 *  - `visual-diff`     — compare a baseline screenshot against a current one.
 *
 * Each profile declares what evidence kinds it produces. The runner
 * (`packages/engine/src/runner/verifier.ts`) honours those kinds when it
 * collects outputs into the journal `VERIFICATION` event.
 *
 * Validators use TypeScript type guards rather than Zod/Ajv to avoid a runtime
 * schema dependency in the engine. The canonical JSON Schema lives in
 * `schemas/verification-profile.schema.json` (generated from this file by the
 * build) for cross-language consumers.
 */

export type VerificationStep =
  | ArgvStep
  | ShellStep
  | PlaywrightStep
  | BrowserScriptStep
  | McpToolCallStep
  | VisualDiffStep;

export interface ArgvStep {
  readonly kind: 'argv';
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  /** Optional fail-fast evaluation. Defaults false for legacy parity; North-Star uses true so cheap gates can block deep verification. */
  readonly failFast?: boolean;
}

export interface ShellStep {
  readonly kind: 'shell';
  readonly command: string;
}

export interface PlaywrightStep {
  readonly kind: 'playwright';
  readonly spec: string;
  readonly baseUrl?: string;
  readonly headed?: boolean;
  /** Browser profile directory; defaults to a per-task isolated profile under
   *  `.agent/runs/<run-id>/browser-profiles/<task-id>/`. Two agents must never
   *  share a profile or they will steal each other's cookies/storage. */
  readonly tabProfile?: string;
}

export interface BrowserScriptStep {
  readonly kind: 'browser-script';
  readonly path: string;
  readonly headed?: boolean;
  readonly tabProfile?: string;
}

export interface McpToolCallStep {
  readonly kind: 'mcp-tool-call';
  readonly server: string;
  readonly tool: string;
  readonly args?: unknown;
}

export interface VisualDiffStep {
  readonly kind: 'visual-diff';
  readonly baseline: string;
  readonly current: string;
  /** Allowed pixel-difference ratio, 0..1. Default 0.01 (1%). */
  readonly threshold?: number;
}

export const EvidenceKinds = ['screenshot', 'console', 'network', 'a11y', 'mcp-response'] as const;
export type EvidenceKind = (typeof EvidenceKinds)[number];

export interface VerificationProfile {
  readonly steps: readonly VerificationStep[];
  readonly evidence: readonly EvidenceKind[];
  readonly timeoutMs?: number;
  /** Optional fail-fast evaluation. Defaults false for legacy parity; North-Star uses true so cheap gates can block deep verification. */
  readonly failFast?: boolean;
}

/**
 * Backward-compat lift: every existing task stores `verification: string[]`
 * (a flat list of shell commands). Wrap it into the new shape so the runner
 * and verifier never have to special-case it.
 */
export function liftVerification(input: readonly string[]): VerificationProfile {
  const steps: ShellStep[] = [];
  for (const command of input) {
    if (command.trim().length === 0) {
      throw new Error('verification command cannot be empty');
    }
    steps.push({ kind: 'shell', command });
  }
  return { steps, evidence: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEvidenceKind(value: unknown): value is EvidenceKind {
  return typeof value === 'string' && (EvidenceKinds as readonly string[]).includes(value);
}


function parseArgvStep(value: unknown, ctx: string): ArgvStep {
  if (!isPlainObject(value)) throw new Error(`${ctx}: argv step must be an object`);
  const { kind, executable, args, cwd, timeoutMs } = value;
  if (kind !== 'argv') throw new Error(`${ctx}: kind must be 'argv', got ${String(kind)}`);
  if (typeof executable !== 'string' || executable.trim().length === 0) throw new Error(`${ctx}: executable must be a non-empty string`);
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) throw new Error(`${ctx}: args must be an array of strings`);
  if (cwd !== undefined && typeof cwd !== 'string') throw new Error(`${ctx}: cwd must be a string`);
  if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || timeoutMs <= 0)) throw new Error(`${ctx}: timeoutMs must be a positive number`);
  return { kind: 'argv', executable, args: [...args] as string[], cwd, timeoutMs };
}

function parseShellStep(value: unknown, ctx: string): ShellStep {
  if (!isPlainObject(value)) throw new Error(`${ctx}: shell step must be an object`);
  const { kind, command } = value;
  if (kind !== 'shell') throw new Error(`${ctx}: kind must be 'shell', got ${String(kind)}`);
  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new Error(`${ctx}: shell command must be a non-empty string`);
  }
  return { kind: 'shell', command };
}

function parsePlaywrightStep(value: unknown, ctx: string): PlaywrightStep {
  if (!isPlainObject(value)) throw new Error(`${ctx}: playwright step must be an object`);
  const { kind, spec, baseUrl, headed, tabProfile } = value;
  if (kind !== 'playwright') throw new Error(`${ctx}: kind must be 'playwright', got ${String(kind)}`);
  if (typeof spec !== 'string' || spec.length === 0) {
    throw new Error(`${ctx}: playwright spec must be a non-empty string`);
  }
  if (baseUrl !== undefined && typeof baseUrl !== 'string') {
    throw new Error(`${ctx}: playwright baseUrl must be a string`);
  }
  if (headed !== undefined && typeof headed !== 'boolean') {
    throw new Error(`${ctx}: playwright headed must be a boolean`);
  }
  if (tabProfile !== undefined && typeof tabProfile !== 'string') {
    throw new Error(`${ctx}: playwright tabProfile must be a string`);
  }
  return {
    kind: 'playwright',
    spec,
    baseUrl,
    headed,
    tabProfile,
  };
}

function parseBrowserScriptStep(value: unknown, ctx: string): BrowserScriptStep {
  if (!isPlainObject(value)) throw new Error(`${ctx}: browser-script step must be an object`);
  const { kind, path, headed, tabProfile } = value;
  if (kind !== 'browser-script') throw new Error(`${ctx}: kind must be 'browser-script', got ${String(kind)}`);
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error(`${ctx}: browser-script path must be a non-empty string`);
  }
  if (headed !== undefined && typeof headed !== 'boolean') {
    throw new Error(`${ctx}: browser-script headed must be a boolean`);
  }
  if (tabProfile !== undefined && typeof tabProfile !== 'string') {
    throw new Error(`${ctx}: browser-script tabProfile must be a string`);
  }
  return { kind: 'browser-script', path, headed, tabProfile };
}

function parseMcpToolCallStep(value: unknown, ctx: string): McpToolCallStep {
  if (!isPlainObject(value)) throw new Error(`${ctx}: mcp-tool-call step must be an object`);
  const { kind, server, tool, args } = value;
  if (kind !== 'mcp-tool-call') throw new Error(`${ctx}: kind must be 'mcp-tool-call', got ${String(kind)}`);
  if (typeof server !== 'string' || server.length === 0) {
    throw new Error(`${ctx}: mcp-tool-call server must be a non-empty string`);
  }
  if (typeof tool !== 'string' || tool.length === 0) {
    throw new Error(`${ctx}: mcp-tool-call tool must be a non-empty string`);
  }
  return { kind: 'mcp-tool-call', server, tool, args };
}

function parseVisualDiffStep(value: unknown, ctx: string): VisualDiffStep {
  if (!isPlainObject(value)) throw new Error(`${ctx}: visual-diff step must be an object`);
  const { kind, baseline, current, threshold } = value;
  if (kind !== 'visual-diff') throw new Error(`${ctx}: kind must be 'visual-diff', got ${String(kind)}`);
  if (typeof baseline !== 'string' || baseline.length === 0) {
    throw new Error(`${ctx}: visual-diff baseline must be a non-empty string`);
  }
  if (typeof current !== 'string' || current.length === 0) {
    throw new Error(`${ctx}: visual-diff current must be a non-empty string`);
  }
  if (threshold !== undefined) {
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
      throw new Error(`${ctx}: visual-diff threshold must be a number in [0, 1]`);
    }
  }
  return { kind: 'visual-diff', baseline, current, threshold };
}

function parseStep(value: unknown, index: number): VerificationStep {
  const ctx = `steps[${index}]`;
  if (!isPlainObject(value)) throw new Error(`${ctx}: must be an object`);
  const { kind } = value;
  switch (kind) {
    case 'argv':
      return parseArgvStep(value, ctx);
    case 'shell':
      return parseShellStep(value, ctx);
    case 'playwright':
      return parsePlaywrightStep(value, ctx);
    case 'browser-script':
      return parseBrowserScriptStep(value, ctx);
    case 'mcp-tool-call':
      return parseMcpToolCallStep(value, ctx);
    case 'visual-diff':
      return parseVisualDiffStep(value, ctx);
    default:
      throw new Error(`${ctx}: unknown kind ${String(kind)}`);
  }
}

/**
 * Validate a parsed `VerificationProfile` (or its string[] predecessor) and
 * return the canonical shape. Throws on the first violation.
 */
export function parseVerification(input: unknown): VerificationProfile {
  if (Array.isArray(input)) return liftVerification(input);
  if (!isPlainObject(input)) {
    throw new Error('verification must be a string[] or a VerificationProfile object');
  }
  const { steps, evidence, timeoutMs, failFast } = input;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('verification.steps must be a non-empty array');
  }
  const parsedSteps = steps.map(parseStep);
  let parsedEvidence: EvidenceKind[] = [];
  if (evidence !== undefined) {
    if (!Array.isArray(evidence)) {
      throw new Error('verification.evidence must be an array');
    }
    for (const e of evidence) {
      if (!isEvidenceKind(e)) {
        throw new Error(`verification.evidence contains invalid kind ${String(e)}`);
      }
      parsedEvidence.push(e);
    }
  }
  if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || timeoutMs <= 0)) {
    throw new Error('verification.timeoutMs must be a positive number');
  }
  if (failFast !== undefined && typeof failFast !== 'boolean') {
    throw new Error('verification.failFast must be a boolean');
  }
  return {
    steps: parsedSteps,
    evidence: parsedEvidence,
    timeoutMs,
    failFast,
  };
}