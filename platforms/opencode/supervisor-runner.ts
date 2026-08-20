import fs from 'node:fs';
import path from 'node:path';
import { createSupervisor, _resolveSupervisorInternals, type SupervisorConfig, type SupervisorPublicView, type _InternalOps, type ChildAssignmentView } from '../../packages/engine/src/supervisor.js';
import { OpenCodeV2Adapter, type OpenCodeV2Config, type MessagePart, type SSEEvent } from './adapter.js';

export interface SupervisorRunnerConfig {
  supervisor?: Partial<SupervisorConfig>;
  adapter?: OpenCodeV2Config;
}

interface TerminalEvidence {
  terminalEvent: unknown;
  eventCursor: string;
  childSessionId: string;
}

export class SupervisorRunner {
  private _complete!: (assignmentId: string, receipt: Record<string, unknown>) => { ok: true } | { ok: false; reason: string };
  private _internal!: _InternalOps;
  private _supervisor!: SupervisorPublicView;
  readonly adapter: OpenCodeV2Adapter;
  readonly supervisorConfig: Partial<SupervisorConfig>;
  private parentSessionId: string | null = null;
  private initialized = false;
  private readonly terminalEvidence = new Map<string, TerminalEvidence>();

  constructor(config: SupervisorRunnerConfig) {
    this.supervisorConfig = config.supervisor ?? {};
    this._supervisor = createSupervisor({
      ...this.supervisorConfig,
      completionVerifier: (assignmentId: string, receipt: Record<string, unknown>) => {
        const evidence = this.terminalEvidence.get(assignmentId);
        if (!evidence) return false;
        return receipt.eventCursor === evidence.eventCursor &&
               receipt.childSessionId === evidence.childSessionId;
      },
    });
    // F10 (R10): resolve internals via module-private symbol — not on public facade
    const internals = _resolveSupervisorInternals(this._supervisor);
    this._complete = internals.complete;
    this._internal = internals._internal;
    this.adapter = new OpenCodeV2Adapter(config.adapter ?? { baseUrl: 'http://127.0.0.1:4096', fetchFn: fetch });
  }

  /** F10 (R10): public view — no completion methods, no internal methods */
  get supervisor(): SupervisorPublicView { return this._supervisor; }

