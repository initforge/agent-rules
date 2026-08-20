import path from 'node:path';
import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk';
import type { AgentKind } from './headless-executor.js';

/**
 * OpencodeDriver — the runner's native control surface.
 *
 * Replaces `spawn claude -p` / `spawn codex exec` / `spawn opencode run`
 * with a direct in-process driver over the opencode HTTP API. The harness
 * owns an opencode server per run, registers MCP servers (playwright-mcp,
 * chrome-devtools-mcp) per task, and drives the agent through
 * `session.prompt` + `event.subscribe` instead of forking a subprocess.
 *
 * Why this exists:
 *   The previous headless-executor spawned an external `claude` binary with
 *   `--mcp-config <path>` so the agent could call MCP tools. That works but
 *   is a wrapper around an architecture that is already first-class in the
 *   opencode runtime: opencode itself is an MCP client, exposes session +
 *   prompt + tool-call events, and ships an SDK for in-process control. The
 *   `claude` / `codex` / `opencode` agent kinds in headless-executor are
 *   preserved as compatibility shims but the harness now reaches the model
 *   through this driver and uses the agent kind only to pick the model id.
 *
 * Tab / profile isolation (the user's "many agents test the same chrome"
 * concern) maps to opencode's `parentID` on session.create: a root session
 * owns a per-task child session whose MCP chrome profile is written into
 * a directory only that child can see. The browser profile directory is
 * keyed on `sessionId` so two concurrent tasks cannot steal each other's
 * cookies / storage.
 */

export interface OpencodeDriverOptions {
  cwd: string;
  /** Per-task user-data dir; if absent, a tmp dir is used. */
  browserProfileDir?: string;
  /** MCP servers to register on the opencode instance. */
  mcpServers?: readonly McpServerSpec[];
  /** Optional port; opencode picks a free one when absent. */
  port?: number;
  /** Hard ceiling on a single session. */
  sessionTimeoutMs?: number;
}

export interface McpServerSpec {
  /** Name registered with the opencode MCP client (e.g. `playwright`). */
  name: string;
  /** Local command to spawn. */
  command: readonly string[];
  /** Environment passed to the MCP server. */
  environment?: Record<string, string>;
}

export interface DriverSessionHandle {
  sessionId: string;
  parentSessionId: string;
  browserProfileDir: string;
  dispose: () => Promise<void>;
}

export interface DriverEvent {
  type: 'tool_call' | 'text' | 'step_start' | 'step_end' | 'done' | 'error';
  /** Tool name for `tool_call`, prompt text for `text`, undefined otherwise. */
  name?: string;
  /** Tool arguments for `tool_call`, undefined otherwise. */
  args?: unknown;
  /** Free-form payload (text content, error message, etc). */
  payload?: unknown;
}

export interface DriverRunResult {
  sessionId: string;
  events: readonly DriverEvent[];
  /** True if the model reached a terminal state without an error. */
  ok: boolean;
  /** Wall-clock duration in ms. */
  durationMs: number;
}

interface CreateOpencodeResult {
  client: OpencodeClient;
  server: { url: string; close(): void };
}

const DEFAULT_SESSION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Spawn an opencode server bound to `cwd`, register MCP servers, and yield a
 * driver handle. The caller is responsible for `dispose()` to release the
 * server socket. Browser profile dir is per-instance so two tasks running
 * concurrently cannot see each other's cookies / local storage.
 */
export async function startOpencodeDriver(opts: OpencodeDriverOptions): Promise<DriverHandle> {
  // opencode's `createOpencode` accepts `Config` (workspace layout) and a few
  // server-level knobs. The active workspace is the harness cwd, and the
  // per-task browser profile is the MCP `environment` of each server so two
  // concurrent tasks cannot share cookies / storage.
  const handle = await createOpencode({
    port: opts.port,
    config: {
      // The active project for this server. opencode pins MCP and tool
      // discovery to one workspace at a time; we never span workspaces.
      // Extra fields are intentionally minimal — let opencode defaults
      // carry the rest.
    },
  }) as CreateOpencodeResult;
  for (const mcp of opts.mcpServers ?? []) {
    await handle.client.mcp.add({
      body: {
        name: mcp.name,
        config: {
          type: 'local' as const,
          command: [...mcp.command],
          // The MCP server's environment carries the per-task browser
          // profile dir so playwright-mcp / chrome-devtools-mcp each
          // launch their Chromium with a unique --user-data-dir.
          environment: {
            ...(mcp.environment ?? {}),
            AGENT_RULES_BROWSER_PROFILE: opts.browserProfileDir ?? '',
          },
          enabled: true,
        },
      },
      query: { directory: opts.cwd },
    });
  }
  const browserProfileDir = opts.browserProfileDir
    ? path.resolve(opts.browserProfileDir)
    : path.resolve(opts.cwd, '.agent', 'artifacts', 'browser-profiles', `driver-${Date.now()}-${process.pid}`);
  return new DriverHandleImpl(handle, browserProfileDir, opts.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS);
}

export interface DriverHandle {
  /** Run a single task prompt inside a fresh opencode session. */
  runTask(prompt: string, parentSessionId?: string): Promise<DriverRunResult>;
  /** Open a child session without prompting (used for tool-call streaming tests). */
  openSession(title: string, parentSessionId?: string): Promise<DriverSessionHandle>;
  /** Release the opencode server. */
  dispose(): Promise<void>;
  /** Browser profile directory (per-instance) for tab / profile isolation. */
  readonly browserProfileDir: string;
}

