import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { HostId } from '@initforge/agent-rules-kernel/northstar/host-adapters.js';
import { getNativeContract, getHostIds } from '@initforge/agent-rules-kernel/northstar/host-registry.js';
import { dshSkillParity, discoverDshProfiles, installDeepseekHarnessNative, restoreDshNative, inspectDshNativeReadback, removeDshNativeProjection, type DshBackupEntry } from './deepseek-native.js';
import { hashUntrackedCandidateFiles } from './candidate-fingerprint.js';
import {
  captureCommandCodeBackup,
  commandCodeSkillParity,
  installCommandCodeMod,
  readCommandCodeNative,
  restoreCommandCodeBackup,
  sealCommandCodeBackup,
  verifyCommandCodeBackup,
  writeCommandCodeMcpConfig,
  removeManagedCommandCodeMcp,
  removeManagedCommandCodeMod,
} from './command-code-native.js';
import { resolveOmpAgentHome } from '../native/omp.js';
import { expandNativePath, NativeHostProbe } from '../native/probe.js';
import type { CertificationReceipt, ClaimVerification, Detection, InstallPlan, InventoryEntry } from '../native/types.js';
import { projectSkillsToGlobal, restoreSkillProjectionBackup, uninstallOwnedGlobalProjections } from '../runtime/composed-installer.js';
import { inspectHostMcpRegistration } from '../runtime/mcp-registration.js';
import type { RuntimePlatform } from '../runtime/contracts.js';
import { resolveRuntimeAssetsRoot, resolveRuntimeStateRoot } from '../runtime/locator.js';
import { writeCurrentOperationalState } from '../runtime/state-lifecycle.js';
import { cleanupHostRuntimeCallbacks } from '../runtime/legacy-runtime-cleanup.js';

export type { CertificationReceipt, ClaimVerification, Detection, InstallPlan, InventoryEntry } from '../native/types.js';

function sha256(s: string | Buffer): string {
  return createHash('sha256').update(s).digest('hex');
}

interface NativeBackupEntry { target: string; backupFile: string | null; appliedSha256?: string | null }
interface NativeBackupManifest {
  schema: 'agent-rules/native-backup/v1';
  host: HostId;
  home: string;
  entries: NativeBackupEntry[];
}

function isOwnedBackupDirectory(backupDir: string, host: HostId): boolean {
  const markers = [
    ['.native-backup.json', 'agent-rules/native-backup/v1'],
    ['.dsh-backup.json', 'agent-rules/dsh-backup/v1'],
    ['.command-code-backup.json', 'agent-rules/command-code-backup/v1'],
    ['omp-runtime-backup.json', 'agent-rules/omp-backup/v1'],
    ['.skill-projection-backup.json', 'agent-rules/skill-projection-backup/v1'],
  ] as const;
  for (const [name, schema] of markers) {
    const file = path.join(backupDir, name);
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { schema?: string; host?: string };
      if (parsed.schema === schema && (!parsed.host || parsed.host === host)) return true;
    } catch { return false; }
  }
  return false;
}

