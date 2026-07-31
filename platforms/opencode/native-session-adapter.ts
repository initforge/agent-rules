import type { OpencodeClient, SessionDurableEventStream } from '@opencode-ai/sdk/v2';

export type OpenCodeNativeClient = OpencodeClient;
export type NativeSessionStatus = 'idle' | 'running' | 'failed' | 'done';
export interface NativeSessionBoundary { status(sessionId: string): Promise<NativeSessionStatus>; continue(sessionId: string, promptId: string): Promise<void>; }
type EventEnvelope = { data?: SessionDurableEventStream | Record<string, unknown>; event?: string; type?: string };
const object = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return undefined; } }
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
};

export class OpenCodeNativeSessionAdapter implements NativeSessionBoundary {
  constructor(private readonly client: OpenCodeNativeClient, private readonly continuationText: string, private readonly timeoutMs = 30_000) {}
  async status(sessionId: string): Promise<NativeSessionStatus> {
    if (!sessionId) throw new Error('OpenCode native session status requires sessionId');
    const stream = (await this.client.v2.session.events({ sessionID: sessionId })).stream;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('status timeout')), this.timeoutMs));
    try {
      for await (const envelope of await Promise.race([Promise.resolve(stream), timeout])) {
        const envelopeObject = object(envelope);
        const event = object(envelopeObject?.data) ?? envelopeObject;
        if (!event) continue;
        const data = object(event.data) ?? event;
        if (data.sessionID && data.sessionID !== sessionId) continue;
        const type = String(event.type ?? data.type ?? envelopeObject?.event ?? '');
        const status = object(data.status)?.type ?? data.status;
        if (type === 'session.idle' || type === 'session.status' && status === 'idle') return 'idle';
        if (type === 'session.status' && status === 'busy') return 'running';
        if (type === 'session.status' && (status === 'retry' || status === 'error')) return 'failed';
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
