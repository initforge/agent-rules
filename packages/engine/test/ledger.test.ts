import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkLedger, type LedgerData } from '../src/ledger.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('WorkLedger', () => {
  let ledger: WorkLedger;
  let ledgerPath: string;

  beforeEach(() => {
    const dir = tmpDir();
    ledgerPath = path.join(dir, 'ledger.json');
    ledger = new WorkLedger(ledgerPath);
  });

  it('writeAtomic creates atomic file (tmp -> rename)', async () => {
    const data: LedgerData = { test: 'value', count: 42 };

    const tmpPath = `${ledgerPath}.tmp`;
    expect(fs.existsSync(ledgerPath)).toBe(false);
    expect(fs.existsSync(tmpPath)).toBe(false);

    await ledger.writeAtomic(data);

    expect(fs.existsSync(ledgerPath)).toBe(true);
    expect(fs.existsSync(tmpPath)).toBe(false);

    const content = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    expect(content.schema).toBe('harness/work-ledger');
    expect(content.version).toBe(1);
    expect(content.payload).toEqual(data);
    expect(content.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('readWithIntegrity reads valid data correctly', async () => {
    const data: LedgerData = { key: 'value', nested: { a: 1 } };
    await ledger.writeAtomic(data);

    const result = await ledger.readWithIntegrity();
    expect(result.valid).toBe(true);
    expect(result.data).toEqual(data);
    expect(result.error).toBeUndefined();
  });

  it('readWithIntegrity detects tampered data', async () => {
    const data: LedgerData = { key: 'original' };
    await ledger.writeAtomic(data);

    fs.writeFileSync(ledgerPath, JSON.stringify({ schema: 'harness/work-ledger', version: 1, sha256: 'a'.repeat(64), payload: { key: 'tampered' } }), 'utf-8');

    const result = await ledger.readWithIntegrity();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('SHA-256 mismatch');
  });

  it('readWithIntegrity reports error for non-existent file', async () => {
    const missingLedger = new WorkLedger(path.join(tmpDir(), 'nonexistent.json'));
    const result = await missingLedger.readWithIntegrity();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not exist');
  });

  it('detectTamper finds modified files', async () => {
    const data: LedgerData = {
      content: 'test',
      shadowHashes: { 'tasks.md': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
    };
    await ledger.writeAtomic(data);

    const baseDir = path.dirname(ledgerPath);
    const shadowDir = path.join(baseDir, 'shadows');
    fs.mkdirSync(shadowDir, { recursive: true });
    fs.writeFileSync(path.join(shadowDir, 'tasks.md'), '# Clean tasks', 'utf-8');

    const result1 = await ledger.detectTamper();
    expect(result1.tampered).toBe(true);
    expect(result1.drift.length).toBeGreaterThan(0);
    expect(result1.drift[0].file).toContain('tasks.md');
  });

  it('detectTamper reports no tamper when shadow hashes match', async () => {
    const data: LedgerData = {
      content: 'test',
      shadowHashes: {},
    };
    await ledger.writeAtomic(data);

    const result = await ledger.detectTamper();
    expect(result.tampered).toBe(false);
    expect(result.drift).toHaveLength(0);
  });

  it('detectTamper reports tamper when ledger itself is corrupted', async () => {
    fs.writeFileSync(ledgerPath, 'not-json', 'utf-8');

    const result = await ledger.detectTamper();
    expect(result.tampered).toBe(true);
  });

  it('regenerateShadows creates shadow files', async () => {
    const data: LedgerData = {
      tasks: [{ id: 'T1', status: 'done' }],
      receipts: [{ id: 'R1' }],
    };
    await ledger.writeAtomic(data);

    const hashes = await ledger.regenerateShadows();

    const baseDir = path.dirname(ledgerPath);
    const shadowDir = path.join(baseDir, 'shadows');

    expect(fs.existsSync(path.join(shadowDir, 'tasks.md'))).toBe(true);
    expect(fs.existsSync(path.join(shadowDir, 'receipts.md'))).toBe(true);
    expect(fs.existsSync(path.join(shadowDir, 'full.md'))).toBe(true);
    expect(hashes.length).toBeGreaterThan(0);
    expect(hashes.every((h) => /^[a-f0-9]{64}$/.test(h))).toBe(true);
  });

  it('regenerateShadows throws for invalid ledger', async () => {
    const badLedger = new WorkLedger(path.join(tmpDir(), 'missing.json'));
    await expect(badLedger.regenerateShadows()).rejects.toThrow('Cannot regenerate shadows');
  });
});
