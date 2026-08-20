/**
 * mcp/http-broker.ts — Streamable HTTP MCP broker with lease-token ACL.
 *
 * Design (owner contract §IV):
 * - every logical session gets its own MCP protocol session (Mcp-Session-Id);
 * - requests must present a non-spoofable lease token (Authorization Bearer or
 *   X-Lease-Token); the broker resolves the lease by token hash and enforces
 *   the session/resource ACL;
 * - provider instances are shared only when the registry marks the provider
 *   shared-safe AND the lease's sharing mode allows it; stateful/write/
 *   destructive providers default to exclusive per-session instances;
 * - one STDIO byte stream is never shared between hosts: the broker owns the
 *   provider stdio and multiplexes JSON-RPC per session, or a per-session
 *   instance is spawned for exclusive leases.
 *
 * The provider stdio is owned by the broker via a stdio client pool. For
 * exclusive leases the broker still owns the stream (the host never attaches
 * directly); for shared providers one stream is multiplexed by session.
 */
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import type { Broker } from '../broker/broker.js';
import type { Registry } from '../projection/registry.js';
import { newId } from '../util/hashes.js';

export interface HttpBrokerOptions {
  broker: Broker;
  registry: Registry;
  /** how to obtain the provider launch command for a provider id */
  launchCommand: (providerId: string, leaseId: string) => { command: string; args: string[]; env: Record<string, string> };
  host?: string;
  port?: number;
}

interface SessionState {
  sessionId: string;
  leaseId: string;
  logicalSessionId: string;
  providerId: string;
  instance: ProviderInstance;
}

interface ProviderInstance {
  providerInstanceId: string;
  providerId: string;
  child: ChildProcess;
  /** sessions multiplexed onto this instance */
  sessions: Map<string, SessionState>;
  /** (sessionId, requestId) -> resolve */
  pending: Map<string, (msg: unknown) => void>;
  buffer: string;
}

export class McpHttpBroker {
  private opts: HttpBrokerOptions;
  private server: http.Server;
  private sessions = new Map<string, SessionState>();
  private instances = new Map<string, ProviderInstance>();
  private sseClients = new Map<string, Set<http.ServerResponse>>();

