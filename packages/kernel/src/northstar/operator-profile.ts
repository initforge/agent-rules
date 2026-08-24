import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Operator Communication Profile — canonical runtime (owner contract REQ-C01..C10).
 *
 * Namespace `operator-profiles/` is intentionally distinct from `profiles/`
 * (domain packs such as 5fedu). A single canonical source + hash is projected
 * to every host; hosts never maintain independent rule copies.
 */

export const OPERATOR_PROFILE_SCHEMA = 'artifact/operator-profile';
export const OPERATOR_PROFILE_PROJECTION_STATUSES = ['SYNCED', 'MANUAL_PROJECTION', 'DRIFTED', 'UNSUPPORTED', 'NEEDS_USER'] as const;
export type OperatorProjectionStatus = (typeof OPERATOR_PROFILE_PROJECTION_STATUSES)[number];

export type TechnicalModeRevert = 'after-task-or-topic';

export interface OperatorProfile {
  schema: typeof OPERATOR_PROFILE_SCHEMA;
  profile_id: string;
  version: string;
  language: 'vi';
  outcome_first: boolean;
  default_owner_mode: 'vibe-coder';
  communication: {
    no_unsolicited_logs_or_architecture: boolean;
    ask_only_for: Array<'material-decision' | 'execution-authority'>;
  };
  technical_mode: {
    trigger_phrases: string[];
    revert: TechnicalModeRevert;
  };
  security_floor: {
    never_weaken: Array<'verification' | 'security' | 'scope' | 'pass-semantics'>;
  };
}

export interface InstalledOperatorProfileState {
  schema: 'artifact/operator-profile-state';
  profile_id: string;
  version: string;
  source_sha256: string;
  active: boolean;
  installed_at: string;
  session_override: { technical_mode: boolean } | null;
}

export interface ProfileResolution {
  effective_technical_mode: boolean;
  precedence_chain: string[];
  installed: boolean;
  active: boolean;
  source_sha256: string | null;
  session_override_active: boolean;
}

const STATE_DIR = '.agent/operator-profile';
const PROFILE_ID_SAFE = /^[a-z0-9][a-z0-9-]{0,64}$/;

export function canonicalOperatorProfilePath(repoRoot: string, profileId: string): string {
  if (!PROFILE_ID_SAFE.test(profileId)) throw new Error(`unsafe operator profile id: ${profileId}`);
  return path.join(repoRoot, 'operator-profiles', profileId, 'profile.json');
}

export function loadCanonicalOperatorProfile(repoRoot: string, profileId: string): { profile: OperatorProfile; sourceSha256: string; rawBytes: Buffer } {
  const filePath = canonicalOperatorProfilePath(repoRoot, profileId);
  if (!fs.existsSync(filePath)) throw new Error(`canonical operator profile not found: ${filePath}`);
  const rawBytes = fs.readFileSync(filePath);
  const sourceSha256 = createHash('sha256').update(rawBytes).digest('hex');
  const parsed = JSON.parse(rawBytes.toString('utf8')) as OperatorProfile;
  assertProfileShape(parsed);
  return { profile: parsed, sourceSha256, rawBytes };
}

export function assertProfileShape(input: unknown): OperatorProfile {
  const p = input as OperatorProfile;
  if (!p || p.schema !== OPERATOR_PROFILE_SCHEMA) throw new Error(`operator profile schema must be ${OPERATOR_PROFILE_SCHEMA}`);
  if (!PROFILE_ID_SAFE.test(p.profile_id ?? '')) throw new Error('operator profile_id missing/unsafe');
  if (typeof p.version !== 'string' || p.version.length === 0) throw new Error('operator profile version missing');
  if (p.language !== 'vi') throw new Error('vibe-product operator profiles are Vietnamese-first');
  if (p.outcome_first !== true) throw new Error('operator profile must be outcome-first');
  if (p.default_owner_mode !== 'vibe-coder') throw new Error('default_owner_mode must be vibe-coder');
  if (!p.communication || typeof p.communication !== 'object') throw new Error('communication contract required');
  if (!Array.isArray(p.communication.ask_only_for) || p.communication.ask_only_for.length === 0) {
    throw new Error('communication.ask_only_for must list material-decision/execution-authority gates');
  }
  if (p.communication.no_unsolicited_logs_or_architecture !== true) {
    throw new Error('vibe-coder default forbids unsolicited logs/architecture dumps');
  }
  if (!Array.isArray(p.technical_mode?.trigger_phrases) || p.technical_mode.trigger_phrases.length === 0) throw new Error('technical_mode trigger phrases required');
  if (p.technical_mode.revert !== 'after-task-or-topic') throw new Error('technical mode must auto-revert after task or topic');
  const floor = p.security_floor?.never_weaken ?? [];
  for (const required of ['verification', 'security', 'scope', 'pass-semantics'] as const) {
    if (!floor.includes(required)) throw new Error(`security_floor.never_weaken must include ${required}`);
  }
  return p;
}

function statePath(repoRoot: string): string {
  return path.join(repoRoot, STATE_DIR, 'state.json');
}

export function readInstalledState(repoRoot: string): InstalledOperatorProfileState | null {
  const p = statePath(repoRoot);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as InstalledOperatorProfileState;
  } catch {
    // Corrupt installed state fails toward host-default rather than crashing;
    // doctor surfaces the divergence via source-hash comparison.
    return null;
  }
}

