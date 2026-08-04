/**
 * AM-0021 bounded repair test
 *
 * AM0021 is already EFFECTIVE in the real ledger.
 * Tests verify idempotence and validation.
 *
 * shadowDir: `.agent/plans/<id>/shadow` pattern verified.
 */
import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { boundedRepair, SHADOW_NAMES, type BoundedRepairInput, type Sha256 } from '../src/ledger-activation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Real ledger constants
const PLAN_ID = 'agent-rules-harness-v3-rearchitecture-20260726-r1';
const LEDGER_REAL = path.join(REPO_ROOT, '.agent', 'ledger', `${PLAN_ID}.json`);
const PLAN_DIR = path.join(REPO_ROOT, '.agent', 'plans', PLAN_ID);

// AM0021 constants from real files (AM-0021 is already EFFECTIVE)
const AM0021_SHA256 = '0dfb45500fe8a7d80f177e57ef8a6c231b44e28f8e4f973b31f85bf7d527cf1c';
const CAPTURE_SHA256 = '954f718a919801a7241d6ac695bb54965a9543c06fa96212564b2b52bcf7d6c4';
const PRIOR_EFFECTIVE_SHA256 = 'd38e0cc94127a71f3dd5b6bbddeec94834e6178ff8ac6491dd045960b6951f4e'; // current ledger identity (includes AM-0021)
const ORIGINAL_SHA256 = 'c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31';

// AM0020 SHA for prior_amendment validation
const AM0020_SHA256 = 'f99e603c2e9c60194518938f78de4ab90645eb02d893f2ef811b436c444ee0cc';

const SHADOW_FILES = [
  'tasks.md', 'progress.md', 'amendments.md', 'reconciliation.md',
  'batches/bootstrap/tasks.md', 'batches/bootstrap/progress.md', 'batches/bootstrap/reconciliation.md'
];

const TEST_TMP: string[] = [];

function sha256Hex(d: string | Buffer): string {
  return crypto.createHash('sha256').update(typeof d === 'string' ? d : Buffer.from(d), 'utf8').digest('hex');
}

/**
 * Copy real ledger + canonical shadow paths to temp fixture.
 * Uses shadowDir = `.agent/plans/<id>/shadow` pattern.
 */
function copyRealFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ns0-am0021-'));
  TEST_TMP.push(root);

  const agt = path.join(root, '.agent');
  const ledgerDst = path.join(agt, 'ledger');
  const planDst = path.join(agt, 'plans', PLAN_ID);
  const lineageDst = path.join(planDst, 'lineage');
  const shadowDst = path.join(planDst, 'shadow');
  const amendDst = path.join(planDst, 'amendments');
  const handoffsDst = path.join(agt, 'handoffs', PLAN_ID);

  // Create all dirs
  for (const d of [ledgerDst, lineageDst, shadowDst, amendDst, handoffsDst]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.mkdirSync(path.join(shadowDst, 'batches', 'bootstrap'), { recursive: true });

  // Copy ledger
  fs.copyFileSync(LEDGER_REAL, path.join(ledgerDst, `${PLAN_ID}.json`));

  // Copy shadow files (canonical shadowDir path: .agent/plans/<id>/shadow)
  for (const f of SHADOW_FILES) {
    const src = path.join(PLAN_DIR, 'shadow', f);
    if (fs.existsSync(src)) {
      const dst = path.join(shadowDst, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }

  // Copy AM0021 amendment
  const amendSrc = path.join(PLAN_DIR, 'amendments', '0021-premium-main-context-economy-and-event-driven-orchestration.md');
  if (fs.existsSync(amendSrc)) {
    fs.copyFileSync(amendSrc, path.join(amendDst, path.basename(amendSrc)));
  }

  // Copy AM0020 amendment (prior_amendment validation)
  const amend0020Src = path.join(PLAN_DIR, 'amendments', '0020-epistemic-integrity-adversarial-review-and-truthful-reporting.md');
  if (fs.existsSync(amend0020Src)) {
    fs.copyFileSync(amend0020Src, path.join(amendDst, path.basename(amend0020Src)));
  }

  // Copy AM0021 capture
  const capSrc = path.join(PLAN_DIR, 'lineage', 'am0021-capture.json');
  if (fs.existsSync(capSrc)) {
    fs.copyFileSync(capSrc, path.join(lineageDst, 'am0021-capture.json'));
  }

  // Copy handoff files referenced in capture
  const handoffFiles = [
    'deepseek-am0021-max-throughput-live-execution-prompt.md',
    'external-project-latest-concepts-dogfood-live-steer-prompt.md',
  ];
  for (const hf of handoffFiles) {
    const src = path.join(REPO_ROOT, '.agent', 'handoffs', PLAN_ID, hf);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(handoffsDst, hf));
    }
  }

  // Copy dogfood manifest
  const dogfoodSrc = path.join(REPO_ROOT, '.agent', 'handoffs', PLAN_ID, 'latest-concepts-dogfood-manifest.json');
  if (fs.existsSync(dogfoodSrc)) {
    fs.copyFileSync(dogfoodSrc, path.join(handoffsDst, 'latest-concepts-dogfood-manifest.json'));
  }

  return root;
}