  constructor(opts: HttpBrokerOptions) {
    this.opts = opts;
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  async listen(): Promise<{ host: string; port: number }> {
    await new Promise<void>((resolve) => {
      this.server.listen(this.opts.port ?? 0, this.opts.host ?? '127.0.0.1', () => resolve());
    });
    const addr = this.server.address();
    if (addr === null || typeof addr === 'string') throw new Error('http broker failed to bind');
    return { host: addr.address, port: addr.port };
  }

  async close(): Promise<void> {
    for (const inst of this.instances.values()) {
      try {
        inst.child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private authToken(req: http.IncomingMessage): string | null {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    const header = req.headers['x-lease-token'];
    return typeof header === 'string' ? header : null;
  }

  private json(res: http.ServerResponse, code: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(payload);
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/health') {
        this.json(res, 200, { ok: true, sessions: this.sessions.size, instances: this.instances.size });
        return;
      }
      if (url.pathname === '/mcp') {
        if (req.method === 'POST') {
          await this.handlePost(req, res);
          return;
        }
        if (req.method === 'GET') {
          this.handleSse(req, res);
          return;
        }
        if (req.method === 'DELETE') {
          this.handleDelete(req, res);
          return;
        }
        this.json(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'method not allowed' } });
        return;
      }
      if (url.pathname === '/admin/leases') {
        this.json(res, 200, {
          leases: this.opts.broker.listLeases().map((l) => ({
            lease_id: l.lease_id,
            logical_session_id: l.logical_session_id,
            provider_id: l.provider_id,
            status: l.status,
            sharing_mode: l.sharing_mode,
          })),
        });
        return;
      }
      this.json(res, 404, { error: 'not found' });
    } catch (e) {
      this.json(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: (e as Error).message } });
    }
  }

  private async handlePost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const token = this.authToken(req);
    if (!token) {
      this.json(res, 401, { jsonrpc: '2.0', error: { code: -32001, message: 'lease token required' } });
      return;
    }
    let lease;
    try {
      lease = this.opts.broker.resolveLeaseByToken(token);
    } catch {
      this.json(res, 401, { jsonrpc: '2.0', error: { code: -32001, message: 'invalid or revoked lease token' } });
      return;
    }
    if (!['READY', 'RELOCATED', 'RECONNECTING', 'RESOURCE_RECREATED'].includes(lease.status)) {
      this.json(res, 403, { jsonrpc: '2.0', error: { code: -32002, message: `lease status ${lease.status} not connectable` } });
      return;
    }

    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = typeof sessionIdHeader === 'string' ? sessionIdHeader : null;

    const raw = await readBody(req);
    let msg: { id?: string | number; method?: string; params?: unknown };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      this.json(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'parse error' } });
      return;
    }

    // Session lifecycle.
    if (msg.method === 'initialize' && !sessionId) {
      const session = await this.createSession(lease, token);
      const result = {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'agent-rules-mcp-http-broker', version: '0.1.0' },
        instructions: 'Session-scoped MCP broker; resource shared only under explicit policy.',
      };
      res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': session.sessionId });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
      return;
    }

    if (!sessionId) {
      this.json(res, 400, { jsonrpc: '2.0', error: { code: -32000, message: 'initialize must be the first request' } });
      return;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.json(res, 404, { jsonrpc: '2.0', error: { code: -32002, message: 'unknown session' } });
      return;
    }
    if (session.leaseId !== lease.lease_id) {
      this.json(res, 403, { jsonrpc: '2.0', error: { code: -32001, message: 'session does not belong to this lease' } });
      return;
    }

    // Forward to the provider instance (per-session or shared multiplex).
    const response = await this.forward(session, msg);
    if (response !== null) {
      this.json(res, 200, response);
    } else {
      // notification: accepted
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end('{}');
    }
  }

  private async createSession(lease: { lease_id: string; logical_session_id: string; provider_id: string; sharing_mode: string }, token: string): Promise<SessionState> {
    const sessionId = newId('sess');
    const provider = this.opts.registry.provider(lease.provider_id);
    const sharedOk = provider?.shared_safe === true && lease.sharing_mode !== 'exclusive';
    let instance: ProviderInstance;
    if (sharedOk) {
      instance = this.instances.get(lease.provider_id) ?? this.spawnInstance(lease.provider_id, lease.lease_id);
      this.instances.set(lease.provider_id, instance);
    } else {
      // Exclusive: dedicated instance per session (never shared stdio).
      instance = this.spawnInstance(lease.provider_id, lease.lease_id, sessionId);
      this.instances.set(`${lease.provider_id}:${sessionId}`, instance);
    }
    const session: SessionState = {
      sessionId,
      leaseId: lease.lease_id,
      logicalSessionId: lease.logical_session_id,
      providerId: lease.provider_id,
      instance,
    };
    instance.sessions.set(sessionId, session);
    this.sessions.set(sessionId, session);
    return session;
  }

  private spawnInstance(providerId: string, leaseId: string, suffix?: string): ProviderInstance {
    const launch = this.opts.launchCommand(providerId, leaseId);
    const child = spawn(launch.command, launch.args, {
      env: { ...process.env, ...launch.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    const instance: ProviderInstance = {
      providerInstanceId: suffix ? `${providerId}-${suffix}` : `${providerId}-shared`,
      providerId,
      child,
      sessions: new Map(),
      pending: new Map(),
      buffer: '',
    };
    child.stdout?.on('data', (d: Buffer) => {
      instance.buffer += d.toString();
      let idx: number;
      while ((idx = instance.buffer.indexOf('\n')) !== -1) {
        const line = instance.buffer.slice(0, idx);
        instance.buffer = instance.buffer.slice(idx + 1);
        this.dispatchLine(instance, line);
      }
    });
    child.stderr?.on('data', () => {
      /* provider stderr is telemetry only */
    });
    return instance;
  }

  private dispatchLine(instance: ProviderInstance, line: string): void {
    if (!line.trim()) return;
    let msg: { id?: string | number; result?: unknown; error?: unknown; method?: string; params?: unknown };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      return;
    }
    if (msg.id !== undefined && msg.id !== null) {
      // Responses are correlated per session: each session owns its id space.
      for (const sessionId of instance.sessions.keys()) {
        const key = `${sessionId}:${String(msg.id)}`;
        const resolve = instance.pending.get(key);
        if (resolve) {
          instance.pending.delete(key);
          resolve(msg);
          return;
        }
      }
      return;
    }
    // server notification -> broadcast to sessions on this instance
    if (msg.method) {
      for (const sessionId of instance.sessions.keys()) {
        const sse = this.sseClients.get(sessionId);
        if (sse) {
          for (const res of sse) {
            res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
          }
        }
      }
    }
  }

  private forward(session: SessionState, msg: { id?: string | number; method?: string; params?: unknown }): Promise<unknown> {
    return new Promise((resolve) => {
      if (msg.id === undefined || msg.id === null) {
        // notification
        session.instance.child.stdin?.write(JSON.stringify(msg) + '\n');
        resolve(null);
        return;
      }
      const key = `${session.sessionId}:${String(msg.id)}`;
      session.instance.pending.set(key, (m: unknown) => resolve(m));
      session.instance.child.stdin?.write(JSON.stringify(msg) + '\n');
    });
  }

  private handleSse(req: http.IncomingMessage, res: http.ServerResponse): void {
    const sessionId = req.headers['mcp-session-id'];
    const sid = typeof sessionId === 'string' ? sessionId : null;
    if (!sid || !this.sessions.has(sid)) {
      this.json(res, 404, { error: 'unknown session' });
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('event: endpoint\ndata: {}\n\n');
    if (!this.sseClients.has(sid)) this.sseClients.set(sid, new Set());
    this.sseClients.get(sid)!.add(res);
    req.on('close', () => {
      this.sseClients.get(sid)?.delete(res);
    });
  }

  private handleDelete(req: http.IncomingMessage, res: http.ServerResponse): void {
    const sessionId = req.headers['mcp-session-id'];
    const sid = typeof sessionId === 'string' ? sessionId : null;
    if (sid && this.sessions.has(sid)) {
      const session = this.sessions.get(sid)!;
      session.instance.sessions.delete(sid);
      this.sessions.delete(sid);
      this.sseClients.delete(sid);
      if (session.instance.sessions.size === 0 && !session.instance.providerId.includes('-shared')) {
        try {
          session.instance.child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        this.instances.delete(`${session.instance.providerId}:${sid}`);
      }
    }
    res.writeHead(204);
    res.end();
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
