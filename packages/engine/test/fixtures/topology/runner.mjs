#!/usr/bin/env node
/**
 * Runner for the controlled topology fixture (packages/engine/test/fixtures/topology).
 * Commands:
 *   start <stateDir>    spawn ingress/api/worker, wait for health, write endpoints.json + pids.json
 *   stop <stateDir>     SIGTERM all processes, wait for exit
 *   restart <stateDir>  stop + start
 *   cleanup <stateDir>  remove the whole state dir
 *   status <stateDir>   print endpoints.json + pid liveness
 *
 * stdout contract: `READY {"ingressUrl":"...","stateDir":"..."}` on successful start.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

async function start(stateDir) {
  fs.mkdirSync(stateDir, { recursive: true });
  const publicPort = await freePort();
  const apiPort = await freePort();
  const pids = [];
  const procs = [];
  const spawnOne = (mode) => {
    const p = spawn(process.execPath, [FIXTURE, mode, '--state', stateDir, '--public-port', String(publicPort), '--api-port', String(apiPort)], { stdio: 'ignore' });
    p.on('exit', () => { p.exited = true; });
    pids.push(p.pid);
    procs.push(p);
  };
  spawnOne('api');
  spawnOne('worker');
  spawnOne('ingress');

  const deadline = Date.now() + 8000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${publicPort}/health`);
      if (res.ok) {
        const body = await res.json();
        if (body.ok === true) { ready = true; break; }
      }
    } catch { /* not up yet */ }
    await sleep(80);
  }

  fs.writeFileSync(path.join(stateDir, 'pids.json'), JSON.stringify({ pids }, null, 2));
  fs.writeFileSync(path.join(stateDir, 'endpoints.json'), JSON.stringify({ ingressUrl: `http://127.0.0.1:${publicPort}`, apiPort, stateDir }, null, 2));
  if (!ready) {
    console.error('START_FAILED: ingress did not become healthy');
    process.exit(1);
  }
  console.log(`READY ${JSON.stringify({ ingressUrl: `http://127.0.0.1:${publicPort}`, stateDir })}`);
}

function stop(stateDir) {
  const p = path.join(stateDir, 'pids.json');
  if (fs.existsSync(p)) {
    const { pids } = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ } }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const alive = pids.some((pid) => { try { process.kill(pid, 0); return true; } catch { return false; } });
      if (!alive) break;
      sleepSync(50);
    }
    fs.rmSync(p, { force: true });
  }
  console.log('STOPPED');
}

async function main() {
  const cmd = process.argv[2];
  const stateDir = path.resolve(process.argv[3] ?? '.');
  switch (cmd) {
    case 'start': return await start(stateDir);
    case 'stop': return stop(stateDir);
    case 'restart': stop(stateDir); return await start(stateDir);
    case 'cleanup': fs.rmSync(stateDir, { recursive: true, force: true }); console.log('CLEANED'); return;
    case 'status': {
      const ep = path.join(stateDir, 'endpoints.json');
      const pk = path.join(stateDir, 'pids.json');
      if (!fs.existsSync(ep)) { console.log('NO_STATE'); return; }
      const endpoints = JSON.parse(fs.readFileSync(ep, 'utf8'));
      const pids = fs.existsSync(pk) ? JSON.parse(fs.readFileSync(pk, 'utf8')).pids : [];
      console.log(JSON.stringify({ ...endpoints, pids }));
      return;
    }
    default:
      console.error(`unknown command: ${String(cmd)}`);
      process.exit(2);
  }
}

await main();
process.exit(0);
