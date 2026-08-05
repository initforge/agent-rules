import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
    // Implemented in P2b. The runner refuses to launch headless browser
    // verification without an explicit operator decision, so this throws a
    // typed error rather than silently returning exit 0 (which would let a
    // task claim success for work the harness never executed).
    throw new NotImplementedError(step.kind);
  }

  private runBrowserScript(step: BrowserScriptStep): StepResult {
    throw new NotImplementedError(step.kind);
  }

  private runMcpToolCall(step: McpToolCallStep): StepResult {
    throw new NotImplementedError(step.kind);
  }

  private runVisualDiff(step: VisualDiffStep): StepResult {
    // We can already produce an evidence ref for the current image even
    // before P2 lands — that part is just a hash. The compare-and-decide
    // half stays unimplemented until the threshold logic lands.
    const evidence: EvidenceRef[] = [];
    try {
      evidence.push({
        kind: 'screenshot',
        path: path.relative(this.config.cwd, step.current),
        sha256: sha256File(step.current),
      });
    } catch {
      /* file missing: leave evidence empty, comparison will report mismatch */
    }
    throw new NotImplementedError(step.kind);
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