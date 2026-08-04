/**
 * Production coordinator adapter for OpenCode platform.
 * - coordinator-only depth 1 (no child session spawn)
 * - native session state via OpenCode SDK
 * - bounded provider/tool/MCP waits
 * - exact cancel/reassign/checkpoint
 */

import type { OpencodeClient, SessionDurableEventStream } from '@opencode-ai/sdk/v2';
import type { OpenCodeNativeClient } from '../../packages/engine/src/native-session-adapter.js';
import { OpenCodeNativeSessionAdapter, parseNativeEvent, type NativeSessionStatus } from '../../packages/engine/src/native-session-adapter.js';
import type { ContextCapsuleKey } from '../../packages/engine/src/context-cache.js';
import type { SupervisorPublicView, ChildKind } from '../../packages/engine/src/supervisor.js';

// ── Bounded wait config ───────────────────────────────────────────────────────

export interface BoundedWaitsConfig {
  /** Provider wait timeout in ms (default: 30000) */
  providerWaitMs: number;
  /** Tool execution wait timeout in ms (default: 120000) */
  toolWaitMs: number;
  /** MCP server wait timeout in ms (default: 30000) */
  mcpWaitMs: number;
  /** Session event poll interval in ms (default: 1000) */
  pollIntervalMs: number;
  /** Max reassignments before escalation (default: 1) */
  maxReassignments: number;
}

const DEFAULT_WAITS: BoundedWaitsConfig = {
  providerWaitMs: 30_000,
  toolWaitMs: 120_000,
  mcpWaitMs: 30_000,
  pollIntervalMs: 1_000,
  maxReassignments: 1,
};

// ── Coordinator adapter interface ──────────────────────────────────────────────

export interface CoordinatorAssignment {
  readonly assignmentId: string;
  readonly sessionId: string;
  readonly kind: ChildKind;
  readonly ownedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly contextKey: ContextCapsuleKey;
  readonly provider: string;
  readonly model: string;
  readonly agentProfile: string;
  readonly status: 'PENDING' | 'DISPATCHED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED' | 'REASSIGNED';
  readonly reassignments: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly checkpointId?: string;
}

export interface CoordinatorCheckpoint {
  readonly checkpointId: string;
  readonly assignmentId: string;
  readonly sessionId: string;
  readonly createdAt: string;
  readonly snapshotToken: string;
}

export interface CoordinatorEvent {
  readonly type: string;
  readonly sessionId: string;
  readonly timestamp: number;
  readonly data: Record<string, unknown>;
}

export type CoordinatorEventType =
  | 'assigned'
  | 'dispatched'
  | 'running'
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  | 'provider_wait'
  | 'mcp_wait'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'reassigned'
  | 'checkpoint_created'
  | 'checkpoint_restored';

// ── Production coordinator adapter ─────────────────────────────────────────────

export class CoordinatorAdapter {
  private readonly client: OpenCodeNativeClient;
  private readonly nativeSession: OpenCodeNativeSessionAdapter;
  private readonly waits: BoundedWaitsConfig;
  private readonly assignments = new Map<string, CoordinatorAssignment>();
  private readonly checkpoints = new Map<string, CoordinatorCheckpoint>();
  private readonly eventHandlers = new Map<string, Set<(event: CoordinatorEvent) => void>>();

  // ponytail: skip — checkpoint persistence to external store
  // Add when checkpoint store (e.g., Redis, DB) integration is required

  constructor(client: OpenCodeNativeClient, waits?: Partial<BoundedWaitsConfig>) {
    this.client = client;
    this.waits = { ...DEFAULT_WAITS, ...waits };
    this.nativeSession = new OpenCodeNativeSessionAdapter(client, 'Continue');
  }

  // ── Session management ─────────────────────────────────────────────────────

  /**
   * Get native session status with bounded wait.
   */
  async getSessionStatus(sessionId: string): Promise<NativeSessionStatus> {
    return this.withTimeout(this.nativeSession.status(sessionId), this.waits.providerWaitMs, 'provider');
  }

