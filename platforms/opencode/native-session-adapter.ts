import type { OpencodeClient, SessionDurableEventStream } from '@opencode-ai/sdk/v2';

export type OpenCodeNativeClient = Pick<OpencodeClient, 'v2'>;
export type NativeSessionStatus = 'idle' | 'running' | 'failed' | 'done';
export interface NativeSessionBoundary { status(sessionId: string): Promise<NativeSessionStatus>; continue(sessionId: string, promptId: string): Promise<void>; }
type EventEnvelope = { data: SessionDurableEventStream | string; event?: string };

export class OpenCodeNativeSessionAdapter implements NativeSessionBoundary {
  constructor(private readonly client: OpenCodeNativeClient, private readonly continuationText: string, private readonly timeoutMs = 30_000) {}
  async status(sessionId: string): Promise<NativeSessionStatus> {
    if (!sessionId) throw new Error('OpenCode native session status requires sessionId');
    const stream = (await this.client.v2.session.events({ sessionID: sessionId })).stream;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('status timeout')), this.timeoutMs));
    try {
      for await (const envelope of await Promise.race([Promise.resolve(stream), timeout])) {
        const raw = typeof (envelope as EventEnvelope).data === 'string' ? JSON.parse((envelope as EventEnvelope).data) : (envelope as EventEnvelope).data;
        const event = raw as Record<string, unknown>;
        const data = (event.data as Record<string, unknown> | undefined) ?? event;
        if (data.sessionID && data.sessionID !== sessionId) continue;
        const type = (event.type ?? data.type ?? (envelope as EventEnvelope).event) as string;
        if (type === 'session.idle' || (type === 'session.status' && (data.status as { type?: string } | undefined)?.type === 'idle')) return 'idle';
        if (type === 'session.status' && (data.status as { type?: string } | undefined)?.type === 'busy') return 'running';
        if (type === 'session.status' && (data.status as { type?: string } | undefined)?.type === 'retry') return 'failed';
      }
    } catch (error) { throw new Error(`OpenCode native session status unavailable: ${sessionId}: ${String(error)}`); }
    throw new Error(`OpenCode native session status unavailable: ${sessionId}`);
  }
  async continue(sessionId: string, promptId: string): Promise<void> {
    if (!sessionId) throw new Error('OpenCode native continuation requires sessionId');
    if (!promptId) throw new Error('OpenCode native continuation requires promptId');
    try { await this.client.v2.session.prompt({ sessionID: sessionId, id: promptId, prompt: { text: this.continuationText }, resume: true }); }
    catch (error) { throw new Error(`OpenCode native continuation rejected: ${sessionId}: ${String(error)}`); }
  }
}
