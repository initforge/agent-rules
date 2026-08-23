import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

export function openCodeHome(): string {
  return process.env.OPENCODE_HOME || path.join(os.homedir(), '.config', 'opencode');
}

export interface OpenCodeSkillDiscoveryResult {
  skills: string[];
  locations: string[];
  bindings: Record<string, {
    effectiveRoot: string;
    precedenceRank: number;
    path: string;
  }>;
}

export function inspectOpenCodeSkills(repoRoot?: string): OpenCodeSkillDiscoveryResult {
  const home = openCodeHome();
  // OpenCode V2 registration order (lowest to highest precedence):
  // 1. Builtin / .claude skill sources
  // 2. .agents skill sources
  // 3. ~/.config/opencode/skills (global)
  // 4. project .opencode/skills (project local)
  // 5. explicit skills config entries
  const orderedRoots = [
    ...(repoRoot ? [path.join(repoRoot, 'skills')] : []),
    ...(repoRoot ? [path.join(repoRoot, '.claude', 'skills')] : []),
    ...(repoRoot ? [path.join(repoRoot, '.agents', 'skills')] : []),
    path.join(home, 'skills'),
    ...(repoRoot ? [path.join(repoRoot, '.opencode', 'skills')] : []),
  ];

  const bindings: Record<string, { effectiveRoot: string; precedenceRank: number; path: string }> = {};
  const locations: string[] = [];

  orderedRoots.forEach((loc, rank) => {
    if (!fs.existsSync(loc)) return;
    locations.push(loc);
    try {
      const entries = fs.readdirSync(loc, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMd = path.join(loc, entry.name, 'SKILL.md');
          if (fs.existsSync(skillMd)) {
            // Later source overrides earlier source with higher precedence
            bindings[entry.name] = {
              effectiveRoot: loc,
              precedenceRank: rank + 1,
              path: path.join(loc, entry.name),
            };
          }
        }
      }
    } catch { /* ignore */ }
  });

  return {
    skills: Object.keys(bindings).sort(),
    locations,
    bindings,
  };
}

export function probeOpenCodePlanning(): { supported: boolean; mode: string; reason?: string } {
  const binary = whichOpenCode();
  if (!binary) {
    return { supported: false, mode: 'opencode-plan-agent', reason: 'OpenCode binary is not found on PATH' };
  }
  return { supported: true, mode: 'opencode-plan-agent' };
}

export type OpenCodeDialect = 'v1' | 'v2';

export interface OpenCodePermissionRule {
  pattern: string;
  action: 'allow' | 'deny' | 'ask';
  tool?: string;
  description?: string;
}

export interface OpenCodeRuntimeContract {
  readonly dialect: OpenCodeDialect;
  readonly executable: string;
  readonly configFileName: string;
  readonly permissionVocabulary: 'tool-map' | 'ordered-rules';
  readonly mcpKey: 'mcp' | 'mcp.servers';
  readonly supportedFlags: readonly string[];
}

export function detectOpenCodeRuntimeContract(configPathOrContent?: string): OpenCodeRuntimeContract {
  const dialect = detectOpenCodeDialect(configPathOrContent);
  if (dialect === 'v1') {
    return {
      dialect: 'v1',
      executable: 'opencode',
      configFileName: 'opencode.json',
      permissionVocabulary: 'tool-map',
      mcpKey: 'mcp',
      supportedFlags: ['run', '--auto', '--agent', '--model', '--session', '--continue'],
    };
  }
  return {
    dialect: 'v2',
    executable: 'opencode2',
    configFileName: 'opencode.json',
    permissionVocabulary: 'ordered-rules',
    mcpKey: 'mcp.servers',
    supportedFlags: ['run', '--agent', '--model', '--session'],
  };
}

