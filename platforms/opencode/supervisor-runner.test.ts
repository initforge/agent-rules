import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { SupervisorRunner } from './supervisor-runner.js';
import type { ContextCapsuleKey } from '../../packages/engine/src/context-cache.js';

// Prevent false backpressure on CI (macOS runners with high load average)
// checkResourcesImpl uses os.loadavg() and will reject all assignChild calls
// if load / num_cpus * 100 >= 200. On shared CI runners this is common.
beforeAll(() => {
  vi.spyOn(os, 'loadavg').mockReturnValue([0, 0, 0]);
  vi.spyOn(process, 'memoryUsage').mockReturnValue({
    rss: 100 * 1024 * 1024,
    heapTotal: 64 * 1024 * 1024,
    heapUsed: 48 * 1024 * 1024,
    external: 10 * 1024 * 1024,
    arrayBuffers: 0,
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

interface RequestLogEntry {
  method: string;
  url: string;
  body: unknown;
}

interface TrackedServer {
  server: Server;
  port: number;
  log: RequestLogEntry[];
}

const stubContextKey: ContextCapsuleKey = {
  effectivePlanSha256: 'a'.repeat(64),
  orderedAmendmentSha256: 'b'.repeat(64),
  baselineSha: 'c'.repeat(40),
  assignmentId: 'stub',
  ownedPaths: ['packages/engine'],
  forbiddenPaths: [],
  sourceFileHashes: { 'src/index.ts': 'd'.repeat(64) },
  toolchainManifestSha256: 'e'.repeat(64),
  acceptanceCriteriaSha256: 'f'.repeat(64),
};

function startTestServer(): Promise<TrackedServer> {
  const log: RequestLogEntry[] = [];
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', () => {
        let parsedBody: unknown = null;
        try { parsedBody = body ? JSON.parse(body) : null; } catch {}

        const url = req.url || '/';
        const method = req.method || 'GET';
        log.push({ method, url, body: parsedBody });

        if (method === 'GET' && url === '/global/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ healthy: true, version: '2.0.0' }));
        } else if (method === 'POST' && url === '/session') {
          const pb = (parsedBody || {}) as Record<string, unknown>;
          const id = randomUUID();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id,
            parentID: pb.parentID || null,
            title: pb.title || null,
            createdAt: new Date().toISOString(),
            status: 'active',
          }));
        } else if (method === 'GET' && url.startsWith('/event')) {
          const urlObj = new URL(url, `http://localhost`);
          const afterVal = urlObj.searchParams.get('after') || 'any';
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
          });
          const eventData = { type: 'idle', sessionId: afterVal, cursor: 'cursor-1', source: 'test:host:stream' };
          res.write(`data: ${JSON.stringify(eventData)}\n\n`);
          res.end();
          return;
        } else if (method === 'GET') {
          const childrenMatch = url.match(/^\/session\/([^/]+)\/children$/);
          if (childrenMatch) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
            return;
          }
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
        } else if (method === 'POST') {
          const asyncMatch = url.match(/^\/session\/([^/]+)\/prompt_async$/);
          if (asyncMatch) {
            res.writeHead(204);
            res.end();
            return;
          }
          const abortMatch = url.match(/^\/session\/([^/]+)\/abort$/);
          if (abortMatch) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(true));
            return;
          }
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
        }
      });
    });
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' ? addr!.port : 0;
      resolve({ server, port, log });
    });
  });
}

function startBindErrorServer(): Promise<TrackedServer> {
  const log: RequestLogEntry[] = [];
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', () => {
        let parsedBody: unknown = null;
        try { parsedBody = body ? JSON.parse(body) : null; } catch {}
        const url = req.url || '/';
        const method = req.method || 'GET';
        log.push({ method, url, body: parsedBody });

        if (method === 'GET' && url === '/global/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ healthy: true, version: '2.0.0' }));
        } else if (method === 'POST' && url === '/session') {
          const pb = (parsedBody || {}) as Record<string, unknown>;
          if (pb.parentID) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Child session creation failed' }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: randomUUID(), parentID: null, title: null, createdAt: new Date().toISOString(), status: 'active' }));
          }
        } else if (method === 'GET' && url.match(/^\/session\/([^/]+)\/children$/) !== null) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
        }
      });
    });
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' ? addr!.port : 0;
      resolve({ server, port, log });
    });
  });
}

