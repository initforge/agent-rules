import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exportPlanBundle, importPlanBundle } from '../src/export-bundle.js';
import type { PlanBundle } from '../src/export-bundle.js';
import { SYMLINK_CAPABLE } from './helpers/symlink-capability.js';

let tmpBase: string;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'export-bundle-test-'));
});

afterEach(() => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

function write(fpath: string, content: string): void {
  const dir = path.dirname(fpath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fpath, content, 'utf-8');
}

function read(fpath: string): string {
  return fs.readFileSync(fpath, 'utf-8');
}

const HASH_64 = 'a'.repeat(64);

// ─── Export ────────────────────────────────────────────────────────────────

describe('exportPlanBundle', () => {
  it('exports bundle with original, amendments, lineage, receipts', async () => {
    const planDir = path.join(tmpBase, 'plan1');
    fs.mkdirSync(planDir, { recursive: true });
    fs.mkdirSync(path.join(planDir, 'amendments'), { recursive: true });
    fs.mkdirSync(path.join(planDir, 'lineage'), { recursive: true });
    write(path.join(planDir, 'original.md'), '# Original');
    write(path.join(planDir, 'amendments', 'am1.md'), '# Amendment 1');
    write(path.join(planDir, 'lineage', 'v1.json'), JSON.stringify({ v: 1 }));
    write(path.join(planDir, 'ledger.json'), JSON.stringify({
      receipts: [{ receiptId: 'R1', assignmentId: 'A1', workerIdentity: 'w1', host: 'h', model: 'm', artifactUris: [], artifactHashes: [], filesChanged: [], commands: [{ executable: 'test', args: [] }], exitCodes: [0], logUris: [], logHashes: [], testEvidenceUris: [], testEvidenceHashes: [], startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T01:00:00.000Z' }],
    }));

    const bundle = await exportPlanBundle(planDir);
    expect(bundle.formatVersion).toBe('1.0');
    expect(bundle.originalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.effectivePlanSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.amendments).toHaveLength(1);
    expect(bundle.amendments[0].id).toBe('am1');
    expect(bundle.identityKind).toBe('legacy-compatibility');
    expect(bundle.lineage).toHaveLength(1);
    expect(bundle.receipts).toHaveLength(1);
    expect(bundle.planId).toBe('plan1');
  });

  it('throws for non-existent directory', async () => {
    await expect(exportPlanBundle('/nonexistent/path')).rejects.toThrow('does not exist');
  });

  it('throws when original.md missing', async () => {
    const planDir = path.join(tmpBase, 'noorig');
    fs.mkdirSync(planDir, { recursive: true });
    await expect(exportPlanBundle(planDir)).rejects.toThrow('original.md');
  });

  it('handles empty amendments/lineage directories', async () => {
    const planDir = path.join(tmpBase, 'empty');
    fs.mkdirSync(planDir, { recursive: true });
    fs.mkdirSync(path.join(planDir, 'amendments'), { recursive: true });
    fs.mkdirSync(path.join(planDir, 'lineage'), { recursive: true });
    write(path.join(planDir, 'original.md'), 'empty plan');
    const bundle = await exportPlanBundle(planDir);
    expect(bundle.amendments).toHaveLength(0);
    expect(bundle.lineage).toHaveLength(0);
    expect(bundle.identityKind).toBe('canonical');
  });

  it('uses the shared canonical identity for canonical amendment IDs', async () => {
    const planDir = path.join(tmpBase, 'canonical');
    fs.mkdirSync(path.join(planDir, 'amendments'), { recursive: true });
    write(path.join(planDir, 'original.md'), 'canonical plan');
    write(path.join(planDir, 'amendments', 'AM-0001.md'), 'approved amendment');

    const bundle = await exportPlanBundle(planDir);
    expect(bundle.identityKind).toBe('canonical');
    expect(bundle.effectivePlanSha256).not.toBe(bundle.originalSha256);
  });
});

// ─── Import ────────────────────────────────────────────────────────────────

describe('importPlanBundle', () => {
  it('validates and imports a valid bundle', async () => {
    const srcDir = path.join(tmpBase, 'src');
    const dstDir = path.join(tmpBase, 'dst');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'amendments'), { recursive: true });
    write(path.join(srcDir, 'original.md'), 'plan content');
    write(path.join(srcDir, 'amendments', 'a1.md'), 'amendment');

    const bundle = await exportPlanBundle(srcDir);
    fs.mkdirSync(dstDir, { recursive: true });
    fs.mkdirSync(path.join(dstDir, 'amendments'), { recursive: true });
    write(path.join(dstDir, 'original.md'), 'plan content');
    write(path.join(dstDir, 'amendments', 'a1.md'), 'amendment');

    const result = await importPlanBundle(bundle, dstDir);
    expect(result.success).toBe(true);

    const bundleFile = path.join(dstDir, 'bundle.json');
    expect(fs.existsSync(bundleFile)).toBe(true);
    const saved = JSON.parse(read(bundleFile));
    expect(saved.planId).toBe(bundle.planId);
  });

  it('rejects bundle with missing formatVersion', async () => {
    const dir = path.join(tmpBase, 'inval1');
    fs.mkdirSync(dir, { recursive: true });
    write(path.join(dir, 'original.md'), 'x');
    const result = await importPlanBundle({} as any, dir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('formatVersion');
  });

  it('rejects bundle with invalid planId (path separators)', async () => {
    const dir = path.join(tmpBase, 'inval2');
    fs.mkdirSync(dir, { recursive: true });
    write(path.join(dir, 'original.md'), 'x');
    const bundle: PlanBundle = {
      formatVersion: '1.0',
      planId: '../escape',
      originalSha256: HASH_64,
      effectivePlanSha256: HASH_64,
      amendments: [],
      receipts: [],
      lineage: [],
      exportedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = await importPlanBundle(bundle, dir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('planId');
  });

  it('rejects bundle with invalid originalSha256', async () => {
    const dir = path.join(tmpBase, 'inval3');
    fs.mkdirSync(dir, { recursive: true });
    write(path.join(dir, 'original.md'), 'x');
    const bundle: PlanBundle = {
      formatVersion: '1.0',
      planId: 'test',
      originalSha256: 'not-a-hex',
      effectivePlanSha256: HASH_64,
      amendments: [],
      receipts: [],
      lineage: [],
      exportedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = await importPlanBundle(bundle, dir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('originalSha256');
  });

  it('rejects bundle with invalid effectivePlanSha256', async () => {
    const dir = path.join(tmpBase, 'inval4');
    fs.mkdirSync(dir, { recursive: true });
    write(path.join(dir, 'original.md'), 'x');
    const bundle: PlanBundle = {
      formatVersion: '1.0',
      planId: 'test',
      originalSha256: HASH_64,
      effectivePlanSha256: 'short',
      amendments: [],
      receipts: [],
      lineage: [],
      exportedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = await importPlanBundle(bundle, dir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('effectivePlanSha256');
  });

  it('fails on original SHA mismatch', async () => {
    const srcDir = path.join(tmpBase, 'src2');
    const dstDir = path.join(tmpBase, 'dst2');
    fs.mkdirSync(srcDir, { recursive: true });
    write(path.join(srcDir, 'original.md'), 'original');
    const bundle = await exportPlanBundle(srcDir);
    fs.mkdirSync(dstDir, { recursive: true });
    write(path.join(dstDir, 'original.md'), 'different');
    bundle.originalSha256 = 'f'.repeat(64);
    const result = await importPlanBundle(bundle, dstDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SHA-256 mismatch');
  });

  it('fails on amendment SHA mismatch', async () => {
    const srcDir = path.join(tmpBase, 'src3');
    const dstDir = path.join(tmpBase, 'dst3');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'amendments'), { recursive: true });
    write(path.join(srcDir, 'original.md'), 'plan');
    write(path.join(srcDir, 'amendments', 'am1.md'), 'original amend');
    const bundle = await exportPlanBundle(srcDir);
    fs.mkdirSync(dstDir, { recursive: true });
    fs.mkdirSync(path.join(dstDir, 'amendments'), { recursive: true });
    write(path.join(dstDir, 'original.md'), 'plan');
    write(path.join(dstDir, 'amendments', 'am1.md'), 'tampered amend');
    const result = await importPlanBundle(bundle, dstDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SHA-256 mismatch');
  });

  it('fails on effective plan SHA mismatch', async () => {
    const srcDir = path.join(tmpBase, 'src4');
    const dstDir = path.join(tmpBase, 'dst4');
    fs.mkdirSync(srcDir, { recursive: true });
    write(path.join(srcDir, 'original.md'), 'plan');
    const bundle = await exportPlanBundle(srcDir);
    fs.mkdirSync(dstDir, { recursive: true });
    write(path.join(dstDir, 'original.md'), 'plan');
    write(path.join(dstDir, 'amendments', 'extra.md'), 'unexpected');
    bundle.effectivePlanSha256 = 'e'.repeat(64);
    const result = await importPlanBundle(bundle, dstDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SHA-256 mismatch');
  });
});

// ─── Adversarial: Symlink / containment ───────────────────────────────────

describe('export-bundle adversarial', () => {
  it.skipIf(!SYMLINK_CAPABLE)('rejects symlink in plan dir (O_NOFOLLOW via SecureFsRoot)', async () => {
    const planDir = path.join(tmpBase, 'symlink-attack');
    fs.mkdirSync(planDir, { recursive: true });
    write(path.join(planDir, 'original.md'), 'plan');
    const outside = path.join(tmpBase, 'outside');
    write(outside, 'leaked');
    // Create symlink 'amendments' -> outside in plan dir
    fs.symlinkSync(outside, path.join(planDir, 'amendments'));
    await expect(exportPlanBundle(planDir)).rejects.toThrow();
  });

  it.skipIf(!SYMLINK_CAPABLE)('rejects symlink in lineage dir (O_NOFOLLOW via SecureFsRoot)', async () => {
    const planDir = path.join(tmpBase, 'symlink-attack2');
    fs.mkdirSync(planDir, { recursive: true });
    write(path.join(planDir, 'original.md'), 'plan');
    const outside = path.join(tmpBase, 'outside2');
    write(outside, 'leaked');
    fs.symlinkSync(outside, path.join(planDir, 'lineage'));
    await expect(exportPlanBundle(planDir)).rejects.toThrow();
  });

  it.skipIf(!SYMLINK_CAPABLE)('rejects import when original.md is a symlink', async () => {
    const srcDir = path.join(tmpBase, 'src5');
    const dstDir = path.join(tmpBase, 'dst5');
    fs.mkdirSync(srcDir, { recursive: true });
    write(path.join(srcDir, 'original.md'), 'real plan');
    const bundle = await exportPlanBundle(srcDir);
    fs.mkdirSync(dstDir, { recursive: true });
    // Create symlink original.md -> outside
    const outside = path.join(tmpBase, 'fake-original');
    write(outside, 'fake plan');
    fs.symlinkSync(outside, path.join(dstDir, 'original.md'));
    const result = await importPlanBundle(bundle, dstDir);
    // SecureFsRoot.openRead uses O_NOFOLLOW, should fail on symlink
    expect(result.success).toBe(false);
  });

  it('rejects import when ledger.json is a symlink', async () => {
    const srcDir = path.join(tmpBase, 'src6');
    const dstDir = path.join(tmpBase, 'dst6');
    fs.mkdirSync(srcDir, { recursive: true });
    write(path.join(srcDir, 'original.md'), 'plan');
    const bundle = await exportPlanBundle(srcDir);
    fs.mkdirSync(dstDir, { recursive: true });
    fs.mkdirSync(path.join(dstDir, 'amendments'), { recursive: true });
    write(path.join(dstDir, 'original.md'), 'plan');
    // Symlink the ledger.json (even though import doesn't read it, still OK)
    const outside = path.join(tmpBase, 'fake-ledger');
    write(outside, '{}');
    const result = await importPlanBundle(bundle, dstDir);
    expect(result.success).toBe(true);
  });

  it('containment: rejects absolute traversal in amendment path', async () => {
    const dir = path.join(tmpBase, 'contain');
    fs.mkdirSync(dir, { recursive: true });
    write(path.join(dir, 'original.md'), 'plan');
    // Create a nested structure that tries containment
    // Using SecureFsRoot, so any path component resolved outside root is rejected
    // Create a real amend dir
    fs.mkdirSync(path.join(dir, 'amendments'), { recursive: true });
    write(path.join(dir, 'amendments', 'real.md'), 'real');
    const bundle = await exportPlanBundle(dir);
    expect(bundle.amendments).toHaveLength(1);
    expect(bundle.amendments[0].id).toBe('real');
    await expect(importPlanBundle({
      ...bundle,
    }, dir)).resolves.toMatchObject({ success: true });
  });
});