afterEach(() => {
  for (const d of TEST_TMP.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

describe('boundedRepair AM-0021 activation', () => {
  const hasRealLedger = fs.existsSync(LEDGER_REAL);

  it.skipIf(!hasRealLedger)('idempotent: AM-0021 already EFFECTIVE returns mutated=false', () => {
    const root = copyRealFixture();

    // Verify fixture setup: AM-0021 is already EFFECTIVE
    const ledgerPath = path.join(root, '.agent', 'ledger', `${PLAN_ID}.json`);
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    expect(ledger.effective_plan_identity.sha256).toBe(PRIOR_EFFECTIVE_SHA256);
    const amendIds = (ledger.amendments as Record<string, unknown>[]).map((a: Record<string, unknown>) => a.amendment_id as string);
    expect(amendIds, 'AM-0021 must be in ledger amendments').toContain('AM-0021');

    // Verify shadowDir pattern
    const shadowDir = path.join(root, '.agent', 'plans', PLAN_ID, 'shadow');
    expect(fs.existsSync(shadowDir)).toBe(true);

    // Build boundedRepair input (AM-0021 already effective)
    const input: BoundedRepairInput = {
      canonicalRoot: root,
      ledgerPath: `.agent/ledger/${PLAN_ID}.json`,
      shadowDir: `.agent/plans/${PLAN_ID}/shadow`,
      originalSha256: ORIGINAL_SHA256,
      priorEffectiveSha256: PRIOR_EFFECTIVE_SHA256,
      amendments: [{
        amendmentId: 'AM-0021',
        amendmentPath: `.agent/plans/${PLAN_ID}/amendments/0021-premium-main-context-economy-and-event-driven-orchestration.md`,
        amendmentSha256: AM0021_SHA256,
        capturePath: `.agent/plans/${PLAN_ID}/lineage/am0021-capture.json`,
      }],
    };

    // Call boundedRepair - should be idempotent
    const result = boundedRepair(input);

    // Verify API succeeds and is idempotent
    expect(result.success, `boundedRepair failed: ${result.error}`).toBe(true);
    expect(result.mutated).toBe(false);  // Already effective, no mutation
    expect(result.effectiveIdentity).toBe(PRIOR_EFFECTIVE_SHA256);

    // Verify ledger unchanged
    const updatedLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    expect(updatedLedger.effective_plan_identity.sha256).toBe(PRIOR_EFFECTIVE_SHA256);

    // Verify journal not created
    expect(fs.existsSync(path.join(root, '.activation-journal.json'))).toBe(false);
  });

  it.skipIf(!hasRealLedger)('idempotent: second call with same input returns mutated=false', () => {
    const root = copyRealFixture();
    const ledgerPath = path.join(root, '.agent', 'ledger', `${PLAN_ID}.json`);

    const input: BoundedRepairInput = {
      canonicalRoot: root,
      ledgerPath: `.agent/ledger/${PLAN_ID}.json`,
      shadowDir: `.agent/plans/${PLAN_ID}/shadow`,
      originalSha256: ORIGINAL_SHA256,
      priorEffectiveSha256: PRIOR_EFFECTIVE_SHA256,
      amendments: [{
        amendmentId: 'AM-0021',
        amendmentPath: `.agent/plans/${PLAN_ID}/amendments/0021-premium-main-context-economy-and-event-driven-orchestration.md`,
        amendmentSha256: AM0021_SHA256,
        capturePath: `.agent/plans/${PLAN_ID}/lineage/am0021-capture.json`,
      }],
    };

    // First call
    const r1 = boundedRepair(input);
    expect(r1.success).toBe(true);
    expect(r1.mutated).toBe(true);

    // Capture state after first call
    const ledgerAfter = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    input.priorEffectiveSha256 = ledgerAfter.effective_plan_identity.sha256 as Sha256;
    const snap: Record<string, Buffer> = {
      'ledger.json': fs.readFileSync(ledgerPath),
    };
    for (const f of SHADOW_FILES) {
      snap[f] = fs.readFileSync(path.join(root, '.agent', 'plans', PLAN_ID, 'shadow', f));
    }

    // Second call should be idempotent
    const r2 = boundedRepair(input);
    expect(r2.success, `idempotent call failed: ${r2.error}`).toBe(true);
    expect(r2.mutated).toBe(false);

    // Verify bytes unchanged
    expect(fs.readFileSync(ledgerPath)).toEqual(snap['ledger.json']);
    for (const f of SHADOW_FILES) {
      expect(fs.readFileSync(path.join(root, '.agent', 'plans', PLAN_ID, 'shadow', f))).toEqual(snap[f]);
    }
  });

  it.skipIf(!hasRealLedger)('rejects wrong amendment SHA', () => {
    const root = copyRealFixture();

    const input: BoundedRepairInput = {
      canonicalRoot: root,
      ledgerPath: `.agent/ledger/${PLAN_ID}.json`,
      shadowDir: `.agent/plans/${PLAN_ID}/shadow`,
      originalSha256: ORIGINAL_SHA256,
      priorEffectiveSha256: PRIOR_EFFECTIVE_SHA256,
      amendments: [{
        amendmentId: 'AM-0021',
        amendmentPath: `.agent/plans/${PLAN_ID}/amendments/0021-premium-main-context-economy-and-event-driven-orchestration.md`,
        amendmentSha256: '0'.repeat(64) as Sha256,  // wrong SHA
        capturePath: `.agent/plans/${PLAN_ID}/lineage/am0021-capture.json`,
      }],
    };

    const r = boundedRepair(input);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/SHA/i);
  });

  it.skipIf(!hasRealLedger)('rejects missing capture file', () => {
    const root = copyRealFixture();

    // Remove capture
    const capPath = path.join(root, '.agent', 'plans', PLAN_ID, 'lineage', 'am0021-capture.json');
    fs.rmSync(capPath);

    const input: BoundedRepairInput = {
      canonicalRoot: root,
      ledgerPath: `.agent/ledger/${PLAN_ID}.json`,
      shadowDir: `.agent/plans/${PLAN_ID}/shadow`,
      originalSha256: ORIGINAL_SHA256,
      priorEffectiveSha256: PRIOR_EFFECTIVE_SHA256,
      amendments: [{
        amendmentId: 'AM-0021',
        amendmentPath: `.agent/plans/${PLAN_ID}/amendments/0021-premium-main-context-economy-and-event-driven-orchestration.md`,
        amendmentSha256: AM0021_SHA256,
        capturePath: `.agent/plans/${PLAN_ID}/lineage/am0021-capture.json`,
      }],
    };

    const r = boundedRepair(input);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/capture/i);
  });

  it.skipIf(!hasRealLedger)('rejects prior identity mismatch', () => {
    const root = copyRealFixture();

    const input: BoundedRepairInput = {
      canonicalRoot: root,
      ledgerPath: `.agent/ledger/${PLAN_ID}.json`,
      shadowDir: `.agent/plans/${PLAN_ID}/shadow`,
      originalSha256: ORIGINAL_SHA256,
      priorEffectiveSha256: '0'.repeat(64) as Sha256,  // wrong prior identity
      amendments: [{
        amendmentId: 'AM-0021',
        amendmentPath: `.agent/plans/${PLAN_ID}/amendments/0021-premium-main-context-economy-and-event-driven-orchestration.md`,
        amendmentSha256: AM0021_SHA256,
        capturePath: `.agent/plans/${PLAN_ID}/lineage/am0021-capture.json`,
      }],
    };

    const r = boundedRepair(input);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/identity/i);
  });
});

/**
 * Safe activation command for AM-0021:
 * 
 * boundedRepair input:
 *   canonicalRoot: <WORKING_DIR>
 *   ledgerPath: .agent/ledger/agent-rules-harness-v3-rearchitecture-20260726-r1.json
 *   shadowDir: .agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/shadow
 *   originalSha256: c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31
 *   priorEffectiveSha256: 21d0a8bbaaf40002c0be6a047476e1cbe7b105382c0877056a2252af9a246003
 *   amendments: [{
 *     amendmentId: "AM-0021",
 *     amendmentPath: ".agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/amendments/0021-premium-main-context-economy-and-event-driven-orchestration.md",
 *     amendmentSha256: "0dfb45500fe8a7d80f177e57ef8a6c231b44e28f8e4f973b31f85bf7d527cf1c",
 *     capturePath: ".agent/plans/agent-rules-harness-v3-rearchitecture-20260726-r1/lineage/am0021-capture.json"
 *   }]
 */
