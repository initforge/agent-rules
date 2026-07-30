import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const pidFile = '.control-plane.pid';
const logFile = 'control-plane.log';
const server = 'packages/control-plane/dist/server/server/index.js';

function stop(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'inherit' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process may already have exited; cleanup remains idempotent.
    }
  }
}

function readPid() {
  if (!existsSync(pidFile)) return null;
  const pid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function start() {
  const previous = readPid();
  if (previous) stop(previous);
  const log = openSync(logFile, 'a');
  const child = spawn(process.execPath, [server], {
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, HOST: '127.0.0.1', PORT: process.env.PORT || '3099' },
  });
  writeFileSync(pidFile, `${child.pid}\n`, 'utf8');
  child.unref();
}

function cleanup() {
  const pid = readPid();
  if (pid) stop(pid);
  if (existsSync(pidFile)) unlinkSync(pidFile);
}

const command = process.argv[2];
if (command === 'start') {
  start();
} else if (command === 'stop') {
  cleanup();
} else {
  console.error('Usage: node automation/control-plane-ci.mjs <start|stop>');
  process.exitCode = 2;
}