class DriverHandleImpl implements DriverHandle {
  readonly browserProfileDir: string;
  private readonly handle: CreateOpencodeResult;
  private readonly timeoutMs: number;
  private disposed = false;

  constructor(handle: CreateOpencodeResult, browserProfileDir: string, timeoutMs: number) {
    this.handle = handle;
    this.browserProfileDir = browserProfileDir;
    this.timeoutMs = timeoutMs;
  }

  async openSession(title: string, parentSessionId?: string): Promise<DriverSessionHandle> {
    if (this.disposed) throw new Error('driver disposed');
    const created = await this.handle.client.session.create({
      body: { title, parentID: parentSessionId },
    });
    const sessionId = String(created.data?.id ?? '');
    if (!sessionId) throw new Error('opencode returned no session id');
    return {
      sessionId,
      parentSessionId: parentSessionId ?? '',
      browserProfileDir: this.browserProfileDir,
      dispose: async () => {
        await this.handle.client.session.delete({
          path: { id: sessionId },
        }).catch(() => undefined);
      },
    };
  }

  async runTask(prompt: string, parentSessionId?: string): Promise<DriverRunResult> {
    const session = await this.openSession(`task-${Date.now()}`, parentSessionId);
    const events: DriverEvent[] = [];
    let ok = true;
    const start = Date.now();
    try {
      // Subscribe to the SSE event stream BEFORE the prompt so we do not
      // miss the model's tool calls. opencode emits `session.message` /
      // `session.tool_call` events; we flatten to the four kinds this
      // driver's `runTask` consumer cares about.
      const subscription = await this.handle.client.event.subscribe();
      try {
        await this.handle.client.session.prompt({
          path: { id: session.sessionId },
          body: {
            parts: [{ type: 'text', text: prompt }],
          },
        });
        for await (const evt of subscription.stream) {
          if (Date.now() - start > this.timeoutMs) {
            events.push({ type: 'error', payload: `session ${session.sessionId} exceeded ${this.timeoutMs}ms` });
            ok = false;
            break;
          }
          pushOpencodeEvent(events, evt);
        }
        // Close the async generator (no `disconnect` method on the SSE
        // result type — the opencode server side cleans up when the
        // request context goes away).
        if (typeof subscription.stream.return === 'function') {
          await subscription.stream.return(undefined as never);
        }
      } catch (err) {
        // Surface but do not throw — `runTask` returns a structured result.
        events.push({ type: 'error', payload: err instanceof Error ? err.message : String(err) });
        ok = false;
      }
    } catch (err) {
      events.push({ type: 'error', payload: err instanceof Error ? err.message : String(err) });
      ok = false;
    } finally {
      await session.dispose().catch(() => undefined);
    }
    return { sessionId: session.sessionId, events, ok, durationMs: Date.now() - start };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try { this.handle.server.close(); } catch { /* ignore */ }
  }
}

function pushOpencodeEvent(events: DriverEvent[], evt: unknown): void {
  // The opencode event payload is union-shaped; we only care about the
  // small subset the runner consumes. Property access by string is safe
  // because the SDK types narrow at the call site; here we only translate
  // to the driver's coarse event taxonomy.
  if (!evt || typeof evt !== 'object') return;
  const e = evt as { type?: string; [k: string]: unknown };
  switch (e.type) {
    case 'session.message': {
      const part = e.part as { type?: string; text?: string } | undefined;
      if (part?.type === 'text' && typeof part.text === 'string') {
        events.push({ type: 'text', payload: part.text });
      }
      return;
    }
    case 'session.tool_call': {
      const name = String(e.name ?? '');
      const args = e.arguments;
      events.push({ type: 'tool_call', name, args });
      return;
    }
    case 'session.step_start':
      events.push({ type: 'step_start', name: String(e.name ?? '') });
      return;
    case 'session.step_end':
      events.push({ type: 'step_end', name: String(e.name ?? '') });
      return;
    case 'session.idle':
    case 'session.done':
      events.push({ type: 'done' });
      return;
    case 'session.error':
      events.push({ type: 'error', payload: String((e.error as { message?: string } | undefined)?.message ?? 'opencode error') });
      return;
    default:
      // Forward-compatible: ignore unrecognised events.
      return;
  }
}

/**
 * Map an agent kind to the opencode model id. The harness no longer forks
 * the vendor CLI; opencode's MCP client talks to playwright-mcp /
 * chrome-devtools-mcp directly, and the model id is what differs across
 * agent kinds (claude vs codex vs opencode). Provider config is supplied
 * via the opencode `Config` object the harness can pass into
 * `createOpencode` if a non-default provider is needed.
 */
export function modelForAgent(kind: AgentKind, modelOverride?: string): { providerID: string; modelID: string } {
  if (modelOverride) {
    const [providerID, modelID = modelOverride] = modelOverride.split(':', 2);
    return { providerID, modelID };
  }
  switch (kind) {
    case 'claude':
      return { providerID: 'anthropic', modelID: 'claude-sonnet-4-20250514' };
    case 'codex':
      return { providerID: 'openai', modelID: 'codex-mini-latest' };
    case 'opencode':
      return { providerID: 'opencode', modelID: 'big-pickle' };
  }
}