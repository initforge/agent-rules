import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { HostId } from './host-adapters.js';
import {
  capabilityTtlDays,
  type CapabilityCertification,
  type CertificationState,
  type HostCapabilityFacts,
  type HostIdentity,
  type SkillSurfaceMode,
  type PermissionSurfaceMode,
  type SubagentSurfaceMode,
  type SurfacePresence,
} from './host-capabilities.js';

/**
 * REQ-011/REQ-018 — per-host capability certification canary runner.
 *
 * For each registered HostId this binds registry v2 static facts with a live
 * binary probe and emits HostCapabilityFacts whose certifications are:
 *   - LIVE_CERTIFIED only when the live probe confirms the capability;
 *   - NOT_LIVE_VERIFIED / STATIC_KNOWN when the binary is absent or unprobed;
 *   - UNSUPPORTED when the host has no native projection at all.
 *
 * Missing binaries are recorded NOT_LIVE_VERIFIED; a detected broken primitive
 * is a real certification failure, never masked. Fingerprint/TTL staleness is
 * applied via the shared capability ABI.
 */

export interface HostProbeResult {
  ok: boolean;
  binary_path?: string;
  version?: string;
  confirmed?: string[];
  error?: string;
}

export interface CanaryRunInput {
  repoRoot: string;
  host: HostId;
  probe?: HostProbeResult;
  adapter_revision?: string;
  projection_hash?: string;
  now?: Date;
}

export const REGISTRY_HOSTS: readonly HostId[] = [
  'codex',
  'claude',
  'grok',
  'opencode',
  'antigravity',
  'cursor',
  'deepseek-harness',
  'command-code',
] as const;

/** Static per-host projection presence: platforms/<host>/adapter.ts exists. */
export function hasNativeProjection(repoRoot: string, host: HostId): boolean {
  return fs.existsSync(path.join(repoRoot, 'platforms', host, 'adapter.ts'));
}

const SURFACE_KEYS: ReadonlyArray<keyof HostCapabilityFacts> = [
  'instruction_surface',
  'context_injection',
  'skill_surface',
  'hook_surface',
  'permission_surface',
  'sandbox_surface',
  'subagent_surface',
  'session_surface',
  'worktree_surface',
  'mcp_surface',
  'headless_surface',
  'compaction_surface',
  'structured_event_surface',
  'planning_surface',
  'model_observability',
] as const;

export function certificationStateFor(input: {
  probed: boolean;
  probeOk?: boolean;
  projectionPresent: boolean;
  capabilityConfirmed?: boolean;
}): CertificationState {
  if (!input.projectionPresent) return 'UNSUPPORTED';
  if (!input.probed) return 'STATIC_KNOWN';
  if (input.probeOk !== true) return 'NOT_LIVE_VERIFIED';
  if (input.capabilityConfirmed === true) return 'LIVE_CERTIFIED';
  return 'STATIC_CONFORMED';
}

function presenceFor(state: CertificationState, present: boolean): SurfacePresence {
  if (state === 'UNSUPPORTED') return 'NONE';
  if (!present) return 'NONE';
  if (state === 'LIVE_CERTIFIED') return 'FULL';
  return 'PARTIAL';
}

function skillModeFor(host: HostId): SkillSurfaceMode {
  if (host === 'opencode') return 'METADATA_THEN_LAZY_BODY';
  if (host === 'command-code') return 'PATH_SCOPED_LAZY';
  return 'EAGER';
}

function permissionModeFor(host: HostId): PermissionSurfaceMode {
  if (host === 'command-code') return 'NATIVE_ALLOW_ASK_DENY';
  if (host === 'opencode') return 'NATIVE_ALLOW_ASK_DENY';
  if (host === 'codex') return 'NATIVE_PRE_EFFECT_DENY';
  if (host === 'claude') return 'NATIVE_PRE_EFFECT_DENY';
  return 'PROMPT_ONLY';
}

function subagentModeFor(host: HostId): SubagentSurfaceMode {
  if (host === 'deepseek-harness') return 'ISOLATED_CONTEXT';
  if (host === 'command-code') return 'ISOLATED_CONTEXT';
  if (host === 'claude') return 'ISOLATED_WORKTREE';
  return 'SHARED_CONTEXT';
}

function computeDefaultProjectionHash(repoRoot: string, host: HostId): string {
  const hostDir = path.join(repoRoot, 'platforms', host);
  if (!fs.existsSync(hostDir)) {
    return createHash('sha256').update(`missing_platform:${host}`).digest('hex');
  }
  const hash = createHash('sha256');
  try {
    const files = fs.readdirSync(hostDir).sort();
    for (const f of files) {
      const p = path.join(hostDir, f);
      if (fs.statSync(p).isFile()) {
        hash.update(f).update(fs.readFileSync(p));
      }
    }
    return hash.digest('hex');
  } catch {
    return createHash('sha256').update(`platform:${host}`).digest('hex');
  }
}