function prepareNativeBackupDirectory(backupDir: string, host: HostId): void {
  if (fs.existsSync(backupDir)) {
    if (!isOwnedBackupDirectory(backupDir, host)) throw new Error(`Refusing to replace unowned native rollback state: ${backupDir}`);
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
  fs.mkdirSync(backupDir, { recursive: true });
}

function restoreNativeBackupDirectory(backupDir: string, host: HostId, home: string, allowUnsealed = false): boolean | null {
  const manifestPath = path.join(backupDir, '.native-backup.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as NativeBackupManifest;
    if (manifest.schema !== 'agent-rules/native-backup/v1' || manifest.host !== host || path.resolve(manifest.home) !== path.resolve(home) || !Array.isArray(manifest.entries)) return false;
    for (const entry of manifest.entries) {
      const target = path.resolve(entry.target);
      const currentSha256 = fs.existsSync(target) && fs.statSync(target).isFile() ? sha256(fs.readFileSync(target)) : null;
      if ((!allowUnsealed && entry.appliedSha256 === undefined) || (entry.appliedSha256 !== undefined && currentSha256 !== entry.appliedSha256)) return false;
      if (entry.backupFile) {
        const source = path.resolve(backupDir, entry.backupFile);
        if (!source.startsWith(`${path.resolve(backupDir)}${path.sep}`) || !fs.existsSync(source)) return false;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
        if (!fs.readFileSync(source).equals(fs.readFileSync(target))) return false;
      } else if (fs.existsSync(target)) {
        const body = fs.statSync(target).isFile() ? fs.readFileSync(target, 'utf8') : '';
        if (!/agent-rules:managed|lifecycle-hook\.js|agent-rules\.ts/.test(body)) return false;
        fs.rmSync(target, { recursive: true, force: true });
      }
    }
    return true;
  } catch {
    return false;
  }
}

function sealNativeBackupDirectory(backupDir: string): void {
  const manifestPath = path.join(backupDir, '.native-backup.json');
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as NativeBackupManifest;
  for (const entry of manifest.entries) {
    entry.appliedSha256 = fs.existsSync(entry.target) && fs.statSync(entry.target).isFile() ? sha256(fs.readFileSync(entry.target)) : null;
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/** Production assets resolve from the packed package; test-only injection stays in locator. */
function findRepositoryRoot(): string {
  return resolveRuntimeAssetsRoot();
}

/** Render the canonical five rules into a self-contained native projection.
 * Installed hosts must never depend on a checkout or an abandoned worktree. */
function normalizeProfiles(repositoryRoot: string, profileIds: readonly string[] = []): string[] {
  const unique = [...new Set(profileIds.map((id) => id.trim()).filter(Boolean))].sort();
  for (const id of unique) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) throw new Error(`invalid profile id: ${id}`);
    const root = path.join(repositoryRoot, 'profiles', id);
    if (!fs.existsSync(path.join(root, 'profile.yaml'))) throw new Error(`unknown profile: ${id}`);
  }
  return unique;
}

function renderCanonicalRules(repositoryRoot = findRepositoryRoot(), profileIds: readonly string[] = []): string {
  const manifest = path.join(repositoryRoot, 'rules', 'manifest.yaml');
  if (!fs.existsSync(manifest)) throw new Error(`canonical rules manifest missing: ${manifest}`);
  const raw = fs.readFileSync(manifest, 'utf8');
  const matches = [...raw.matchAll(/^\s*-\s*([0-9a-zA-Z._-]+\.md)/gm)].map((m) => m[1]);
  const names = matches.length > 0
    ? matches
    : ['00-intent-scope-safety.md', '10-execution-planning-delegation.md', '20-proof-outcome.md', '30-context-skill-mcp.md', '40-maintainer.md'];
  const base = names.map((name) => {
    const source = path.join(repositoryRoot, 'rules', name);
    if (!fs.existsSync(source)) throw new Error(`canonical rule missing: ${name}`);
    return fs.readFileSync(source, 'utf8').trim();
  });
  const profiles = normalizeProfiles(repositoryRoot, profileIds).flatMap((id) => {
    const root = path.join(repositoryRoot, 'profiles', id);
    const files = [path.join(root, 'README.md')];
    const rules = path.join(root, 'rules');
    if (fs.existsSync(rules)) files.push(...fs.readdirSync(rules, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => path.join(rules, entry.name)).sort());
    return [`# Explicit profile: ${id}`, ...files.filter((file) => fs.existsSync(file)).map((file) => fs.readFileSync(file, 'utf8').trim())];
  });
  return [...base, ...profiles].join('\n\n');
}

function compileSkillSource(repositoryRoot: string, profileIds: readonly string[]): { root: string; profiles: string[]; cleanup: () => void } {
  const profiles = normalizeProfiles(repositoryRoot, profileIds);
  if (profiles.length === 0) return { root: path.join(repositoryRoot, 'skills'), profiles, cleanup: () => undefined };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-profile-skills-'));
  const root = path.join(temp, 'skills');
  fs.mkdirSync(root, { recursive: true });
  const copySkills = (source: string): void => {
    if (!fs.existsSync(source)) return;
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const target = path.join(root, entry.name);
      if (fs.existsSync(target)) throw new Error(`profile skill conflicts with another selected skill: ${entry.name}`);
      fs.cpSync(path.join(source, entry.name), target, { recursive: true, force: false, errorOnExist: true });
    }
  };
  try {
    copySkills(path.join(repositoryRoot, 'skills'));
    for (const id of profiles) copySkills(path.join(repositoryRoot, 'profiles', id, 'skills'));
    return { root, profiles, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

/** Resolve the one skill projection surface declared by the native contract. */
function resolveNativeSkillRoot(host: HostId, detection: Detection): string | null {
  const contract = getNativeContract(host);
  const raw = contract?.paths.skillPath;
  if (!raw) return null;
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const resolved = expandNativePath(raw, detection.homeDir, userHome);
  const root = resolved.replace(/[\\/]?<skill>[\\/]?SKILL\.md$/i, '').replace(/[\\/]?<skill>$/i, '');
  return root && !root.includes('n/a') ? root : null;
}

export function getGitHead(): string {

  try {
    const res = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: process.cwd() });
    if (res.status === 0 && res.stdout.trim()) {
      return res.stdout.trim();
    }
  } catch {}
  try {
    const gitDir = path.join(process.cwd(), '.git');
    if (fs.existsSync(gitDir)) {
      const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
      if (!head.startsWith('ref:')) return head;
      const ref = head.slice(4).trim();
      const p = path.join(gitDir, ref);
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
      const packed = path.join(gitDir, 'packed-refs');
      if (fs.existsSync(packed)) {
        const lines = fs.readFileSync(packed, 'utf8').split('\n');
        for (const l of lines) {
          if (l.endsWith(' ' + ref)) return l.split(' ')[0];
        }
      }
    }
  } catch {}
  return 'unknown-head';
}

export function computeCandidateFingerprint(): string {
  const head = getGitHead();
  let trackedDiffHash = '0'.repeat(64);
  let stagedDiffHash = '0'.repeat(64);
  const untrackedHash = hashUntrackedCandidateFiles(process.cwd());
  try {
    const tracked = spawnSync('git', ['diff', 'HEAD'], { encoding: 'utf8', cwd: process.cwd() });
    if (tracked.status === 0) trackedDiffHash = sha256(tracked.stdout || '');
    const staged = spawnSync('git', ['diff', '--cached'], { encoding: 'utf8', cwd: process.cwd() });
    if (staged.status === 0) stagedDiffHash = sha256(staged.stdout || '');
  } catch {}

  let lockHash = '0'.repeat(64);
  const lockPath = path.join(process.cwd(), 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    try { lockHash = sha256(fs.readFileSync(lockPath)); } catch {}
  }

  let contractsHash = '0'.repeat(64);
  const contractsPath = path.join(findRepositoryRoot(), 'platforms', 'platform-contracts.json');
  if (fs.existsSync(contractsPath)) {
    try { contractsHash = sha256(fs.readFileSync(contractsPath)); } catch {}
  }

  let sourceHash = '0'.repeat(64);
  const rulesManifest = path.join(findRepositoryRoot(), 'rules', 'manifest.yaml');
  if (fs.existsSync(rulesManifest)) {
    try { sourceHash = sha256(fs.readFileSync(rulesManifest)); } catch {}
  }

  const payload = JSON.stringify({
    gitHead: head,
    trackedDiffHash,
    stagedDiffHash,
    untrackedHash,
    lockHash,
    contractsHash,
    sourceHash,
    verifierVersion: '2.0.0',
    environmentClass: `${process.platform}-${process.arch}`,
  });
  return sha256(payload);
}

export function acquireWorktreeWriterLease(host: HostId, stateRoot = resolveRuntimeStateRoot()): { release: () => void; leaseId: string } {
  const lockDir = path.join(stateRoot, 'tmp', 'locks');
  fs.mkdirSync(lockDir, { recursive: true });
  const lockFile = path.join(lockDir, 'worktree-writer.lock');
  const hostLockFile = path.join(lockDir, `${host}.lock`);
  const leaseId = randomUUID();
  const now = Date.now();
  const leasePayload = JSON.stringify({
    host,
    pid: process.pid,
    leaseId,
    timestamp: now,
    expiresAt: now + 60000,
  });

  let acquired = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(fd, leasePayload, 'utf8');
      fs.closeSync(fd);
      acquired = true;
      break;
    } catch (e: any) {
      if (e.code === 'EEXIST') {
        try {
          const raw = fs.readFileSync(lockFile, 'utf8');
          const data = JSON.parse(raw);
          if (Date.now() > (data.expiresAt || 0)) {
            try { fs.unlinkSync(lockFile); } catch {}
            continue;
          }
        } catch {
          throw new Error(`NEEDS_USER: active lock state is unreadable; refusing to remove it: ${lockFile}`);
        }
      }
    }
  }

  if (!acquired) {
    throw new Error(`Failed to acquire worktree writer lease for ${host}: locked by another process`);
  }

  try { fs.writeFileSync(hostLockFile, leaseId, 'utf8'); } catch {}

  return {
    leaseId,
    release: () => {
      try {
        if (fs.existsSync(lockFile)) {
          const raw = fs.readFileSync(lockFile, 'utf8');
          const data = JSON.parse(raw);
          if (data.leaseId === leaseId) fs.unlinkSync(lockFile);
        }
      } catch {}
      try {
        if (fs.existsSync(hostLockFile) && fs.readFileSync(hostLockFile, 'utf8') === leaseId) {
          fs.unlinkSync(hostLockFile);
        }
      } catch {}
    },
  };
}

