import { describe, expect, it, vi } from 'vitest';
import type { OpencodeClient, SessionDurableEventStream } from '@opencode-ai/sdk/v2';
import { OpenCodeNativeSessionAdapter, type OpenCodeNativeClient } from './native-session-adapter.js';

const stream = (...data: SessionDurableEventStream[]): AsyncIterable<unknown> => ({ [Symbol.asyncIterator]: async function* () { for (const item of data) yield { data: item }; } });
const client = (events: AsyncIterable<unknown>) => ({ v2: { session: { events: vi.fn(async () => ({ stream: events })), prompt: vi.fn(async () => ({})) } } }) as unknown as OpenCodeNativeClient;

describe('OpenCodeNativeSessionAdapter', () => {
  it('uses official status events', async () => { const sdk = client(stream({ type: 'session.idle', sessionID: 's' } as SessionDurableEventStream)); await expect(new OpenCodeNativeSessionAdapter(sdk, 'resume').status('s')).resolves.toBe('idle'); });
  it('sends resume and continuation key through official SDK fields', async () => { const sdk = client(stream()); const adapter = new OpenCodeNativeSessionAdapter(sdk, 'resume text'); await adapter.continue('s', 'CONTINUE:key'); expect(sdk.v2.session.prompt).toHaveBeenCalledWith({ sessionID: 's', id: 'CONTINUE:key', prompt: { text: 'resume text' }, resume: true }); });
  it('fails closed when stream has no status', async () => { await expect(new OpenCodeNativeSessionAdapter(client(stream()), 'resume').status('s')).rejects.toThrow('status unavailable'); });
});
