import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'agent-rules-packed-'));
const packDir = path.join(temp, 'packs');
const app = path.join(temp, 'app');
const home = path.join(temp, 'home');
const runtimeTarget = path.join(temp, 'codex-home');
const bin = path.join(temp, 'bin');
await Promise.all([fsp.mkdir(packDir), fsp.mkdir(app), fsp.mkdir(home), fsp.mkdir(runtimeTarget), fsp.mkdir(bin)]);

function runResult(executable, args, options = {}) {
  return spawnSync(executable, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
}

function run(executable, args, options = {}) {
  const result = runResult(executable, args, options);
  if (result.error || result.status !== 0) throw new Error(`${executable} ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  return result.stdout;
}

function runNpm(args, options = {}) {
  if (process.env.npm_execpath) {
    return run(process.execPath, [process.env.npm_execpath, ...args], options);
  }
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    shell: process.platform === 'win32',
    ...options,
  });
}

function pack(workspace) {
  const before = new Set(fs.readdirSync(packDir));
  runNpm(['pack', '--silent', '--ignore-scripts', '--pack-destination', packDir], { cwd: path.join(root, workspace) });
  const created = fs.readdirSync(packDir).find((name) => !before.has(name));
  if (!created) throw new Error(`npm pack produced no tarball for ${workspace}`);
  return path.join(packDir, created);
}

function containsAgentDirectory(root) {
  if (!fs.existsSync(root)) return false;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.agent' || containsAgentDirectory(path.join(root, entry.name))) return true;
  }
  return false;
}

try {
  const tarballs = ['packages/kernel', 'packages/cli'].map(pack);
  await fsp.writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'packed-smoke', private: true }));
  runNpm(['install', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], { cwd: app });

  const cliEntry = path.join(app, 'node_modules/@initforge/agent-rules/dist/index.js');
  const runCli = (args, options = {}) => run(process.execPath, [cliEntry, ...args], options);
  const fakeCodex = path.join(bin, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  await fsp.writeFile(fakeCodex, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n');
  if (process.platform !== 'win32') await fsp.chmod(fakeCodex, 0o755);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: runtimeTarget, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` };
  const help = runCli(['--help'], { cwd: app, env });
  for (const command of ['install', 'uninstall', 'doctor', 'status', 'integration', 'reference', 'route-native']) assert.match(help, new RegExp(`\\b${command}\\b`));
  for (const retired of ['run', 'init', 'plan', 'goal']) assert.doesNotMatch(help, new RegExp(`^\\s+${retired}\\s`, 'm'));

  const routed = runCli(['route-native', '--stdin'], {
    cwd: app,
    env,
    input: JSON.stringify({
      protocol_version: '2.0', host: 'codex', session_id: 'packed', turn_id: 'one', cwd: app,
      prompt: 'Refactor a database query', repo_root: app, host_facts: { model: 'owner/model' },
    }),
  });
  const capsule = JSON.parse(routed);
  assert.equal(capsule.model.requested, 'owner/model');

  const installedRoot = path.join(app, 'node_modules/@initforge/agent-rules');
  runCli(['--json', 'install', 'codex', '--no-integrations'], { cwd: app, env });
  runCli(['--json', 'install', 'codex', '--no-integrations'], { cwd: app, env });
  const doctor = runResult(process.execPath, [cliEntry, '--json', 'doctor', 'codex'], { cwd: app, env });
  assert.equal(doctor.error, undefined);
  const doctorOutput = JSON.parse(doctor.stdout);
  assert.ok(['HEALTHY', 'DEGRADED', 'NEEDS_USER'].includes(doctorOutput.data.hosts[0].status), JSON.stringify(doctorOutput.data.hosts[0], null, 2));
  assert.notEqual(doctorOutput.data.hosts[0].components.rules, 'BROKEN');
  assert.equal(doctorOutput.data.hosts[0].components.hooks, 'NOT_APPLICABLE');
  const hooksPath = path.join(runtimeTarget, 'hooks.json');
  if (fs.existsSync(hooksPath)) assert.doesNotMatch(fs.readFileSync(hooksPath, 'utf8'), /agent-rules-lifecycle|lifecycle-hook|agent-rules-runtime|route-native/i);
  assert.equal(fs.existsSync(path.join(runtimeTarget, 'agent-rules-runtime')), false);
  assert.equal(fs.existsSync(path.join(home, '.agent-rules', 'runtime')), false);

  const installedAgents = path.join(runtimeTarget, 'AGENTS.md');
  const installedSkill = path.join(home, '.agents', 'skills', 'finish-to-completion', 'SKILL.md');
  const agentsBytes = await fsp.readFile(installedAgents);
  const skillBytes = await fsp.readFile(installedSkill);
  const movedPackage = `${installedRoot}.moved`;
  const stateRoot = path.join(home, '.agent-rules');
  const movedState = `${stateRoot}.moved`;
  await fsp.rename(installedRoot, movedPackage);
  if (fs.existsSync(stateRoot)) await fsp.rename(stateRoot, movedState);
  assert.ok((await fsp.readFile(installedAgents)).equals(agentsBytes));
  assert.ok((await fsp.readFile(installedSkill)).equals(skillBytes));
  if (fs.existsSync(movedState)) await fsp.rename(movedState, stateRoot);
  await fsp.rename(movedPackage, installedRoot);
  const coordinatorUrl = pathToFileURL(path.join(installedRoot, 'dist/runtime/installation-coordinator.js')).href;
  run(process.execPath, ['--input-type=module', '--eval',
    `import { createInstallationCoordinator } from ${JSON.stringify(coordinatorUrl)}; const r = await createInstallationCoordinator({enableMcp:false}).rollback('codex'); if (r.errors && Object.keys(r.errors).length) throw new Error(JSON.stringify(r.errors));`,
  ], { cwd: app, env });
  runCli(['uninstall', 'codex'], { cwd: app, env });
  assert.equal(fs.existsSync(path.join(runtimeTarget, 'agent-rules-runtime')), false);
  assert.equal(containsAgentDirectory(temp), false);

  console.log('packed clean static install/route/update/doctor/source-state-independence/rollback/uninstall PASS');
} finally {
  await fsp.rm(temp, { recursive: true, force: true });
}
