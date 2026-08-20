/**
 * util/hashes.ts — sha256 helpers for fingerprints, digests and tokens.
 */
import { createHash, randomUUID } from 'node:crypto';

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function sha256File(filePath: string, fs: typeof import('node:fs')): string {
  return sha256Hex(fs.readFileSync(filePath));
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function newToken(): string {
  return randomUUID();
}

/** Deterministic command digest over argv so config drift is detectable. */
export function commandDigest(command: string, args: readonly string[]): string {
  return sha256Hex(JSON.stringify({ command, args }));
}

/** Hash of a canonical JSON document (registry, policy). */
export function docHash(obj: unknown): string {
  return sha256Hex(JSON.stringify(obj));
}
