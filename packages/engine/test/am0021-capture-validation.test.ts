import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const CAPTURE = path.join(ROOT, '.agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/lineage/am0021-capture.json');

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p, 'utf-8')).digest('hex');
}

function sha256Str(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf-8').digest('hex');
}

describe('AM-0021 capture validation (boundedRepair brCapVerify)', () => {
  let cap: Record<string, unknown>;

  beforeAll(() => {
    cap = JSON.parse(fs.readFileSync(CAPTURE, 'utf-8'));
  });

  it('has required top-level fields', () => {
    expect(cap.schema_version).toBeTruthy();
    expect(typeof cap.plan_id).toBe('string');
    expect(cap.amendment_id).toBe('AM-0021');
  });

  it('original.sha256 matches file content', () => {
    const orig = cap.original as Record<string, unknown>;
    expect(orig.sha256).toBe(sha256File(path.join(ROOT, orig.path as string)));
  });

  it('amendment.sha256 matches file content', () => {
    const amend = cap.amendment as Record<string, unknown>;
    expect(amend.sha256).toBe(sha256File(path.join(ROOT, amend.path as string)));
  });

  it('repository_baselines (plural) has active_integration', () => {
    const rb = cap.repository_baselines as Record<string, unknown> | undefined;
    expect(rb).toBeDefined();
    expect(typeof rb.active_integration).toBe('string');
    expect(rb.active_integration).toBeTruthy();
  });

  it('handoff (singular) has path and sha256 that match the file', () => {
    const handoff = cap.handoff as Record<string, unknown> | undefined;
    expect(handoff).toBeDefined();
    expect(typeof handoff.path).toBe('string');
    expect(typeof handoff.sha256).toBe('string');
    expect(handoff.sha256).toBe(sha256File(path.join(ROOT, handoff.path as string)));
  });

  it('validates against brCapVerify logic for steer/audit/continuation_prompt fields', () => {
    for (const k of ['audit', 'handoff', 'continuation_prompt', 'steer'] as const) {
      const entry = cap[k] as Record<string, unknown> | undefined;
      if (!entry) continue;
      expect(typeof entry.path).toBe('string');
      expect(typeof entry.sha256).toBe('string');
      const fullPath = path.join(ROOT, entry.path as string);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(sha256File(fullPath)).toBe(entry.sha256 as string);
    }
  });
});
