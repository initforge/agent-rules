/**
 * bin/connect.js — guardian connect bridge (the projected MCP server command).
 *
 * Hosts configure this command as their MCP server for a provider. It:
 *  1. validates the lease token with the broker (fail closed);
 *  2. resolves the registry-pinned launch spec — raw provider commands from
 *     project configs are never accepted (no direct bypass);
 *  3. spawns the provider, attributes process+window, performs X11 placement,
 *     marks the lease READY (guardian_wrapped=true);
 *  4. performs an initialize/initialized/tools/list handshake proof on the
 *     SAME provider child (evidence, not the host's own connection);
 *  5. pipes stdio 1:1 between the host and the provider.
 *
 * Usage: mcp-guardian connect --lease <lease-id> --provider <provider-id>
 *        env AGENT_RULES_LEASE_TOKEN must carry the lease token (never argv).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from 'node:url';
import { Broker } from '../broker/broker.js';
import { StateStore } from '../state/store.js';
import { Registry } from '../projection/registry.js';
import { Guardian } from '../guardian/guardian.js';
import { handshake } from '../mcp/client.js';
import { commandDigest } from '../util/hashes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/bin -> dist -> mcp-guardian -> packages -> repo root
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * Resolve the registry-pinned provider binary from the exact-version npx cache
 * (~/.npm/_npx/<hash>/node_modules/.bin/<commandName>) when present, else null.
 * Version match is exact (never @latest, never a random cache selection).
 */
export function resolvePinnedBin(
  source: { package?: string | null; version?: string | null; commandName?: string | null },
  fallbackName?: string | null,
): string | null {
  const version = source?.version;
  if (!version) return null;
  const pkg = source?.package ?? null;
  const binName = source?.commandName ?? fallbackName;
  const cacheRoot = path.join(os.homedir(), '.npm', '_npx');
  let cacheDirs: string[] = [];
  try {
    cacheDirs = fs.readdirSync(cacheRoot);
  } catch {
    return null;
  }
  for (const d of cacheDirs) {
    const dir = path.join(cacheRoot, d);
    if (!binName) continue;
    const binPath = path.join(dir, 'node_modules', '.bin', binName);
    if (!fs.existsSync(binPath)) continue;
    // exact-version match against the installed package.json
    const candidates = pkg
      ? [path.join(dir, 'node_modules', ...pkg.split('/'))]
      : [path.join(dir, 'node_modules', binName), path.join(dir, 'node_modules', '@playwright', 'mcp')];
    for (const pkgJson of candidates) {
      const pj = path.join(pkgJson, 'package.json');
      try {
        if (fs.existsSync(pj) && JSON.parse(fs.readFileSync(pj, 'utf8')).version === version) {
          return binPath;
        }
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

function parseArgs(argv: string[]): { leaseId?: string; providerId?: string } {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lease') out.leaseId = argv[++i];
    else if (a === '--provider') out.providerId = argv[++i];
    else if (a.startsWith('--lease=')) out.leaseId = a.slice(8);
    else if (a.startsWith('--provider=')) out.providerId = a.slice(11);
  }
  return out;
}

export async function main(argv: string[]): Promise<number> {
  const { leaseId, providerId } = parseArgs(argv);
  const token = process.env.AGENT_RULES_LEASE_TOKEN;
  if (!leaseId || !providerId) {
    console.error('usage: mcp-guardian connect --lease <lease-id> --provider <provider-id>');
    return 2;
  }
  if (!token) {
    console.error('connect: AGENT_RULES_LEASE_TOKEN is required (never pass tokens via argv)');
    return 2;
  }

  const store = new StateStore();
  const broker = new Broker({ stateStore: store });
  const registry = Registry.load(REPO_ROOT);
  const entry = registry.provider(providerId);
  if (!entry) {
    console.error(`connect: unknown provider ${providerId} (registry-driven only)`);
    return 2;
  }

  // Fail closed: lease must exist, token must match, status connectable.
  let lease;
  try {
    lease = broker.resolveLease(leaseId, token);
  } catch (e) {
    console.error(`connect: lease rejected: ${(e as Error).message}`);
    return 2;
  }
  if (!['CREATED', 'ACQUIRING', 'STARTING', 'READY', 'RELOCATED'].includes(lease.status)) {
    console.error(`connect: lease ${leaseId} status ${lease.status} is not connectable`);
    return 2;
  }

  // Registry-pinned launch spec only.
  const source = entry.registry_entry.source;
  const version = source?.version ?? null;
  if (!source || !version || !/^\d+\.\d+/.test(version)) {
    console.error(`connect: provider ${providerId} has no pinned version — refusing (no @latest)`);
    return 2;
  }
  // Resolve the pinned binary: prefer the exact-version npx cache entry (the
  // install path used by registry installs), then PATH. Never @latest.
  const command = resolvePinnedBin(source, providerId) ?? source.commandName ?? providerId;
  const args: string[] = [];
  const env: Record<string, string> = {
    AGENT_RULES_GUARDIAN: '1',
    AGENT_RULES_LEASE_ID: leaseId,
    AGENT_RULES_LOGICAL_SESSION_ID: lease.logical_session_id,
    AGENT_RULES_PROVIDER_ID: providerId,
  };
  for (const name of entry.registry_entry.environment ?? []) {
    if (process.env[name]) env[name] = process.env[name];
  }
  const digest = commandDigest(command, args);

  const guardian = new Guardian({ broker });
  const spec = {
    command,
    args,
    env,
    display: process.env.DISPLAY ?? null,
    requireWindow: entry.gui,
    initialWorkspace: lease.initial_workspace,
  };

  const result = await guardian.connect(leaseId, token, spec);
  if (!result.ok || !result.child) {
    console.error(`connect: guardian refused: ${result.error}`);
    return 1;
  }
  const child = result.child;
  const providerInstanceId = result.provider_instance_id!;

  // Handshake proof on the SAME provider child (before the host takes over).
  let proof = null;
  try {
    proof = await handshake({ command, args, env, child, timeoutMs: 20_000 });
  } catch (e) {
    console.error(`connect: handshake proof failed: ${(e as Error).message}`);
    broker.noteTransition(leaseId, 'READY', 'FAILED', `handshake proof failed: ${(e as Error).message}`, { guardian_wrapped: true });
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    return 1;
  }
  broker.attachProvider(leaseId, token, {
    provider_instance_id: providerInstanceId,
    mcp_connection_id: `conn_${Date.now()}`,
    resource_id: null,
    provider_pid: child.pid ?? null,
    provider_start_time: result.identity?.start_time ?? null,
    transport: 'stdio',
    mcp_handshake_proof: proof,
  });
  broker.kvSet(`connect:${leaseId}`, JSON.stringify({
    command_digest: digest,
    registry_hash: registry.registryHash,
    guardian_wrapped: true,
    provider_instance_id: providerInstanceId,
    handshake: proof,
  }));

  // Pipe the provider's stdio to our own (the host owns our stdio).
  if (child.stdout && child.stderr && child.stdin) {
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    process.stdin.pipe(child.stdin);
  } else {
    console.error('connect: provider stdio unavailable');
    broker.noteTransition(leaseId, 'READY', 'FAILED', 'provider stdio unavailable at pipe time');
    return 1;
  }
  const exit = await new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    process.stdin.on('end', () => {
      try {
        child.stdin?.end();
      } catch {
        /* ignore */
      }
    });
  });
  return exit;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
