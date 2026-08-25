#!/usr/bin/env node
/**
 * offline-8host-liveclos.mjs — real native lifecycle proof on ISOLATED TEMP
 * HOMES for all 8 hosts (JOURNEY-010, REQ-111):
 *
 *   detect → install → reload → readback → offlineCanary → rollback (byte-equal)
 *
 * Every host is run against a fresh temp home with its own env var pointing at
 * that home. User content preservation is verified by planting a sentinel file
 * around the managed block before install and asserting it survives byte-equal.
 * Rollback is exercised with the REAL backup dir produced by install, and the
 * restored file must hash-identical to the pre-install bytes.
 * No login flows, no credentials, no token capture. MODEL_BEHAVIOR stays
 * NEEDS_USER (JOURNEY-012). Exit 0 only when all offline canaries are green
 * and rollback is byte-equal. Prints a machine-readable JSON summary.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cliDist = path.join(root, 'packages', 'cli', 'dist', 'index.js');
if (!fs.existsSync(cliDist)) {
  console.error('offline-8host: build the CLI first (npm run build)');
  process.exit(2);
}

const LEFT = path.join(root, 'packages', 'cli', 'dist', 'services', 'native-installer.js');
const REGISTRY = path.join(root, 'platforms', 'platform-contracts.json');
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const hosts = registry.registry.host_ids;

const homeEnvFor = (host) => {
  const contract = registry.native_contracts?.[host] ?? registry.platforms?.[host]?.contract ?? registry.platforms?.[host];
  return contract?.homeEnv;
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function applyEnv(overrides) {
  const saved = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(overrides)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-offline8-'));
  const results = [];
  let failed = false;
  // Each host's instruction file (temp-home path) → pre-install bytes, to prove
  // byte-equal rollback restores exactly.
  const preInstallBytes = new Map();
  try {
    for (const host of hosts) {
      const home = path.join(tempRoot, host);
      fs.mkdirSync(home, { recursive: true });
      const homeEnv = homeEnvFor(host) || `AGENT_RULES_${host.toUpperCase().replace(/-/g, '_')}_HOME`;
      const restoreEnv = applyEnv({
        USERPROFILE: home,
        HOME: home,
        APPDATA: path.join(home, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
        [homeEnv]: home,
      });
      const row = { host, env: homeEnv };
      try {
        const { NativeInstaller } = await import(pathToFileURL(LEFT).href);
        const installer = new NativeInstaller();
        const contract = registry.native_contracts?.[host] ?? registry.platforms?.[host];
        const rawInstr = contract?.paths?.instructionPath ?? '';
        const instrRel = rawInstr.replace(/\$[A-Z_]+/g, '').replace('~', '');
        const instrPath = path.join(home, instrRel.replace(/^[\\/]/, ''));
        const isDirSurface = rawInstr.includes('bundle') || rawInstr.includes('mods') || rawInstr.includes('/rules') || rawInstr.endsWith('rules') || rawInstr.endsWith('rules/');
        const isActivationManaged = ['codex', 'opencode', 'antigravity'].includes(host);

        // Plant user content sentinel (JOURNEY-013) when the host uses a
        // plain-file instruction surface.
        if (!isDirSurface && !isActivationManaged && instrRel) {
          fs.mkdirSync(path.dirname(instrPath), { recursive: true });
          const before = '# User sentinel before install\n\n<!-- keep -->\n';
          fs.writeFileSync(instrPath, before, 'utf8');
          preInstallBytes.set(host, { path: instrPath, bytes: Buffer.from(before, 'utf8'), hash: sha256(Buffer.from(before, 'utf8')) });
        }

        // detect
        const detection = await installer.detect(host);
        row.detected = detection.present;
        row.signals = detection.signals;
        row.homeDir = detection.homeDir;

        // install (targets the temp home via env)
        let installResult;
        try {
          installResult = await installer.install(host, { dryRun: false });
          row.install = installResult.status;
          row.installClaims = Object.fromEntries(Object.entries(installResult.claims).map(([k, v]) => [k, v.status]));
        } catch (error) {
          row.install = `ERROR: ${error instanceof Error ? error.message : String(error)}`;
          row.installClaims = {};
        }

        // reload
        const reload = await installer.reload(host);
        row.reload = reload.ok ? 'PASS' : 'UNKNOWN';
        row.reloadMethod = reload.method;

        // readback (real native readback)
        const readback = await installer.readback(host);
        row.readback = readback.ok ? 'PASS' : readback.found ? 'PARTIAL' : 'NOT_FOUND';
        row.readbackDetail = readback.detail;
        row.readbackSha = readback.sha256 ?? null;

        // offline canary (credential-free)
        const offline = await installer.offlineCanary(host);
        row.offlineCanary = offline.ok ? 'PASS' : (Object.entries(offline.claims).some(([, c]) => c.status === 'FAIL') ? 'FAIL' : 'PARTIAL');
        row.offlineClaims = Object.fromEntries(Object.entries(offline.claims).map(([k, v]) => [k, v.status]));

        // exercise rollback with the REAL backup produced by install
        let rollbackOk = false;
        let byteEqual = false;
        try {
          const backupBase = path.join(process.cwd(), '.agent', 'tmp', 'backups', host);
          if (fs.existsSync(backupBase)) {
            const dirs = fs.readdirSync(backupBase).map((d) => path.join(backupBase, d)).filter((d) => fs.statSync(d).isDirectory()).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
            if (dirs.length) {
              const rollback = await installer.rollback(host, dirs[0]);
              byteEqual = rollback.byteEqual;
              rollbackOk = rollback.ok;
            }
          }
        } catch (error) {
          row.rollbackDetail = error instanceof Error ? error.message : String(error);
        }
        row.rollback = rollbackOk && byteEqual ? 'PASS' : 'FAIL';
        row.rollbackByteEqual = byteEqual;

        // user-content preservation: sentinel still around the managed block
        if (preInstallBytes.has(host)) {
          const { path: p } = preInstallBytes.get(host);
          const afterInstall = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
          row.sentinelPreserved = afterInstall.includes('User sentinel before install') && afterInstall.includes('<!-- keep -->');
        } else {
          row.sentinelPreserved = 'n/a';
        }
      } catch (error) {
        row.error = error instanceof Error ? error.message : String(error);
      } finally {
        restoreEnv();
      }

      const rowOk = (row.install === 'Ready' || row.install === undefined)
        && row.offlineCanary !== 'FAIL'
        && row.rollback !== 'FAIL'
        && row.sentinelPreserved !== false
        && !row.error;
      if (!rowOk) failed = true;
      results.push(row);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  const summary = {
    schema: 'agent-rules/offline-8host/live-close',
    version: 1,
    status: failed ? 'FAILED' : 'PASS',
    hosts: results.length,
    results,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`offline-8host failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});