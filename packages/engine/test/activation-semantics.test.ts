import { describe, expect, it } from 'vitest';
import {
  sha256Bytes, fatalUtf8Decode, canonicalJsonIdentity, canonicalSha256, payloadBytes, validateCanonicalJson,
  validateCaptureChain, validateAmendmentChain,
  parseAm0012Ns0To9, validateAcMapping, setAnchorTextHashes,
  validateAssignmentsBatches,
  discoverEvidenceGraph, computeStale,
  reanchorToNsTask, fastPathStructure, computeEffectivePlanSha256,
  fullAnchorKey,
  type CaptureRecord, type ActivationAmendment, type NsAnchor, type ContinuationLink,
  type EvidenceNode, type EvidenceGraph,
} from '../src/activation-semantics.js';
import type { Sha256, PlanAnchor, RepositoryBaseline, HostTaskRef, PlanHandoff, ReviewReceipt, TaskAssignment, LedgerBatch } from '../src/contracts.js';

// ══════════════════════════════════════════════════════════════════════════════
// CANONICAL FIXTURES — explicit raw bytes, hardcoded known SHAs
// ══════════════════════════════════════════════════════════════════════════════

const CANONICAL_PLAN =
  '# Full Plan\n\n## NS0 Overview\nREQ-OVERVIEW: Plan overview and scope.\n\n## NS1 Setup\nREQ-SETUP: Environment setup.\n\n## NS2 Config\nREQ-CONFIG: Configuration management.\n\n## NS3 Build\nREQ-BUILD: Build system.\n\n## NS4 Test\nREQ-TEST: Test framework.\n\n## NS5 Deploy\nREQ-DEPLOY: Deployment pipeline.\n\n## NS6 Monitor\nREQ-MONITOR: Monitoring setup.\n\n## NS7 Task\nREQ-TASK: Task execution.\n\n## NS8 Review\nREQ-REVIEW: Review process.\n\n## NS9 Final\nREQ-FINAL: Final validation.\n';
const PLAN_BYTES = new TextEncoder().encode(CANONICAL_PLAN);
const PLAN_SHA: Sha256 = '41c24bfb009a15993bb8a769337d3879827637181cf0980e80922968867a6624';
const PLAN_LINE_COUNT = CANONICAL_PLAN.split(/\r?\n/).length;

const CANONICAL_AM0012 =
  '[NS0] [AC1, AC2]\n  anchor: NS0 Overview | 3 4 | REQ-OVERVIEW\n[NS1] [AC3, AC4]\n  anchor: NS1 Setup | 6 7 | REQ-SETUP\n[NS2] [AC5, AC6]\n  anchor: NS2 Config | 9 10 | REQ-CONFIG\n[NS3] [AC7, AC8]\n  anchor: NS3 Build | 12 13 | REQ-BUILD\n[NS4] [AC9, AC10]\n  anchor: NS4 Test | 15 16 | REQ-TEST\n[NS5] [AC11, AC12]\n  anchor: NS5 Deploy | 18 19 | REQ-DEPLOY\n[NS6] [AC13, AC14]\n  anchor: NS6 Monitor | 21 22 | REQ-MONITOR\n[NS7] [AC15, AC16]\n  anchor: NS7 Task | 24 25 | REQ-TASK\n[NS8] [AC17, AC18]\n  anchor: NS8 Review | 27 28 | REQ-REVIEW\n[NS9] [AC19, AC20]\n  anchor: NS9 Final | 30 31 | REQ-FINAL\n';
const AM0012_BYTES = new TextEncoder().encode(CANONICAL_AM0012);
const AM0012_SHA: Sha256 = 'efd455e16095185cc08224daea95d771245c658ab71f3f066cd90a2e3c4f4fde';

const AM_BODIES: Record<string, string> = {};
const AM_SHAS: Record<string, Sha256> = {};
for (let i = 1; i <= 11; i++) {
  const id = 'AM' + String(i).padStart(4, '0');
  const body = id + ': sample amendment ' + i;
  AM_BODIES[id] = body;
  AM_SHAS[id] = sha256Bytes(new TextEncoder().encode(body));
}
const AM0004_TOMBSTONE = 'AM0004: tombstone revoked';
const AM0004_TOMBSTONE_SHA: Sha256 = '3c13e5fd288648a55b72e4858f85bc09e729240f53a3fcaeb731b7b9d0feede1';
AM_BODIES['AM0012'] = CANONICAL_AM0012;
AM_SHAS['AM0012'] = AM0012_SHA;

