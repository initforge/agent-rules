/**
 * hosts/deepseek-harness.ts — DeepSeek Harness (DSH) host adapter.
 *
 * Contract (owner contract §IX):
 * - detect the EXACT installed binary/package (never @latest, no unapproved
 *   installs); attest version from package.json / dump-config;
 * - headless mode: per task/session lease, exact argv/cwd/env, MCP provider
 *   config generated from the canonical registry;
 * - DSH Web multi-session: bind by the native DSH agent/session identity
 *   (~/.dsh/sessions/<project-slug>/session-<uuid>/), never by Web process PID
 *   or DSH workspace names; each agent session gets its own lease;
 * - if no session-scoped MCP seam exists, report the real granularity
 *   (host-process / project) instead of claiming chat.
 *
 * DSH skills: canonical SKILL.md / ROUTE.json remain authoritative; DSH only
 * receives selected, provenance-bound projections. Session logs are telemetry,
 * never authority. No edits to DSH source/core loop.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dump as yamlDump } from 'js-yaml';
import { sha256Hex } from '../util/hashes.js';
import type { Broker } from '../broker/broker.js';
import type { Projector } from '../projection/projector.js';
import type { HostAttestation, HostMcpProjection, HostSessionAdapter, HostSessionBinding, RuntimeReconcileResult } from './contract.js';
import { binding, registerWithBroker } from './contract.js';
import type { LeaseRecord, SessionGranularity } from '../types.js';

const execFileAsync = promisify(execFile);

export interface DshAdapterOptions {
  broker: Broker;
  projector: Projector;
  /** dsh binary (default: resolve from PATH or npx cache) */
  binary?: string;
  /** DSH data root (default ~/.dsh) */
  dshHome?: string;
  /** project root to scope sessions */
  projectRoot?: string;
}

export interface DshSessionIdentity {
  sessionId: string;
  projectSlug: string;
  projectPath: string | null;
  sessionDir: string;
  modifiedAt: number | null;
}

export class DeepseekHarnessAdapter implements HostSessionAdapter {
  private broker: Broker;
  private projector: Projector;
  private binary: string;
  private dshHome: string;
  private projectRoot: string | null;
  private attestation: HostAttestation | null = null;

  constructor(opts: DshAdapterOptions) {
    this.broker = opts.broker;
    this.projector = opts.projector;
    this.binary = opts.binary ?? resolveDshBinary();
    this.dshHome = opts.dshHome ?? path.join(os.homedir(), '.dsh');
    this.projectRoot = opts.projectRoot ?? null;
  }

  async detect(): Promise<HostAttestation> {
    const detail: Record<string, unknown> = { dsh_home: this.dshHome };
    let version: string | null = null;
    let versionSource: string | null = null;
    let binaryPath: string | null = null;
    let running = false;
    let pid: number | null = null;

    // 1. Binary/version: prefer the installed package.json (exact pin), else --version.
    const pkgJson = path.join(path.dirname(this.binary), '..', 'package.json');
    try {
      if (fs.existsSync(pkgJson)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as { name?: string; version?: string };
        if (pkg.name?.includes('dsh') && pkg.version) {
          version = pkg.version;
          versionSource = 'installed package.json';
        }
      }
    } catch {
      /* fall through */
    }
    if (!version) {
      try {
        const { stdout } = await execFileAsync(this.binary, ['--version'], { timeout: 5000 });
        version = stdout.trim().split('\n')[0] ?? null;
        versionSource = 'binary --version';
      } catch {
        version = null;
      }
    }
    detail.version_pinned = version !== null && /^\d+\.\d+\.\d+/.test(version ?? '');

    // 2. dump-config attestation (doctor-style probe).
    let dumpConfig: string | null = null;
    try {
      const { stdout } = await execFileAsync(this.binary, ['dump-config'], { timeout: 8000 });
      dumpConfig = stdout.slice(0, 4000);
      detail.dump_config = 'ok';
    } catch (e) {
      detail.dump_config = `failed: ${(e as Error).message.slice(0, 200)}`;
    }

    // 3. Running instances (Web runtime).
    try {
      const { stdout } = await execFileAsync('ps', ['-eo', 'pid,args'], { timeout: 3000 });
      const matches = stdout
        .split('\n')
        .filter((l) => l.includes('dsh') && (l.includes(' web') || l.includes('web')))
        .map((l) => {
          const m = /^\s*(\d+)/.exec(l);
          return m ? Number(m[1]) : null;
        })
        .filter((p): p is number => p !== null);
      if (matches.length > 0) {
        running = true;
        pid = matches[0];
        detail.running_pids = matches;
      }
    } catch {
      /* optional */
    }

    this.attestation = {
      host_kind: 'deepseek-harness',
      binary: this.binary,
      version,
      version_source: versionSource,
      pinned: detail.version_pinned === true,
      install_authority: false, // adapter never installs DSH itself
      running,
      pid,
      host_instance_id: running ? `dsh-web-${pid}` : null,
      detected_at: new Date().toISOString(),
      detail,
    };
    return this.attestation;
  }