export class NativeInstaller {
  private readonly probe = new NativeHostProbe();
  detect(host: HostId): Promise<Detection> { return this.probe.detect(host); }
  inventory(detection: Detection): Promise<InventoryEntry[]> { return this.probe.inventory(detection); }
  async planInstall(host: HostId, detection?: Detection, _inventory?: InventoryEntry[]): Promise<InstallPlan> {
    const d = detection ?? (await this.detect(host));
    return this.probe.planInstall(host, d);
  }

  async install(host: HostId, opts?: { dryRun?: boolean; enableMcp?: boolean; backupDir?: string; profiles?: string[] }): Promise<CertificationReceipt> {
    if (opts?.dryRun) {
      const detection = await this.detect(host);
      const inventory = await this.inventory(detection);
      await this.planInstall(host, detection, inventory);
      return this.certify(host, 'DRY_RUN', opts.profiles ?? []);
    }
    const repositoryRoot = findRepositoryRoot();
    const compiledSkills = compileSkillSource(repositoryRoot, opts?.profiles ?? []);
    const compiledRules = renderCanonicalRules(repositoryRoot, compiledSkills.profiles);
    const lease = acquireWorktreeWriterLease(host);
    let backupDir = opts?.backupDir ?? '';
    try {
      const detection = await this.detect(host);
      const inventory = await this.inventory(detection);
      const plan = await this.planInstall(host, detection, inventory);
      if (!backupDir) backupDir = plan.backupDir;
      prepareNativeBackupDirectory(backupDir, host);

      // The native coordinator owns the complete host projection. This helper
      // only copies skills and records ownership; it cannot mutate MCP config.
      const skillRoot = resolveNativeSkillRoot(host, detection);
      const skills = await projectSkillsToGlobal(compiledSkills.root, host as RuntimePlatform, {
        ...(skillRoot ? { targetRoots: [skillRoot] } : {}),
        rollbackRoot: backupDir,
      });
      if (skills.collisions.length > 0) {
        throw new Error(`native skill projection needs user resolution: ${skills.collisions.join(', ')}`);
      }

      if (host === 'deepseek-harness') {
        const receipt = await this.installDeepseekHarness(detection, backupDir, opts?.enableMcp === true, compiledRules, compiledSkills.root, compiledSkills.profiles);
        this.assertInstalledReadback(receipt);
        return receipt;
      }

      if (host === 'command-code') {
        captureCommandCodeBackup(detection.homeDir, backupDir);
        installCommandCodeMod(detection.homeDir, repositoryRoot, compiledRules);
        if (opts?.enableMcp === true) writeCommandCodeMcpConfig(detection.homeDir);
        sealCommandCodeBackup(backupDir);
        const receipt = await this.certify(host, 'INSTALLED', compiledSkills.profiles);
        this.assertInstalledReadback(receipt);
        return receipt;
      }

      const userHome = process.env.USERPROFILE || process.env.HOME || '';
      const nativeBackup: NativeBackupManifest = { schema: 'agent-rules/native-backup/v1', host, home: detection.homeDir, entries: [] };

      // Backup existing files
      for (const ch of plan.changes) {
        const src = expandNativePath(ch.path, detection.homeDir, userHome);
        if (fs.existsSync(src) && !src.includes('~/.agents/skills')) {
          try {
            const stat = fs.statSync(src);
            if (stat.isFile()) {
              const dst = path.join(backupDir, sha256(src).slice(0, 8) + '-' + path.basename(src));
              fs.copyFileSync(src, dst);
              nativeBackup.entries.push({ target: src, backupFile: path.basename(dst) });
            }
          } catch {}
        } else if (!src.includes('<skill>') && !src.includes('n/a')) {
          nativeBackup.entries.push({ target: src, backupFile: null });
        }
      }
      fs.writeFileSync(path.join(backupDir, '.native-backup.json'), `${JSON.stringify(nativeBackup, null, 2)}\n`, 'utf8');

      const contract = getNativeContract(host);
      if (contract) {
        const rawInstr = contract.paths.instructionPath;
        const instrPath = expandNativePath(rawInstr, detection.homeDir, userHome);
        // Every host's instruction surface is its OWN official native file or
        // directory (REQ-111); "activation managed" must not skip writing the
        // managed block for file-based surfaces (that would be claim-filling).
        const isNonFileInstruction = rawInstr.includes('bundle') || rawInstr.includes('mods') || rawInstr.includes('/rules') || rawInstr.endsWith('rules') || rawInstr.endsWith('rules/');

        const profileMarkers = compiledSkills.profiles.map((id) => `<!-- agent-rules:profile:${id} -->`).join('\n');
        const managed = `<!-- agent-rules:managed:${host} BEGIN (do not edit manually) -->\n# Agent Rules — ${host} native (global)\nThis self-contained static projection is owned by agent-rules and is bound to candidate ${computeCandidateFingerprint().slice(0, 12)}.\n${profileMarkers}\n\n${compiledRules}\n\nAt task intake, resolve explicit skill mentions and deterministic repository facts once through native skill discovery. If advanced routing is unavailable, continue with these base rules; never ask the user to run a router.\n<!-- agent-rules:managed:${host} END -->\n`;

        if ((host === 'grok' || host === 'cursor') && instrPath) {
          fs.mkdirSync(instrPath, { recursive: true });
          const target = path.join(instrPath, 'agent-rules.md');
          if (fs.existsSync(target)) {
            const existing = fs.readFileSync(target, 'utf8');
            if (!existing.includes(`agent-rules:managed:${host}`) && existing !== managed) {
              throw new Error(`Refusing to overwrite user-owned ${host} rule projection: ${target}`);
            }
          }
          fs.writeFileSync(target, managed, 'utf8');
        } else if (instrPath && !instrPath.includes('~/.agents') && !isNonFileInstruction) {
          let isDir = false;
          try { isDir = fs.existsSync(instrPath) && fs.statSync(instrPath).isDirectory(); } catch {}
          if (!isDir) {
            const dir = path.dirname(instrPath);
            fs.mkdirSync(dir, { recursive: true });
            let existing = '';
            try {
              if (fs.existsSync(instrPath) && fs.statSync(instrPath).isFile()) {
                existing = fs.readFileSync(instrPath, 'utf8');
              }
            } catch {}

            // A pre-v3 OpenCode projection imported an ephemeral worktree
            // runtime.  It is only safe to remove when it carries our exact
            // marker; leaving it first can make OpenCode load stale rules even
            // after the self-contained managed block below is refreshed.
            existing = existing.replace(/^# Managed by agent-rules\s*\r?\n@[^\r\n]*agent-rules-runtime[^\r\n]*\r?\n*/i, '');

            let next: string;
            const re = new RegExp(`<!-- agent-rules:managed:${host} BEGIN.*? END -->\\s*`, 'gs');
            if (re.test(existing)) next = existing.replace(re, managed);
            else next = existing.trimEnd() + '\n\n' + managed;

            const tmp = instrPath + '.tmp-' + randomUUID().slice(0, 6);
            fs.writeFileSync(tmp, next, 'utf8');
            fs.renameSync(tmp, instrPath);
          }
        }

        // The core projector never writes MCP config itself.  Setup invokes
        // the integration registration service as a separate, auditable step.
      }

      sealNativeBackupDirectory(backupDir);

      const receipt = await this.certify(host, 'INSTALLED', compiledSkills.profiles);
      this.assertInstalledReadback(receipt);
      return receipt;
    } catch (e) {
      if (backupDir && fs.existsSync(backupDir)) {
        if (fs.readdirSync(backupDir).length === 0) fs.rmSync(backupDir, { recursive: true, force: true });
        else {
          const restored = await this.rollback(host, backupDir, true);
          if (!restored.ok || !restored.byteEqual) {
            throw new Error(`${e instanceof Error ? e.message : String(e)}; native/skill rollback incomplete at ${backupDir}`);
          }
        }
      }
      throw e;
    } finally {
      lease.release();
      compiledSkills.cleanup();
    }
  }

  /** DSH uses native Cordis profiles, not the generic mcp.json projection. */
  private async installDeepseekHarness(detection: Detection, backupDir: string, enableMcp: boolean, compiledRules: string, skillSourceRoot: string, profiles: string[]): Promise<CertificationReceipt> {
    return installDeepseekHarnessNative(detection, backupDir, () => this.certify('deepseek-harness', 'INSTALLED', profiles), { enableMcp, compiledRules, skillSourceRoot });
  }

  private assertInstalledReadback(receipt: CertificationReceipt): void {
    if (receipt.claims.NATIVE_INSTALLED.status !== 'PASS' || receipt.claims.NATIVE_DISCOVERED.status !== 'PASS' || receipt.claims.NATIVE_SKILLS.status !== 'PASS') {
      throw new Error(`native install readback rejected ${receipt.host}: installed=${receipt.claims.NATIVE_INSTALLED.status}, discovered=${receipt.claims.NATIVE_DISCOVERED.status}, skills=${receipt.claims.NATIVE_SKILLS.status}`);
    }
  }

  async certify(host: HostId, mode: 'INSTALLED' | 'DRY_RUN' | 'READBACK' = 'READBACK', profiles: readonly string[] = []): Promise<CertificationReceipt> {
    const detection = await this.detect(host);
    const gitHead = getGitHead();
    const candidateFingerprint = computeCandidateFingerprint();
    const now = new Date().toISOString();
    const contract = getNativeContract(host);
    const userHome = process.env.USERPROFILE || process.env.HOME || '';
    const selectedProfiles = normalizeProfiles(findRepositoryRoot(), profiles);
    const readback = await this.readback(host);

    // Dynamic skill catalog count
    let skillCount = 36;
    try {
      const skillsDir = path.join(findRepositoryRoot(), 'skills');
      if (fs.existsSync(skillsDir)) {
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        const valid = entries.filter(e => e.isDirectory() && fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md')));
        if (valid.length > 0) skillCount = valid.length;
      }
    } catch {}

    const inv = await this.inventory(detection);
    const duplicateSkills = inv.filter(i => i.kind === 'duplicate');
    const malformedSkills = inv.filter(i => i.kind === 'malformed');

    // 1. HOST_PRESENT
    const hostPresentStatus = detection.present ? 'PASS' : 'UNSUPPORTED';

    // 2. NATIVE_INSTALLED
    let installedStatus: 'PASS' | 'FAIL' | 'UNSUPPORTED' = 'UNSUPPORTED';
    let installedDetail = 'host not present';
    if (detection.present) {
      if (host === 'deepseek-harness') {
        const dsh = inspectDshNativeReadback(detection);
        installedStatus = dsh.nativeFilesPresent ? 'PASS' : 'FAIL';
        installedDetail = dsh.nativeFilesPresent
          ? dsh.dumpUnavailableReason
            ? `DSH static AGENTS.md and skill parity verified; enhanced dump-config readback is unavailable in the current sandbox`
            : `DSH AGENTS.md, native skill file parity ${dsh.skillParity.count}/${dsh.skillParity.expected}, Cordis rows and dump-config readback verified`
          : 'DSH native AGENTS.md/skills/profile rows or dump-config readback are incomplete';
      } else if (host === 'command-code') {
        const native = readCommandCodeNative(detection.homeDir);
        installedStatus = native.modStatic ? 'PASS' : 'FAIL';
        installedDetail = native.modStatic
          ? `self-contained static mod verified at ${native.modPath}`
          : `static managed mod missing or contains a runtime callback at ${native.modPath}`;
      } else if (contract) {
        const instrPath = expandNativePath(contract.paths.instructionPath, detection.homeDir, userHome);
        if (fs.existsSync(instrPath)) {
          let stat: fs.Stats | null = null;
          try { stat = fs.statSync(instrPath); } catch {}
          if (stat?.isFile()) {
            const content = fs.readFileSync(instrPath, 'utf8');
            if (content.includes(`agent-rules:managed:${host}`) || content.includes('agent-rules')) {
              installedStatus = 'PASS';
              installedDetail = `managed block verified in ${path.basename(instrPath)}`;
            } else {
              installedStatus = 'FAIL';
              installedDetail = `managed block not found in ${path.basename(instrPath)}`;
            }
          } else if (stat?.isDirectory()) {
            installedStatus = readback.ok ? 'PASS' : 'FAIL';
            installedDetail = readback.ok ? `native rules directory read back at ${path.basename(instrPath)}` : `native rules directory exists but readback failed: ${readback.detail ?? 'unknown reason'}`;
          } else {
            installedStatus = readback.ok ? 'PASS' : 'FAIL';
            installedDetail = readback.ok ? `native surface read back for ${host}` : `native surface readback failed: ${readback.detail ?? 'unknown reason'}`;
          }
        } else {
          installedStatus = 'FAIL';
          installedDetail = `native instruction surface missing: ${instrPath}`;
        }
      }

    }

    // 5. NATIVE_POLICY proves that the canonical policy projection is present.
    // It is not a positive/negative permission or sandbox canary.
    let policyStatus: 'PASS' | 'FAIL' | 'UNSUPPORTED' = 'UNSUPPORTED';
    let policyDetail = 'host not present';
    if (detection.present) {
      if (installedStatus === 'PASS') {
        policyStatus = 'PASS';
        policyDetail = `canonical agent-rules policy projection verified in the effective host instruction surface for ${host}; live permission and sandbox behavior were not exercised`;
      } else {
        policyStatus = 'FAIL';
        policyDetail = `effective host instruction surface missing canonical policy projection for ${host}`;
      }
    }
    // 6. NATIVE_SKILLS
    const skillPath = contract ? expandNativePath(contract.paths.skillPath, detection.homeDir, userHome) : '';
    const skillRoot = skillPath.replace(/[\\/]?<skill>[\\/]?SKILL\.md$/i, '').replace(/[\\/]?<skill>$/i, '');
    const hostSkills = fs.existsSync(skillRoot)
      ? fs.readdirSync(skillRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillRoot, entry.name, 'SKILL.md'))).length
      : 0;
    let skillsStatus: 'PASS' | 'FAIL' = hostSkills > 0 ? 'PASS' : 'FAIL';
    let skillsDetail = hostSkills > 0 ? `native skill readback ${hostSkills} at ${skillRoot}` : `native skill readback found no SKILL.md under ${skillRoot || '<no native skill path>'}`;
    if (duplicateSkills.length > 0) {
      skillsStatus = 'FAIL';
      skillsDetail = `duplicate skills discovered: ${duplicateSkills.map(d => d.path).join(', ')}`;
    } else if (malformedSkills.length > 0) {
      skillsStatus = 'FAIL';
      skillsDetail = `malformed skills discovered: ${malformedSkills.map(d => d.path).join(', ')}`;
    } else if (host === 'deepseek-harness' && detection.present) {
      const parity = dshSkillParity(detection.homeDir);
      if (!parity.ok) {
        skillsStatus = 'FAIL';
        skillsDetail = `DSH native skill hash parity incomplete: ${parity.count}/${parity.expected}`;
      } else {
        skillsDetail = `enumerated ${skillCount} dynamic skills; DSH native hash parity ${parity.sha256}`;
      }
    } else if (host === 'command-code' && detection.present) {
      const parity = commandCodeSkillParity(userHome, findRepositoryRoot());
      if (!parity.ok) {
        skillsStatus = 'FAIL';
        skillsDetail = `Command Code shared skill hash parity incomplete: ${parity.count}/${parity.expected}`;
      } else {
        skillsDetail = `Command Code shared skill hash parity ${parity.sha256}`;
      }
    }

    if (detection.present && selectedProfiles.length > 0) {
      let instructionFile = host === 'command-code'
        ? readCommandCodeNative(detection.homeDir).modPath
        : host === 'deepseek-harness'
          ? path.join(detection.homeDir, 'AGENTS.md')
          : contract ? expandNativePath(contract.paths.instructionPath, detection.homeDir, userHome) : '';
      if (instructionFile && fs.existsSync(instructionFile) && fs.statSync(instructionFile).isDirectory()) instructionFile = path.join(instructionFile, 'agent-rules.md');
      const instructionBody = instructionFile && fs.existsSync(instructionFile) && fs.statSync(instructionFile).isFile() ? fs.readFileSync(instructionFile, 'utf8') : '';
      const missingRules = selectedProfiles.filter((id) => !instructionBody.includes(`Explicit profile: ${id}`) && !instructionBody.includes(`agent-rules:profile:${id}`));
      const missingSkills = selectedProfiles.flatMap((id) => {
        const source = path.join(findRepositoryRoot(), 'profiles', id, 'skills');
        if (!fs.existsSync(source)) return [];
        return fs.readdirSync(source, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !fs.existsSync(path.join(skillRoot, entry.name, 'SKILL.md'))).map((entry) => `${id}:${entry.name}`);
      });
      if (missingRules.length > 0) {
        installedStatus = 'FAIL';
        installedDetail = `selected profile rules missing from native instructions: ${missingRules.join(', ')}`;
      }
      if (missingSkills.length > 0) {
        skillsStatus = 'FAIL';
        skillsDetail = `selected profile skills missing: ${missingSkills.join(', ')}`;
      } else if (skillsStatus === 'PASS') {
        skillsDetail = `${skillsDetail}; selected profiles: ${selectedProfiles.join(', ')}`;
      }
    }

    // 7. NATIVE_MCP
    let mcpStatus: 'PASS' | 'FAIL' | 'NEEDS_USER' | 'UNSUPPORTED' = 'UNSUPPORTED';
    let mcpDetail = 'native MCP registration is inspected by the setup coordinator';
    let mcpOmission: string | null = 'registration/tool visibility is a separate native-host observation';
    if (host === 'deepseek-harness' && detection.present) {
      const dsh = inspectDshNativeReadback(detection);
      mcpStatus = dsh.nativeMcp ? 'PASS' : dsh.dumpUnavailableReason ? 'NEEDS_USER' : 'UNSUPPORTED';
      mcpDetail = dsh.nativeMcp ? `Cordis MCP rows for ${dsh.profiles.length} discovered profiles verified by dump-config` : dsh.dumpUnavailableReason ? 'DSH dump-config is unavailable because the host could not write its cache in the current sandbox' : 'no native Cordis registration observed';
      mcpOmission = dsh.nativeMcp ? null : dsh.dumpUnavailableReason ? 'rerun doctor where DSH may write its native cache' : 'generic DSH mcp.json is not native proof';
    } else if (host === 'command-code' && detection.present) {
      const native = readCommandCodeNative(detection.homeDir);
      if (!native.mcpPresent) {
        mcpStatus = 'UNSUPPORTED';
        mcpDetail = `no native Command Code MCP registration at ${native.mcpPath}`;
        mcpOmission = 'setup did not register the standard MCPs';
      } else if (!native.mcpValid) {
        mcpStatus = 'FAIL';
        mcpDetail = `Command Code MCP config is invalid at ${native.mcpPath}`;
        mcpOmission = 'native mcp config is invalid';
      } else if (!native.mcpComplete) {
        mcpStatus = 'FAIL';
        mcpDetail = `Command Code MCP config is missing one or more managed servers: ${native.expectedMcpServerNames.join(', ')}`;
        mcpOmission = 'managed native MCP server readback incomplete';
      } else {
        mcpStatus = 'PASS';
        mcpDetail = `Command Code MCP servers verified in ${native.mcpPath}: ${native.mcpServerNames.join(', ')}`;
      }
    } else if (contract) {
      const rawMcp = contract.paths.mcpPath;
      if (rawMcp.includes('n/a') || rawMcp.includes('managed_profile') || !detection.present) {
        mcpStatus = 'UNSUPPORTED';
        mcpDetail = 'host has no official native mcp surface';
        mcpOmission = 'no native mcp surface';
      } else {
        const registration = await inspectHostMcpRegistration(findRepositoryRoot(), host);
        if (registration.status === 'REGISTERED') {
          mcpStatus = 'PASS';
          mcpDetail = `native MCP registration read back from ${registration.configPath ?? 'host-native lifecycle'}`;
          mcpOmission = 'native config registration does not by itself prove a model tool call';
        } else if (registration.status === 'NO_ADAPTER') {
          mcpStatus = 'UNSUPPORTED';
          mcpDetail = 'host has no native registration adapter';
          mcpOmission = 'no host registration adapter';
        } else if (registration.status === 'NEEDS_USER') {
          mcpStatus = 'NEEDS_USER';
          mcpDetail = registration.entries.map((entry) => `${entry.id}: ${entry.detail}`).join(', ') || 'native MCP registration needs an external dependency or user decision';
          mcpOmission = 'registration is intentionally incomplete until the reported dependency or user decision is resolved';
        } else {
          mcpStatus = 'FAIL';
          mcpDetail = registration.entries.map((entry) => `${entry.id}: ${entry.status}`).join(', ') || `native MCP registration ${registration.status.toLowerCase()}`;
          mcpOmission = 'a required native MCP registration is missing, disabled, invalid, or user-modified';
        }
      }
    }

    // 8. MODEL_BEHAVIOR (always NEEDS_USER when offline / no live canary turn)
    let modelBehaviorStatus: 'PASS' | 'NEEDS_USER' = 'NEEDS_USER';
    const modelBehaviorDetail = 'host signed out or offline; harmless model turn requires active authenticated session';
    const modelBehaviorOmission = 'signed-out: model turn requires auth';

    // 9. ROLLBACK_VERIFIED
    const rollbackStatus: 'UNSUPPORTED' = 'UNSUPPORTED';
    const rollbackDetail = detection.present ? 'rollback is only PASS after an executed restore and byte comparison' : 'host not present';

    const claims: CertificationReceipt['claims'] = {
      HOST_PRESENT: { status: hostPresentStatus, evidence: [{ kind: 'binary-or-desktop-signal', detail: detection.signals.join(';') }], omitted_reason: null },
      NATIVE_INSTALLED: {
        status: installedStatus,
        evidence: [{ kind: 'managed-block-or-file', host, detail: installedDetail }, { kind: 'native-readback', found: readback.found, method: readback.method, detail: readback.detail ?? 'readback not applicable for activation-managed surface' }],
        omitted_reason: null,
      },
      NATIVE_DISCOVERED: {
        // Host surface discovery is grounded in real detection signals
        // (binary/desktop/config-dir), never a contract string pass-through.
        status: detection.present ? 'PASS' : 'UNSUPPORTED',
        evidence: [{ kind: 'host-surface-detected', host, signals: detection.signals, binaryPath: detection.binaryPath ?? null, homeDir: detection.homeDir }],
        omitted_reason: null,
      },
      NATIVE_POLICY: { status: policyStatus, evidence: [{ kind: 'canonical-policy-projection', host, detail: policyDetail }], omitted_reason: policyStatus === 'PASS' ? 'live permission and sandbox canaries are reported separately by doctor' : null },
      NATIVE_SKILLS: { status: skillsStatus, evidence: [{ kind: 'skill-catalog-dynamic', host, count: skillCount, detail: skillsDetail }], omitted_reason: null },
      NATIVE_MCP: { status: mcpStatus, evidence: [{ kind: 'native-mcp-surface', host, detail: mcpDetail }], omitted_reason: mcpOmission },
      MODEL_BEHAVIOR: { status: modelBehaviorStatus, evidence: [{ kind: 'model-turn-not-tested', reason: modelBehaviorDetail }], omitted_reason: modelBehaviorOmission },
      ROLLBACK_VERIFIED: { status: rollbackStatus, evidence: [{ kind: 'uninstall-rollback-preserves-user', host, detail: rollbackDetail }], omitted_reason: rollbackDetail },
    };

    // Static usability requires only native instructions, skills and policy
    // readback. Optional MCP or absent lifecycle surfaces never block core.
    const usableClaims = ['HOST_PRESENT', 'NATIVE_INSTALLED', 'NATIVE_DISCOVERED', 'NATIVE_SKILLS', 'NATIVE_POLICY'];
    const usable = usableClaims.every(k => claims[k].status === 'PASS');
    const status: CertificationReceipt['status'] = !detection.present ? 'Unsupported' : usable ? 'Ready' : 'Needs action';

    const axes: CertificationReceipt['axes'] = {
      infrastructure: {
        status: (installedStatus === 'PASS' && hostPresentStatus === 'PASS' && skillsStatus === 'PASS') ? 'PASS' : hostPresentStatus === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'FAIL',
        present: detection.present,
        installed: installedStatus === 'PASS',
        catalog_valid: skillsStatus === 'PASS',
        mcp_registered: mcpStatus === 'PASS',
      },
      routing: {
        status: usable ? 'PASS' : detection.present ? 'FAIL' : 'UNSUPPORTED',
        mode: detection.present ? 'STATIC_NATIVE' : 'UNSUPPORTED',
        intake: detection.present ? 'MODEL_MEDIATED' : 'NOT_APPLICABLE',
        policy_effective: claims.NATIVE_POLICY.status === 'PASS',
      },
      behavior: {
        status: modelBehaviorStatus,
        model_turn_verified: false,
        mcp_observed_effect: false,
      },
    };

    const authorityTier: CertificationReceipt['authority_tier'] = !detection.present
      ? 'UNAVAILABLE'
      : axes.infrastructure.status === 'PASS'
        ? 'NATIVE_ADVISORY'
        : 'UNAVAILABLE';

    const receipt: CertificationReceipt = {
      schema: 'agent-rules/host-certification-receipt',
      version: 1,
      host,
      generated_at: now,
      git_head: gitHead,
      candidate_fingerprint: candidateFingerprint,
      status,
      authority_tier: authorityTier,
      usable,
      claims,
      axes,
      native_readback: { method: contract?.readbackStrategy, present: detection.present, verified: readback.ok, found: readback.found, detail: readback.detail ?? null },
      mcp_handshake: { status: mcpStatus === 'PASS' ? 'NATIVE_SURFACE_INTACT' : mcpStatus === 'FAIL' ? 'NATIVE_SURFACE_FAILED' : mcpStatus === 'NEEDS_USER' ? 'NEEDS_USER' : 'UNSUPPORTED', host, detail: mcpDetail },
      skill_catalog: { count: skillCount, skipped: 0, duplicates: duplicateSkills.length },
    };

    if (mode !== 'DRY_RUN') {
      writeCurrentOperationalState(path.join('hosts', `${host}.json`), receipt);
    }

    return receipt;
  }

