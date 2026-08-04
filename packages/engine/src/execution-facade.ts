/**
 * execution-facade.ts — Shared execution facade wiring event-delta, artifact-broker,
 * capsule, wake, and checkpoint modules for CLI integration.
 *
 * Minimal wiring: submit command → broker artifact/event → create checkpoint.
 * Resume: validate checkpoint integrity → wake decision → proceed.
 *
 * ponytail: skip — parallel execution, cross-run coordination, incremental diffs.
 * Add when AM-0021 cluster 4 ships.
 */
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { Sha256 } from './contracts.js';
import { sha256Bytes } from './contracts.js';
import { createEventDelta, type EventDelta, type EventDeltaInput, type EventType, eventDeltaReceipt, reduceEventDeltas, idempotentInsert } from './event-delta.js';
import { brokerToolOutput, type ToolOutputReceipt } from './tool-output-broker.js';
import { createCheckpoint, buildResumeContext, validateCheckpointIntegrity, validateCursorCapsulePair, type Checkpoint, type CursorPosition, type CapsuleState, type CheckpointTrigger } from './checkpoint-resume.js';
import { evaluateWakeSignal, type WakeSignal, type WakeDecision, type WakeCapsuleSnapshot, DEFAULT_WAKE_POLICY_CONFIG } from './semantic-wake-policy.js';
import type { ArtifactPointer } from './artifact-pointer.js';

// ── Execution Facade Types ──────────────────────────────────────────────────────

export interface ExecutionCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
}

export interface ExecutionReceipt {
  readonly executionId: string;
  readonly command: ExecutionCommand;
  readonly event: EventDelta;
  readonly artifact: ArtifactPointer;
  readonly toolOutput: ToolOutputReceipt;
  readonly checkpoint: Checkpoint;
  readonly createdAt: string;
}

export interface ExecutionFacadeOptions {
  readonly planId: string;
  readonly runId: string;
  readonly baseDir?: string;
  readonly candidateEpoch?: number;
  readonly trustClass?: 'UNTRUSTED' | 'QUARANTINED' | 'TRUSTED' | 'VERIFIED';
}

export interface ResumeValidation {
  readonly valid: boolean;
  readonly checkpoint: Checkpoint;
  readonly wakeDecision: WakeDecision;
  readonly errors: readonly string[];
}

// ── Internal State ─────────────────────────────────────────────────────────────

interface FacadeState {
  planId: string;
  runId: string;
  baseDir: string;
  candidateEpoch: number;
  eventSequence: number;
  decisions: Array<{
    decisionId: string;
    decision: string;
    rationale: string;
    committedAt: string;
    commitSha256: Sha256;
  }>;
  artifactPointers: ArtifactPointer[];
  pendingClaims: string[];
  pendingEvidence: string[];
  activeWorkers: string[];
  // Idempotency: track processed event hashes to prevent duplicate processing
  processedEventHashes: Set<string>;
  // Event log for audit trail
  eventLog: EventDelta[];
}

// ── Execution Facade ──────────────────────────────────────────────────────────

export class ExecutionFacade {
  private readonly state: FacadeState;
  private readonly checkpoints: Checkpoint[] = [];

  constructor(options: ExecutionFacadeOptions) {
    this.state = {
      planId: options.planId,
      runId: options.runId,
      baseDir: options.baseDir ?? process.cwd(),
      candidateEpoch: options.candidateEpoch ?? Date.now(),
      eventSequence: 0,
      decisions: [],
      artifactPointers: [],
      pendingClaims: [],
      pendingEvidence: [],
      activeWorkers: [],
      processedEventHashes: new Set<string>(),
      eventLog: [],
    };
  }

