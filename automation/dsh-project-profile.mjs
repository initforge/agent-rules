#!/usr/bin/env node
/**
 * dsh-project-profile.mjs — attach the canonical agent-rules MCP projection to
 * a DSH profile via the supported profile/patch mechanism.
 *
 * Reads integrations/registry.json (pinned versions only), projects the chosen
 * providers through the mcp-guardian Projector (guardian-wrapped connect
 * bridge, registry/policy hash, rollback reference, no secrets), then writes
 * profiles/<name>/cordis.patch.yml as a cordis PatchOptions insert list (one
 * @deepseek-ai/dsh-mcp-client instance per provider) with a backup of the
 * previous patch and an agent-rules-projection.json receipt.
 *
 * Usage:
 *   node automation/dsh-project-profile.mjs                     # attach to web profile (all MCP providers)
 *   node automation/dsh-project-profile.mjs --profile headless  # another profile
 *   node automation/dsh-project-profile.mjs --providers playwright-mcp,codebase-memory-mcp
 *   node automation/dsh-project-profile.mjs --dry-run           # generate without writing
 *   node automation/dsh-project-profile.mjs --verify            # validate the attached patch with dsh --dump-config
 *
 * The lease token is never written to disk: the patch references it via
 * `!!js process.env.AGENT_RULES_LEASE_TOKEN` (resolved at DSH mount time).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const GUARDIAN_PKG = path.join(REPO_ROOT, 'packages', 'mcp-guardian');

const mod = (p) => import(pathToFileURL(p).href);
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

async function loadProjector() {
  const { Registry } = await mod(path.join(GUARDIAN_PKG, 'dist', 'projection', 'registry.js'));
  const { Projector, gitHead } = await mod(path.join(GUARDIAN_PKG, 'dist', 'projection', 'projector.js'));
  const { docHash } = await mod(path.join(GUARDIAN_PKG, 'dist', 'util', 'hashes.js'));
  const registry = Registry.load(REPO_ROOT);
  const bridge = path.join(GUARDIAN_PKG, 'dist', 'bin', 'connect.js');
  const projector = new Projector(registry, {
    repoRoot: REPO_ROOT,
    gitHead: gitHead(REPO_ROOT),
    policyHash: docHash({ policy: 'owner-policy-v1', scope: 'mcp-guardian-projection' }),
    guardianBridgeCommand: bridge,
  });
  return { registry, projector };
}

function parseArgs(argv) {
  const out = { profile: 'web', providers: null, dryRun: false, verify: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') out.profile = argv[++i];
    else if (a === '--providers') out.providers = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--verify') out.verify = true;
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
  const { registry, projector } = await loadProjector();

  if (opts.verify) {
    // Validate the attached patch by composing the profile with dsh itself.
    const dshBin = process.env.DSH_BIN ?? 'dsh';
    const patchPath = path.join(dshHome, 'profiles', opts.profile, 'cordis.patch.yml');
    if (!fs.existsSync(patchPath)) {
      console.error(`dsh-project-profile --verify: no patch at ${patchPath}`);
      process.exit(1);
    }
    try {
      const out = execFileSync(dshBin, ['--profile', opts.profile, '--dump-config'], { encoding: 'utf8', timeout: 30000 });
      const hasMcp = /mcp-|dsh-mcp-client/.test(out);
      console.log(`dsh-project-profile --verify: dsh --profile ${opts.profile} --dump-config composes OK (mcp entries present: ${hasMcp})`);
      if (!hasMcp) process.exit(1);
      return;
    } catch (e) {
      console.error(`dsh-project-profile --verify: FAILED — ${e.message}`);
      process.exit(1);
    }
  }

  const allProviders = registry.all();
  const mcpProviders = allProviders.filter((p) => p.kind === 'mcp');
  const selected = opts.providers
    ? mcpProviders.filter((p) => opts.providers.includes(p.id))
    : mcpProviders;
  if (selected.length === 0) {
    console.error('dsh-project-profile: no MCP providers selected (registry has ' + mcpProviders.length + ' mcp providers)');
    process.exit(2);
  }

  // Build one entry per provider with a lease bound to a stable per-provider
  // logical session identity (project-scoped DSH session; the running DSH web
  // binds its own uuid via the host adapter at runtime).
  const { Broker } = await mod(path.join(GUARDIAN_PKG, 'dist', 'broker', 'broker.js'));
  const { StateStore } = await mod(path.join(GUARDIAN_PKG, 'dist', 'state', 'store.js'));
  const stateDir = process.env.AGENT_RULES_MCP_STATE_DIR ?? path.join(os.homedir(), '.local', 'state', 'agent-rules', 'mcp-broker');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const broker = new Broker({ stateStore: new StateStore({ stateDir }) });

  const entries = selected.map((p) => {
    const logical = `dsh:project:${createHash('sha256').update(REPO_ROOT).digest('hex').slice(0, 16)}`;
    const { lease } = broker.acquireLease({
      logical_session_id: logical,
      host_kind: 'deepseek-harness',
      provider_id: p.id,
      project_root: REPO_ROOT,
    });
    const projection = projector.project(p.id, lease, lease.sharing_mode, lease.visibility_mode);
    return { lease, projection };
  });

  const { DeepseekHarnessAdapter } = await mod(path.join(GUARDIAN_PKG, 'dist', 'hosts', 'deepseek-harness.js'));
  const adapter = new DeepseekHarnessAdapter({ broker, projector, dshHome });
  const res = adapter.attachDshProfileProjection(entries, { profileName: opts.profile, dryRun: opts.dryRun });
  if (!res.ok) {
    console.error(`dsh-project-profile: ${res.reason}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    action: opts.dryRun ? 'dry-run' : 'attached',
    profile: opts.profile,
    dsh_home: dshHome,
    providers: selected.map((p) => `${p.id}@${p.registry_entry.source?.version}`),
    patch_path: res.patchPath,
    receipt_path: res.receiptPath,
    backup_path: res.backupPath,
    registry_hash: registry.registryHash,
    policy_hash: projector.ctx.policyHash,
    rollback_reference: projector.ctx.gitHead,
    lease_token_in_file: false,
    lease_token_reference: 'process.env.AGENT_RULES_LEASE_TOKEN',
    state_dir: stateDir,
  }, null, 2));
  if (!opts.dryRun) {
    console.error('\nNext: restart the DSH web process with AGENT_RULES_LEASE_TOKEN=<token> in its env so the projected MCP servers can connect through the guardian bridge.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
