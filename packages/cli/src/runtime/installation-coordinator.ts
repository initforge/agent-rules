import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { HostId } from '@initforge/agent-rules-kernel/northstar/host-adapters.js';
import { configureHostRegistryRoot } from '@initforge/agent-rules-kernel/northstar/host-registry.js';
import type { RuntimeCandidateManifest } from '@initforge/agent-rules-kernel/contracts.js';
import { assertRuntimeCandidateManifest } from '@initforge/agent-rules-kernel/contracts.js';
import { NativeInstaller, type CertificationReceipt } from '../services/native-installer.js';
import { provisionMcps } from '../integration/provisioning.js';
import { convergeHostMcpConfig, registerHostMcpAdapters, restoreHostMcpBackup } from './mcp-convergence.js';
import { RUNTIME_PLATFORMS, type RuntimePlatform } from './contracts.js';
import { packedRuntimeAvailable, resolvePackageRoot, resolveRuntimeAsset, resolveRuntimeAssetsRoot } from './locator.js';
import { cleanupOperationalState, writeCurrentOperationalState } from './state-lifecycle.js';
import { cleanupCentralExecutableRuntime, cleanupHostRuntimeCallbacks, type LegacyCleanupResult } from './legacy-runtime-cleanup.js';

configureHostRegistryRoot(resolveRuntimeAssetsRoot());

export interface InstallationCoordinatorOptions {
  dryRun?: boolean;
  enableMcp?: boolean;
}

export interface StaticReadback {
  native: boolean;
  static: boolean;
  mcp: boolean;
  authority_tier: 'NATIVE_ENFORCED' | 'NATIVE_ADVISORY' | 'MANAGED' | 'UNAVAILABLE';
  cleanup?: LegacyCleanupResult;
  error?: string;
}