  /** submitCommand — broker command output to artifact, emit event delta, checkpoint. */
  submitCommand(cmd: ExecutionCommand, stdout: string, stderr: string, exitCode: number, durationMs: number): ExecutionReceipt {
    const executionId = `exec-${randomUUID().slice(0, 8)}`;
    const { planId, runId, candidateEpoch } = this.state;

    // 1. Broker tool output to content-addressed artifact
    const { receipt: toolOutput } = brokerToolOutput(
      cmd.command,
      cmd.args,
      stdout,
      stderr,
      exitCode,
      durationMs,
      {
        candidateEpoch,
        baseDir: this.state.baseDir,
      },
    );

    // 2. Create artifact pointer from tool output
    const artifactPointer: ArtifactPointer = toolOutput.stdoutPointer;

    // 3. Build idempotency key from command hash
    const idempotencyKey = createHash('sha256')
      .update(JSON.stringify({ planId, runId, command: cmd.command, args: cmd.args, candidateEpoch }))
      .digest('hex');

    // 4. Emit event delta for command execution (idempotent)
    const eventInput: EventDeltaInput = {
      sequence: this.state.eventSequence++,
      eventType: this.inferEventType(exitCode),
      actor: 'execution-facade',
      affectedRequirements: [],
      affectedClaims: [],
      previousState: null,
      currentState: {
        executionId,
        command: cmd.command,
        args: cmd.args,
        exitCode,
        durationMs,
        artifactId: artifactPointer.artifactId,
        idempotencyKey,
      },
      severity: exitCode === 0 ? 'INFO' : 'WARNING',
      candidateEpoch,
      artifactRefs: [artifactPointer],
      wakeReason: exitCode === 0 ? null : 'WORKER_FAILED',
      createdAt: new Date().toISOString(),
    };

    const event = createEventDelta(eventInput);

    // 5. Idempotent insert: skip if already processed
    if (!this.state.processedEventHashes.has(event.eventSha256)) {
      this.state.processedEventHashes.add(event.eventSha256);
      this.state.eventLog = [...this.state.eventLog, event] as EventDelta[];
    }

    this.state.artifactPointers.push(artifactPointer);

    // 6. Create checkpoint after command execution
    const checkpoint = this.createExecutionCheckpoint('task_complete');

    return Object.freeze({
      executionId,
      command: cmd,
      event,
      artifact: artifactPointer,
      toolOutput,
      checkpoint,
      createdAt: new Date().toISOString(),
    });
  }

  /** createCheckpoint — snapshot current state as checkpoint. */
  createExecutionCheckpoint(trigger: CheckpointTrigger): Checkpoint {
    const { planId, runId, decisions, pendingClaims, pendingEvidence, activeWorkers } = this.state;
    // Extract taskId from decision JSON for completedTaskIds to match validation logic
    const completedTaskIds = decisions.map(d => {
      try {
        const ctx = JSON.parse(d.decision);
        return ctx.taskId ?? d.decisionId;
      } catch {
        return d.decisionId;
      }
    });
    const cursor: CursorPosition = {
      planId,
      runId,
      epoch: this.state.candidateEpoch,
      taskId: `task-${this.state.eventSequence}`,
      attemptCount: 0,
      completedTaskIds,
      failedTaskIds: [],
      skippedTaskIds: [],
    };

    const capsule: CapsuleState = {
      planId,
      runId,
      epoch: this.state.candidateEpoch,
      decisions: decisions.map(d => ({
        decisionId: d.decisionId,
        decision: d.decision,
        rationale: d.rationale,
        committedAt: d.committedAt,
        commitSha256: d.commitSha256,
      })),
      pendingClaims: [...pendingClaims],
      pendingEvidence: [...pendingEvidence],
      activeWorkers: [...activeWorkers],
      mode: 'EXECUTION',
    };

    const previousId = this.checkpoints.length > 0
      ? this.checkpoints[this.checkpoints.length - 1].checkpointId
      : null;

    const checkpoint = createCheckpoint(trigger, cursor, capsule, previousId);
    this.checkpoints.push(checkpoint);

    // Emit checkpoint event
    const checkpointEvent: EventDeltaInput = {
      sequence: this.state.eventSequence++,
      eventType: 'CHECKPOINT',
      actor: 'execution-facade',
      affectedRequirements: [],
      affectedClaims: [],
      previousState: null,
      currentState: {
        checkpointId: checkpoint.checkpointId,
        trigger,
        cursorTaskId: cursor.taskId,
      },
      severity: 'INFO',
      candidateEpoch: this.state.candidateEpoch,
      artifactRefs: [],
      wakeReason: null,
    };
    createEventDelta(checkpointEvent);

    return checkpoint;
  }

