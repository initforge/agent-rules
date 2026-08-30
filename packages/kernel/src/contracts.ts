import { createHash } from 'node:crypto';

export interface RuntimeCandidateManifest {
  readonly schema: 'agent-rules/runtime-candidate-manifest/v1';
  readonly candidate_id: string;
  readonly package_id: string;
  readonly package_version: string;
  readonly asset_hashes: Readonly<Record<string, string>>;
  readonly schema_hashes: Readonly<Record<string, string>>;
  readonly platform_contract_hashes: Readonly<Record<string, string>>;
  readonly manifest_sha256: string;
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function isSha256(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function assertHashMap(value: unknown, name: string): asserts value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  for (const [key, hash] of Object.entries(value)) if (!key || !isSha256(hash)) throw new Error(`${name} contains an invalid path or SHA-256`);
}

export function assertRuntimeCandidateManifest(manifest: RuntimeCandidateManifest): void {
  if (manifest.schema !== 'agent-rules/runtime-candidate-manifest/v1') throw new Error('runtime candidate manifest schema is invalid');
  if (!manifest.package_id || !manifest.package_version || !isSha256(manifest.candidate_id)) throw new Error('runtime candidate identity is invalid');
  assertHashMap(manifest.asset_hashes, 'asset_hashes');
  assertHashMap(manifest.schema_hashes, 'schema_hashes');
  assertHashMap(manifest.platform_contract_hashes, 'platform_contract_hashes');
  const { manifest_sha256, ...body } = manifest;
  if (!isSha256(manifest_sha256) || sha256(JSON.stringify(body)) !== manifest_sha256) throw new Error('runtime candidate manifest hash mismatch');
}