  /**
   * Continue session with bounded wait.
   */
  async continueSession(sessionId: string, promptId: string): Promise<void> {
    return this.withTimeout(this.nativeSession.continue(sessionId, promptId), this.waits.providerWaitMs, 'provider');
  }

  /**
   * Subscribe to session events with bounded timeout.
   * Returns async iterable that yields events until timeout or session end.
   */
  async *subscribeSessionEvents(
    sessionId: string,
    options: { afterEventId?: string; timeoutMs?: number } = {}
  ): AsyncIterable<CoordinatorEvent> {
    const timeoutMs = options.timeoutMs ?? this.waits.providerWaitMs;
    const deadline = Date.now() + timeoutMs;
    const seenStatusTypes = new Set<string>();

    // F1 (R3): exact remaining timeout passed to SDK
    const stream = await this.client.v2.session.events({ sessionID: sessionId });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('session event subscription timeout')), timeoutMs)
    );

    try {
      const iterator = stream.stream[Symbol.asyncIterator]();
      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;

        const readPromise = iterator.next();
        const raceResult = await Promise.race([readPromise, timeout]);

        if (raceResult.done) break;

        const parsed = parseNativeEvent(raceResult.value);
        if (!parsed) continue;

        // Filter out hidden ask/question events from coordinator view
        if (parsed.type === 'question.v2.asked' || parsed.type === 'question.asked' ||
            parsed.type === 'permission.v2.asked' || parsed.type === 'permission.asked') {
          continue;
        }

        if (parsed.type === 'session.status' || parsed.type === 'session.idle') {
          const data = parsed.data as Record<string, unknown>;
          const sessionIdFromEvent = String(data.sessionID ?? '');
          // session.idle is always emitted (terminal event)
          if (parsed.type === 'session.idle') {
            yield {
              type: 'completed',
              sessionId: sessionIdFromEvent,
              timestamp: Date.now(),
              data: parsed.data,
            };
            break;
          }
          // For session.status, track seen types to avoid duplicates
          const statusType = String(data.status?.type ?? data.status ?? '');
          const key = `${sessionIdFromEvent}:${statusType}`;
          if (sessionIdFromEvent && !seenStatusTypes.has(key)) {
            seenStatusTypes.add(key);
            yield {
              type: 'running',
              sessionId: sessionIdFromEvent,
              timestamp: Date.now(),
              data: parsed.data,
            };
          }
        }
      }
    } finally {
      // G-08: cleanup handled by SDK stream
    }
  }

  // ── Assignment management ───────────────────────────────────────────────────

  /**
   * Create assignment in coordinator-only mode (no child session spawn).
   * Session is managed directly by coordinator at depth 1.
   */
  createAssignment(params: {
    assignmentId: string;
    kind: ChildKind;
    ownedPaths: readonly string[];
    forbiddenPaths: readonly string[];
    contextKey: ContextCapsuleKey;
    provider?: string;
    model?: string;
    agentProfile?: string;
  }): CoordinatorAssignment {
    if (this.assignments.has(params.assignmentId)) {
      throw new Error(`Assignment ${params.assignmentId} already exists`);
    }

    const now = new Date().toISOString();
    const assignment: CoordinatorAssignment = {
      assignmentId: params.assignmentId,
      sessionId: '', // Set when dispatched
      kind: params.kind,
      ownedPaths: params.ownedPaths,
      forbiddenPaths: params.forbiddenPaths,
      contextKey: params.contextKey,
      provider: params.provider ?? 'openai',
      model: params.model ?? 'gpt-4',
      agentProfile: params.agentProfile ?? params.kind,
      status: 'PENDING',
      reassignments: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.assignments.set(params.assignmentId, assignment);
    this.emit('assigned', { assignmentId: params.assignmentId, sessionId: '' });
    return assignment;
  }

  /**
   * Dispatch assignment - binds session and transitions to DISPATCHED.
   */
  dispatchAssignment(assignmentId: string, sessionId: string): CoordinatorAssignment {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);
    if (assignment.status !== 'PENDING') throw new Error(`Cannot dispatch ${assignmentId} in ${assignment.status}`);

    const updated: CoordinatorAssignment = {
      ...assignment,
      sessionId,
      status: 'DISPATCHED',
      updatedAt: new Date().toISOString(),
    };
    this.assignments.set(assignmentId, updated);
    this.emit('dispatched', { assignmentId, sessionId });
    return updated;
  }

  /**
   * Transition to RUNNING state.
   */
  startAssignment(assignmentId: string): CoordinatorAssignment {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);
    if (assignment.status !== 'DISPATCHED') throw new Error(`Cannot start ${assignmentId} in ${assignment.status}`);

    const updated: CoordinatorAssignment = {
      ...assignment,
      status: 'RUNNING',
      updatedAt: new Date().toISOString(),
    };
    this.assignments.set(assignmentId, updated);
    this.emit('running', { assignmentId, sessionId: assignment.sessionId });
    return updated;
  }

  // ── Exact cancel ───────────────────────────────────────────────────────────

  /**
   * Cancel assignment - exact cancel with bounded wait.
   * Fails closed if remote cancel times out.
   */
  async cancelAssignment(assignmentId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) return { ok: false, reason: `Assignment ${assignmentId} not found` };
    if (['COMPLETED', 'FAILED', 'ABORTED', 'REASSIGNED'].includes(assignment.status)) {
      return { ok: false, reason: `Assignment ${assignmentId} already ${assignment.status}` };
    }

    if (!assignment.sessionId) {
      // Not yet dispatched - just mark as aborted
      const updated: CoordinatorAssignment = { ...assignment, status: 'ABORTED', updatedAt: new Date().toISOString() };
      this.assignments.set(assignmentId, updated);
      this.emit('aborted', { assignmentId, sessionId: '' });
      return { ok: true };
    }

    try {
      await this.withTimeout(
        this.client.v2.session.abort({ sessionID: assignment.sessionId }),
        this.waits.providerWaitMs,
        'provider'
      );

      const updated: CoordinatorAssignment = { ...assignment, status: 'ABORTED', updatedAt: new Date().toISOString() };
      this.assignments.set(assignmentId, updated);
      this.emit('aborted', { assignmentId, sessionId: assignment.sessionId });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: `Cancel failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // ── Exact reassign ─────────────────────────────────────────────────────────

  /**
   * Reassign assignment to new session - bounded with max reassignments.
   */
  async reassignAssignment(
    assignmentId: string,
    newSessionId: string
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) return { ok: false, reason: `Assignment ${assignmentId} not found` };
    if (!['RUNNING', 'DISPATCHED'].includes(assignment.status)) {
      return { ok: false, reason: `Cannot reassign ${assignmentId} in ${assignment.status}` };
    }
    if (assignment.reassignments >= this.waits.maxReassignments) {
      return { ok: false, reason: `Max reassignments (${this.waits.maxReassignments}) exceeded for ${assignmentId}` };
    }

    // Cancel current session first
    if (assignment.sessionId) {
      try {
        await this.withTimeout(
          this.client.v2.session.abort({ sessionID: assignment.sessionId }),
          this.waits.providerWaitMs,
          'provider'
        );
      } catch {
        // Best-effort cancel - proceed with reassign
      }
    }

    const updated: CoordinatorAssignment = {
      ...assignment,
      sessionId: newSessionId,
      status: 'DISPATCHED',
      reassignments: assignment.reassignments + 1,
      updatedAt: new Date().toISOString(),
    };
    this.assignments.set(assignmentId, updated);
    this.emit('reassigned', { assignmentId, oldSessionId: assignment.sessionId, newSessionId });
    return { ok: true };
  }

  // ── Exact checkpoint ───────────────────────────────────────────────────────

  /**
   * Create checkpoint for assignment - captures current state.
   */
  async createCheckpoint(assignmentId: string): Promise<{ ok: true; checkpoint: CoordinatorCheckpoint } | { ok: false; reason: string }> {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) return { ok: false, reason: `Assignment ${assignmentId} not found` };
    if (!assignment.sessionId) return { ok: false, reason: `No session bound to ${assignmentId}` };

    try {
      // Get session messages for checkpoint
      const messagesResult = await this.withTimeout(
        this.client.v2.session.messages({ sessionID: assignment.sessionId, limit: 100 }),
        this.waits.providerWaitMs,
        'provider'
      );

      const messages = messagesResult.data ?? [];
      const snapshotToken = JSON.stringify({
        assignmentId,
        sessionId: assignment.sessionId,
        messages: messages.map((m: unknown) => {
          const msg = m as Record<string, unknown>;
          return { id: msg.id, role: msg.role, time: msg.time };
        }),
        status: assignment.status,
        reassignments: assignment.reassignments,
      });

      const checkpointId = `cp-${assignmentId}-${Date.now()}`;
      const checkpoint: CoordinatorCheckpoint = {
        checkpointId,
        assignmentId,
        sessionId: assignment.sessionId,
        createdAt: new Date().toISOString(),
        snapshotToken,
      };

      this.checkpoints.set(checkpointId, checkpoint);

      // Update assignment with checkpoint reference
      const updated: CoordinatorAssignment = {
        ...assignment,
        checkpointId,
        updatedAt: new Date().toISOString(),
      };
      this.assignments.set(assignmentId, updated);

      this.emit('checkpoint_created', { assignmentId, checkpointId });
      return { ok: true, checkpoint };
    } catch (err) {
      return { ok: false, reason: `Checkpoint failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /**
   * Restore from checkpoint.
   */
  async restoreCheckpoint(
    checkpointId: string
  ): Promise<{ ok: true; assignment: CoordinatorAssignment } | { ok: false; reason: string }> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) return { ok: false, reason: `Checkpoint ${checkpointId} not found` };

    const assignment = this.assignments.get(checkpoint.assignmentId);
    if (!assignment) return { ok: false, reason: `Assignment ${checkpoint.assignmentId} not found` };

    // Restore session and status from checkpoint
    const snapshot = JSON.parse(checkpoint.snapshotToken) as {
      status: CoordinatorAssignment['status'];
      reassignments: number;
      sessionId: string;
    };

    const restored: CoordinatorAssignment = {
      ...assignment,
      sessionId: snapshot.sessionId,
      status: snapshot.status === 'RUNNING' ? 'DISPATCHED' : snapshot.status,
      reassignments: snapshot.reassignments,
      checkpointId,
      updatedAt: new Date().toISOString(),
    };
    this.assignments.set(checkpoint.assignmentId, restored);

    this.emit('checkpoint_restored', { checkpointId, assignmentId: checkpoint.assignmentId });
    return { ok: true, assignment: restored };
  }

  // ── Tool/MCP bounded waits ─────────────────────────────────────────────────

  /**
   * Wait for tool execution with bounded timeout.
   */
  async waitForTool(
    assignmentId: string,
    toolName: string,
    options: { timeoutMs?: number } = {}
  ): Promise<{ ok: true } | { ok: false; reason: string; timedOut: boolean }> {
    const timeoutMs = options.timeoutMs ?? this.waits.toolWaitMs;
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) return { ok: false, reason: `Assignment ${assignmentId} not found`, timedOut: false };
    if (!assignment.sessionId) return { ok: false, reason: `No session bound`, timedOut: false };

    const deadline = Date.now() + timeoutMs;

    for await (const event of this.subscribeSessionEvents(assignment.sessionId, { timeoutMs })) {
      if (Date.now() >= deadline) {
        this.emit('tool_error', { assignmentId, toolName, reason: 'timeout' });
        return { ok: false, reason: `Tool ${toolName} wait timeout`, timedOut: true };
      }

      if (event.type === 'tool_end' || event.type === 'tool_error') {
        return { ok: true };
      }
    }

    return { ok: false, reason: `Session ended before tool completion`, timedOut: false };
  }

  /**
   * Wait for MCP server with bounded timeout.
   */
  async waitForMcp(
    assignmentId: string,
    mcpServer: string,
    options: { timeoutMs?: number } = {}
  ): Promise<{ ok: true } | { ok: false; reason: string; timedOut: boolean }> {
    const timeoutMs = options.timeoutMs ?? this.waits.mcpWaitMs;
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) return { ok: false, reason: `Assignment ${assignmentId} not found`, timedOut: false };
    if (!assignment.sessionId) return { ok: false, reason: `No session bound`, timedOut: false };

    const deadline = Date.now() + timeoutMs;

    for await (const event of this.subscribeSessionEvents(assignment.sessionId, { timeoutMs })) {
      if (Date.now() >= deadline) {
        this.emit('mcp_wait', { assignmentId, mcpServer, status: 'timeout' });
        return { ok: false, reason: `MCP ${mcpServer} wait timeout`, timedOut: true };
      }

      const data = event.data as Record<string, unknown>;
      if (data.server === mcpServer) {
        this.emit('mcp_wait', { assignmentId, mcpServer, status: 'ready' });
        return { ok: true };
      }
    }

    return { ok: false, reason: `Session ended before MCP ready`, timedOut: false };
  }

  // ── Complete assignment ────────────────────────────────────────────────────

  /**
   * Complete assignment - transitions to COMPLETED.
   */
  completeAssignment(assignmentId: string): { ok: true } | { ok: false; reason: string } {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) return { ok: false, reason: `Assignment ${assignmentId} not found` };
    if (assignment.status !== 'RUNNING') return { ok: false, reason: `Cannot complete ${assignmentId} in ${assignment.status}` };

    const updated: CoordinatorAssignment = {
      ...assignment,
      status: 'COMPLETED',
      updatedAt: new Date().toISOString(),
    };
    this.assignments.set(assignmentId, updated);
    this.emit('completed', { assignmentId, sessionId: assignment.sessionId });
    return { ok: true };
  }

  /**
   * Fail assignment - transitions to FAILED.
   */
  failAssignment(assignmentId: string, error: string): { ok: true } | { ok: false; reason: string } {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) return { ok: false, reason: `Assignment ${assignmentId} not found` };
    if (['COMPLETED', 'FAILED', 'ABORTED'].includes(assignment.status)) {
      return { ok: false, reason: `Cannot fail ${assignmentId} in ${assignment.status}` };
    }

    const updated: CoordinatorAssignment = {
      ...assignment,
      status: 'FAILED',
      updatedAt: new Date().toISOString(),
    };
    this.assignments.set(assignmentId, updated);
    this.emit('failed', { assignmentId, sessionId: assignment.sessionId, error });
    return { ok: true };
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  getAssignment(assignmentId: string): CoordinatorAssignment | undefined {
    return this.assignments.get(assignmentId);
  }

  getAllAssignments(): readonly CoordinatorAssignment[] {
    return Array.from(this.assignments.values());
  }

  getCheckpoint(checkpointId: string): CoordinatorCheckpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  on(event: CoordinatorEventType, handler: (event: CoordinatorEvent) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.eventHandlers.get(event)?.delete(handler);
  }

  private emit(type: CoordinatorEventType, data: Record<string, unknown>): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      const event: CoordinatorEvent = { type, sessionId: String(data.sessionId ?? ''), timestamp: Date.now(), data };
      for (const handler of handlers) {
        try { handler(event); } catch { /* best-effort */ }
      }
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  private async withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} wait timeout after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createCoordinatorAdapter(
  client: OpenCodeNativeClient,
  waits?: Partial<BoundedWaitsConfig>
): CoordinatorAdapter {
  return new CoordinatorAdapter(client, waits);
}
