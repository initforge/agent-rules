export interface OpenCodeV2Config {
  baseUrl: string;
  fetchFn: typeof fetch;
}

export interface Session {
  id: string;
  parentID?: string;
  title?: string;
  createdAt: string;
  status: string;
}

export interface MessagePart {
  type: string;
  text: string;
}

export interface MessageResponse {
  info: { id: string; role: string; created: string; model?: string };
  parts: MessagePart[];
  model?: string; // resolved/observed model from response
}

export interface HealthResponse {
  healthy: boolean;
  version: string;
}

export interface SSEEvent {
  type: string;
  data: unknown;
  id?: string;
}

/**
 * Sentinel for model slots the OpenCode host does not expose.
 * Fail-closed: never fabricate model values.
 */
export const HOST_UNOBSERVABLE = 'HOST_UNOBSERVABLE';

/**
 * Model provenance evidence: requested, resolved, observed.
 * Model truth rule: only values the host actually exposes are recorded.
 * Anything else is HOST_UNOBSERVABLE. Nothing is fabricated.
 */
export interface OpenCodeModelEvidence {
  readonly requested: string;
  readonly resolved: string;
  readonly observed: string;
}

/**
 * Parse requested/resolved/observed model evidence from SSE event data.
 * Returns UNOBSERVABLE for any slot the host does not expose.
 */
export function parseModelEvidence(
  events: Record<string, unknown>[],
  requestedModel?: string,
): OpenCodeModelEvidence {
  let resolved = HOST_UNOBSERVABLE;
  let observed = HOST_UNOBSERVABLE;

  for (const ev of events) {
    if (typeof ev !== 'object' || ev === null) continue;

    // Init events may carry resolved model
    if (ev.type === 'init' || ev.type === 'server.connected') {
      const model = (ev as Record<string, unknown>).model;
      if (typeof model === 'string' && model) {
        resolved = model;
      }
    }

    // Message events carry observed model
    if (ev.type === 'message' || ev.type === 'assistant') {
      const msgData = (ev as Record<string, unknown>);
      // Nested model field in message payload
      const model = (msgData as Record<string, unknown>).model;
      if (typeof model === 'string' && model && model !== '<synthetic>' && model !== '') {
        observed = model;
      }
      // Alternative: model in info block
      const info = (msgData as Record<string, unknown>).info;
      if (info && typeof info === 'object') {
        const infoModel = (info as Record<string, unknown>).model;
        if (typeof infoModel === 'string' && infoModel && infoModel !== '<synthetic>') {
          observed = infoModel;
        }
      }
    }
  }

  return {
    requested: requestedModel ?? HOST_UNOBSERVABLE,
    resolved,
    observed,
  };
}

function buildUrl(base: string, path: string): string {
  const baseClean = base.replace(/\/+$/, '');
  const pathClean = path.replace(/^\/+/, '');
  return `${baseClean}/${pathClean}`;
}

async function throwOnError(res: Response): Promise<void> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && typeof body === 'object') {
        if (typeof body.error === 'string') message = body.error;
        else if (typeof body.message === 'string') message = body.message;
      }
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(message);
  }
}

// F5 (R5): SSE persistent parsing state — id persists, empty id resets to '' (not undefined)
interface SSELineState {
  currentType: string;
  currentData: string;
  currentId: string;
  hadExplicitEvent: boolean;
}

function resetSSEState(): SSELineState {
  return { currentType: 'message', currentData: '', currentId: '', hadExplicitEvent: false };
}

function processSSELines(lines: string[], state: SSELineState): SSEEvent[] {
  const events: SSEEvent[] = [];
  for (const line of lines) {
    if (line === '') {
      if (state.currentData !== '') {
        let parsed: unknown;
        try {
          parsed = JSON.parse(state.currentData);
        } catch {
          Object.assign(state, { currentData: '', currentType: 'message', hadExplicitEvent: false });
          // F3 (R4): preserve currentId — last-event-id persists per SSE spec
          continue;
        }
        const finalType = state.hadExplicitEvent
          ? state.currentType
          : ((parsed as Record<string, unknown>)?.type as string) || state.currentType;
        events.push({ type: finalType, data: parsed, id: state.currentId });
      }
      // F3 (R4): reset type/data/explicit, KEEP currentId (last-event-id persistence)
      state.currentType = 'message';
      state.currentData = '';
      state.hadExplicitEvent = false;
      continue;
    }
    const eventMatch = line.match(/^event:\s?(.*)$/);
    if (eventMatch) {
      state.currentType = eventMatch[1] || 'message';
      state.hadExplicitEvent = true;
      continue;
    }
    const idMatch = line.match(/^id:\s?(.*)$/);
    if (idMatch) {
      // F5 (R5): empty id ('id:') resets to '' not undefined
      state.currentId = idMatch[1] !== undefined ? idMatch[1] : '';
      continue;
    }
    const dataMatch = line.match(/^data:\s?(.*)$/);
    if (dataMatch) {
      if (state.currentData !== '') state.currentData += '\n';
      state.currentData += dataMatch[1];
      continue;
    }
    if (line.startsWith(':')) continue;
    // unknown field — skip per SSE spec
  }
  return events;
}

export class OpenCodeV2Adapter {
  private config: OpenCodeV2Config;

  constructor(config: OpenCodeV2Config) {
    this.config = config;
  }