export interface CoordinatorReceipt {
  schema: 'agent-rules/installation-receipt/v2';
  candidate_id: string;
  event: 'INSTALL' | 'UPDATE' | 'UNINSTALL' | 'DOCTOR' | 'ROLLBACK';
  hosts: string[];
  package_root: string;
  assets_root: string;
  observed_at: string;
  integrations_enabled: boolean;
  native?: Record<string, CertificationReceipt>;
  readback?: Record<string, StaticReadback>;
  errors?: Record<string, string>;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function walkHashes(start: string, prefix = ''): Record<string, string> {
  const hashes: Record<string, string> = {};
  if (!fs.existsSync(start)) return hashes;
  for (const entry of fs.readdirSync(start, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(start, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, walkHashes(full, rel));
    else hashes[rel] = sha256(fs.readFileSync(full));
  }
  return hashes;
}

export function loadRuntimeCandidateManifest(): RuntimeCandidateManifest {
  const assetsRoot = resolveRuntimeAssetsRoot();
  const packedManifestPath = path.join(assetsRoot, 'manifest.json');
  const asset_hashes = fs.existsSync(packedManifestPath)
    ? (JSON.parse(fs.readFileSync(packedManifestPath, 'utf8')).files as Array<{ path: string; sha256: string }>).reduce<Record<string, string>>((acc, file) => { acc[file.path] = file.sha256; return acc; }, {})
    : walkHashes(assetsRoot);
  const schema_hashes = Object.fromEntries(Object.entries(asset_hashes).filter(([key]) => key.startsWith('schemas/')));
  const platform_contract_hashes = Object.fromEntries(Object.entries(asset_hashes).filter(([key]) => key.includes('platform-contracts.json') || key.startsWith('platforms/')));
  const body: Omit<RuntimeCandidateManifest, 'manifest_sha256'> = {
    schema: 'agent-rules/runtime-candidate-manifest/v1', candidate_id: sha256(JSON.stringify({ asset_hashes, schema_hashes, platform_contract_hashes })),
    package_id: '@initforge/agent-rules', package_version: '2.0.0', asset_hashes, schema_hashes, platform_contract_hashes,
  };
  const manifest = { ...body, manifest_sha256: sha256(JSON.stringify(body)) };
  assertRuntimeCandidateManifest(manifest);
  return manifest;
}

function staticOk(receipt: CertificationReceipt): boolean {
  return ['HOST_PRESENT', 'NATIVE_INSTALLED', 'NATIVE_DISCOVERED', 'NATIVE_SKILLS', 'NATIVE_POLICY']
    .every((claim) => receipt.claims[claim]?.status === 'PASS');
}

export class InstallationCoordinator {
  private readonly native = new NativeInstaller();
  private readonly candidate = loadRuntimeCandidateManifest();
  private provisioned = false;

  constructor(private readonly options: InstallationCoordinatorOptions = {}) {}

  candidateId(): string { return this.candidate.candidate_id; }
  assetsRoot(): string { return resolveRuntimeAssetsRoot(); }
  usesPackedAssets(): boolean { return packedRuntimeAvailable(); }
  resolveAsset(relativePath: string): string { return resolveRuntimeAsset(relativePath); }

  private persist(receipt: CoordinatorReceipt): void {
    if (this.options.dryRun) return;
    writeCurrentOperationalState('installation.json', receipt);
    for (const host of receipt.hosts) writeCurrentOperationalState(path.join('install-options', `${host}.json`), {
      schema: 'agent-rules/install-options/v1', host, integrations_enabled: receipt.integrations_enabled, candidate_id: receipt.candidate_id,
    });
  }

  private receipt(event: CoordinatorReceipt['event'], hosts: readonly string[], native: Record<string, CertificationReceipt>, readback: Record<string, StaticReadback>, errors: Record<string, string>): CoordinatorReceipt {
    return {
      schema: 'agent-rules/installation-receipt/v2', candidate_id: this.candidate.candidate_id, event, hosts: [...hosts],
      package_root: resolvePackageRoot(), assets_root: this.assetsRoot(), observed_at: new Date().toISOString(), integrations_enabled: this.options.enableMcp !== false,
      native, readback, ...(Object.keys(errors).length ? { errors } : {}),
    };
  }

  private async provisionProvidersOnce(): Promise<void> {
    if (this.provisioned || this.options.enableMcp === false || this.options.dryRun) return;
    await provisionMcps(this.assetsRoot(), { installProfile: 'all' });
    this.provisioned = true;
  }

  private async installOne(host: RuntimePlatform): Promise<{ native: CertificationReceipt; readback: StaticReadback }> {
    const detection = await this.native.detect(host as HostId);
    if (!detection.present) {
      const native = await this.native.certify(host as HostId, 'DRY_RUN');
      return { native, readback: { native: false, static: false, mcp: false, authority_tier: 'UNAVAILABLE', error: 'host is not locally available; no files changed' } };
    }
    const inventory = await this.native.inventory(detection);
    const plan = await this.native.planInstall(host as HostId, detection, inventory);
    let nativeApplied = false;
    let mcpApplied = false;
    try {
      await this.native.install(host as HostId, { dryRun: this.options.dryRun, enableMcp: this.options.enableMcp !== false && ['deepseek-harness', 'command-code'].includes(host), backupDir: plan.backupDir });
      nativeApplied = this.options.dryRun !== true;
      if (this.options.enableMcp !== false && this.options.dryRun !== true && !['deepseek-harness', 'command-code'].includes(host)) {
        const registration = await registerHostMcpAdapters(this.assetsRoot(), host as HostId);
        mcpApplied = Boolean(registration.backupReceipt);
      }
      const native = await this.native.certify(host as HostId, this.options.dryRun ? 'DRY_RUN' : 'INSTALLED');
      if (!staticOk(native)) throw new Error(`required static readback failed for ${host}`);
      const cleanup = this.options.dryRun ? undefined : cleanupHostRuntimeCallbacks(host as HostId, detection.homeDir);
      return {
        native,
        readback: {
          native: true, static: true, mcp: ['PASS', 'UNSUPPORTED', 'NEEDS_USER'].includes(native.claims.NATIVE_MCP.status),
          authority_tier: native.authority_tier, ...(cleanup ? { cleanup } : {}),
          ...(cleanup?.needsUser.length ? { error: cleanup.needsUser.join('; ') } : {}),
        },
      };
    } catch (error) {
      if (mcpApplied) restoreHostMcpBackup(host as HostId);
      if (nativeApplied) {
        const restored = await this.native.rollback(host as HostId, plan.backupDir);
        if (!restored.ok || !restored.byteEqual) throw new Error(`${error instanceof Error ? error.message : String(error)}; static rollback was not byte-equal`);
      }
      throw error;
    }
  }

  private async runInstall(event: 'INSTALL' | 'UPDATE', hosts: readonly string[]): Promise<CoordinatorReceipt> {
    const native: Record<string, CertificationReceipt> = {};
    const readback: Record<string, StaticReadback> = {};
    const errors: Record<string, string> = {};
    if (!this.options.dryRun) cleanupOperationalState();
    try { await this.provisionProvidersOnce(); } catch (error) { errors._integrations = error instanceof Error ? error.message : String(error); }
    for (const value of hosts) {
      try {
        const result = await this.installOne(value as RuntimePlatform);
        native[value] = result.native; readback[value] = result.readback;
        if (result.readback.error) errors[`${value}:cleanup`] = result.readback.error;
      } catch (error) { errors[value] = error instanceof Error ? error.message : String(error); }
    }
    if (!this.options.dryRun) {
      const cleanup = cleanupCentralExecutableRuntime();
      if (cleanup.needsUser.length) errors._central_runtime_cleanup = cleanup.needsUser.join('; ');
      cleanupOperationalState();
    }
    const receipt = this.receipt(event, hosts, native, readback, errors);
    this.persist(receipt);
    return receipt;
  }

  install(hosts: readonly string[]): Promise<CoordinatorReceipt> { return this.runInstall('INSTALL', hosts); }
  update(hosts: readonly string[]): Promise<CoordinatorReceipt> { return this.runInstall('UPDATE', hosts); }

  async doctor(hosts: readonly string[]): Promise<CoordinatorReceipt> {
    const native: Record<string, CertificationReceipt> = {};
    const readback: Record<string, StaticReadback> = {};
    const errors: Record<string, string> = {};
    for (const value of hosts) {
      try {
        const receipt = await this.native.certify(value as HostId, 'DRY_RUN');
        native[value] = receipt;
        readback[value] = { native: receipt.claims.NATIVE_DISCOVERED.status === 'PASS', static: staticOk(receipt), mcp: ['PASS', 'UNSUPPORTED', 'NEEDS_USER'].includes(receipt.claims.NATIVE_MCP.status), authority_tier: receipt.authority_tier };
      } catch (error) { errors[value] = error instanceof Error ? error.message : String(error); }
    }
    return this.receipt('DOCTOR', hosts, native, readback, errors);
  }

  async rollback(host: RuntimePlatform): Promise<CoordinatorReceipt> {
    const errors: Record<string, string> = {};
    const native: Record<string, CertificationReceipt> = {};
    const readback: Record<string, StaticReadback> = {};
    try {
      restoreHostMcpBackup(host as HostId);
      const detection = await this.native.detect(host as HostId);
      const inventory = await this.native.inventory(detection);
      const plan = await this.native.planInstall(host as HostId, detection, inventory);
      const restored = await this.native.rollback(host as HostId, plan.backupDir);
      if (!restored.ok || !restored.byteEqual) throw new Error(`static rollback failed for ${host}`);
      const receipt = await this.native.certify(host as HostId, 'READBACK');
      native[host] = receipt;
      readback[host] = { native: true, static: staticOk(receipt), mcp: ['PASS', 'UNSUPPORTED', 'NEEDS_USER'].includes(receipt.claims.NATIVE_MCP.status), authority_tier: receipt.authority_tier };
    } catch (error) { errors[host] = error instanceof Error ? error.message : String(error); }
    const receipt = this.receipt('ROLLBACK', [host], native, readback, errors); this.persist(receipt); return receipt;
  }

  async uninstall(hosts: readonly string[]): Promise<CoordinatorReceipt> {
    const native: Record<string, CertificationReceipt> = {};
    const readback: Record<string, StaticReadback> = {};
    const errors: Record<string, string> = {};
    for (const value of hosts) {
      try {
        if (!this.options.dryRun) await convergeHostMcpConfig(this.assetsRoot(), value as HostId, { globalMcpProfile: 'none' });
        await this.native.uninstall(value as HostId);
        const detection = await this.native.detect(value as HostId);
        if (!this.options.dryRun) cleanupHostRuntimeCallbacks(value as HostId, detection.homeDir);
        const receipt = await this.native.certify(value as HostId, 'DRY_RUN');
        native[value] = receipt;
        readback[value] = { native: false, static: false, mcp: false, authority_tier: detection.present ? 'NATIVE_ADVISORY' : 'UNAVAILABLE' };
      } catch (error) { errors[value] = error instanceof Error ? error.message : String(error); }
    }
    if (!this.options.dryRun) cleanupCentralExecutableRuntime();
    const receipt = this.receipt('UNINSTALL', hosts, native, readback, errors); this.persist(receipt); return receipt;
  }
}

export const COORDINATOR_HOSTS = [...RUNTIME_PLATFORMS];
export function createInstallationCoordinator(options: InstallationCoordinatorOptions = {}): InstallationCoordinator { return new InstallationCoordinator(options); }
export function coordinatorLeaseId(): string { return `coord-${randomUUID()}`; }