  async initialize(): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const health = await this.adapter.health();
      if (!health.healthy) return { ok: false, reason: `Server unhealthy: version=${health.version}` };
    } catch (err) {
      return { ok: false, reason: `Server unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
    try {
      const statePath = this.supervisorConfig.statePath;
      const stateLoaded = statePath && fs.existsSync(statePath);

      if (stateLoaded) {
        const sid = this._supervisor.sessionId;
        try {
          await this.adapter.getChildren({ sessionId: sid });
          this.parentSessionId = sid;
          this.initialized = true;
          return { ok: true };
        } catch {
          // Session not found on server, create new below
        }
      }

      const session = await this.adapter.createSession({ title: `supervisor-${this._supervisor.sessionId}` });
      this.parentSessionId = session.id;

      this._supervisor = createSupervisor({
        ...this.supervisorConfig,
        initialSessionId: session.id,
        completionVerifier: (assignmentId: string, receipt: Record<string, unknown>) => {
          const evidence = this.terminalEvidence.get(assignmentId);
          if (!evidence) return false;
          return receipt.eventCursor === evidence.eventCursor &&
                 receipt.childSessionId === evidence.childSessionId;
        },
      });
      const internals = _resolveSupervisorInternals(this._supervisor);
      this._complete = internals.complete;
      this._internal = internals._internal;
      this._internal.persistState();

      this.initialized = true;
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: `Initialization failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  get isInitialized(): boolean { return this.initialized; }

  async runAssignment(params: {
    assignmentId: string; kind: 'writer' | 'reviewer' | 'verifier';
    ownedPaths: readonly string[]; forbiddenPaths: readonly string[];
    contextKey: import('../../packages/engine/src/context-cache.js').ContextCapsuleKey;
    provider?: string; model?: string; effort?: string; agentProfile?: string;
  }): Promise<{ ok: true; assignment: ChildAssignmentView } | { ok: false; reason: string }> {
    if (!this.initialized) return { ok: false, reason: 'Runner not initialized' };
    if (!this.parentSessionId) return { ok: false, reason: 'No parent session' };

    const assignResult = this._supervisor.assignChild({
      assignmentId: params.assignmentId, kind: params.kind,
      ownedPaths: params.ownedPaths, forbiddenPaths: params.forbiddenPaths,
      contextKey: params.contextKey,
      provider: params.provider, model: params.model, effort: params.effort,
    });
    if (!assignResult.ok) return assignResult;

    try {
      const childSession = await this.adapter.createSession({ parentID: this.parentSessionId, title: `${params.assignmentId}-${params.kind}` });
      const bindResult = this._supervisor.bindChildSession(params.assignmentId, childSession.id);
      if (!bindResult.ok) { this._supervisor.failAssignment(params.assignmentId, bindResult.reason); return { ok: false, reason: bindResult.reason }; }
    } catch (err) {
      this._supervisor.failAssignment(params.assignmentId, `Child session failed: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, reason: `Child session failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    const dispatchResult = this._supervisor.dispatchAssignment(params.assignmentId);
    if (!dispatchResult.ok) { this._supervisor.failAssignment(params.assignmentId, dispatchResult.reason); return dispatchResult; }

    try {
      const ck = params.contextKey;
      const ownedStr = [...params.ownedPaths].join(', ');
      const forbiddenStr = [...params.forbiddenPaths].join(', ');
      const parts: MessagePart[] = [{ type: 'text', text: [
        `Capsule: assignmentId=${ck.assignmentId}, effectivePlanSha256=${ck.effectivePlanSha256}`,
        `Paths: owned=${ownedStr}, forbidden=${forbiddenStr}`,
        `AC hash: ${ck.acceptanceCriteriaSha256}`,
        'Policy: depth=1, no child dispatch, no task/subagent creation',
      ].join('\n') }];

      const assignment = this._supervisor.children.find(c => c.assignmentId === params.assignmentId);
      if (!assignment) { this._supervisor.failAssignment(params.assignmentId, 'Assignment vanished'); return { ok: false, reason: 'Assignment vanished' }; }

      await this.adapter.promptAsync({
        sessionId: assignment.childSessionId!, parts,
        model: { providerID: assignment.provider, modelID: assignment.model },
        agent: params.agentProfile ?? 'writer',
      });

      const ackResult = this._supervisor.ackAssignment(params.assignmentId);
      if (!ackResult.ok) { this._supervisor.failAssignment(params.assignmentId, ackResult.reason); return ackResult; }

      const updated = this._supervisor.children.find(c => c.assignmentId === params.assignmentId);
      if (!updated) { this._supervisor.failAssignment(params.assignmentId, 'Assignment vanished after ack'); return { ok: false, reason: 'Assignment vanished after ack' }; }
      return { ok: true, assignment: updated };
    } catch (err) {
      this._supervisor.failAssignment(params.assignmentId, `Prompt failed: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, reason: `Prompt failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** F10 (R10): completion — error/failed events fail; source+sessionId+cursor validation */
  async completeWithEvidence(assignmentId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const evidence = this.terminalEvidence.get(assignmentId);
    if (!evidence) return { ok: false, reason: 'No terminal evidence observed; call waitForTerminalEvidence first' };

    // F10 (R10): cursor must be from terminal event, not stale nextCursor
    if (!evidence.eventCursor) return { ok: false, reason: 'Terminal event missing cursor' };

    const ev = evidence.terminalEvent as Record<string, unknown> | undefined;
    if (!ev) return { ok: false, reason: 'Invalid terminal event' };

    // F10 (R10): validate event type — envelope or data.type
    const eventType = (typeof ev.type === 'string') ? ev.type :
                      (typeof (ev as any).data?.type === 'string') ? (ev as any).data.type : undefined;
    if (!eventType || !['idle', 'error', 'completed', 'failed'].includes(eventType)) {
      return { ok: false, reason: `Invalid terminal event type: ${eventType ?? '(missing)'}` };
    }

    // F10 (R10): error/failed events fail the assignment
    if (eventType === 'error' || eventType === 'failed') {
      const errorMsg = typeof ev.error === 'string' ? ev.error : 'Terminal error event';
      return this._supervisor.failAssignment(assignmentId, errorMsg);
    }

    // F10 (R10): source must match host/session/stream format
    const source = typeof ev.source === 'string' ? ev.source : undefined;
    if (!source || !source.includes(':')) return { ok: false, reason: 'Terminal event missing valid source (host:session:stream)' };

    // F10 (R10): sessionId validation
    const eventSessionId = (ev.sessionId as string) || (ev.childSessionId as string);
    if (!eventSessionId) return { ok: false, reason: 'Terminal event missing sessionId' };
    const assignment = this._supervisor.children.find(c => c.assignmentId === assignmentId);
    if (!assignment) return { ok: false, reason: `Assignment not found: ${assignmentId}` };
    if (assignment.childSessionId && eventSessionId !== assignment.childSessionId) {
      return { ok: false, reason: `Terminal event sessionId mismatch` };
    }

    const receipt: Record<string, unknown> = {
      terminalEvent: evidence.terminalEvent,
      eventCursor: evidence.eventCursor,
      childSessionId: evidence.childSessionId,
    };

    const result = this._complete(assignmentId, receipt);
    if (result.ok) {
      this.terminalEvidence.delete(assignmentId);
    }
    return result;
  }

  fail(assignmentId: string, error: string): ReturnType<SupervisorPublicView['failAssignment']> {
    return this._supervisor.failAssignment(assignmentId, error);
  }

  async waitForTerminalEvidence(params: {
    sessionId: string; afterCursor?: string; timeoutMs?: number; assignmentId?: string;
  }): Promise<{ ok: true; events: unknown[]; nextCursor: string } | { ok: false; reason: string }> {
    if (params.assignmentId) {
      const assignment = this._supervisor.children.find(c => c.assignmentId === params.assignmentId);
      if (!assignment) return { ok: false, reason: `Assignment not found: ${params.assignmentId}` };
      if (assignment.childSessionId && assignment.childSessionId !== params.sessionId) {
        return { ok: false, reason: `sessionId ${params.sessionId} does not match assignment ${params.assignmentId} childSessionId ${assignment.childSessionId}` };
      }
    }

    const timeoutMs = params.timeoutMs ?? 120000;
    const deadline = Date.now() + timeoutMs;
    const events: unknown[] = [];
    let nextCursor = params.afterCursor ?? '';

    let stream: ReadableStream<SSEEvent>;
    try {
      const remaining = deadline - Date.now();
      stream = await this.adapter.subscribeEvents({ afterCursor: params.afterCursor, timeoutMs: Math.max(0, remaining) });
    } catch (err) {
      return { ok: false, reason: `Failed to subscribe: ${err instanceof Error ? err.message : String(err)}` };
    }

    const reader = stream.getReader();
    try {
      while (Date.now() < deadline) {
        let readResult: ReadableStreamReadResult<SSEEvent>;
        try { readResult = await reader.read(); } catch { break; }
        const { done, value } = readResult;
        if (done) break;

        const data = value.data as Record<string, unknown>;
        const eventSessionId = (data.sessionId as string) || (data.childSessionId as string);
        if (eventSessionId === params.sessionId) {
          events.push(data);
          // F10 (R10): terminal detection from envelope type or data.type
          const envelopeType = value.type;
          const dataType = data.type as string | undefined;
          const isTerminal = envelopeType === 'idle' || envelopeType === 'error' ||
                             dataType === 'idle' || dataType === 'error' ||
                             dataType === 'completed' || dataType === 'failed';
          if (isTerminal) {
            // F10 (R10): cursor must come from terminal event's own data.cursor or SSE id
            const cursor = (data.cursor as string) || (value.id as string);
            if (!cursor) return { ok: false, reason: 'Terminal event missing cursor (data.cursor or SSE id)' };
            if (params.assignmentId) {
              this.terminalEvidence.set(params.assignmentId, {
                terminalEvent: data,
                eventCursor: cursor,
                childSessionId: params.sessionId,
              });
            }
            return { ok: true, events, nextCursor: cursor };
          }
        }
      }
      return { ok: false, reason: 'Timeout or stream ended without terminal evidence' };
    } finally {
      reader.cancel();
    }
  }

  /** F10 (R10): abort with single-layer journal (PRE/OK/FAIL); precheck terminal before remote */
  async abort(assignmentId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const localAssignment = this._supervisor.children.find(c => c.assignmentId === assignmentId);
    if (!localAssignment) return { ok: false, reason: `Assignment not found: ${assignmentId}` };
    if (localAssignment.status === 'COMPLETED' || localAssignment.status === 'ABORTED') {
      return { ok: false, reason: `Assignment ${assignmentId} is already ${localAssignment.status}` };
    }

    // F10 (R10): single-layer journal — PRE before remote, OK/FAIL after
    const jPath = this.supervisorConfig.statePath ? journalPath(this.supervisorConfig.statePath) : null;
    if (jPath) writeJournalEntry(jPath, `PRE:${assignmentId}:${Date.now()}`);

    // Remote abort
    if (localAssignment.childSessionId) {
      try {
        const remoteOk = await this.adapter.abort({ sessionId: localAssignment.childSessionId });
        if (!remoteOk) {
          if (jPath) writeJournalEntry(jPath, `FAIL:${assignmentId}:${Date.now()}:remote_abort_failed`);
          return { ok: false, reason: `Remote abort returned false for session ${localAssignment.childSessionId}` };
        }
      } catch (err) {
        if (jPath) writeJournalEntry(jPath, `FAIL:${assignmentId}:${Date.now()}:remote_abort_exception`);
        return { ok: false, reason: `Remote abort failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    // Local abort
    const abortResult = this._supervisor.abortAssignment(assignmentId);
    if (!abortResult.ok) {
      if (jPath) writeJournalEntry(jPath, `FAIL:${assignmentId}:${Date.now()}:local_abort_${abortResult.reason}`);
      this.terminalEvidence.delete(assignmentId);
      return abortResult;
    }

    if (jPath) writeJournalEntry(jPath, `OK:${assignmentId}:${Date.now()}`);
    this.terminalEvidence.delete(assignmentId);
    return { ok: true };
  }

  get openWriterSlots(): number { return this._supervisor.availableWriterSlots; }
  get openReviewerSlots(): number { return this._supervisor.availableReviewerSlots; }
}

// F10 (R10): single journal layer — secure O_NOFOLLOW|O_APPEND|O_CREAT, mode 0o600, dedup PRE
function journalPath(statePath: string): string { return statePath + '.reconcile'; }

function writeJournalEntry(jPath: string, entry: string): void {
  try {
    // F10 (R10): O_NOFOLLOW to prevent symlink attacks, O_APPEND|O_CREAT for append-only
    const flags = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW;
    const fd = fs.openSync(jPath, flags, 0o600);
    try {
      fs.writeSync(fd, entry + '\n');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // Fsync dir
    const dirFd = fs.openSync(path.dirname(jPath), 'r');
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  } catch { /* best-effort */ }
}
