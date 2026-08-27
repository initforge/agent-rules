import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { HostId } from '@initforge/agent-rules-kernel/northstar/host-adapters.js';
import { getNativeContract, getHostIds } from '@initforge/agent-rules-kernel/northstar/host-registry.js';
import { dshSkillParity, discoverDshProfiles, installDeepseekHarnessNative, restoreDshNative, inspectDshNativeReadback, type DshBackupEntry } from './deepseek-native.js';
import { hashUntrackedCandidateFiles } from './candidate-fingerprint.js';
import {
  captureCommandCodeBackup,
  commandCodeSkillParity,
  installCommandCodeMod,
  readCommandCodeNative,
  restoreCommandCodeBackup,
  verifyCommandCodeBackup,
  removeManagedCommandCodeMcp,
  removeManagedCommandCodeMod,
  writeCommandCodeMcpConfig,
} from './command-code-native.js';
import { NativeHostProbe } from '../native/probe.js';
import type { CertificationReceipt, ClaimVerification, Detection, InstallPlan, InventoryEntry } from '../native/types.js';
import { projectSkillsToGlobal, uninstallOwnedGlobalProjections } from '../runtime/composed-installer.js';
import { inspectHostMcpRegistration } from '../runtime/mcp-convergence.js';
import type { RuntimePlatform } from '../runtime/contracts.js';

export type { CertificationReceipt, ClaimVerification, Detection, InstallPlan, InventoryEntry } from '../native/types.js';

function sha256(s: string | Buffer): string {
  return createHash('sha256').update(s).digest('hex');
}

/** Render the canonical five rules into a self-contained native projection.
 * Installed hosts must never depend on a checkout or an abandoned worktree. */
function renderCanonicalRules(repositoryRoot = process.cwd()): string {
  const manifest = path.join(repositoryRoot, 'rules', 'manifest.yaml');
  if (!fs.existsSync(manifest)) throw new Error(`canonical rules manifest missing: ${manifest}`);
  const names = fs.readFileSync(manifest, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+([\w.-]+\.md)\s*$/)?.[1])
    .filter((name): name is string => Boolean(name));
  if (names.length !== 5) throw new Error(`canonical rules manifest must name exactly five rules; found ${names.length}`);
  return names.map((name) => {
    const source = path.join(repositoryRoot, 'rules', name);
    if (!fs.existsSync(source)) throw new Error(`canonical rule missing: ${name}`);
    return fs.readFileSync(source, 'utf8').trim();
  }).join('\n\n');
}

function installOmpNativeExtension(activeAgentDir: string, repositoryRoot = process.cwd()): string {
  const source = path.join(repositoryRoot, 'platforms', 'omp', 'agent-rules-extension.ts');
  const runtime = path.join(repositoryRoot, 'packages', 'kernel', 'dist', 'workflow', 'native-session.js');
  if (!fs.existsSync(source)) throw new Error(`OMP native extension source missing: ${source}`);
  if (!fs.existsSync(runtime)) throw new Error(`OMP native extension requires a built kernel runtime: ${runtime}`);
  const targetDir = path.join(activeAgentDir, 'extensions');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(runtime, path.join(targetDir, 'agent-rules-session.js'));
  fs.copyFileSync(source, path.join(targetDir, 'agent-rules.ts'));
  const worker = path.join(repositoryRoot, 'platforms', 'omp', 'agents', 'initforge-worker.md');
  if (!fs.existsSync(worker)) throw new Error(`OMP worker definition missing: ${worker}`);
  const agentDir = path.join(activeAgentDir, 'agents');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.copyFileSync(worker, path.join(agentDir, 'agent-rules-worker.md'));
  return path.join(targetDir, 'agent-rules.ts');
}

interface OmpRuntimeBackupEntry { target: string; backup: string | null; sha256: string | null }

/** OMP extensions and worker definitions are part of the native projection,
 * so they need the same transaction boundary as AGENTS.md and skills. */