  /**
   * DSH Web native session identity: ~/.dsh/sessions/<project-slug>/session-<uuid>/.
   * The uuid is the durable per-chat identity; the project slug is scoping only.
   */
  listNativeSessions(): DshSessionIdentity[] {
    const sessionsRoot = path.join(this.dshHome, 'sessions');
    if (!fs.existsSync(sessionsRoot)) return [];
    const out: DshSessionIdentity[] = [];
    let projectDirs: string[];
    try {
      projectDirs = fs.readdirSync(sessionsRoot);
    } catch {
      return [];
    }
    for (const projectDir of projectDirs) {
      const projectPath = path.join(sessionsRoot, projectDir);
      let entries: string[];
      try {
        entries = fs.readdirSync(projectPath);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const m = /^session-([0-9a-f-]{36})$/.exec(entry);
        if (!m) continue;
        const sessionDir = path.join(projectPath, entry);
        let stat;
        try {
          stat = fs.statSync(sessionDir);
        } catch {
          continue;
        }
        out.push({
          sessionId: m[1],
          projectSlug: projectDir,
          projectPath: decodeProjectSlug(projectDir),
          sessionDir,
          modifiedAt: stat.mtimeMs,
        });
      }
    }
    out.sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0));
    return out;
  }

  /**
   * Resolve the logical session for this host process. When the DSH Web
   * runtime exposes native session uuids for the project, we bind per chat
   * session; otherwise granularity degrades honestly to host-process/project.
   */
  async registerSession(input: {
    hostSessionId?: string | null;
    hostInstanceId?: string | null;
    projectRoot?: string | null;
    sourceWindowFingerprintHash?: string | null;
    requested?: string;
  }): Promise<HostSessionBinding> {
    const att = await this.detect();
    const projectRoot = input.projectRoot ?? this.projectRoot ?? null;
    const sessions = this.listNativeSessions();

    let hostSessionId = input.hostSessionId ?? null;
    let logicalSessionId: string;
    let granularity: SessionGranularity;
    let observed: string | null = null;
    let fallback: string | null = null;

    if (hostSessionId) {
      const found = sessions.find((s) => s.sessionId === hostSessionId);
      if (found) {
        granularity = 'chat';
        observed = `native DSH session ${hostSessionId} observed at ${found.sessionDir}`;
        logicalSessionId = `dsh:${hostSessionId}`;
      } else {
        granularity = 'host-process';
        fallback = `DSH session ${hostSessionId} not observed in ${this.dshHome}/sessions; degraded to host-process`;
        logicalSessionId = `dsh:process:${input.hostInstanceId ?? sha256Hex(projectRoot ?? 'unknown').slice(0, 16)}`;
      }
    } else if (projectRoot) {
      const slug = encodeProjectSlug(projectRoot);
      const projectSessions = sessions.filter((s) => s.projectSlug === slug);
      if (projectSessions.length === 1) {
        // Single active session for this project: bind per chat.
        hostSessionId = projectSessions[0].sessionId;
        granularity = 'chat';
        observed = `single DSH Web session ${hostSessionId} for project ${projectRoot}`;
        logicalSessionId = `dsh:${hostSessionId}`;
      } else if (projectSessions.length > 1) {
        granularity = 'host-process';
        fallback = `${projectSessions.length} DSH sessions exist for project ${projectRoot}; no hostSessionId provided — cannot claim per-chat binding`;
        logicalSessionId = `dsh:project:${sha256Hex(projectRoot).slice(0, 16)}`;
      } else {
        granularity = 'project';
        fallback = 'no DSH session observed for this project; granularity = project';
        logicalSessionId = `dsh:project:${sha256Hex(projectRoot).slice(0, 16)}`;
      }
    } else {
      granularity = 'host-process';
      fallback = 'no project root and no host session id; granularity = host-process';
      logicalSessionId = `dsh:process:${input.hostInstanceId ?? 'unknown'}`;
    }

    const b = binding({
      logical_session_id: logicalSessionId,
      host_kind: 'deepseek-harness',
      host_session_id: hostSessionId,
      host_instance_id: input.hostInstanceId ?? att.host_instance_id,
      project_root: projectRoot,
      source_window_fingerprint_hash: input.sourceWindowFingerprintHash ?? null,
      granularity,
      requested: input.requested ?? 'host-provided',
      resolved: hostSessionId ?? 'none',
      observed: observed ?? 'not-observed',
      attestation_status: att.running ? 'ATTESTED' : 'DETECTED_NOT_RUNNING',
      fallback_reason: fallback,
      evidence_refs: [`dsh-attestation:${att.detected_at}`, `dsh-sessions-root:${path.join(this.dshHome, 'sessions')}`],
    });
    registerWithBroker(this.broker, b);
    return b;
  }

  async resolveSession(input: { hostSessionId?: string | null; projectRoot?: string | null; requested?: string }): Promise<HostSessionBinding> {
    return this.registerSession(input);
  }

  getGranularity(): SessionGranularity {
    return this.attestation?.running ? 'chat' : 'host-process';
  }

  subscribeLifecycle(_sessionId: string): () => void {
    // DSH Web does not expose a lifecycle hook seam in 0.1.0-rc.6; session
    // liveness is observed via the sessions directory, not claimed natively.
    return () => undefined;
  }

  async projectMcp(sessionId: string, lease: LeaseRecord): Promise<HostMcpProjection> {
    const entry = this.projector.project(lease.provider_id, lease, lease.sharing_mode, lease.visibility_mode);
    const content = this.projector.toDshProfile([entry]);
    return {
      format: 'dsh-profile',
      content,
      entries: [{ provider_id: lease.provider_id, guardian_wrapped: true, command_digest: entry.command_digest }],
      registry_hash: this.projector['registry'].registryHash,
    };
  }

  async attachLease(_sessionId: string, _lease: LeaseRecord): Promise<void> {
    /* no native seam; lease attach is broker-side */
  }

  /**
   * Attach the projected MCP entries to a DSH profile through the supported
   * profile/patch mechanism: writes `profiles/<name>/cordis.patch.yml` as a
   * pure cordis PatchOptions insert list (one @deepseek-ai/dsh-mcp-client
   * instance per provider, guardian-wrapped, token via `!!js` env reference),
   * backs up the previous patch, and writes a projection receipt next to it.
   * No secrets are ever written into the profile directory.
   */
  attachDshProfileProjection(
    entries: Array<{ lease: LeaseRecord; projection: import('../projection/projector.js').ProjectedEntry }>,
    opts: { profileName?: string; dryRun?: boolean } = {},
  ): { ok: boolean; patchPath: string | null; receiptPath: string | null; backupPath: string | null; reason?: string } {
    const profileName = opts.profileName ?? 'web';
    const profileDir = path.join(this.dshHome, 'profiles', profileName);
    if (!fs.existsSync(profileDir)) {
      return { ok: false, patchPath: null, receiptPath: null, backupPath: null, reason: `DSH profile ${profileName} does not exist (${profileDir})` };
    }
    const patchPath = path.join(profileDir, 'cordis.patch.yml');
    const patch = this.projector.toDshCordisPatch(entries.map((e) => e.projection));
    const yaml = `# Generated by agent-rules mcp-guardian — do not hand-edit.\n# Registry-driven DSH profile projection (guardian-wrapped; token via host env only).\n${yamlDump(patch)}`;
    const receipt = this.projector.toDshProjectionReceipt(entries.map((e) => e.projection), {
      profile: profileName,
      dsh_home: this.dshHome,
      logical_session_ids: [...new Set(entries.map((e) => e.lease.logical_session_id))],
      lease_ids: entries.map((e) => e.lease.lease_id),
      entries_count: entries.length,
    });
    const receiptPath = path.join(profileDir, 'agent-rules-projection.json');
    if (opts.dryRun) {
      return { ok: true, patchPath, receiptPath, backupPath: null, reason: 'dry-run: patch content generated but not written' };
    }
    const backupPath = patchPath + '.agent-rules-backup';
    try {
      if (fs.existsSync(patchPath)) fs.copyFileSync(patchPath, backupPath);
      fs.writeFileSync(patchPath, yaml, { mode: 0o600 });
      fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
      return { ok: true, patchPath, receiptPath, backupPath };
    } catch (e) {
      return { ok: false, patchPath, receiptPath, backupPath, reason: `write failed: ${(e as Error).message}` };
    }
  }

  async detachLease(_sessionId: string, _lease: LeaseRecord): Promise<void> {
    /* no native seam */
  }

  async reconcile(sessionId: string): Promise<RuntimeReconcileResult> {
    const leases = this.broker.listLeases({ logicalSessionId: sessionId });
    return { leases, drift: [] };
  }
}