  /** commitDecision — record a committed decision for checkpointing. */
  commitDecision(decisionId: string, decision: string, rationale: string): void {
    const committedAt = new Date().toISOString();
    const commitSha256 = sha256Bytes(new TextEncoder().encode(JSON.stringify({
      decisionId,
      decision,
      rationale,
      committedAt,
    })));

    this.state.decisions.push({ decisionId, decision, rationale, committedAt, commitSha256 });
  }

  /** evaluateWake — apply semantic wake policy to determine if execution should proceed. */
  evaluateWake(reason: WakeSignal['reason'], metadata?: Record<string, string>): WakeDecision {
    const snapshot: WakeCapsuleSnapshot = {
      planId: this.state.planId,
      runId: this.state.runId,
      epoch: this.state.candidateEpoch,
      decisions: this.state.decisions.map(d => d.decisionId),
      pendingClaims: [...this.state.pendingClaims],
      pendingEvidence: [...this.state.pendingEvidence],
      activeWorkers: [...this.state.activeWorkers],
      metadata: metadata ?? {},
    };

    const signal: WakeSignal = {
      reason,
      planId: this.state.planId,
      runId: this.state.runId,
      actor: 'execution-facade',
      epoch: this.state.candidateEpoch,
      metadata,
    };

    return evaluateWakeSignal(signal, snapshot, DEFAULT_WAKE_POLICY_CONFIG);
  }

  /** validateResume — validate checkpoint integrity, identity binding, and compute wake decision. */
  validateResume(checkpoint: Checkpoint): ResumeValidation {
    const validation = validateCheckpointIntegrity(checkpoint);
    const errors = [...validation.errors];
    const warnings: string[] = [];

    // Identity binding: checkpoint must belong to this facade's plan/run
    // planId and runId are hard constraints — foreign values cause rejection.
    if (checkpoint.cursor.planId !== this.state.planId) {
      errors.push(`identity mismatch: checkpoint.cursor.planId "${checkpoint.cursor.planId}" !== facade.planId "${this.state.planId}"`);
    }
    if (checkpoint.cursor.runId !== this.state.runId) {
      errors.push(`identity mismatch: checkpoint.cursor.runId "${checkpoint.cursor.runId}" !== facade.runId "${this.state.runId}"`);
    }
    // epoch is a hard constraint — mismatched epoch causes immediate rejection (fail closed).
    if (checkpoint.cursor.epoch !== this.state.candidateEpoch) {
      errors.push(`identity mismatch: checkpoint.cursor.epoch ${checkpoint.cursor.epoch} !== facade.candidateEpoch ${this.state.candidateEpoch}`);
    }

    // Cursor-capsule identity binding
    const pairValidation = validateCursorCapsulePair(checkpoint.cursor, checkpoint.capsule);
    errors.push(...pairValidation.errors);

    if (!validation.valid || errors.length > 0) {
      return {
        valid: false,
        checkpoint,
        wakeDecision: this.evaluateWake('MANUAL_WAKE'),
        errors: Object.freeze([...new Set(errors)]), // dedupe
      };
    }

    // Compute wake decision based on checkpoint state
    const lastDecision = checkpoint.capsule.decisions[checkpoint.capsule.decisions.length - 1];
    const reason = lastDecision?.decision.includes('failed') ? 'WORKER_FAILED' : 'MANUAL_WAKE';

    return {
      valid: true,
      checkpoint,
      wakeDecision: this.evaluateWake(reason),
      errors: [],
    };
  }