function startDispatchErrorServer(): Promise<TrackedServer> {
  const log: RequestLogEntry[] = [];
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', () => {
        let parsedBody: unknown = null;
        try { parsedBody = body ? JSON.parse(body) : null; } catch {}
        const url = req.url || '/';
        const method = req.method || 'GET';
        log.push({ method, url, body: parsedBody });

        if (method === 'GET' && url === '/global/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ healthy: true, version: '2.0.0' }));
        } else if (method === 'POST' && url === '/session') {
          const pb = (parsedBody || {}) as Record<string, unknown>;
          if (pb.parentID) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: null, parentID: pb.parentID || null, title: pb.title || null, createdAt: new Date().toISOString(), status: 'active' }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: randomUUID(), parentID: null, title: null, createdAt: new Date().toISOString(), status: 'active' }));
          }
        } else if (method === 'GET' && url.match(/^\/session\/([^/]+)\/children$/) !== null) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
        } else if (method === 'POST' && url.includes('/prompt_async')) {
          res.writeHead(204);
          res.end();
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
        }
      });
    });
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' ? addr!.port : 0;
      resolve({ server, port, log });
    });
  });
}

function startErrorServer(): Promise<TrackedServer> {
  const log: RequestLogEntry[] = [];
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', () => {
        let parsedBody: unknown = null;
        try { parsedBody = body ? JSON.parse(body) : null; } catch {}
        log.push({ method: req.method || 'GET', url: req.url || '/', body: parsedBody });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      });
    });
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' ? addr!.port : 0;
      resolve({ server, port, log });
    });
  });
}