function buildFacts(input: CanaryRunInput): { facts: HostCapabilityFacts; certifications: CapabilityCertification[] } {
  const defaultProjectionHash = computeDefaultProjectionHash(input.repoRoot, input.host);
  const { host, probe, repoRoot, adapter_revision = '0', projection_hash = defaultProjectionHash, now = new Date() } = input;
  const projectionPresent = hasNativeProjection(repoRoot, host);
  const probed = probe !== undefined;
  const probeOk = probe?.ok;
  const state = certificationStateFor({ probed, probeOk, projectionPresent });
  const ttlDays = capabilityTtlDays('permission_surface', host);

  const hostIdentity: HostIdentity = { host, ...(probe?.version ? { host_version: probe.version } : {}) };
  const certifications: CapabilityCertification[] = SURFACE_KEYS.map((capability) => {
    const confirmed = probe?.confirmed?.includes(capability) === true;
    const capState = !projectionPresent
      ? 'UNSUPPORTED'
      : !probed
        ? 'STATIC_KNOWN'
        : probeOk !== true
          ? 'NOT_LIVE_VERIFIED'
          : confirmed
            ? 'LIVE_CERTIFIED'
            : 'STATIC_CONFORMED';
    const expires = new Date(now.getTime() + ttlDays * 86_400_000);
    return {
      capability,
      certification_state: capState,
      evidence_refs: probeOk === true ? [`probe:${host}`] : [],
      certified_at: probed ? now.toISOString() : '',
      expires_at: expires.toISOString(),
      host,
      adapter_revision,
      projection_hash,
      ...(probe?.version ? { host_version: probe.version } : {}),
    };
  });

  const certByCapability = new Map(certifications.map((c) => [c.capability, c]));
  const c = (key: keyof HostCapabilityFacts) => certByCapability.get(key)?.certification_state ?? state;
  const presence = (key: keyof HostCapabilityFacts, present: boolean) => presenceFor(c(key), present);

  const facts: HostCapabilityFacts = {
    host: hostIdentity,
    adapter: { adapter_revision, contract_revision: 'v2' },
    projection: { projection_hash, projection_path: projectionPresent ? `platforms/${host}` : undefined },
    instruction_surface: { presence: presence('instruction_surface', projectionPresent) },
    context_injection: { presence: presence('context_injection', projectionPresent) },
    skill_surface: { mode: skillModeFor(host), lazy_body: host === 'opencode' || host === 'command-code', path_scoped: host === 'command-code' },
    hook_surface: { presence: presence('hook_surface', host !== 'opencode'), failure_semantics: host === 'command-code' ? 'fail_open' : 'fail_closed' },
    permission_surface: { mode: permissionModeFor(host), pre_effect_deny: host === 'codex' || host === 'claude' },
    sandbox_surface: { presence: presence('sandbox_surface', host === 'codex' || host === 'deepseek-harness'), mutation_denied: host === 'codex' },
    subagent_surface: { mode: subagentModeFor(host) },
    session_surface: { presence: presence('session_surface', host !== 'cursor'), headless: host !== 'cursor' },
    worktree_surface: { presence: presence('worktree_surface', host === 'claude' || host === 'opencode'), isolated_transaction: host === 'claude' },
    mcp_surface: { presence: presence('mcp_surface', projectionPresent), lease: true, schema_exposure: true },
    headless_surface: { presence: presence('headless_surface', host !== 'cursor' && host !== 'antigravity'), high_trust_mutation_denied: host === 'command-code' },
    compaction_surface: { presence: presence('compaction_surface', false) },
    structured_event_surface: { presence: presence('structured_event_surface', host === 'command-code' || host === 'claude'), structured_events: host === 'command-code' || host === 'claude' },
    planning_surface: { presence: presence('planning_surface', host === 'codex' || host === 'claude' || host === 'opencode' || host === 'antigravity' || host === 'command-code'), write_hooks_in_plan_mode: false },
    model_observability: { observed_models: host === 'claude', attestation: probeOk === true ? 'host-attested' : 'unconfirmed' },
    capability_fingerprint: createHash('sha256')
      .update(JSON.stringify({ host, adapter_revision, projection_hash, probe_version: probe?.version ?? null, probe_ok: probeOk ?? null }))
      .digest('hex'),
    static_contract_revision: 'registry-v2',
    ...(probe?.version ? { observed_runtime_revision: probe.version } : {}),
    certifications,
  };
  return { facts, certifications };
}

/** Canonical per-host canary run: returns facts with honest certifications. */
export function runHostCanary(input: CanaryRunInput): { facts: HostCapabilityFacts; state: CertificationState; certifications: CapabilityCertification[] } {
  const { facts, certifications } = buildFacts(input);
  // Host-level state: a successful live probe makes the host LIVE_CERTIFIED
  // even when only some capabilities are individually confirmed; per-capability
  // certifications remain selective so a broken primitive is never masked.
  const state = !hasNativeProjection(input.repoRoot, input.host)
    ? 'UNSUPPORTED'
    : input.probe === undefined
      ? 'STATIC_KNOWN'
      : input.probe.ok === true
        ? 'LIVE_CERTIFIED'
        : 'NOT_LIVE_VERIFIED';
  return { facts, state, certifications };
}

export { SURFACE_KEYS };