  /**
   * reload — host-native reload mechanism (REQ-111). Returns the contract's
   * native reload method; the reload claim is only usable when the host reads
   * rules/skills again after reload/new session.
   */
  async reload(host: HostId): Promise<{ ok: boolean; method: string; evidence: unknown[] }> {
    const contract = getNativeContract(host);
    const method = contract?.reload ?? 'host-reload';
    const detection = await this.detect(host);
    return {
      // Naming a restart mechanism is not the same as making the host reload.
      // Desktop reload is an owner-visible action unless the adapter actually
      // invokes and observes it.
      ok: false,
      method,
      evidence: [
        { kind: 'native-reload-mechanism-declared', host, method, present: detection.present, contractReload: contract?.reload ?? null },
      ],
    };
  }

  /**
   * readback — real native readback of the installed managed surface
   * (REQ-111). Reads the actual instruction config file the host consumes and
   * reports whether the managed block is present plus its byte hash. Never
   * fabricated from contract strings.
   */
  async readback(host: HostId): Promise<{ ok: boolean; method: string; found: boolean; sha256?: string; detail?: string }> {
    const contract = getNativeContract(host);
    if (!contract) return { ok: false, method: 'none', found: false, detail: 'no native contract' };
    const detection = await this.detect(host);
    const userHome = process.env.USERPROFILE || process.env.HOME || '';
    const rawInstr = contract.paths.instructionPath;
    let instrPath = expandNativePath(rawInstr, detection.homeDir, userHome);
    instrPath = instrPath.replace(/\.grok[\\/]\.grok/, '.grok');
    if (host === 'deepseek-harness') {
      const dsh = inspectDshNativeReadback(detection);
      return { ok: dsh.nativeFilesPresent, method: 'DSH native AGENTS.md + skills + Cordis profile dump-config readback', found: dsh.nativeFilesPresent, sha256: dsh.sha256, detail: dsh.nativeFilesPresent ? 'DSH native AGENTS.md, skill hashes and profile rows present' : 'DSH native AGENTS.md/skills/profile rows or dump-config readback missing' };
    }
    if (host === 'command-code') {
      const native = readCommandCodeNative(detection.homeDir);
      const body = native.modPresent ? fs.readFileSync(native.modPath) : '';
      return {
        ok: native.modManaged,
        method: 'cmdc mods readback + shared skill projection',
        found: native.modPresent,
        sha256: body ? sha256(body) : undefined,
        detail: native.modManaged ? `managed mod present at ${native.modPath}` : `managed mod missing or unmanaged at ${native.modPath}`,
      };
    }
    const isNonFileInstruction = rawInstr.includes('bundle') || rawInstr.includes('mods') || rawInstr.includes('/rules') || rawInstr.endsWith('rules') || rawInstr.endsWith('rules/');
    if (isNonFileInstruction) {
      // Host uses a projected directory/native surface; fall back to listing the
      // managed paths for real existence evidence.
      const projected = instrPath;
      const found = fs.existsSync(projected);
      if (!found) return { ok: false, method: contract.readbackStrategy ?? 'native', found: false, detail: `projected path missing: ${projected}` };
      let sha256Hex: string | undefined;
      try {
        if (fs.statSync(projected).isDirectory()) {
          const files = fs.readdirSync(projected).filter((f) => f.endsWith('.md') || f.endsWith('.toml') || f.endsWith('.json')).sort();
          const managedFiles = files.filter((file) => {
            try { return fs.readFileSync(path.join(projected, file), 'utf8').includes(`agent-rules:managed:${host}`); } catch { return false; }
          });
          if (managedFiles.length) sha256Hex = sha256(managedFiles.map((f) => `${f}:${sha256(fs.readFileSync(path.join(projected, f)))}`).join('|'));
          if (managedFiles.length === 0) return { ok: false, method: contract.readbackStrategy ?? 'native-projection', found: false, detail: `no managed ${host} projection in ${projected}` };
        } else {
          sha256Hex = sha256(fs.readFileSync(projected));
        }
      } catch { /* hash best-effort */ }
      return { ok: true, method: contract.readbackStrategy ?? 'native-projection', found: true, ...(sha256Hex ? { sha256: sha256Hex } : {}), detail: `projected surface present at ${projected}` };
    }
    if (!fs.existsSync(instrPath)) return { ok: false, method: contract.readbackStrategy ?? 'native', found: false, detail: `instruction path missing: ${instrPath}` };
    let body = '';
    try { body = fs.readFileSync(instrPath, 'utf8'); } catch (error) {
      return { ok: false, method: contract.readbackStrategy ?? 'native', found: false, detail: `cannot read ${instrPath}: ${error instanceof Error ? error.message : String(error)}` };
    }
    const managed = new RegExp(`<!-- agent-rules:managed:${host} BEGIN`, 's').test(body);
    return {
      ok: managed,
      method: contract.readbackStrategy ?? 'managed-block',
      found: managed,
      sha256: sha256(body),
      detail: managed ? `managed block present in ${path.basename(instrPath)}` : `managed block absent in ${path.basename(instrPath)}`,
    };
  }

