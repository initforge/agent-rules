#!/usr/bin/env node
/**
 * Controlled multi-service topology fixture (AM-0019 §8 / §12) — self-contained,
 * zero network deps, no external repo mutation. Three cooperating processes:
 *
 *   ingress  — PUBLIC port only. Verifiers drive HTTP here and nowhere else.
 *              Proxies to the internal api and answers /health, /version,
 *              /api/journey, /api/items, /api/rollback(+revert/marker).
 *   api      — INTERNAL port. Owns db.json (versioned schema + migrations),
 *              seed step, item CRUD, queue enqueue, rollback marker state.
 *   worker   — polls queue.json and completes jobs asynchronously.
 *
 * State lives entirely under --state <dir> (db.json, queue.json, rollback.json,
 * logs/). Restart keeps the dir, proving persistence; cleanup removes it.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const mode = args._[0];
const state = path.resolve(args.state);
const publicPort = Number(args['public-port']);
const apiPort = Number(args['api-port']);
const ownerPid = Number(args['owner-pid'] ?? 0);

fs.mkdirSync(path.join(state, 'logs'), { recursive: true });

function log(msg) {
  fs.appendFileSync(path.join(state, 'logs', `${mode}.log`), `[${mode}] ${new Date().toISOString()} ${msg}\n`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out[a.slice(2)] = argv[i + 1]; i++; }
    else out._.push(a);
  }
  return out;
}

// ── versioned migrations (schema 1 -> 2) ─────────────────────────────────────
const MIGRATIONS = [
  { to: 1, up: (db) => { db.schemaVersion = 1; db.items = {}; db.meta = {}; } },
  { to: 2, up: (db) => { db.schemaVersion = 2; db.meta.seeded = false; } },
];
const SCHEMA_VERSION = 2;

function loadDb() {
  const p = path.join(state, 'db.json');
  if (!fs.existsSync(p)) {
    const db = {};
    for (const m of MIGRATIONS) m.up(db);
    db.migrationLog = MIGRATIONS.map((m) => ({ to: m.to, at: new Date().toISOString() }));
    fs.writeFileSync(p, JSON.stringify(db, null, 2));
    return db;
  }
  const db = JSON.parse(fs.readFileSync(p, 'utf8'));
  const log0 = db.migrationLog ?? [];
  while (db.schemaVersion < SCHEMA_VERSION) {
    const next = MIGRATIONS.find((m) => m.to === db.schemaVersion + 1);
    if (!next) break;
    next.up(db);
    db.schemaVersion = next.to;
    log0.push({ from: next.to - 1, to: next.to, at: new Date().toISOString() });
  }
  db.migrationLog = log0;
  fs.writeFileSync(p, JSON.stringify(db, null, 2));
  return db;
}

function loadQueue() {
  const p = path.join(state, 'queue.json');
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify({ nextId: 1, jobs: {} }, null, 2));
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function saveQueue(q) {
  fs.writeFileSync(path.join(state, 'queue.json'), JSON.stringify(q, null, 2));
}

function rollbackState() {
  const p = path.join(state, 'rollback.json');
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify({ generation: 0, marker: 'gen-0', previous: null }, null, 2));
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function saveRollback(rs) {
  fs.writeFileSync(path.join(state, 'rollback.json'), JSON.stringify(rs, null, 2));
}

// ── internal api ─────────────────────────────────────────────────────────────
function startApi() {
  const db = loadDb();
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const readBody = () => new Promise((resolve) => { let buf = ''; req.on('data', (c) => { buf += c; }); req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } }); });

    if (req.method === 'GET' && u.pathname === '/health') {
      return send(200, { ok: true, schemaVersion: db.schemaVersion, itemCount: Object.keys(db.items).length, migrationLog: db.migrationLog });
    }
    if (req.method === 'POST' && u.pathname === '/seed') {
      let seeded = 0;
      if (!db.meta.seeded) {
        db.items['seed-item-1'] = { name: 'seeded-item', createdAt: new Date().toISOString() };
        db.meta.seeded = true;
        seeded = 1;
        fs.writeFileSync(path.join(state, 'db.json'), JSON.stringify(db, null, 2));
      }
      return send(200, { ok: true, seeded });
    }
    if (req.method === 'POST' && u.pathname === '/items') {
      const { name } = await readBody();
      const id = `item-${Object.keys(db.items).length + 1}`;
      db.items[id] = { name: String(name ?? 'item'), createdAt: new Date().toISOString() };
      fs.writeFileSync(path.join(state, 'db.json'), JSON.stringify(db, null, 2));
      return send(200, { ok: true, id });
    }
    if (req.method === 'GET' && u.pathname === '/items') {
      return send(200, { ok: true, items: Object.entries(db.items).map(([id, it]) => ({ id, ...it })) });
    }
    if (req.method === 'POST' && u.pathname === '/enqueue') {
      const { name } = await readBody();
      const q = loadQueue();
      const id = `job-${q.nextId++}`;
      q.jobs[id] = { name: String(name ?? 'job'), status: 'pending' };
      saveQueue(q);
      return send(200, { ok: true, jobId: id });
    }
    if (req.method === 'GET' && u.pathname.startsWith('/jobs/')) {
      const id = u.pathname.slice('/jobs/'.length);
      const job = loadQueue().jobs[id];
      return job ? send(200, { ok: true, jobId: id, ...job }) : send(404, { ok: false, error: 'job not found' });
    }
    if (req.method === 'POST' && u.pathname === '/rollback') {
      const rs = rollbackState();
      const before = rs.marker;
      rs.generation += 1;
      rs.previous = before;
      rs.marker = `gen-${rs.generation}`;
      saveRollback(rs);
      return send(200, { ok: true, before, after: rs.marker });
    }
    if (req.method === 'POST' && u.pathname === '/rollback/revert') {
      const rs = rollbackState();
      const restored = rs.previous ?? rs.marker;
      rs.marker = restored;
      rs.previous = null;
      saveRollback(rs);
      return send(200, { ok: true, restored });
    }
    if (req.method === 'GET' && u.pathname === '/rollback/marker') {
      return send(200, { ok: true, marker: rollbackState().marker });
    }
    return send(404, { ok: false, error: 'not found' });
  });
  server.listen(apiPort, '127.0.0.1', () => log(`api listening on ${apiPort}`));
  return server;
}

// ── worker (async queue processing) ──────────────────────────────────────────
function startWorker() {
  const timer = setInterval(() => {
    const q = loadQueue();
    let changed = false;
    for (const [id, job] of Object.entries(q.jobs)) {
      if (job.status === 'pending') { job.status = 'processing'; job.workerPid = process.pid; changed = true; }
    }
    if (changed) saveQueue(q);
    for (const [id, job] of Object.entries(q.jobs)) {
      if (job.status === 'processing') {
        setTimeout(() => {
          const q2 = loadQueue();
          if (q2.jobs[id] && q2.jobs[id].status === 'processing') {
            q2.jobs[id].status = 'done';
            q2.jobs[id].processedAt = new Date().toISOString();
            saveQueue(q2);
            log(`processed ${id}`);
          }
        }, 12);
      }
    }
  }, 25);
  log('worker started');
  return timer;
}

// ── public ingress ───────────────────────────────────────────────────────────
function apiFetch(pathname, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: '127.0.0.1', port: apiPort, path: pathname, method, headers: { 'content-type': 'application/json', ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => { try { resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : {} }); } catch { resolve({ status: res.statusCode, body: {} }); } });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function startIngress() {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      if (req.method === 'GET' && u.pathname === '/health') {
        const h = await apiFetch('/health', 'GET');
        return send(h.status, { ok: h.body.ok === true, ingress: 'ok', schemaVersion: h.body.schemaVersion, migrations: h.body.migrationLog ?? [] });
      }
      if (req.method === 'GET' && u.pathname === '/version') {
        const h = await apiFetch('/health', 'GET');
        return send(200, { ok: true, schemaVersion: h.body.schemaVersion, migrationLog: h.body.migrationLog ?? [] });
      }
      if (req.method === 'POST' && u.pathname === '/api/journey') {
        const seed = await apiFetch('/seed', 'POST');
        const item = await apiFetch('/items', 'POST', { name: 'journey-item' });
        const enq = await apiFetch('/enqueue', 'POST', { name: item.body.id });
        return send(200, { ok: true, itemId: item.body.id, jobId: enq.body.jobId, seeded: seed.body.seeded });
      }
      if (req.method === 'GET' && u.pathname.startsWith('/api/journey/')) {
        const jobId = u.pathname.slice('/api/journey/'.length);
        const j = await apiFetch(`/jobs/${jobId}`, 'GET');
        return send(j.status, j.body);
      }
      if (req.method === 'GET' && u.pathname === '/api/items') {
        const it = await apiFetch('/items', 'GET');
        return send(it.status, it.body);
      }
      if (req.method === 'POST' && u.pathname === '/api/rollback') {
        const r = await apiFetch('/rollback', 'POST');
        return send(r.status, r.body);
      }
      if (req.method === 'POST' && u.pathname === '/api/rollback/revert') {
        const r = await apiFetch('/rollback/revert', 'POST');
        return send(r.status, r.body);
      }
      if (req.method === 'GET' && u.pathname === '/api/rollback/marker') {
        const r = await apiFetch('/rollback/marker', 'GET');
        return send(r.status, r.body);
      }
      return send(404, { ok: false, error: 'not found' });
    } catch (e) {
      return send(502, { ok: false, error: String((e && e.message) || e) });
    }
  });
  server.listen(publicPort, '127.0.0.1', () => log(`ingress listening on ${publicPort}`));
  return server;
}

// ── graceful shutdown ────────────────────────────────────────────────────────
function graceful(server, timer) {
  let closed = false;
  const shutdown = () => {
    if (closed) return;
    closed = true;
    log('shutting down');
    const exitNow = () => process.exit(0);
    if (timer) clearInterval(timer);
    if (server) server.close(exitNow);
    else exitNow();
    setTimeout(exitNow, 500);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  if (Number.isInteger(ownerPid) && ownerPid > 1 && ownerPid !== process.pid) {
    const ownerWatch = setInterval(() => {
      try {
        process.kill(ownerPid, 0);
      } catch (error) {
        if (error?.code !== 'EPERM') shutdown();
      }
    }, 200);
    ownerWatch.unref();
  }
}

if (mode === 'api') graceful(startApi(), null);
else if (mode === 'ingress') graceful(startIngress(), null);
else if (mode === 'worker') graceful(null, startWorker());
else { console.error(`unknown mode: ${String(mode)}`); process.exit(2); }