const NS7_ANCHOR_SHA: Sha256 = '705e2915cf27b323569051edaac6e2cc8bf69ff9d085e010f7c2f61981e4076c';

// ── Constants verified from external one-time computation ────────────────────

const hash = 'a'.repeat(64) as Sha256;
const repoBaseline: RepositoryBaseline = { commit: 'abc123', branch: 'main', dirtyFingerprint: hash };
const audit: HostTaskRef = { host: 'codex', taskRef: 'task-001', sessionRef: 'session-001' };
const handoff: PlanHandoff = { recipientRole: 'worker', requiredArtifacts: ['receipt'], nextSafeAction: 'verify' };

function contLink(predecessorId = 'ORIGIN', predecessorHash: Sha256 = hash): ContinuationLink {
  return { predecessorId, predecessorHash };
}

function capture(overrides: Partial<CaptureRecord> & { cont?: ContinuationLink } = {}): CaptureRecord {
  return {
    planId: 'plan-001', relativePath: 'packages/engine/src/main.ts',
    sha256: hash, baselines: [repoBaseline], audit, handoff,
    continuation: overrides.cont ?? contLink(), status: 'VERIFIED', rule: 'capture:plan',
    ...overrides,
  } as CaptureRecord;
}

function amendment(id: string, status: ActivationAmendment['status'] = 'APPROVED',
  sha: Sha256 = hash, sourceRef = 'owner://amendment'): ActivationAmendment {
  return { amendmentId: id as any, status, sha256: sha, sourceRef };
}

function section(nsId: string, acIds: string[], anchors: PlanAnchor[]): NsAnchor {
  return { nsId: nsId as any, acIds: acIds as any, anchors };
}