  /**
   * offlineCanary — credential-free offline verification (claims 1–7+9,
   * REQ-111/REQ-2). Never opens login flows and never requires credentials.
   */
  async offlineCanary(host: HostId): Promise<{ ok: boolean; claims: Record<string, { status: string; evidence: unknown[] }> }> {
    const receipt = await this.certify(host, 'DRY_RUN');
    const claims = Object.fromEntries(
      Object.entries(receipt.claims)
        .filter(([name]) => name !== 'MODEL_BEHAVIOR')
        .map(([name, claim]) => [name, { status: claim.status, evidence: claim.evidence }]),
    );
    const coreClaims = ['HOST_PRESENT', 'NATIVE_INSTALLED', 'NATIVE_DISCOVERED', 'NATIVE_POLICY', 'NATIVE_SKILLS'];
    const ok = coreClaims.every((name) => claims[name]?.status === 'PASS' || claims[name]?.status === 'UNSUPPORTED');
    return { ok, claims };
  }

  /**
   * authenticatedCanary — model-turn live canary for logged-in hosts
   * (REQ-111 auth boundary). Detects an existing authenticated session without
   * reading credentials and binds a real host-generated model-turn event to a
   * nonce when one exists. Never opens login flows and never fabricates PASS.
   *
   * - MODEL_BEHAVIOR=PASS requires a host-generated model-turn event whose
   *   script hash matches the installed gate and whose nonce we can verify.
   * - A live logged-in session WITHOUT a bound turn is recorded honestly as a
   *   live session observation; MEMORY of the model-turn claim stays with the
   *   acceptance audit, never invented here.
   */
  async authenticatedCanary(host: HostId): Promise<{ ok: boolean; modelBehavior: 'PASS' | 'NEEDS_USER' | 'BLOCKED'; evidence: unknown[] }> {
    const receipt = await this.certify(host, 'READBACK');
    const model = receipt.claims.MODEL_BEHAVIOR;
    const evidence = [...model.evidence];
    // Hosts with a live host-generated session event may carry a real model
    // turn receipt; otherwise the safe default is NEEDS_USER (never fabricated
    // PASS). No login flow, no credential read, no token capture.
    const hintedEvidence = process.env[`AGENT_RULES_${host.toUpperCase().replace(/-/g, '_')}_MODEL_TURN_EVIDENCE`];
    if (hintedEvidence) evidence.push({ kind: 'unverified-model-turn-hint', host });
    evidence.push({ kind: 'model-turn-requires-authenticated-session', reason: 'a local environment value is not a host-generated nonce-bound turn; observe it in the host UI' });
    return { ok: false, modelBehavior: 'NEEDS_USER', evidence };
  }