  /**
   * restoreFromCheckpoint — validate checkpoint integrity + identity binding,
   * load state from checkpoint on success.
   * Returns { valid, checkpoint, errors } — does NOT throw.
   * On valid: facade state (decisions, eventSequence, pendingClaims/Evidence) is loaded from checkpoint.
   * On invalid: facade state unchanged, errors describe failures.
   */
  restoreFromCheckpoint(checkpoint: Checkpoint): ResumeValidation {
    const validation = this.validateResume(checkpoint);
    if (!validation.valid) return validation;

    // Load validated state from checkpoint
    this.state.decisions = checkpoint.capsule.decisions.map(d => ({
      decisionId: d.decisionId,
      decision: d.decision,
      rationale: d.rationale,
      committedAt: d.committedAt,
      commitSha256: d.commitSha256,
    }));
    this.state.pendingClaims = [...checkpoint.capsule.pendingClaims];
    this.state.pendingEvidence = [...checkpoint.capsule.pendingEvidence];
    this.state.activeWorkers = [...checkpoint.capsule.activeWorkers];
    this.state.eventSequence = checkpoint.cursor.attemptCount + 1;

    return validation;
  }

  /** getLatestCheckpoint — retrieve most recent checkpoint. */
  getLatestCheckpoint(): Checkpoint | null {
    return this.checkpoints.length > 0
      ? this.checkpoints[this.checkpoints.length - 1]
      : null;
  }

  /** getEventSequence — current event sequence number. */
  getEventSequence(): number {
    return this.state.eventSequence;
  }

  /** getArtifactPointers — all artifact pointers created during execution. */
  getArtifactPointers(): readonly ArtifactPointer[] {
    return [...this.state.artifactPointers];
  }

  /** getEventLog — all events emitted during execution. */
  getEventLog(): readonly EventDelta[] {
    return [...this.state.eventLog];
  }

  /** getProcessedEventCount — number of unique events processed. */
  getProcessedEventCount(): number {
    return this.state.processedEventHashes.size;
  }

  /** hasProcessedEvent — check if event was already processed (idempotency). */
  hasProcessedEvent(eventSha256: string): boolean {
    return this.state.processedEventHashes.has(eventSha256);
  }

  /** getWakeDecisionForCheckpoint — compute wake decision from checkpoint state. */
  getWakeDecisionForCheckpoint(checkpoint: Checkpoint): WakeDecision {
    const lastDecision = checkpoint.capsule.decisions[checkpoint.capsule.decisions.length - 1];
    const reason = lastDecision?.decision.includes('failed') ? 'WORKER_FAILED' : 'MANUAL_WAKE';
    return this.evaluateWake(reason);
  }

  private inferEventType(exitCode: number): EventType {
    return exitCode === 0 ? 'WORKER_COMPLETE' : 'WORKER_FAIL';
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createExecutionFacade(options: ExecutionFacadeOptions): ExecutionFacade {
  return new ExecutionFacade(options);
}

// ── Standalone helpers for CLI integration ─────────────────────────────────────

/**
 * runAndCheckpoint — single-shot execute + broker + checkpoint.
 * Convenience wrapper for CLI runner integration.
 */
export function runAndCheckpoint(
  cmd: ExecutionCommand,
  stdout: string,
  stderr: string,
  exitCode: number,
  durationMs: number,
  options: ExecutionFacadeOptions,
): ExecutionReceipt {
  const facade = createExecutionFacade(options);
  return facade.submitCommand(cmd, stdout, stderr, exitCode, durationMs);
}

/**
 * validateCheckpointForResumeViaFacade — validate checkpoint using facade options and produce wake decision.
 * ponytail: rename to validateCheckpointForResume when checkpoint-resume version is deprecated.
 */
export function validateCheckpointForResumeViaFacade(
  checkpoint: Checkpoint,
  options: ExecutionFacadeOptions,
): ResumeValidation {
  const facade = createExecutionFacade(options);
  return facade.validateResume(checkpoint);
}

/**
 * restoreFromCheckpoint — validate + load state from checkpoint.
 * Used by CLI runner to restore execution state on resume.
 */
export function restoreFromCheckpoint(
  checkpoint: Checkpoint,
  options: ExecutionFacadeOptions,
): ResumeValidation {
  const facade = createExecutionFacade(options);
  return facade.restoreFromCheckpoint(checkpoint);
}