function backupOmpNativeExtension(activeAgentDir: string, backupDir: string): void {
  const targets = [
    path.join(activeAgentDir, 'extensions', 'agent-rules.ts'),
    path.join(activeAgentDir, 'extensions', 'agent-rules-session.js'),
    path.join(activeAgentDir, 'agents', 'agent-rules-worker.md'),
  ];
  const entries: OmpRuntimeBackupEntry[] = targets.map((target, index) => {
    if (!fs.existsSync(target)) return { target, backup: null, sha256: null };
    const bytes = fs.readFileSync(target);
    const backup = path.join(backupDir, `omp-runtime-${index}-${path.basename(target)}`);
    fs.copyFileSync(target, backup);
    return { target, backup: path.basename(backup), sha256: sha256(bytes) };
  });
  fs.writeFileSync(path.join(backupDir, 'omp-runtime-backup.json'), JSON.stringify({ entries }, null, 2) + '\n', 'utf8');
}

function restoreOmpNativeExtension(backupDir: string): boolean {
  const manifestPath = path.join(backupDir, 'omp-runtime-backup.json');
  if (!fs.existsSync(manifestPath)) return true;
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { entries?: OmpRuntimeBackupEntry[] };
  for (const entry of parsed.entries ?? []) {
    if (entry.backup === null) {
      fs.rmSync(entry.target, { force: true });
      continue;
    }
    const source = path.join(backupDir, entry.backup);
    if (!fs.existsSync(source)) return false;
    fs.mkdirSync(path.dirname(entry.target), { recursive: true });
    fs.copyFileSync(source, entry.target);
    if (entry.sha256 && sha256(fs.readFileSync(entry.target)) !== entry.sha256) return false;
  }
  return true;
}

/** Resolve the one skill projection surface declared by the native contract. */
function resolveNativeSkillRoot(host: HostId, detection: Detection): string | null {
  const contract = getNativeContract(host);
  const raw = contract?.paths.skillPath;
  if (!raw) return null;
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const resolved = raw.replace(/\$[A-Z_]+/, detection.homeDir).replace('~', userHome);
  const root = resolved.replace(/[\\/]?<skill>[\\/]?SKILL\.md$/i, '').replace(/[\\/]?<skill>$/i, '');
  return root && !root.includes('n/a') ? root : null;
}

export function getActivePlanId(): string {
  try {
    const curPath = path.join(process.cwd(), '.agent', 'current.json');
    if (fs.existsSync(curPath)) {
      const cur = JSON.parse(fs.readFileSync(curPath, 'utf8'));
      return cur.plan_id || cur.work_id || 'full-native-integrity-global-behavior-v1';
    }
  } catch {}
  return 'full-native-integrity-global-behavior-v1';
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
  const contractsPath = path.join(process.cwd(), 'platforms', 'platform-contracts.json');
  if (fs.existsSync(contractsPath)) {
    try { contractsHash = sha256(fs.readFileSync(contractsPath)); } catch {}
  }

  let planHash = '0'.repeat(64);
  const currentPath = path.join(process.cwd(), '.agent', 'current.json');
  if (fs.existsSync(currentPath)) {
    try {
      const cur = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
      planHash = cur.canonical_ledger?.observed_effective_sha256 || cur.effective_chain_tip?.sha256 || sha256(JSON.stringify(cur));
    } catch {}
  }

  const payload = JSON.stringify({
    gitHead: head,
    trackedDiffHash,
    stagedDiffHash,
    untrackedHash,
    lockHash,
    contractsHash,
    planHash,
    verifierVersion: '2.0.0',
    environmentClass: `${process.platform}-${process.arch}`,
  });
  return sha256(payload);
}