  async rollback(host: HostId, backupDir?: string, allowUnsealed = false): Promise<{ ok: boolean; byteEqual: boolean }> {
    if (!backupDir || !fs.existsSync(backupDir)) return { ok: false, byteEqual: false };
    const detection = await this.detect(host);
    let byteEqual = true;
    let restoredAny = false;

    if (host === 'deepseek-harness' && fs.existsSync(path.join(backupDir, '.dsh-backup.json'))) {
      restoredAny = true;
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, '.dsh-backup.json'), 'utf8')) as { home?: string; plugin_install_started?: boolean; entries?: DshBackupEntry[] };
        if (!manifest.home || path.resolve(manifest.home) !== path.resolve(detection.homeDir) || !Array.isArray(manifest.entries)) throw new Error('DSH rollback manifest is not bound to the detected DSH_HOME');
        const before = new Map<string, Buffer | null>();
        const beforeModes = new Map<string, number | null>();
        for (const entry of manifest.entries) {
          const destination = path.resolve(manifest.home, entry.relativePath);
          if (!destination.startsWith(path.resolve(manifest.home) + path.sep)) throw new Error(`DSH rollback path escapes DSH_HOME: ${entry.relativePath}`);
          const currentSha256 = fs.existsSync(destination) && fs.statSync(destination).isFile() ? sha256(fs.readFileSync(destination)) : null;
          if ((!allowUnsealed && entry.appliedSha256 === undefined) || (entry.appliedSha256 !== undefined && currentSha256 !== entry.appliedSha256)) throw new Error(`DSH file changed after installation: ${destination}`);
          before.set(destination, entry.backupFile ? fs.readFileSync(path.join(backupDir, entry.backupFile)) : null);
          beforeModes.set(destination, entry.mode ?? null);
        }
        const profiles = discoverDshProfiles(manifest.home);
        await restoreDshNative(before, manifest.home, profiles, manifest.plugin_install_started ? detection.binaryPath : undefined, undefined, beforeModes);
        for (const [file, expected] of before) {
          const actual = fs.existsSync(file) ? fs.readFileSync(file) : null;
          if (expected === null ? actual !== null : actual === null || !expected.equals(actual)) byteEqual = false;
          const expectedMode = beforeModes.get(file);
          if (expected !== null && expectedMode !== null && expectedMode !== undefined && (!fs.existsSync(file) || (fs.statSync(file).mode & 0o7777) !== expectedMode)) byteEqual = false;
        }
      } catch {
        byteEqual = false;
      }
    } else if (host === 'command-code' && fs.existsSync(path.join(backupDir, '.command-code-backup.json'))) {
      restoredAny = true;
      try {
        byteEqual = restoreCommandCodeBackup(backupDir, allowUnsealed) && verifyCommandCodeBackup(backupDir);
      } catch {
        byteEqual = false;
      }
    } else {
      const native = restoreNativeBackupDirectory(backupDir, host, detection.homeDir, allowUnsealed);
      if (native !== null) {
        restoredAny = true;
        byteEqual = native && byteEqual;
      }
    }

    if (fs.existsSync(path.join(backupDir, '.skill-projection-backup.json'))) {
      restoredAny = true;
      try {
        byteEqual = await restoreSkillProjectionBackup(backupDir) && byteEqual;
      } catch {
        byteEqual = false;
      }
    }
    byteEqual = restoredAny && byteEqual;

    const receipt = await this.certify(host);
    receipt.claims.ROLLBACK_VERIFIED = {
      status: byteEqual ? 'PASS' : 'FAIL',
      evidence: [{ kind: 'rollback-restored-byte-equal', backupDir, byteEqual }],
      omitted_reason: null,
    };
    writeCurrentOperationalState(path.join('hosts', `${host}.json`), receipt);
    if (byteEqual) fs.rmSync(backupDir, { recursive: true, force: true });
    return { ok: byteEqual, byteEqual };
  }

  async uninstall(host: HostId): Promise<void> {
    const lease = acquireWorktreeWriterLease(host);
    const userHome = process.env.USERPROFILE || process.env.HOME || '';
    try {
      const detection = await this.detect(host);
      const contract = getNativeContract(host);
      if (!contract) return;

      if (host === 'command-code') {
        removeManagedCommandCodeMod(detection.homeDir);
        removeManagedCommandCodeMcp(detection.homeDir);
        const receipt = await this.certify(host);
        receipt.status = detection.present ? 'Needs action' : 'Unsupported';
        writeCurrentOperationalState(path.join('hosts', `${host}.json`), receipt);
        await uninstallOwnedGlobalProjections(host as RuntimePlatform);
        return;
      }

      if (host === 'deepseek-harness') {
        removeDshNativeProjection(detection);
        const receipt = await this.certify(host);
        receipt.status = detection.present ? 'Needs action' : 'Unsupported';
        writeCurrentOperationalState(path.join('hosts', `${host}.json`), receipt);
        await uninstallOwnedGlobalProjections(host as RuntimePlatform);
        return;
      }

      cleanupHostRuntimeCallbacks(host, detection.homeDir);

      const instrPath = expandNativePath(contract.paths.instructionPath, detection.homeDir, userHome);
      if (instrPath && fs.existsSync(instrPath) && !instrPath.includes('~/.agents')) {
        let isFile = false;
        try { isFile = fs.statSync(instrPath).isFile(); } catch {}
        if (isFile) {
          let body = fs.readFileSync(instrPath, 'utf8');
          const re = new RegExp(`<!-- agent-rules:managed:${host} BEGIN.*? END -->\\s*`, 'gs');
          if (re.test(body)) {
            body = body.replace(re, '').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
            const tmp = instrPath + '.tmp-' + randomUUID().slice(0, 6);
            fs.writeFileSync(tmp, body, 'utf8');
            fs.renameSync(tmp, instrPath);
          }
        }
      }

      const mcpPath = expandNativePath(contract.paths.mcpPath, detection.homeDir, userHome);
      if (mcpPath && fs.existsSync(mcpPath)) {
        if (mcpPath.includes('.json')) {
          try {
            const j = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
            if (j.mcpServers && j.mcpServers['agent-rules-mcp-bridge'] && j.mcpServers['agent-rules-mcp-bridge']._owner === 'agent-rules') {
              delete j.mcpServers['agent-rules-mcp-bridge'];
              fs.writeFileSync(mcpPath, JSON.stringify(j, null, 2) + '\n', 'utf8');
            }
          } catch {}
        } else if (mcpPath.includes('.toml')) {
          try {
            let body = fs.readFileSync(mcpPath, 'utf8');
            if (body.includes('agent-rules-mcp-bridge')) {
              body = body.replace(/\n\[mcp_servers\.agent-rules-mcp-bridge\][\s\S]*?(?=\n\[|$)/, '');
              fs.writeFileSync(mcpPath, body, 'utf8');
            }
          } catch {}
        }
      }

      const receipt = await this.certify(host);
      receipt.status = detection.present ? 'Needs action' : 'Unsupported';
      writeCurrentOperationalState(path.join('hosts', `${host}.json`), receipt);
      await uninstallOwnedGlobalProjections(host as RuntimePlatform);
    } finally {
      lease.release();
    }
  }
}
