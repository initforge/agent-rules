import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type LedgerData = Record<string, unknown>;

interface LedgerEnvelope {
  schema: string;
  version: number;
  sha256: string;
  payload: LedgerData;
}

const CURRENT_SCHEMA = 'harness/work-ledger';
const CURRENT_VERSION = 1;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function computeEnvelopeSha256(schema: string, version: number, payload: LedgerData): string {
  return sha256(`${schema}:${version}:${JSON.stringify(payload)}`);
}

export class WorkLedger {
  private readonly path: string;
  private readonly tmpPath: string;

  constructor(path: string) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error('path must be non-empty');
    }
    this.path = path;
    this.tmpPath = `${path}.tmp`;
  }

  async writeAtomic(data: LedgerData): Promise<void> {
    const payload = { ...data };
    const sha256Hex = computeEnvelopeSha256(CURRENT_SCHEMA, CURRENT_VERSION, payload);
    const envelope: LedgerEnvelope = {
      schema: CURRENT_SCHEMA,
      version: CURRENT_VERSION,
      sha256: sha256Hex,
      payload,
    };

    ensureDir(path.dirname(this.path));
    fs.writeFileSync(this.tmpPath, JSON.stringify(envelope, null, 2), 'utf-8');
    const tmpFd = fs.openSync(this.tmpPath, 'r+');
    try {
      fs.fsyncSync(tmpFd);
    } finally {
      fs.closeSync(tmpFd);
    }
    fs.renameSync(this.tmpPath, this.path);
    const dirFd = fs.openSync(path.dirname(this.path), 'r');
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  }

  async readWithIntegrity(): Promise<{ data: LedgerData; valid: boolean; error?: string }> {
    try {
      if (!fs.existsSync(this.path)) {
        return { data: {}, valid: false, error: 'Ledger file does not exist' };
      }

      const raw = fs.readFileSync(this.path, 'utf-8');
      const envelope = JSON.parse(raw) as LedgerEnvelope;

      if (envelope.schema !== CURRENT_SCHEMA) {
        return { data: envelope.payload || {}, valid: false, error: `Schema mismatch: expected ${CURRENT_SCHEMA}, got ${envelope.schema}` };
      }
      if (envelope.version !== CURRENT_VERSION) {
        return { data: envelope.payload || {}, valid: false, error: `Version mismatch: expected ${CURRENT_VERSION}, got ${envelope.version}` };
      }

      const expectedSha = computeEnvelopeSha256(envelope.schema, envelope.version, envelope.payload || {});
      if (envelope.sha256 !== expectedSha) {
        return { data: envelope.payload || {}, valid: false, error: `SHA-256 mismatch: expected ${expectedSha}, got ${envelope.sha256}` };
      }

      return { data: envelope.payload || {}, valid: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: {}, valid: false, error: message };
    }
  }

  async regenerateShadows(): Promise<string[]> {
    const result = await this.readWithIntegrity();
    if (!result.valid) {
      throw new Error(`Cannot regenerate shadows: ${result.error || 'invalid ledger'}`);
    }

    const baseDir = path.dirname(this.path);
    const shadowDir = path.join(baseDir, 'shadows');
    ensureDir(shadowDir);

    const shadowHashes: string[] = [];
    const data = result.data;

    const shadowSections = ['tasks', 'receipts', 'verifications', 'requirements'];
    for (const section of shadowSections) {
      const sectionData = data[section];
      if (sectionData !== undefined) {
        const content = JSON.stringify(sectionData, null, 2);
        const contentHash = sha256(content);
        const shadowPath = path.join(shadowDir, `${section}.md`);
        fs.writeFileSync(shadowPath, content, 'utf-8');
        shadowHashes.push(contentHash);
      }
    }

    const fullContent = JSON.stringify(data, null, 2);
    const fullHash = sha256(fullContent);
    const fullShadowPath = path.join(shadowDir, 'full.md');
    fs.writeFileSync(fullShadowPath, fullContent, 'utf-8');
    shadowHashes.push(fullHash);

    return shadowHashes;
  }

  async detectTamper(): Promise<{ tampered: boolean; drift: Array<{ file: string; expected: string; actual: string }> }> {
    const result = await this.readWithIntegrity();
    if (!result.valid) {
      return {
        tampered: true,
        drift: [{ file: this.path, expected: '(valid ledger)', actual: result.error || 'unknown error' }],
      };
    }

    const drift: Array<{ file: string; expected: string; actual: string }> = [];
    const payload = result.data;
    const shadowHashes = payload['shadowHashes'] as Record<string, string> | undefined;

    if (shadowHashes && typeof shadowHashes === 'object') {
      const baseDir = path.dirname(this.path);
      const shadowDir = path.join(baseDir, 'shadows');

      for (const [fileName, expectedHash] of Object.entries(shadowHashes)) {
        const filePath = path.join(shadowDir, fileName);
        if (!fs.existsSync(filePath)) {
          drift.push({ file: filePath, expected: expectedHash, actual: '(missing)' });
        } else {
          const content = fs.readFileSync(filePath, 'utf-8');
          const actualHash = sha256(content);
          if (actualHash !== expectedHash) {
            drift.push({ file: filePath, expected: expectedHash, actual: actualHash });
          }
        }
      }
    }

    return { tampered: drift.length > 0, drift };
  }
}