export function detectOpenCodeDialect(configPathOrContent?: string): OpenCodeDialect {
  if (!configPathOrContent) return 'v2';
  try {
    let content = configPathOrContent;
    if (fs.existsSync(configPathOrContent)) {
      content = fs.readFileSync(configPathOrContent, 'utf8');
    }
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.permissions)) return 'v2';
    if (parsed.permission !== undefined && !Array.isArray(parsed.permission)) return 'v1';
    if (parsed.tools?.shell !== undefined || parsed.tools?.subagent !== undefined) return 'v2';
    if (parsed.tools?.bash !== undefined || parsed.tools?.task !== undefined) return 'v1';
  } catch {
    // If not parseable JSON, check version string
    if (/v1\b/i.test(configPathOrContent)) return 'v1';
  }
  return 'v2';
}

/**
 * OpenCode V2 ordered permission rule evaluator.
 * Implements strict last-matching-rule behavior:
 * Subsequent rules override earlier matching rules; if no rule matches, default is 'ask'.
 */
export function evaluateOpenCodeV2Permissions(
  rules: readonly OpenCodePermissionRule[],
  target: string,
  tool?: string
): 'allow' | 'deny' | 'ask' {
  let matchedAction: 'allow' | 'deny' | 'ask' | null = null;
  const normalizedTarget = target.replace(/\\/g, '/');

  for (const rule of rules) {
    if (rule.tool && tool && rule.tool !== '*' && rule.tool !== tool) {
      continue;
    }
    const pattern = rule.pattern.replace(/\\/g, '/');
    let matches = false;
    if (pattern === '*' || pattern === '**' || pattern === normalizedTarget) {
      matches = true;
    } else if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      matches = normalizedTarget === prefix || normalizedTarget.startsWith(`${prefix}/`);
    } else if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      matches = normalizedTarget.startsWith(`${prefix}/`) && !normalizedTarget.slice(prefix.length + 1).includes('/');
    } else if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      matches = regex.test(normalizedTarget);
    }
    if (matches) {
      matchedAction = rule.action; // Last matching rule wins!
    }
  }

  return matchedAction ?? 'ask';
}

export function formatOpenCodeV1Config(options: {
  permissionMap?: Record<string, 'allow' | 'deny' | 'ask' | Record<string, 'allow' | 'deny' | 'ask'>>;
  mcp?: Record<string, unknown>;
  plugins?: string[];
}): Record<string, unknown> {
  return {
    $schema: 'https://opencode.ai/config.json',
    permission: options.permissionMap ?? { '*': 'ask', bash: 'allow' },
    mcp: options.mcp ?? {},
    ...(options.plugins ? { plugins: options.plugins } : {}),
  };
}

export function formatOpenCodeV2Config(options: {
  permissions?: OpenCodePermissionRule[];
  mcpServers?: Record<string, unknown>;
  plugins?: string[];
}): Record<string, unknown> {
  return {
    $schema: 'https://opencode.ai/config.v2.json',
    permissions: options.permissions ?? [{ pattern: '*', action: 'ask' }],
    mcp: {
      servers: options.mcpServers ?? {},
    },
    ...(options.plugins ? { plugins: options.plugins } : {}),
  };
}

export function formatOpenCodeConfig(options: {
  dialect: OpenCodeDialect;
  permissions?: OpenCodePermissionRule[];
  permissionMap?: Record<string, 'allow' | 'deny' | 'ask' | Record<string, 'allow' | 'deny' | 'ask'>>;
  mcp?: Record<string, unknown>;
  mcpServers?: Record<string, unknown>;
  plugins?: string[];
}): Record<string, unknown> {
  if (options.dialect === 'v1') {
    return formatOpenCodeV1Config({
      permissionMap: options.permissionMap ?? (options.permissions?.[0] ? { '*': options.permissions[0].action } : undefined),
      mcp: options.mcp ?? options.mcpServers,
      plugins: options.plugins,
    });
  }
  return formatOpenCodeV2Config({
    permissions: options.permissions,
    mcpServers: options.mcpServers ?? options.mcp,
    plugins: options.plugins,
  });
}