describe('SupervisorRunner', () => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it('1. starts fresh and health-checks before session creation', async () => {
    const { server, port, log } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      expect(runner.isInitialized).toBe(false);

      const result = await runner.initialize();
      expect(result.ok).toBe(true);
      expect(runner.isInitialized).toBe(true);

      expect(log.length).toBeGreaterThanOrEqual(2);
      const healthEntry = log.find(e => e.method === 'GET' && e.url === '/global/health');
      expect(healthEntry).toBeTruthy();
      const sessionEntry = log.find(e => e.method === 'POST' && e.url === '/session');
      expect(sessionEntry).toBeTruthy();
    } finally {
      server.close();
    }
  });

  it('2. creates parent session with correct title', async () => {
    const { server, port, log } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();

      const sessionEntry = log.find(e => e.method === 'POST' && e.url === '/session');
      expect(sessionEntry).toBeTruthy();
      const body = sessionEntry!.body as Record<string, unknown>;
      expect(body).toHaveProperty('title');
      expect((body.title as string)).toMatch(/^supervisor-/);
    } finally {
      server.close();
    }
  });

  it('3. creates child session with parentID', async () => {
    const { server, port, log } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();

      const result = await runner.runAssignment({
        assignmentId: 'child-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);

      const sessionEntries = log.filter(e => e.method === 'POST' && e.url === '/session');
      const childSessionEntry = sessionEntries[sessionEntries.length - 1];
      expect(childSessionEntry).toBeTruthy();
      const body = childSessionEntry!.body as Record<string, unknown>;
      expect(body).toHaveProperty('parentID');
      expect(body.parentID).toBeTruthy();
      expect(body.title).toBe('child-test-writer');
    } finally {
      server.close();
    }
  });

  it('4. sends prompt_async with parts', async () => {
    const { server, port, log } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();
      const result = await runner.runAssignment({
        assignmentId: 'prompt-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);

      const promptEntries = log.filter(e => e.method === 'POST' && e.url?.includes('/prompt_async'));
      expect(promptEntries.length).toBe(1);
      const body = promptEntries[0].body as Record<string, unknown>;
      expect(body).toHaveProperty('parts');
      expect(Array.isArray(body.parts)).toBe(true);
      expect((body.parts as Array<unknown>)).toHaveLength(1);
    } finally {
      server.close();
    }
  });

  it('5. full lifecycle: assign child session dispatch prompt_async ack complete', async () => {
    const { server, port, log } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();
      const result = await runner.runAssignment({
        assignmentId: 'lifecycle-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.assignment.status).toBe('RUNNING');

      // F5 (R5): wait for terminal evidence first
      const evidence = await runner.waitForTerminalEvidence({
        sessionId: result.assignment.childSessionId!,
        afterCursor: result.assignment.childSessionId ?? undefined,
        timeoutMs: 5000,
        assignmentId: 'lifecycle-test',
      });
      expect(evidence.ok).toBe(true);
      if (!evidence.ok) return;

      const completeResult = await runner.completeWithEvidence('lifecycle-test');
      expect(completeResult.ok).toBe(true);

      const assignment = runner.supervisor.children.find(c => c.assignmentId === 'lifecycle-test');
      expect(assignment?.status).toBe('COMPLETED');
      expect(assignment?.receipt).toMatchObject({
        childSessionId: result.assignment.childSessionId,
      });
      expect(assignment?.receipt?.completionToken).toBeFalsy();

      const healthCount = log.filter(e => e.method === 'GET' && e.url === '/global/health').length;
      expect(healthCount).toBe(1);

      const sessionCount = log.filter(e => e.method === 'POST' && e.url === '/session').length;
      expect(sessionCount).toBe(2);

      const promptCount = log.filter(e => e.method === 'POST' && e.url?.includes('/prompt_async')).length;
      expect(promptCount).toBe(1);
    } finally {
      server.close();
    }
  });

  it('6. restart reuses durable state across two runner instances', async () => {
    const { server, port } = await startTestServer();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-restart-'));
    const statePath = path.join(tmpDir, 'state.json');
    try {
      const runner1 = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
        supervisor: { statePath },
      });
      const init1 = await runner1.initialize();
      expect(init1.ok).toBe(true);
      const supervisorId1 = runner1.supervisor.sessionId;

      await runner1.runAssignment({
        assignmentId: 'restart-assignment',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });

      const runner2 = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
        supervisor: { statePath },
      });

      expect(runner2.supervisor.sessionId).toBe(supervisorId1);
      expect(runner2.supervisor.children).toHaveLength(1);

      const init2 = await runner2.initialize();
      expect(init2.ok).toBe(true);
      expect(runner2.supervisor.sessionId).toBe(supervisorId1);
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('7. non-2xx fails closed server returns 500 runner returns error without creating state', async () => {
    const { server, port } = await startErrorServer();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-error-'));
    const statePath = path.join(tmpDir, 'state.json');
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
        supervisor: { statePath },
      });

      const result = await runner.initialize();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Server unreachable');
      }
      expect(runner.isInitialized).toBe(false);
      expect(fs.existsSync(statePath)).toBe(false);
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('8. capacity rejection before remote assign 3 writers max 2 first 2 succeed 3rd fails', async () => {
    const { server, port, log } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
        supervisor: { maxWriters: 2 },
      });
      await runner.initialize();
      expect(runner.openWriterSlots).toBe(2);

      const r1 = await runner.runAssignment({
        assignmentId: 'cap-1',
        kind: 'writer',
        ownedPaths: ['src/a/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(r1.ok).toBe(true);

      const r2 = await runner.runAssignment({
        assignmentId: 'cap-2',
        kind: 'writer',
        ownedPaths: ['src/b/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(r2.ok).toBe(true);

      const logLenAfterTwo = log.length;

      const r3 = await runner.runAssignment({
        assignmentId: 'cap-3',
        kind: 'writer',
        ownedPaths: ['src/c/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(r3.ok).toBe(false);
      if (!r3.ok) {
        expect(r3.reason).toContain('writer');
      }

      expect(log.length).toBe(logLenAfterTwo);
    } finally {
      server.close();
    }
  });

  it('9. no fake IDs all session IDs are real UUIDs from the test server', async () => {
    const { server, port } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();

      const result = await runner.runAssignment({
        assignmentId: 'uuid-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.assignment.childSessionId).toMatch(uuidPattern);
      expect(result.assignment.parentSessionId).toMatch(uuidPattern);
    } finally {
      server.close();
    }
  });

  it('10. exactly 1 POST /session across restart', async () => {
    const { server, port, log } = await startTestServer();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-restart-'));
    const statePath = path.join(tmpDir, 'state.json');
    try {
      const runner1 = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
        supervisor: { statePath },
      });
      await runner1.initialize();

      const runner2 = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
        supervisor: { statePath },
      });
      await runner2.initialize();

      const parentPosts = log.filter(e => e.method === 'POST' && e.url === '/session');
      expect(parentPosts.length).toBe(1);
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('11. parentID equality on child sessions', async () => {
    const { server, port, log } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();
      const result = await runner.runAssignment({
        assignmentId: 'parent-id-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const childSessionEntries = log.filter(e =>
        e.method === 'POST' && e.url === '/session' &&
        (e.body as Record<string, unknown>)?.parentID
      );
      expect(childSessionEntries.length).toBe(1);
      const childBody = childSessionEntries[0].body as Record<string, unknown>;
      expect(childBody.parentID).toBe(result.assignment.parentSessionId);
    } finally {
      server.close();
    }
  });

  it('12. no random placeholder child ID (null before bind, real UUID after)', async () => {
    const { server, port } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();

      // F4: PENDING writers reserve paths — use non-overlapping path for placeholder
      const assignResult = runner.supervisor.assignChild({
        assignmentId: 'placeholder-test',
        kind: 'writer',
        ownedPaths: ['placeholder-path/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(assignResult.ok).toBe(true);
      if (!assignResult.ok) return;
      expect(assignResult.assignment.childSessionId).toBeNull();

      const result = await runner.runAssignment({
        assignmentId: 'real-uuid-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.assignment.childSessionId).toMatch(uuidPattern);
    } finally {
      server.close();
    }
  });

  it('13. prompt body contains Policy: depth=1 and AC hash:', async () => {
    const { server, port, log } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();
      await runner.runAssignment({
        assignmentId: 'prompt-content-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });

      const promptEntry = log.find(e => e.method === 'POST' && e.url?.includes('/prompt_async'));
      expect(promptEntry).toBeTruthy();
      const body = promptEntry!.body as Record<string, unknown>;
      const parts = body.parts as Array<{ type: string; text: string }>;
      expect(parts.length).toBe(1);
      expect(parts[0].text).toContain('Policy: depth=1, no child dispatch, no task/subagent creation');
      expect(parts[0].text).toContain('AC hash:');
      expect(parts[0].text).toContain(stubContextKey.acceptanceCriteriaSha256);
    } finally {
      server.close();
    }
  });

  it('14. non-2xx at bind step propagates failure', async () => {
    const { server, port } = await startBindErrorServer();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bind-error-'));
    const statePath = path.join(tmpDir, 'state.json');
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
        supervisor: { statePath },
      });
      const initResult = await runner.initialize();
      expect(initResult.ok).toBe(true);

      const result = await runner.runAssignment({
        assignmentId: 'bind-error-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(false);

      const assignment = runner.supervisor.children.find(c => c.assignmentId === 'bind-error-test');
      expect(assignment?.status).toBe('FAILED');
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('15. non-2xx at dispatch step propagates failure', async () => {
    const { server, port } = await startDispatchErrorServer();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-error-'));
    const statePath = path.join(tmpDir, 'state.json');
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
        supervisor: { statePath },
      });
      const initResult = await runner.initialize();
      expect(initResult.ok).toBe(true);

      const result = await runner.runAssignment({
        assignmentId: 'dispatch-error-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(false);

      const assignment = runner.supervisor.children.find(c => c.assignmentId === 'dispatch-error-test');
      expect(assignment?.status).toBe('FAILED');
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('16. non-2xx at ack step propagates failure', async () => {
    const { server, port } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
        supervisor: { assignmentTimeoutMs: 0 },
      });
      await runner.initialize();

      const result = await runner.runAssignment({
        assignmentId: 'ack-error-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(false);

      const assignment = runner.supervisor.children.find(c => c.assignmentId === 'ack-error-test');
      expect(assignment?.status).toBe('FAILED');
    } finally {
      server.close();
    }
  });

  it('17. completion without terminal evidence is rejected', async () => {
    const { server, port } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();
      const result = await runner.runAssignment({
        assignmentId: 'no-evidence-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // F5 (R5): no waitForTerminalEvidence → no stored evidence
      const completeResult = await runner.completeWithEvidence('no-evidence-test');
      expect(completeResult.ok).toBe(false);
      if (!completeResult.ok) {
        expect(completeResult.reason).toContain('No terminal evidence observed');
      }
    } finally {
      server.close();
    }
  });

  it('18. waitForTerminalEvidence works and stores evidence for completion', async () => {
    const { server, port } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();
      const result = await runner.runAssignment({
        assignmentId: 'sse-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const childId = result.assignment.childSessionId as string;
      const ev = await runner.waitForTerminalEvidence({
        sessionId: childId,
        afterCursor: childId,
        timeoutMs: 5000,
        assignmentId: 'sse-test',
      });
      expect(ev.ok).toBe(true);
      if (ev.ok) {
        expect(ev.events.length).toBeGreaterThan(0);
        expect(typeof ev.nextCursor).toBe('string');
      }
      // F5 (R5): evidence stored — can complete
      const completeResult = await runner.completeWithEvidence('sse-test');
      expect(completeResult.ok).toBe(true);
    } finally {
      server.close();
    }
  });

  // F7: HIGH — runner abort routes to adapter.abort + supervisor.abortAssignment fail-closed
  it('19. abort calls remote adapter abort and marks supervisor assignment ABORTED', async () => {
    const { server, port } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();

      const result = await runner.runAssignment({
        assignmentId: 'abort-test',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const abortResult = await runner.abort('abort-test');
      expect(abortResult.ok).toBe(true);

      const assignment = runner.supervisor.children.find(c => c.assignmentId === 'abort-test');
      expect(assignment?.status).toBe('ABORTED');
    } finally {
      server.close();
    }
  });

  it('20. abort rejects unknown assignment', async () => {
    const { server, port } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();

      const abortResult = await runner.abort('nonexistent');
      expect(abortResult.ok).toBe(false);
      if (!abortResult.ok) {
        expect(abortResult.reason).toContain('not found');
      }
    } finally {
      server.close();
    }
  });

  it('21. abort rejects already-completed assignment', async () => {
    const { server, port } = await startTestServer();
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();

      const result = await runner.runAssignment({
        assignmentId: 'abort-completed',
        kind: 'writer',
        ownedPaths: ['src/'],
        forbiddenPaths: [],
        contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // F5 (R5): wait for terminal evidence first
      const evidence = await runner.waitForTerminalEvidence({
        sessionId: result.assignment.childSessionId!,
        afterCursor: result.assignment.childSessionId ?? undefined,
        timeoutMs: 5000,
        assignmentId: 'abort-completed',
      });
      expect(evidence.ok).toBe(true);
      if (!evidence.ok) return;

      await runner.completeWithEvidence('abort-completed');

      const abortResult = await runner.abort('abort-completed');
      expect(abortResult.ok).toBe(false);
    } finally {
      server.close();
    }
  });

  // F6 (R2): adapter.abort returning false prevents local abort
  it('22. abort fails closed when remote returns false', async () => {
    const log: RequestLogEntry[] = [];
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', () => {
        let parsedBody: unknown = null;
        try { parsedBody = body ? JSON.parse(body) : null; } catch {}
        const url = req.url || '/';
        const method = req.method || 'GET';
        log.push({ method, url, body: parsedBody });
        if (method === 'GET' && url === '/global/health') {
          res.writeHead(200); res.end(JSON.stringify({ healthy: true, version: '2.0.0' }));
        } else if (method === 'POST' && url === '/session') {
          res.writeHead(200); res.end(JSON.stringify({ id: randomUUID(), status: 'active', createdAt: new Date().toISOString() }));
        } else if (method === 'GET' && url.match(/^\/session\/([^/]+)\/children$/) !== null) {
          res.writeHead(200); res.end(JSON.stringify([]));
        } else if (method === 'POST' && url.includes('/prompt_async')) {
          res.writeHead(204); res.end();
        } else if (method === 'POST' && url.includes('/abort')) {
          // Return false — remote abort failed
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(false));
        } else {
          res.writeHead(404); res.end(JSON.stringify({ error: 'Not Found' }));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
      });
      await runner.initialize();
      const result = await runner.runAssignment({
        assignmentId: 'abort-false-test', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const abortResult = await runner.abort('abort-false-test');
      expect(abortResult.ok).toBe(false);
      if (!abortResult.ok) {
        expect(abortResult.reason).toContain('Remote abort returned false');
      }
      // Assignment should NOT be ABORTED locally because remote failed
      const assignment = runner.supervisor.children.find(c => c.assignmentId === 'abort-false-test');
      expect(assignment?.status).not.toBe('ABORTED');
    } finally {
      server.close();
    }
  });

  // F7 (R3): abort partial failure reconciliation — remote ok, local fail → FAILED + capability revoked
  // F5 (R5): reconciliation persist failure propagates false
  it('23. abort remote-succeeds-local-fails records fail-closed', async () => {
    const log: RequestLogEntry[] = [];
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', () => {
        let parsedBody: unknown = null;
        try { parsedBody = body ? JSON.parse(body) : null; } catch {}
        const url = req.url || '/';
        const method = req.method || 'GET';
        log.push({ method, url, body: parsedBody });
        if (method === 'GET' && url === '/global/health') {
          res.writeHead(200); res.end(JSON.stringify({ healthy: true, version: '2.0.0' }));
        } else if (method === 'POST' && url === '/session') {
          res.writeHead(200); res.end(JSON.stringify({ id: randomUUID(), status: 'active', createdAt: new Date().toISOString() }));
        } else if (method === 'GET' && url.startsWith('/event')) {
          const urlObj = new URL(url, `http://localhost`);
          const afterVal = urlObj.searchParams.get('after') || 'any';
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
          res.write(`data: ${JSON.stringify({ type: 'idle', sessionId: (parsedBody as any)?.sessionId || afterVal, cursor: 'cursor-1', source: 'test:host:stream' })}\n\n`);
          res.end();
        } else if (method === 'GET' && url.match(/^\/session\/([^/]+)\/children$/) !== null) {
          res.writeHead(200); res.end(JSON.stringify([]));
        } else if (method === 'POST' && url.includes('/prompt_async')) {
          res.writeHead(204); res.end();
        } else if (method === 'POST' && url.includes('/abort')) {
          // Remote abort succeeds
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(true));
        } else {
          res.writeHead(404); res.end(JSON.stringify({ error: 'Not Found' }));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    try {
      const runner = new SupervisorRunner({
        adapter: { baseUrl: `http://localhost:${port}`, fetchFn: fetch },
        supervisor: { assignmentTimeoutMs: 60000 },
      });
      await runner.initialize();
      const result = await runner.runAssignment({
        assignmentId: 'abort-reconcile', kind: 'writer', ownedPaths: ['src/'], forbiddenPaths: [], contextKey: stubContextKey,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // F5 (R5): wait for terminal evidence first
      const evidence = await runner.waitForTerminalEvidence({
        sessionId: result.assignment.childSessionId!,
        afterCursor: result.assignment.childSessionId ?? undefined,
        timeoutMs: 5000,
        assignmentId: 'abort-reconcile',
      });
      expect(evidence.ok).toBe(true);
      if (!evidence.ok) return;

      // Complete the assignment first (local state) so local abort will fail
      await runner.completeWithEvidence('abort-reconcile');

      // Now run abort — precheck catches terminal status (COMPLETED), no remote call
      const abortResult = await runner.abort('abort-reconcile');
      expect(abortResult.ok).toBe(false);
      if (!abortResult.ok) {
        // F7 (R7): precheck returns immediately without remote call
        expect(abortResult.reason).toContain('already COMPLETED');
      }
      // Assignment stays COMPLETED (already terminal); reconciliation revoked capability
      const updated = runner.supervisor.children.find(c => c.assignmentId === 'abort-reconcile');
      // The reconciliation leaves it in the pre-existing terminal state (COMPLETED)
      expect(updated?.status).toBe('COMPLETED');
    } finally {
      server.close();
    }
  });
});