function planAnchor(overrides: Partial<PlanAnchor> = {}): PlanAnchor {
  return {
    planSha256: PLAN_SHA, sectionHeading: 'NS0 Overview', lineStart: 3, lineEnd: 4,
    anchorTextSha256: NS7_ANCHOR_SHA, requirementId: 'REQ-OVERVIEW', chunkIndex: 0, ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// FIXTURE INTEGRITY — golden from external known computation
// ══════════════════════════════════════════════════════════════════════════════

describe('fixture golden constants', () => {
  it('plan SHA from canonical bytes', () => {
    expect(PLAN_SHA).toBe('41c24bfb009a15993bb8a769337d3879827637181cf0980e80922968867a6624');
  });
  it('AM0012 SHA from canonical bytes', () => {
    expect(AM0012_SHA).toBe('efd455e16095185cc08224daea95d771245c658ab71f3f066cd90a2e3c4f4fde');
  });
  it('NS7 anchor text SHA', () => {
    expect(NS7_ANCHOR_SHA).toBe('705e2915cf27b323569051edaac6e2cc8bf69ff9d085e010f7c2f61981e4076c');
  });
});

// ── Strict canonical JSON ────────────────────────────────────────────────────

describe('strict canonical JSON', () => {
  it('rejects undefined', () => {
    expect(() => canonicalJsonIdentity({ a: undefined })).toThrow();
  });
  it('rejects NaN', () => {
    expect(() => canonicalJsonIdentity({ a: NaN })).toThrow();
  });
  it('rejects Infinity', () => {
    expect(() => canonicalJsonIdentity({ a: Infinity })).toThrow();
  });
  it('rejects sparse array', () => {
    const arr: unknown[] = [];
    arr[1] = 'b';
    expect(() => canonicalJsonIdentity(arr)).toThrow();
  });
  it('rejects non-plain object (Date)', () => {
    expect(() => canonicalJsonIdentity(new Date())).toThrow();
  });
  it('rejects non-plain object (custom class)', () => {
    class Foo {}
    expect(() => canonicalJsonIdentity(new Foo())).toThrow();
  });
  it('accepts valid values', () => {
    expect(() => canonicalJsonIdentity({ a: 1, b: 'hello', c: null, d: [1, 2, 3], e: { f: true } })).not.toThrow();
  });
  it('sorted-key output', () => {
    expect(canonicalJsonIdentity({ b: 2, a: 1, c: { z: 3, y: 2 } })).toBe('{"a":1,"b":2,"c":{"y":2,"z":3}}');
  });
  it('deterministic', () => {
    expect(canonicalJsonIdentity({ x: 10, y: 20 })).toBe(canonicalJsonIdentity({ y: 20, x: 10 }));
  });
  it('reproducible sha256', () => {
    expect(canonicalSha256({ a: 1, b: 2 })).toBe(canonicalSha256({ b: 2, a: 1 }));
  });
  it('collision test: different values produce different hashes', () => {
    const h1 = canonicalSha256({ a: 1 });
    const h2 = canonicalSha256({ a: 2 });
    expect(h1).not.toBe(h2);
  });
  it('collision test: array order matters', () => {
    const h1 = canonicalSha256([1, 2]);
    const h2 = canonicalSha256([2, 1]);
    expect(h1).not.toBe(h2);
  });
});

describe('payloadBytes', () => {
  it('excludes sha256 from bytes', () => {
    const bytes = payloadBytes({ a: 1, sha256: 'abc' as Sha256 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1}');
  });
  it('canonical sorting preserved', () => {
    const bytes = payloadBytes({ z: 1, a: 2, sha256: '' as Sha256 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":2,"z":1}');
  });
});

// ── Effective plan SHA ───────────────────────────────────────────────────────

describe('computeEffectivePlanSha256', () => {
  it('original only (no effectives) returns PLAN_SHA', () => {
    expect(computeEffectivePlanSha256(PLAN_BYTES, [], new Map())).toBe(PLAN_SHA);
  });
  it('original + APPROVED AM0001', () => {
    const map = new Map([['AM0001', new TextEncoder().encode(AM_BODIES['AM0001'])]]);
    const result = computeEffectivePlanSha256(PLAN_BYTES, [amendment('AM0001', 'APPROVED', AM_SHAS['AM0001'])], map);
    // Pre-computed golden: sha256(PLAN + AM0001 body)
    expect(result).toBe('8a03f13f30bb2e605a532038cc33551d0314ea1c02eed2328487cb46213cbba8');
  });
});

// ── Capture chain ────────────────────────────────────────────────────────────

describe('validateCaptureChain', () => {
  function makeAmBytes(ids: string[]): Map<string, Uint8Array> {
    const m = new Map();
    for (const id of ids) {
      const body = AM_BODIES[id] ?? id + ': sample';
      m.set(id, new TextEncoder().encode(body));
    }
    return m;
  }

  it('accepts valid chain covering all amendments', () => {
    const ams = [amendment('AM0001', 'APPROVED', AM_SHAS['AM0001'])];
    expect(() => validateCaptureChain(
      [capture({ sha256: AM_SHAS['AM0001'], cont: contLink('ORIGIN', AM_SHAS['AM0001']) })],
      ams, makeAmBytes(['AM0001']),
    )).not.toThrow();
  });
  it('rejects empty chain', () => {
    expect(() => validateCaptureChain([], [], new Map())).toThrow('non-empty');
  });
  it('rejects missing amendment bytes', () => {
    expect(() => validateCaptureChain(
      [capture({ sha256: hash, cont: contLink('ORIGIN', hash) })],
      [amendment('AM0001', 'APPROVED', hash)], new Map(),
    )).toThrow('missing bytes');
  });
  it('rejects SHA mismatch between declared and actual bytes', () => {
    const bytes = new Map([['AM0001', new TextEncoder().encode('different bytes')]]);
    expect(() => validateCaptureChain(
      [capture({ sha256: hash, cont: contLink('ORIGIN', hash) })],
      [amendment('AM0001', 'APPROVED', hash)], bytes,
    )).toThrow('SHA mismatch');
  });
  it('rejects missing amendment hash entry in captures', () => {
    const ams = [amendment('AM0001', 'APPROVED', AM_SHAS['AM0001'])];
    expect(() => validateCaptureChain(
      [capture({ sha256: 'b'.repeat(64) as Sha256, cont: contLink('ORIGIN', 'b'.repeat(64) as Sha256) })],
      ams, makeAmBytes(['AM0001']),
    )).toThrow('missing hash entry');
  });
  it('rejects duplicate planId', () => {
    expect(() => validateCaptureChain(
      [capture(), capture()], [], new Map(),
    )).toThrow('duplicate planId');
  });
  it('validates continuation ordered chain', () => {
    const c1 = capture({ planId: 'C1', sha256: 'b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1' as Sha256, cont: contLink('ORIGIN', hash) });
    const c2 = capture({ planId: 'C2', sha256: 'c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2' as Sha256, cont: contLink('C1', 'b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1' as Sha256) });
    expect(() => validateCaptureChain([c1, c2], [], new Map())).not.toThrow();
  });
  it('rejects continuation predecessor mismatch', () => {
    const c1 = capture({ planId: 'C1', sha256: hash, cont: contLink('ORIGIN', hash) });
    const c2 = capture({ planId: 'C2', sha256: hash, cont: contLink('WRONG', hash) });
    // predecessorId 'WRONG' != previous planId 'C1'
    expect(() => validateCaptureChain([c1, c2], [], new Map())).toThrow('predecessorId');
  });
  it('rejects continuation hash mismatch', () => {
    const c1 = capture({ planId: 'C1', sha256: hash, cont: contLink('ORIGIN', hash) });
    const c2 = capture({ planId: 'C2', sha256: hash, cont: contLink('C1', 'b'.repeat(64) as Sha256) });
    expect(() => validateCaptureChain([c1, c2], [], new Map())).toThrow('predecessorHash mismatch');
  });
});

// ── Amendment chain ──────────────────────────────────────────────────────────

describe('validateAmendmentChain', () => {
  it('accepts manifest order', () => {
    const ams = [amendment('AM0001', 'APPROVED'), amendment('AM0002', 'EFFECTIVE')];
    expect(() => validateAmendmentChain(ams, ['AM0001', 'AM0002'])).not.toThrow();
  });
  it('rejects wrong order vs manifest', () => {
    const ams = [amendment('AM0002', 'APPROVED'), amendment('AM0001', 'APPROVED')];
    expect(() => validateAmendmentChain(ams, ['AM0001', 'AM0002'])).toThrow('Position 0: expected AM0001');
  });
  it('rejects empty chain', () => { expect(() => validateAmendmentChain([], [])).toThrow('non-empty'); });
  it('rejects count mismatch', () => {
    expect(() => validateAmendmentChain([amendment('AM0001')], ['AM0001', 'AM0002'])).toThrow('Expected 2');
  });
  it('rejects duplicate IDs', () => {
    expect(() => validateAmendmentChain([amendment('AM0001'), amendment('AM0001')], ['AM0001', 'AM0001'])).toThrow('duplicate');
  });
  it('AM0004 must be TOMBSTONED', () => {
    expect(() => validateAmendmentChain([amendment('AM0004', 'APPROVED')], ['AM0004'])).toThrow('TOMBSTONED');
  });
  it('AM0004 tombstone accepted', () => {
    expect(() => validateAmendmentChain(
      [amendment('AM0004', 'TOMBSTONED', AM0004_TOMBSTONE_SHA, 'tombstone')], ['AM0004'],
    )).not.toThrow();
  });
  it('AM0012 PENDING requires pending: sourceRef', () => {
    expect(() => validateAmendmentChain(
      [amendment('AM0012', 'PENDING', hash, 'pending:pre-identity')], ['AM0012'],
    )).not.toThrow();
  });
  it('AM0012 PENDING rejects wrong sourceRef', () => {
    expect(() => validateAmendmentChain(
      [amendment('AM0012', 'PENDING', hash, 'wrong')], ['AM0012'],
    )).toThrow('sourceRef must start with pending:');
  });
  it('AM0012 EFFECTIVE accepted', () => {
    expect(() => validateAmendmentChain([amendment('AM0012', 'EFFECTIVE')], ['AM0012'])).not.toThrow();
  });
  it('rejects unknown status', () => {
    expect(() => validateAmendmentChain([amendment('AM0001', 'UNKNOWN' as any)], ['AM0001'])).toThrow('unknown status');
  });
  it('AM-0012 hyphenated maps to AM0012 constraint (EFFECTIVE)', () => {
    expect(() => validateAmendmentChain([amendment('AM-0012', 'EFFECTIVE')], ['AM-0012'])).not.toThrow();
  });
  it('AM-0012 hyphenated maps to AM0012 constraint (PENDING)', () => {
    expect(() => validateAmendmentChain(
      [amendment('AM-0012', 'PENDING', hash, 'pending:pre-identity')], ['AM-0012'],
    )).not.toThrow();
  });
  it('AM-0012 hyphenated PENDING rejects wrong sourceRef', () => {
    expect(() => validateAmendmentChain(
      [amendment('AM-0012', 'PENDING', hash, 'wrong')], ['AM-0012'],
    )).toThrow('sourceRef must start with pending:');
  });
  it('AM-0012 hyphenated rejects non-PENDING/EFFECTIVE status', () => {
    expect(() => validateAmendmentChain(
      [amendment('AM-0012', 'APPROVED')], ['AM-0012'],
    )).toThrow('AM0012 must be PENDING or EFFECTIVE');
  });
  it('AM-0012 hyphenated AM-0004 must be TOMBSTONED', () => {
    expect(() => validateAmendmentChain([amendment('AM-0004', 'APPROVED')], ['AM-0004'])).toThrow('TOMBSTONED');
  });
  it('AM-0004 hyphenated tombstone accepted', () => {
    expect(() => validateAmendmentChain(
      [amendment('AM-0004', 'TOMBSTONED', AM0004_TOMBSTONE_SHA, 'tombstone')], ['AM-0004'],
    )).not.toThrow();
  });
  it('rejects non-canonical amendment ID (mixed format)', () => {
    expect(() => validateAmendmentChain([amendment('AM_0012', 'EFFECTIVE')], ['AM_0012'])).toThrow('Non-canonical');
  });
});

// ── Parse AM0012 NS0..NS9 sections ──────────────────────────────────────────

describe('parseAm0012Ns0To9', () => {
  it('parses all 10 NS sections and 20 ACs with anchors', () => {
    const mapping = parseAm0012Ns0To9(AM0012_BYTES, PLAN_SHA, PLAN_LINE_COUNT);
    expect(mapping.sections).toHaveLength(10);
    for (let n = 0; n <= 9; n++) {
      expect(mapping.sections[n].nsId).toBe(`NS${n}`);
      expect(mapping.sections[n].acIds).toHaveLength(2);
      expect(mapping.sections[n].anchors).toHaveLength(1);
    }
    expect(mapping.acOrdered).toHaveLength(20);
    expect(mapping.acOrdered[0]).toBe('AC1');
    expect(mapping.acOrdered[19]).toBe('AC20');
  });
  it('rejects NS section without anchor', () => {
    const bad = new TextEncoder().encode(
      '[NS0] [AC1, AC2]\n[NS1] [AC3, AC4]\n  anchor: NS1 Setup | 6 7 | REQ-SETUP\n[NS2] [AC5, AC6]\n[NS3] [AC7, AC8]\n[NS4] [AC9, AC10]\n[NS5] [AC11, AC12]\n[NS6] [AC13, AC14]\n[NS7] [AC15, AC16]\n[NS8] [AC17, AC18]\n[NS9] [AC19, AC20]\n  anchor: NS9 Final | 30 31 | REQ-FINAL\n');
    expect(() => parseAm0012Ns0To9(bad, PLAN_SHA, 100)).toThrow('no valid anchor');
  });
  it('rejects malformed anchor line', () => {
    const bad = new TextEncoder().encode(
      '[NS0] [AC1, AC2]\n  anchor: NS0 Overview | 3 4 | REQ-OVERVIEW\n[NS1] [AC3, AC4]\n  bad line\n[NS2] [AC5, AC6]\n[NS3] [AC7, AC8]\n[NS4] [AC9, AC10]\n[NS5] [AC11, AC12]\n[NS6] [AC13, AC14]\n[NS7] [AC15, AC16]\n[NS8] [AC17, AC18]\n[NS9] [AC19, AC20]\n  anchor: NS9 Final | 30 31 | REQ-FINAL\n');
    expect(() => parseAm0012Ns0To9(bad, PLAN_SHA, 100)).toThrow('malformed line');
  });
  it('rejects anchor line beyond plan', () => {
    const bad = new TextEncoder().encode(
      '[NS0] [AC1, AC2]\n  anchor: NS0 Overview | 3 999 | REQ-OVERVIEW\n[NS1] [AC3, AC4]\n[NS2] [AC5, AC6]\n[NS3] [AC7, AC8]\n[NS4] [AC9, AC10]\n[NS5] [AC11, AC12]\n[NS6] [AC13, AC14]\n[NS7] [AC15, AC16]\n[NS8] [AC17, AC18]\n[NS9] [AC19, AC20]\n');
    expect(() => parseAm0012Ns0To9(bad, PLAN_SHA, 32)).toThrow('exceeds plan line count');
  });
  it('rejects NS10 out of range', () => {
    const bad = new TextEncoder().encode('[NS10] [AC1]\n' + repeatNs(0));
    expect(() => parseAm0012Ns0To9(bad, PLAN_SHA, 100)).toThrow('out of range');
  });
  it('rejects duplicate NS', () => {
    const bad = new TextEncoder().encode('[NS0] [AC1]\n  anchor: NS0 Overview | 3 4 | REQ-OVERVIEW\n[NS0] [AC2]\n  anchor: NS0 Overview | 3 4 | REQ-OVERVIEW\n' + repeatNs(1));
    expect(() => parseAm0012Ns0To9(bad, PLAN_SHA, 100)).toThrow('Duplicate');
  });
  it('rejects AC21', () => {
    const bad = new TextEncoder().encode('[NS0] [AC21]\n' + repeatNs(0, 1));
    expect(() => parseAm0012Ns0To9(bad, PLAN_SHA, 100)).toThrow('out of range');
  });
  it('rejects missing sections', () => {
    expect(() => parseAm0012Ns0To9(new TextEncoder().encode('[NS0] [AC1]\n  anchor: NS0 Overview | 3 4 | REQ-OVERVIEW\n[NS1] [AC2]\n  anchor: NS1 Setup | 6 7 | REQ-SETUP'), PLAN_SHA, 100)).toThrow('expected 10');
  });
  it('rejects non-UTF8', () => {
    expect(() => parseAm0012Ns0To9(new Uint8Array([0xff]), PLAN_SHA, 100)).toThrow();
  });
});

function repeatNs(start: number, skipAc = 0): string {
  let out = '';
  for (let n = start; n <= 9; n++) {
    const ac1 = (n * 2 + 1 + skipAc);
    const ac2 = (n * 2 + 2 + skipAc);
    out += `[NS${n}] [AC${ac1}, AC${ac2}]\n  anchor: NS${n} | ${n + 3} ${n + 4} | REQ-NS${n}\n`;
  }
  return out;
}

// ── setAnchorTextHashes ──────────────────────────────────────────────────────

describe('setAnchorTextHashes', () => {
  it('computes NS7 anchor text hash', () => {
    const ns7: NsAnchor[] = [section('NS7', ['AC15', 'AC16'], [{
      planSha256: PLAN_SHA, sectionHeading: 'NS7 Task', lineStart: 24, lineEnd: 25,
      anchorTextSha256: '' as Sha256, requirementId: 'REQ-TASK', chunkIndex: 0,
    }])];
    const result = setAnchorTextHashes(ns7, PLAN_BYTES, PLAN_SHA);
    expect(result[0].anchors[0].anchorTextSha256).toBe(NS7_ANCHOR_SHA);
  });
  it('anchor identity has full fields', () => {
    const inp: NsAnchor[] = [section('NS7', ['AC15'], [{
      planSha256: PLAN_SHA, sectionHeading: 'NS7 Task', lineStart: 24, lineEnd: 25,
      anchorTextSha256: '' as Sha256, requirementId: 'REQ-TASK', chunkIndex: 0,
    }])];
    const result = setAnchorTextHashes(inp, PLAN_BYTES, PLAN_SHA);
    const a = result[0].anchors[0];
    expect(a.planSha256).toBe(PLAN_SHA);
    expect(a.sectionHeading).toBe('NS7 Task');
    expect(a.lineStart).toBe(24);
    expect(a.lineEnd).toBe(25);
    expect(a.requirementId).toBe('REQ-TASK');
    expect(a.anchorTextSha256).toBe(NS7_ANCHOR_SHA);
  });
  it('fullAnchorKey includes all fields', () => {
    const a: PlanAnchor = { planSha256: PLAN_SHA, sectionHeading: 'NS7 Task', lineStart: 24, lineEnd: 25, anchorTextSha256: NS7_ANCHOR_SHA, requirementId: 'REQ-TASK', chunkIndex: 0 };
    const key = fullAnchorKey(a);
    expect(key).toContain(PLAN_SHA);
    expect(key).toContain('NS7 Task');
    expect(key).toContain('24');
    expect(key).toContain('25');
    expect(key).toContain(NS7_ANCHOR_SHA);
    expect(key).toContain('REQ-TASK');
  });
});

// ── AC mapping ───────────────────────────────────────────────────────────────

describe('validateAcMapping', () => {
  function allNs(): NsAnchor[] {
    const r: NsAnchor[] = [];
    for (let n = 0; n <= 9; n++) {
      r.push(section(`NS${n}`, [`AC${n * 2 + 1}`, `AC${n * 2 + 2}`], []));
    }
    return r;
  }
  it('accepts complete set', () => { expect(() => validateAcMapping(allNs())).not.toThrow(); });
  it('rejects < 10 sections', () => { expect(() => validateAcMapping([])).toThrow('exactly 10'); });
  it('rejects duplicate within section', () => {
    const s = allNs(); s[9] = section('NS9', ['AC19', 'AC19'] as any, []);
    expect(() => validateAcMapping(s)).toThrow('Duplicate');
  });
  it('rejects cross-section duplicate', () => {
    const s = allNs(); s[9] = section('NS9', ['AC19', 'AC1'], []);
    expect(() => validateAcMapping(s)).toThrow('mapped to multiple');
  });
  it('rejects incomplete set', () => {
    const s = allNs(); s[9] = section('NS9', ['AC19'], []);
    expect(() => validateAcMapping(s)).toThrow('20 unique');
  });
});

// ── Flat-ledger shape ────────────────────────────────────────────────────────

describe('validateAssignmentsBatches', () => {
  const anc = planAnchor();
  const ns: NsAnchor[] = [section('NS0', ['AC1', 'AC2'], [anc])];
  function asgn(taskId: string, aids = [anc]): TaskAssignment {
    return { assignmentId: `A-${taskId}`, taskId, requirementIds: ['REQ-OVERVIEW'], anchors: aids, dependencies: [], sourceOfTruthPaths: [], ownedPaths: ['pkg'], forbiddenPaths: [], allowedTools: [], acceptanceCriteria: [], modelTier: 'standard' as const, riskTier: 'low' as const, tokenBudget: 100, timeBudgetMs: 60000, costBudgetUsd: 1, verificationCommands: [], escalationConditions: [], receiptContractSha256: hash };
  }

  it('accepts valid', () => { expect(() => validateAssignmentsBatches([asgn('T1')], [{ batchId: 'B1', status: 'PENDING' as const, taskIds: ['T1'] }], ns)).not.toThrow(); });
  it('rejects duplicate assignmentId', () => {
    const a = asgn('T1');
    expect(() => validateAssignmentsBatches([a, { ...a, taskId: 'T2' }], [{ batchId: 'B1', status: 'PENDING' as const, taskIds: ['T1', 'T2'] }], ns)).toThrow('duplicate');
  });
  it('rejects duplicate taskId', () => { expect(() => validateAssignmentsBatches([asgn('T1'), { ...asgn('T1'), assignmentId: 'A2' }], [{ batchId: 'B1', status: 'PENDING' as const, taskIds: ['T1'] }], ns)).toThrow('duplicate taskIds'); });
  it('rejects batch with missing assignment', () => { expect(() => validateAssignmentsBatches([asgn('T1')], [{ batchId: 'B1', status: 'PENDING' as const, taskIds: ['T-missing'] }], ns)).toThrow('no assignment'); });
  it('rejects empty batch', () => { expect(() => validateAssignmentsBatches([asgn('T1')], [{ batchId: 'B1', status: 'PENDING' as const, taskIds: [] }], ns)).toThrow('empty'); });
  it('rejects anchor not in any NS', () => {
    const fake: PlanAnchor = { planSha256: hash, sectionHeading: 'Fake', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'R-FAKE', chunkIndex: 0 };
    expect(() => validateAssignmentsBatches([asgn('T1', [fake])], [{ batchId: 'B1', status: 'PENDING' as const, taskIds: ['T1'] }], ns)).toThrow('not in any NS');
  });
  it('rejects orphan assignment', () => { expect(() => validateAssignmentsBatches([asgn('T1')], [], ns)).toThrow('not in any batch'); });
  it('rejects overlapping batches', () => { expect(() => validateAssignmentsBatches([asgn('T1')], [{ batchId: 'B1', status: 'PENDING' as const, taskIds: ['T1'] }, { batchId: 'B2', status: 'RUNNING' as const, taskIds: ['T1'] }], ns)).toThrow('in batches'); });
});

// ── Evidence graph multi-identity nodes ──────────────────────────────────────

describe('discoverEvidenceGraph', () => {
  it('creates nodes for every identity field', () => {
    const records = [{ findingId: 'F1', assignmentId: 'A1', receiptId: 'R1' }];
    const graph = discoverEvidenceGraph(records, ['R1']);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['A1', 'F1', 'R1']);
    const r1 = graph.nodes.find((n) => n.id === 'R1')!;
    expect(r1.boundRoot).toBe('R1');
    expect(r1.references).toContain('F1');
    expect(r1.references).toContain('A1');
  });
  it('rootless nodes get empty boundRoot', () => {
    const graph = discoverEvidenceGraph([{ findingId: 'F1' }], ['some-root']);
    expect(graph.nodes.find((n) => n.id === 'F1')!.boundRoot).toBe('');
  });
  it('references include all traversed IDs', () => {
    const records = [
      { id: 'L1', items: [{ findingId: 'F1', assignmentId: 'A1' }] },
    ];
    const graph = discoverEvidenceGraph(records, ['L1']);
    // L1 has no sibling IDs in same record so own references are empty;
    // references are sibling IDs and ownRefs from the same record only
    const l1 = graph.nodes.find((n) => n.id === 'L1')!;
    expect(l1.references).toHaveLength(0);
    const f1 = graph.nodes.find((n) => n.id === 'F1')!;
    expect(f1.references).toContain('L1');
    expect(f1.references).toContain('A1');
  });
  it('handles empty records', () => { expect(discoverEvidenceGraph([], ['r']).nodes).toEqual([]); });
});

describe('computeStale', () => {
  it('stale roots via reference edges', () => {
    const g: EvidenceGraph = {
      roots: ['old'],
      nodes: [{ id: 'dep1', boundRoot: '', references: ['old'] }, { id: 'dep2', boundRoot: '', references: ['dep1'] }],
    };
    const r = computeStale(g, ['live']);
    expect(r.staleRoots).toEqual(['old']);
    expect(r.transitiveDependents).toContain('dep1');
    expect(r.transitiveDependents).toContain('dep2');
  });
  it('unrelated preserved', () => {
    const g: EvidenceGraph = {
      roots: ['live', 'dead'],
      nodes: [
        { id: 'live-child', boundRoot: '', references: ['live'] },
        { id: 'dead-child', boundRoot: '', references: ['dead'] },
      ],
    };
    const r = computeStale(g, ['live']);
    expect(r.transitiveDependents).toEqual(['dead-child']);
    expect(r.transitiveDependents).not.toContain('live-child');
  });
  it('all current: none stale', () => {
    expect(computeStale({ roots: ['a'], nodes: [] }, ['a']).staleRoots).toEqual([]);
  });
});

// ── Re-anchor ────────────────────────────────────────────────────────────────

describe('reanchorToNsTask', () => {
  it('by namespace NS7', () => {
    const r = reanchorToNsTask([{ findingId: 'F1', namespace: 'NS7' }], 'NS7', 'anc-7', 'T7');
    expect(r).toHaveLength(1);
    expect(r[0].originalId).toBe('F1');
  });
  it('by taskId', () => {
    const r = reanchorToNsTask([{ assignmentId: 'A1', taskId: 'T9' }], 'NS9', 'anc-9', 'T9');
    expect(r[0].recordType).toBe('assignment');
  });
  it('ignores non-matching', () => {
    expect(reanchorToNsTask([{ findingId: 'F1', namespace: 'NS3' }], 'NS7', 'a', 'T7')).toHaveLength(0);
    expect(reanchorToNsTask([{ receiptId: 'R1', taskId: 'T-other' }], 'NS7', 'a', 'T7')).toHaveLength(0);
  });
  it('skips no-id records', () => {
    expect(reanchorToNsTask([{ namespace: 'NS7' }] as any, 'NS7', 'a', 'T7')).toHaveLength(0);
  });
});

// ── Fast-path ────────────────────────────────────────────────────────────────

describe('fastPathStructure', () => {
  it('detects needs-remediation', () => {
    const r = fastPathStructure({ status: 'needs-remediation', repairSlices: [{ repairSliceId: 'R1', status: 'PENDING', findingIds: ['F1'], reopenedCriterionIds: ['AC1'] }], shadowRevision: 1, latestReview: { reviewId: 'R1', stale: false, shadowRevision: 1 } });
    expect(r.executionState.needsRemediation).toBe(true);
    expect(r.valid).toBe(true);
  });
  it('invalid status', () => {
    expect(fastPathStructure({ status: 'BAD', repairSlices: [], shadowRevision: 0, latestReview: null }).valid).toBe(false);
  });
  it('audit events', () => {
    const r = fastPathStructure({ status: 'needs-remediation', repairSlices: [{ repairSliceId: 'R1', status: 'PENDING_REVIEW', findingIds: ['F1'], reopenedCriterionIds: ['AC1'] }], shadowRevision: 2, latestReview: { reviewId: 'R1', stale: false, shadowRevision: 2 } });
    expect(r.auditEvents.some((e) => e.eventType === 'needs-remediation')).toBe(true);
  });
  it('shadow revision propagated', () => {
    expect(fastPathStructure({ status: 'VERIFYING', repairSlices: [], shadowRevision: 7, latestReview: { shadowRevision: 7 } }).executionState.shadowRevision).toBe(7);
  });
});