  async createSession(params: { parentID?: string; title?: string } = {}): Promise<Session> {
    const body: Record<string, unknown> = {};
    if (params.parentID !== undefined) body.parentID = params.parentID;
    if (params.title !== undefined) body.title = params.title;

    const res = await this.config.fetchFn(buildUrl(this.config.baseUrl, '/session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await throwOnError(res);
    return res.json() as Promise<Session>;
  }

  async prompt(params: {
    sessionId: string;
    parts: MessagePart[];
    model?: { providerID: string; modelID: string };
    agent?: string;
    noReply?: boolean;
  }): Promise<MessageResponse> {
    const body: Record<string, unknown> = { parts: params.parts };
    if (params.model !== undefined) body.model = params.model;
    if (params.agent !== undefined) body.agent = params.agent;
    if (params.noReply !== undefined) body.noReply = params.noReply;

    const res = await this.config.fetchFn(
      buildUrl(this.config.baseUrl, `/session/${params.sessionId}/message`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    await throwOnError(res);
    return res.json() as Promise<MessageResponse>;
  }

  async promptAsync(params: {
    sessionId: string;
    parts: MessagePart[];
    model?: { providerID: string; modelID: string };
    agent?: string;
  }): Promise<boolean> {
    const body: Record<string, unknown> = { parts: params.parts };
    if (params.model !== undefined) body.model = params.model;
    if (params.agent !== undefined) body.agent = params.agent;

    const res = await this.config.fetchFn(
      buildUrl(this.config.baseUrl, `/session/${params.sessionId}/prompt_async`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    await throwOnError(res);
    return true;
  }

  async getChildren(params: { sessionId: string }): Promise<Session[]> {
    const res = await this.config.fetchFn(
      buildUrl(this.config.baseUrl, `/session/${params.sessionId}/children`),
      { method: 'GET' },
    );
    await throwOnError(res);
    return res.json() as Promise<Session[]>;
  }

  async abort(params: { sessionId: string }): Promise<boolean> {
    const res = await this.config.fetchFn(
      buildUrl(this.config.baseUrl, `/session/${params.sessionId}/abort`),
      { method: 'POST' },
    );
    await throwOnError(res);
    const data = (await res.json()) as unknown;
    return data === true;
  }

  async health(): Promise<HealthResponse> {
    const res = await this.config.fetchFn(buildUrl(this.config.baseUrl, '/global/health'), {
      method: 'GET',
    });
    await throwOnError(res);
    return res.json() as Promise<HealthResponse>;
  }

  async subscribeEvents(params: { afterCursor?: string; timeoutMs?: number } = {}): Promise<ReadableStream<SSEEvent>> {
    const url = new URL(buildUrl(this.config.baseUrl, '/event'));
    if (params.afterCursor !== undefined) {
      url.searchParams.set('after', params.afterCursor);
    }

    // F1 (R3): exact remaining timeout
    const timeoutMs = params.timeoutMs ?? 30000;
    const deadline = Date.now() + timeoutMs;

    // F1 (R3): AbortController for fetch + reader, race pattern
    const controller = new AbortController();
    let fetchTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await this.config.fetchFn(url.toString(), {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      await throwOnError(res);

      if (!res.body) {
        throw new Error('Response body is null');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // F3 (R3): line-level buffer + persistent SSE parse state
      let lineBuf = '';
      const sseState = resetSSEState();

      // G-08: Track deadlineTimer reference for cancel() cleanup
      let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

      return new ReadableStream<SSEEvent>({
        async pull(control) {
          // F1 (R3): deadline timer cancels pending reader.read
          deadlineTimer = setTimeout(() => {
            reader.cancel();
          }, Math.max(0, deadline - Date.now()));

          try {
            while (true) {
              const remaining = deadline - Date.now();
              if (remaining <= 0) {
                reader.cancel();
                control.close();
                return;
              }

              let readResult: ReadableStreamReadResult<Uint8Array>;
              try {
                readResult = await reader.read();
              } catch {
                reader.cancel();
                control.close();
                return;
              }

              const { done, value } = readResult;
              if (done) {
                // F3 (R4): flush TextDecoder (stream: false) for buffered UTF-8 bytes
                lineBuf += decoder.decode();
                if (lineBuf) {
                  const lines = lineBuf.split(/\r?\n/);
                  const events = processSSELines(lines, sseState);
                  for (const ev of events) control.enqueue(ev);
                }
                // F3 (R4): EOF force-dispatch any pending data without blank line
                if (sseState.currentData !== '') {
                  let parsed: unknown;
                  try {
                    parsed = JSON.parse(sseState.currentData);
                  } catch {
                    // malformed — skip
                  }
                  if (parsed !== undefined) {
                    const finalType = sseState.hadExplicitEvent
                      ? sseState.currentType
                      : ((parsed as Record<string, unknown>)?.type as string) || sseState.currentType;
                    control.enqueue({ type: finalType, data: parsed, id: sseState.currentId });
                  }
                }
                lineBuf = '';
                sseState.currentData = '';
                control.close();
                return;
              }

              // F3 (R3): decode with stream:true to handle multi-byte UTF-8 fragmentation
              lineBuf += decoder.decode(value, { stream: true });
              const lastNl = lineBuf.lastIndexOf('\n');
              if (lastNl === -1) continue;

              // F3 (R3): extract complete lines (include trailing \n for dispatch)
              const complete = lineBuf.slice(0, lastNl + 1);
              lineBuf = lineBuf.slice(lastNl + 1);
              const lines = complete.split(/\r?\n/);
              const events = processSSELines(lines, sseState);
              for (const ev of events) control.enqueue(ev);
              if (events.length > 0) return;
            }
            } finally {
              if (deadlineTimer) clearTimeout(deadlineTimer);
              deadlineTimer = null;
            }
        },
        cancel() {
          if (fetchTimer) clearTimeout(fetchTimer);
          fetchTimer = null;
          if (deadlineTimer) clearTimeout(deadlineTimer);
          deadlineTimer = null;
          reader.cancel();
        },
      });
    } finally {
      if (fetchTimer) clearTimeout(fetchTimer);
      fetchTimer = null;
    }
  }
}