export function installOperatorProfile(repoRoot: string, profileId: string): InstalledOperatorProfileState {
  const { profile, sourceSha256 } = loadCanonicalOperatorProfile(repoRoot, profileId);
  const state: InstalledOperatorProfileState = {
    schema: 'artifact/operator-profile-state',
    profile_id: profile.profile_id,
    version: profile.version,
    source_sha256: sourceSha256,
    active: true,
    installed_at: new Date().toISOString(),
    session_override: null,
  };
  fs.mkdirSync(path.join(repoRoot, STATE_DIR), { recursive: true });
  fs.writeFileSync(statePath(repoRoot), JSON.stringify(state, null, 2), 'utf8');
  return state;
}

export function deactivateOperatorProfile(repoRoot: string): void {
  const state = readInstalledState(repoRoot);
  if (!state) return;
  fs.writeFileSync(statePath(repoRoot), JSON.stringify({ ...state, active: false }, null, 2), 'utf8');
}

export function setSessionOverride(repoRoot: string, override: { technical_mode: boolean } | null): void {
  const state = readInstalledState(repoRoot);
  if (!state) throw new Error('no operator profile installed');
  fs.writeFileSync(statePath(repoRoot), JSON.stringify({ ...state, session_override: override }, null, 2), 'utf8');
}

/**
 * Precedence chain (REQ-C03):
 * owner instruction > session override > installed operator profile > host default.
 */
export function resolveEffectiveProfile(input: {
  repoRoot: string;
  ownerInstructionTechnical?: boolean | undefined;
}): ProfileResolution {
  const state = readInstalledState(input.repoRoot);
  const chain: string[] = [];
  let effectiveTechnical = false;

  if (input.ownerInstructionTechnical !== undefined) {
    chain.push(`owner-instruction:${input.ownerInstructionTechnical ? 'technical' : 'normal'}`);
    effectiveTechnical = input.ownerInstructionTechnical;
  } else if (state?.session_override) {
    chain.push(`session-override:${state.session_override.technical_mode ? 'technical' : 'normal'}`);
    effectiveTechnical = state.session_override.technical_mode;
  } else if (state?.active) {
    chain.push(`installed-operator-profile:vibe-default`);
    effectiveTechnical = false;
  } else {
    chain.push('host-default:normal');
  }

  return {
    effective_technical_mode: effectiveTechnical,
    precedence_chain: chain,
    installed: state !== null,
    active: state?.active === true,
    source_sha256: state?.source_sha256 ?? null,
    session_override_active: state?.session_override !== null && state?.session_override !== undefined,
  };
}

/** Detect a temporary technical-mode trigger; returns undefined when absent. */
export function detectOwnerInstruction(ownerText: string, profile?: OperatorProfile): boolean | undefined {
  // Prefer the canonical profile's triggers; DEFAULT_TECHNICAL_TRIGGERS is the
  // fallback only when no profile is loaded.
  const triggers = profile?.technical_mode.trigger_phrases ?? DEFAULT_TECHNICAL_TRIGGERS;
  const lower = ownerText.toLowerCase();
  if (triggers.some((t) => lower.includes(t.toLowerCase()))) return true;
  if (/(trả lời ngắn|không cần chi tiết|vibe|thôi chi tiết|ngắn gọn)/i.test(lower)) return false;
  return undefined;
}

export const DEFAULT_TECHNICAL_TRIGGERS = [
  'technical mode',
  'giải thích kỹ thuật',
  'đào sâu',
  'chi tiết kỹ thuật',
];

/** Deterministic projection body rendered into each host overlay (REQ-C06). */
export function renderProfileForHost(profile: OperatorProfile, host: string): string {
  return [
    `<!-- agent-rules:operator-profile:${profile.profile_id} BEGIN (source-sha bound; do not edit in place) -->`,
    `- profile_id: ${profile.profile_id}`,
    `- version: ${profile.version}`,
    `- language: ${profile.language} (outcome-first: ${profile.outcome_first})`,
    `- default_owner_mode: ${profile.default_owner_mode}`,
    `- host: ${host}`,
    `- ask_only_for: ${profile.communication.ask_only_for.join(', ')}`,
    `- technical_triggers: ${profile.technical_mode.trigger_phrases.join(' | ')}`,
    `- technical_revert: ${profile.technical_mode.revert}`,
    `- never_weaken: ${profile.security_floor.never_weaken.join(', ')}`,
    `<!-- agent-rules:operator-profile:${profile.profile_id} END -->`,
  ].join('\n');
}

/** Projection status semantics (REQ-C05/C08). */
export function computeProjectionStatus(input: {
  expectedContent: string | null;
  actualContent: string | null;
  surfaceSupported: boolean;
}): OperatorProjectionStatus {
  if (!input.surfaceSupported) return 'MANUAL_PROJECTION';
  if (input.expectedContent === null) return 'UNSUPPORTED';
  if (input.actualContent === null) return 'NEEDS_USER';
  return input.actualContent === input.expectedContent ? 'SYNCED' : 'DRIFTED';
}

export const OVERLAY_SECTION_BEGIN = (id: string) => `<!-- agent-rules:operator-profile:${id} BEGIN`;
