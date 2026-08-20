/**
 * mcp/client.ts — minimal MCP stdio client used for handshake proof.
 *
 * Speaks JSON-RPC 2.0 over the provider's stdio: initialize -> initialized
 * notification -> tools/list. The proof (server info, protocol version,
 * capabilities, tool list) is stored on the lease as evidence — never treated
 * as the host's own connection, which remains per-session.
 */
import { spawn } from 'node:child_process';
import type { McpHandshakeProof } from '../types.js';
import { newId } from '../util/hashes.js';

const MCP_PROTOCOL_VERSION = '2024-11-05';

export interface McpClientOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
  /** reuse an already-spawned provider child (probe before piping stdio) */
  child?: import('node:child_process').ChildProcess;
}

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export class McpClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'McpClientError';
  }
}

export async function handshake(opts: McpClientOptions): Promise<McpHandshakeProof> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const child = opts.child ?? spawn(opts.command, opts.args ?? [], {
    env: { ...process.env, ...(opts.env ?? {}) },
    cwd: opts.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  const ownsChild = !opts.child;

  let buffer = '';
  const pending = new Map<string, (msg: JsonRpcMessage) => void>();
  let stderrTail = '';

  child.stderr?.on('data', (d: Buffer) => {
    stderrTail = (stderrTail + d.toString()).slice(-2000);
  });

  const onLine = (line: string): void => {
    if (!line.trim()) return;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line) as JsonRpcMessage;
    } catch {
      return;
    }
    if (msg.id !== undefined && msg.id !== null) {
      const key = String(msg.id);
      const resolve = pending.get(key);
      if (resolve) {
        pending.delete(key);
        resolve(msg);
      }
    }
  };

  child.stdout?.on('data', (d: Buffer) => {
    buffer += d.toString();
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      onLine(line);
    }
  });

  const send = (msg: JsonRpcMessage): void => {
    child.stdin?.write(JSON.stringify(msg) + '\n');
  };

  const request = (method: string, params: unknown): Promise<JsonRpcMessage> =>
    new Promise((resolve, reject) => {
      const id = newId('req');
      pending.set(id, resolve);
      send({ jsonrpc: '2.0', id, method, params });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new McpClientError('MCP_REQUEST_TIMEOUT', `request ${method} timed out; stderr: ${stderrTail.slice(-500)}`));
        }
      }, timeoutMs);
    });

  try {
    const initId = newId('init');
    const initResult = await new Promise<JsonRpcMessage>((resolve, reject) => {
      pending.set(initId, resolve);
      send({ jsonrpc: '2.0', id: initId, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'agent-rules-mcp-guardian', version: '0.1.0' } } });
      setTimeout(() => {
        if (pending.has(initId)) {
          pending.delete(initId);
          reject(new McpClientError('MCP_INITIALIZE_TIMEOUT', `initialize timed out; stderr: ${stderrTail.slice(-500)}`));
        }
      }, timeoutMs);
    });
    if (initResult.error) {
      throw new McpClientError('MCP_INITIALIZE_ERROR', `initialize failed: ${initResult.error.message}`);
    }
    const init = initResult.result as { protocolVersion?: string; capabilities?: Record<string, unknown>; serverInfo?: { name?: string; version?: string } } | undefined;

    // initialized notification (fire and forget)
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    const toolsResult = await request('tools/list', {});
    if (toolsResult.error) {
      throw new McpClientError('MCP_TOOLS_LIST_ERROR', `tools/list failed: ${toolsResult.error.message}`);
    }
    const tools = (toolsResult.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? [];

    return {
      server_info: init?.serverInfo ? { name: init.serverInfo.name ?? 'unknown', version: init.serverInfo.version ?? 'unknown' } : null,
      protocol_version: init?.protocolVersion ?? null,
      capabilities: init?.capabilities ?? null,
      tools_listed: tools.length,
      tools_sample: tools.slice(0, 10).map((t) => t.name),
      initialize_id: initId,
      tools_list_id: 'tools/list',
      handshake_ms: Date.now() - started,
    };
  } finally {
    if (ownsChild) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    } else {
      // Detach probe listeners so the host's piped traffic is untouched.
      child.stdout?.removeAllListeners('data');
      child.stderr?.removeAllListeners('data');
    }
  }
}