export function resolveDshBinary(): string {
  if (process.env.DSH_BIN && fs.existsSync(process.env.DSH_BIN)) return process.env.DSH_BIN;
  // Known npx caches (developer-preview installs) — exact package pin, no @latest.
  const cacheRoot = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(cacheRoot)) {
    try {
      const candidates = fs.readdirSync(cacheRoot).map((d) => path.join(cacheRoot, d));
      for (const dir of candidates) {
        const bin = path.join(dir, 'node_modules', '.bin', 'dsh');
        if (fs.existsSync(bin)) return bin;
      }
    } catch {
      /* continue */
    }
  }
  return 'dsh';
}

/** ~/.dsh/sessions uses project paths mangled into slugs, e.g. --home-user-Projects-x-- */
export function encodeProjectSlug(projectRoot: string): string {
  return `--${projectRoot.replace(/\//g, '-').replace(/^-/, '')}--`;
}

export function decodeProjectSlug(slug: string): string | null {
  if (!slug.startsWith('--') || !slug.endsWith('--')) return null;
  const inner = slug.slice(2, -2);
  if (!inner) return null;
  // home-user-Projects-x -> /home/user/Projects/x for the common layout
  if (/^home-/.test(inner)) {
    return `/${inner.replace(/-/g, '/')}`;
  }
  return inner.replace(/-/g, '/');
}