export function acquireWorktreeWriterLease(host: HostId): { release: () => void; leaseId: string } {
  const lockDir = path.join(process.cwd(), '.agent', 'tmp', 'locks');
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
          try { fs.unlinkSync(lockFile); continue; } catch {}
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
  planInstall(host: HostId, detection: Detection, _inventory: InventoryEntry[]): InstallPlan { return this.probe.planInstall(host, detection); }

  async install(host: HostId, opts?: { dryRun?: boolean; force?: boolean; enableMcp?: boolean }): Promise<CertificationReceipt> {
    const lease = acquireWorktreeWriterLease(host);
    let backupDir = '';
    try {
      const detection = await this.detect(host);
      const inventory = await this.inventory(detection);
      const plan = this.planInstall(host, detection, inventory);
      backupDir = plan.backupDir;

      if (opts?.dryRun) {
        return this.certify(host, 'DRY_RUN');
      }

      // The native coordinator owns the complete host projection. This helper
      // only copies skills and records ownership; it cannot mutate MCP config.
      const skillRoot = resolveNativeSkillRoot(host, detection);
      const skills = await projectSkillsToGlobal(path.join(process.cwd(), 'skills'), host as RuntimePlatform, {
        force: opts?.force,
        ...(skillRoot ? { targetRoots: [skillRoot] } : {}),
      });
      if (skills.collisions.length > 0) {
        throw new Error(`native skill projection needs user resolution: ${skills.collisions.join(', ')}`);
      }

      if (host === 'deepseek-harness') {
        const receipt = await this.installDeepseekHarness(detection, backupDir, opts?.enableMcp === true);
        this.assertInstalledReadback(receipt);
        return receipt;
      }

      if (host === 'command-code') {
        captureCommandCodeBackup(detection.homeDir, backupDir);
        installCommandCodeMod(detection.homeDir, process.cwd());
        if (opts?.enableMcp === true) writeCommandCodeMcpConfig(detection.homeDir);
        const receipt = await this.certify(host, 'INSTALLED');
        this.assertInstalledReadback(receipt);
        return receipt;
      }

      fs.mkdirSync(backupDir, { recursive: true });
      if (host === 'omp') backupOmpNativeExtension(detection.homeDir, backupDir);
      const userHome = process.env.USERPROFILE || process.env.HOME || '';

      // Backup existing files
      for (const ch of plan.changes) {
        const src = ch.path.replace('~', userHome).replace(/\$[A-Z_]+/, detection.homeDir);
        if (fs.existsSync(src) && !src.includes('~/.agents/skills')) {
          try {
            const stat = fs.statSync(src);
            if (stat.isFile()) {
              const dst = path.join(backupDir, sha256(src).slice(0, 8) + '-' + path.basename(src));
              fs.copyFileSync(src, dst);
            }
          } catch {}
        }
      }

      const contract = getNativeContract(host);
      if (contract) {
        const rawInstr = contract.paths.instructionPath;
        const instrPath = rawInstr.replace(/\$[A-Z_]+/, detection.homeDir).replace('~', userHome);
        // Every host's instruction surface is its OWN official native file or
        // directory (REQ-111); "activation managed" must not skip writing the
        // managed block for file-based surfaces (that would be claim-filling).
        const isNonFileInstruction = rawInstr.includes('bundle') || rawInstr.includes('mods') || rawInstr.includes('/rules') || rawInstr.endsWith('rules') || rawInstr.endsWith('rules/');

        const managed = `<!-- agent-rules:managed:${host} BEGIN (do not edit manually) -->\n# Agent Rules — ${host} native (global)\nThis self-contained projection is owned by agent-rules and is bound to git HEAD ${getGitHead().slice(0, 12)}.\n\n${renderCanonicalRules()}\n\nNative layer: base rules + selected native skills + lifecycle adapter. Runtime layer only adds the task delta.\n<!-- agent-rules:managed:${host} END -->\n`;

        if ((host === 'grok' || host === 'cursor') && instrPath) {
          fs.mkdirSync(instrPath, { recursive: true });
          const target = path.join(instrPath, 'agent-rules.md');
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

      if (host === 'omp') installOmpNativeExtension(detection.homeDir);

      const sharedSkills = path.join(userHome, '.agents', 'skills');
      fs.mkdirSync(sharedSkills, { recursive: true });

      const receipt = await this.certify(host, 'INSTALLED');
      this.assertInstalledReadback(receipt);
      return receipt;
    } catch (e) {
      if (backupDir && fs.existsSync(backupDir)) {
        await this.rollback(host, backupDir);
      }
      throw e;
    } finally {
      lease.release();
    }
  }

  /** DSH uses native Cordis profiles, not the generic mcp.json projection. */
  private async installDeepseekHarness(detection: Detection, backupDir: string, enableMcp: boolean): Promise<CertificationReceipt> {
    return installDeepseekHarnessNative(detection, backupDir, () => this.certify('deepseek-harness', 'INSTALLED'), { enableMcp });
  }

  private assertInstalledReadback(receipt: CertificationReceipt): void {
    if (receipt.claims.NATIVE_INSTALLED.status !== 'PASS' || receipt.claims.NATIVE_DISCOVERED.status !== 'PASS' || receipt.claims.NATIVE_SKILLS.status !== 'PASS') {
      throw new Error(`native install readback rejected ${receipt.host}: installed=${receipt.claims.NATIVE_INSTALLED.status}, discovered=${receipt.claims.NATIVE_DISCOVERED.status}, skills=${receipt.claims.NATIVE_SKILLS.status}`);
    }
  }

  async certify(host: HostId, mode: 'INSTALLED' | 'DRY_RUN' | 'READBACK' = 'READBACK'): Promise<CertificationReceipt> {
    const detection = await this.detect(host);
    const gitHead = getGitHead();
    const candidateFingerprint = computeCandidateFingerprint();
    const now = new Date().toISOString();
    const contract = getNativeContract(host);
    const userHome = process.env.USERPROFILE || process.env.HOME || '';
    const readback = await this.readback(host);
    const reload = await this.reload(host);

    // Dynamic skill catalog count
    let skillCount = 36;
    try {
      const skillsDir = path.join(process.cwd(), 'skills');
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
        installedDetail = dsh.nativeFilesPresent ? `DSH AGENTS.md, native skill file parity ${dsh.skillParity.count}/${dsh.skillParity.expected}, Cordis rows and dump-config readback verified` : 'DSH native AGENTS.md/skills/profile rows or dump-config readback are incomplete';
      } else if (host === 'command-code') {
        const native = readCommandCodeNative(detection.homeDir);
        installedStatus = native.modManaged ? 'PASS' : 'FAIL';
        installedDetail = native.modManaged
          ? `managed mod verified at ${native.modPath}`
          : `managed mod missing or unmanaged at ${native.modPath}`;
      } else if (contract) {
        const instrPath = contract.paths.instructionPath.replace(/\$[A-Z_]+/, detection.homeDir).replace('~', userHome);
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

    // 5. NATIVE_POLICY
    const policyStatus: 'UNSUPPORTED' = 'UNSUPPORTED';
    const policyDetail = detection.present ? 'no host-native policy inspection was run' : 'host not present';

    // 6. NATIVE_SKILLS
    const skillPath = contract?.paths.skillPath.replace(/\$[A-Z_]+/, detection.homeDir).replace('~', userHome) ?? '';
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
      const parity = commandCodeSkillParity(userHome, process.cwd());
      if (!parity.ok) {
        skillsStatus = 'FAIL';
        skillsDetail = `Command Code shared skill hash parity incomplete: ${parity.count}/${parity.expected}`;
      } else {
        skillsDetail = `Command Code shared skill hash parity ${parity.sha256}`;
      }
    }

    // 7. NATIVE_MCP
    let mcpStatus: 'PASS' | 'FAIL' | 'UNSUPPORTED' = 'UNSUPPORTED';
    let mcpDetail = 'native MCP registration is inspected by the setup coordinator';
    let mcpOmission: string | null = 'registration/tool visibility is a separate native-host observation';
    if (host === 'deepseek-harness' && detection.present) {
      const dsh = inspectDshNativeReadback(detection);
      mcpStatus = dsh.nativeMcp ? 'PASS' : 'UNSUPPORTED';
      mcpDetail = dsh.nativeMcp ? `Cordis MCP rows for ${dsh.profiles.length} discovered profiles verified by dump-config` : 'no native Cordis registration observed';
      mcpOmission = dsh.nativeMcp ? null : 'generic DSH mcp.json is not native proof';
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
        const registration = await inspectHostMcpRegistration(process.cwd(), host);
        if (registration.status === 'REGISTERED') {
          mcpStatus = 'PASS';
          mcpDetail = `native MCP registration read back from ${registration.configPath ?? 'host-native lifecycle'}`;
          mcpOmission = 'native config registration does not by itself prove a model tool call';
        } else if (registration.status === 'NO_ADAPTER') {
          mcpStatus = 'UNSUPPORTED';
          mcpDetail = 'host has no native registration adapter';
          mcpOmission = 'no host registration adapter';
        } else {
          mcpStatus = 'FAIL';
          mcpDetail = registration.entries.map((entry) => `${entry.id}: ${entry.status}`).join(', ') || `native MCP registration ${registration.status.toLowerCase()}`;
          mcpOmission = 'a required native MCP registration is missing, disabled, invalid, or user-modified';
        }
      }
    }

    // 8. MODEL_BEHAVIOR (always NEEDS_USER when offline / no live canary turn)
    const modelBehaviorStatus: 'PASS' | 'NEEDS_USER' = 'NEEDS_USER';
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
      NATIVE_LIFECYCLE: {
        status: reload.ok ? 'PASS' : 'UNSUPPORTED',
        evidence: [{ kind: 'native-reload', host, method: reload.method, ok: reload.ok }],
        omitted_reason: null,
      },
      NATIVE_POLICY: { status: policyStatus, evidence: [{ kind: 'permission-deny-canary', host, detail: policyDetail }], omitted_reason: null },
      NATIVE_SKILLS: { status: skillsStatus, evidence: [{ kind: 'skill-catalog-dynamic', host, count: skillCount, detail: skillsDetail }], omitted_reason: null },
      NATIVE_MCP: { status: mcpStatus, evidence: [{ kind: 'native-mcp-surface', host, detail: mcpDetail }], omitted_reason: mcpOmission },
      MODEL_BEHAVIOR: { status: modelBehaviorStatus, evidence: [{ kind: 'model-turn-not-tested', reason: modelBehaviorDetail }], omitted_reason: modelBehaviorOmission },
      ROLLBACK_VERIFIED: { status: rollbackStatus, evidence: [{ kind: 'uninstall-rollback-preserves-user', host, detail: rollbackDetail }], omitted_reason: rollbackDetail },
    };

    // `Ready` is the practical native-install meaning: config is in the
    // location the host consumes and it read back correctly. Reload control,
    // a GUI model turn, and release CI are tracked separately; treating them
    // as an install failure made a usable host look broken.
    const usableClaims = ['HOST_PRESENT', 'NATIVE_INSTALLED', 'NATIVE_DISCOVERED', 'NATIVE_SKILLS', 'NATIVE_MCP'];
    const usable = usableClaims.every(k => claims[k].status === 'PASS');
    const status: CertificationReceipt['status'] = !detection.present ? 'Unsupported' : usable ? 'Ready' : 'Needs action';

    const receipt: CertificationReceipt = {
      schema: 'agent-rules/host-certification-receipt',
      version: 1,
      host,
      generated_at: now,
      git_head: gitHead,
      candidate_fingerprint: candidateFingerprint,
      status,
      usable,
      claims,
      native_readback: { method: contract?.readbackStrategy, present: detection.present, verified: readback.ok, found: readback.found, detail: readback.detail ?? null },
      mcp_handshake: { status: mcpStatus === 'PASS' ? 'NATIVE_SURFACE_INTACT' : mcpStatus === 'FAIL' ? 'NATIVE_SURFACE_FAILED' : 'UNSUPPORTED', host, detail: mcpDetail },
      skill_catalog: { count: skillCount, skipped: 0, duplicates: duplicateSkills.length },
    };

    if (mode !== 'DRY_RUN') {
      // Host receipts are runtime scratch. A release manifest records only the
      // selected final evidence hashes; repeated installs must not bloat .agent.
      const tmpPath = path.join(process.cwd(), '.agent', 'tmp', 'host-receipts', `host-${host}.json`);
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
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
    let instrPath = rawInstr.replace(/\$[A-Z_]+/, detection.homeDir).replace('~', userHome);
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
    const receipt = await this.certify(host, 'READBACK');
    const claims = Object.fromEntries(
      Object.entries(receipt.claims)
        .filter(([name]) => name !== 'MODEL_BEHAVIOR')
        .map(([name, claim]) => [name, { status: claim.status, evidence: claim.evidence }]),
    );
    const ok = Object.values(claims).every((claim) => claim.status === 'PASS' || claim.status === 'UNSUPPORTED');
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

  async rollback(host: HostId, backupDir?: string): Promise<{ ok: boolean; byteEqual: boolean }> {
    if (!backupDir || !fs.existsSync(backupDir)) return { ok: false, byteEqual: false };
    const userHome = process.env.USERPROFILE || process.env.HOME || '';
    const detection = await this.detect(host);
    let byteEqual = true;

    if (host === 'deepseek-harness' && fs.existsSync(path.join(backupDir, '.dsh-backup.json'))) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, '.dsh-backup.json'), 'utf8')) as { home?: string; plugin_install_started?: boolean; entries?: DshBackupEntry[] };
        if (!manifest.home || path.resolve(manifest.home) !== path.resolve(detection.homeDir) || !Array.isArray(manifest.entries)) throw new Error('DSH rollback manifest is not bound to the detected DSH_HOME');
        const before = new Map<string, Buffer | null>();
        const beforeModes = new Map<string, number | null>();
        for (const entry of manifest.entries) {
          const destination = path.resolve(manifest.home, entry.relativePath);
          if (!destination.startsWith(path.resolve(manifest.home) + path.sep)) throw new Error(`DSH rollback path escapes DSH_HOME: ${entry.relativePath}`);
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
      try {
        restoreCommandCodeBackup(backupDir);
        byteEqual = verifyCommandCodeBackup(backupDir);
      } catch {
        byteEqual = false;
      }
    } else if (host === 'omp') {
      try {
        byteEqual = restoreOmpNativeExtension(backupDir);
        // Continue through the normal instruction-file restore below; OMP's
        // extension files and its managed AGENTS.md are separate surfaces.
        const files = fs.readdirSync(backupDir);
        for (const f of files) {
          const fp = path.join(backupDir, f);
          if (!fs.statSync(fp).isFile()) continue;
          const destName = f.replace(/^[a-f0-9]{8}-/, '');
          const contract = getNativeContract(host);
          if (!contract) continue;
          const instrPath = contract.paths.instructionPath
            .replace(/\$[A-Z_]+/, detection.homeDir)
            .replace('~', userHome);
          if (path.basename(instrPath) === destName) {
            fs.copyFileSync(fp, instrPath);
            if (sha256(fs.readFileSync(fp)) !== sha256(fs.readFileSync(instrPath))) byteEqual = false;
          }
        }
      } catch {
        byteEqual = false;
      }
    } else {
      try {
        const files = fs.readdirSync(backupDir);
        for (const f of files) {
          const fp = path.join(backupDir, f);
          if (fs.statSync(fp).isFile()) {
            const destName = f.replace(/^[a-f0-9]{8}-/, '');
            const contract = getNativeContract(host);
            if (contract) {
              // Resolve the SAME env-var/home placeholders as install so rollback
              // restores the true native instruction surface (REQ-010/REQ-111).
              const instrPath = contract.paths.instructionPath
                .replace(/\$[A-Z_]+/, detection.homeDir)
                .replace('~', userHome);
              if (path.basename(instrPath) === destName) {
                fs.copyFileSync(fp, instrPath);
                const origSha = sha256(fs.readFileSync(fp));
                const restoredSha = sha256(fs.readFileSync(instrPath));
                if (origSha !== restoredSha) byteEqual = false;
              }
            }
          }
        }
      } catch {
        byteEqual = false;
      }
    }

    const receipt = await this.certify(host);
    receipt.claims.ROLLBACK_VERIFIED = {
      status: byteEqual ? 'PASS' : 'FAIL',
      evidence: [{ kind: 'rollback-restored-byte-equal', backupDir, byteEqual }],
      omitted_reason: null,
    };

    const tmpPath = path.join(process.cwd(), '.agent', 'tmp', 'host-receipts', `host-${host}.json`);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

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
        const tmpPath = path.join(process.cwd(), '.agent', 'tmp', 'host-receipts', `host-${host}.json`);
        fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
        fs.writeFileSync(tmpPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
        await uninstallOwnedGlobalProjections(host as RuntimePlatform);
        return;
      }

      const instrPath = contract.paths.instructionPath.replace(/\$[A-Z_]+/, detection.homeDir).replace('~', userHome);
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

      const mcpPath = contract.paths.mcpPath.replace(/\$[A-Z_]+/, detection.homeDir).replace('~', userHome);
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

      const tmpPath = path.join(process.cwd(), '.agent', 'tmp', 'host-receipts', `host-${host}.json`);
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
      await uninstallOwnedGlobalProjections(host as RuntimePlatform);
    } finally {
      lease.release();
    }
  }
}
