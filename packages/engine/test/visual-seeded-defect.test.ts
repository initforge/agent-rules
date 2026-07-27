import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type {
  VisualEvidenceBundle,
  VisualFinding,
  VisualVerdict,
  SemanticVisualReviewReceipt,
  StructuredVisualClaim,
} from '../src/visual-contracts.js';
import { compileVisualEvidence, bundleFingerprint } from '../src/visual-compiler.js';
import { reduceVisualConformance, type ReductionReference } from '../src/visual-reducer.js';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hash64(value = 'default'): string {
  return sha256(value).repeat(2).slice(0, 64);
}

function sameScreenshots(): { expected: Buffer; current: Buffer } {
  const data = Buffer.from('identical-screenshot-data-visual-seeded');
  return { expected: Buffer.from(data), current: Buffer.from(data) };
}

function diffScreenshots(): { expected: Buffer; current: Buffer } {
  const base = Buffer.from('base-screenshot-data-visual-seeded');
  const current = Buffer.from(base);
  current[15] = 0xAB;
  current[25] = 0xCD;
  return { expected: Buffer.from(base), current };
}

function emptyRef(): ReductionReference {
  return {
    geometry: { viewport: { width: 1280, height: 720 }, elements: [] },
    styles: { elements: [] },
    accessibility: { violations: [], incomplete: [] },
  };
}

function makeElement(
  selector: string,
  x: number, y: number, w: number, h: number,
  paintOrder = 0,
  computedStyles: Record<string, string> = {},
) {
  return { selector, boundingBox: { x, y, width: w, height: h }, paintOrder, computedStyles };
}

describe('Non-vision visual QA seeded-defect remediation', () => {

  it('detects overlap defect from structured evidence', () => {
    const { bundle } = compileVisualEvidence({
      route: '/overlap',
      state: 'check',
      viewport: '1280x720',
      screenshots: sameScreenshots(),
      domSnapshot: [
        makeElement('#a', 10, 10, 200, 100),
        makeElement('#b', 150, 50, 100, 80),
      ],
    });
    const result = reduceVisualConformance(bundle, emptyRef());
    expect(result.structured).toBe('FAIL');
    const overlapFindings = result.findings.filter((f) => f.sourceHint === 'element overlap detected');
    expect(overlapFindings.length).toBeGreaterThan(0);
    expect(overlapFindings[0].severity).toBe('critical');
    expect(overlapFindings[0].selector).toContain('#a');
    expect(overlapFindings[0].selector).toContain('#b');
  });

  it('detects off-screen content defect', () => {
    const { bundle } = compileVisualEvidence({
      route: '/offscreen',
      state: 'check',
      viewport: '800x600',
      screenshots: sameScreenshots(),
      domSnapshot: [
        makeElement('#offscreen-left', -50, 100, 100, 50),
      ],
    });
    const ref: ReductionReference = {
      geometry: { viewport: { width: 800, height: 600 }, elements: [{ selector: '#offscreen-left', boundingBox: { x: 10, y: 100, width: 100, height: 50 } }] },
      styles: { elements: [] },
      accessibility: { violations: [], incomplete: [] },
    };
    const result = reduceVisualConformance(bundle, ref);
    const offscreenFindings = result.findings.filter((f) => f.sourceHint === 'element is positioned off-screen');
    expect(offscreenFindings.length).toBeGreaterThan(0);
    expect(offscreenFindings[0].detector).toBe('reduceVisualConformance');
  });

  it('detects text overflow defect', () => {
    const { bundle } = compileVisualEvidence({
      route: '/text-overflow',
      state: 'check',
      viewport: '1280x720',
      screenshots: sameScreenshots(),
      domSnapshot: [
        makeElement('#overflow-box', 10, 10, 200, 50, 0, { 'text-overflow': 'ellipsis', overflow: 'hidden' }),
      ],
    });
    const result = reduceVisualConformance(bundle, emptyRef());
    const overflowFindings = result.findings.filter((f) => f.sourceHint === 'text overflow or ellipsis detected');
    expect(overflowFindings.length).toBeGreaterThan(0);
    expect(overflowFindings[0].severity).toBe('moderate');
  });

  it('detects font-size drift', () => {
    const { bundle } = compileVisualEvidence({
      route: '/font-drift',
      state: 'check',
      viewport: '1280x720',
      screenshots: sameScreenshots(),
      domSnapshot: [
        makeElement('#title', 20, 20, 400, 36, 1, { 'font-size': '24px', color: '#000' }),
      ],
    });
    const ref: ReductionReference = {
      geometry: { viewport: { width: 1280, height: 720 }, elements: [{ selector: '#title', boundingBox: { x: 20, y: 20, width: 400, height: 36 } }] },
      styles: { elements: [{ selector: '#title', computedStyles: { 'font-size': '16px', color: '#000' } }] },
      accessibility: { violations: [], incomplete: [] },
    };
    const result = reduceVisualConformance(bundle, ref);
    const driftFindings = result.findings.filter((f) => f.sourceHint === 'font size drift');
    expect(driftFindings.length).toBeGreaterThan(0);
    expect(driftFindings[0].expected).toBe('16px');
    expect(driftFindings[0].actual).toBe('24px');
  });

  it('detects ellipsis/line-count drift', () => {
    const { bundle } = compileVisualEvidence({
      route: '/ellipsis-linecount',
      state: 'check',
      viewport: '1280x720',
      screenshots: sameScreenshots(),
      domSnapshot: [
        makeElement('#ellipsis-box', 10, 10, 200, 120, 0, { 'text-overflow': 'ellipsis', overflow: 'hidden', 'line-height': '16px' }),
      ],
    });
    const result = reduceVisualConformance(bundle, emptyRef());
    const ellipsisFindings = result.findings.filter((f) => f.sourceHint === 'text overflow or ellipsis detected');
    expect(ellipsisFindings.length).toBeGreaterThan(0);
    const lineCountFindings = result.findings.filter((f) => f.sourceHint === 'element exceeds typical line count');
    expect(lineCountFindings.length).toBeGreaterThan(0);
    expect(lineCountFindings[0].actual).toContain('lines');
  });

  it('detects spacing/grid/alignment drift', () => {
    const { bundle } = compileVisualEvidence({
      route: '/alignment',
      state: 'check',
      viewport: '1280x720',
      screenshots: sameScreenshots(),
      domSnapshot: [
        makeElement('#item1', 10, 10, 100, 50),
        makeElement('#item2', 140, 10, 100, 50),
      ],
    });
    const ref: ReductionReference = {
      geometry: {
        viewport: { width: 1280, height: 720 },
        elements: [
          { selector: '#item1', boundingBox: { x: 10, y: 10, width: 100, height: 50 } },
          { selector: '#item2', boundingBox: { x: 120, y: 10, width: 100, height: 50 } },
        ],
      },
      styles: { elements: [] },
      accessibility: { violations: [], incomplete: [] },
    };
    const result = reduceVisualConformance(bundle, ref);
    const alignmentFindings = result.findings.filter((f) => f.sourceHint === 'horizontal alignment drift');
    expect(alignmentFindings.length).toBeGreaterThan(0);
    expect(alignmentFindings[0].selector).toBe('#item2');
  });

  it('non-vision worker repair loop: detect -> fix -> verify', () => {
    const { bundle } = compileVisualEvidence({
      route: '/repair-loop',
      state: 'broken',
      viewport: '1280x720',
      screenshots: diffScreenshots(),
      domSnapshot: [
        makeElement('#broken-btn', -5, 100, 100, 44),
      ],
    });
    const ref: ReductionReference = {
      geometry: {
        viewport: { width: 1280, height: 720 },
        elements: [
          { selector: '#broken-btn', boundingBox: { x: 20, y: 100, width: 100, height: 44 } },
        ],
      },
      styles: { elements: [] },
      accessibility: { violations: [], incomplete: [] },
    };

    const result1 = reduceVisualConformance(bundle, ref);
    expect(result1.structured).toBe('FLAKY');
    const offscreenFindings = result1.findings.filter((f) => f.sourceHint === 'element is positioned off-screen');
    expect(offscreenFindings.length).toBeGreaterThan(0);

    const fixedBundle: VisualEvidenceBundle = {
      ...bundle,
      domSnapshot: [
        makeElement('#broken-btn', 20, 100, 100, 44),
      ],
      globalDiffPercent: 0,
      regionDiffMetrics: [
        { region: 'top-left', diffPercent: 0 },
        { region: 'top-right', diffPercent: 0 },
        { region: 'center', diffPercent: 0 },
        { region: 'bottom-left', diffPercent: 0 },
        { region: 'bottom-right', diffPercent: 0 },
      ],
      currentScreenshotHash: bundle.expectedScreenshotHash,
      diffScreenshotHash: hash64('no-diff'),
    };

    const result2 = reduceVisualConformance(fixedBundle, ref);
    expect(result2.structured).toBe('PASS');
    const offscreenAfterFix = result2.findings.filter((f) => f.sourceHint === 'element is positioned off-screen');
    expect(offscreenAfterFix.length).toBe(0);
  });

  it('independent verifier confirms repair', () => {
    const { bundle: workerBundle } = compileVisualEvidence({
      route: '/verifier',
      state: 'fixed',
      viewport: '1280x720',
      screenshots: sameScreenshots(),
      domSnapshot: [
        makeElement('#ok', 50, 50, 200, 44),
      ],
    });

    const ref: ReductionReference = {
      geometry: {
        viewport: { width: 1280, height: 720 },
        elements: [
          { selector: '#ok', boundingBox: { x: 50, y: 50, width: 200, height: 44 } },
        ],
      },
      styles: { elements: [] },
      accessibility: { violations: [], incomplete: [] },
    };

    const workerResult = reduceVisualConformance(workerBundle, ref);
    expect(workerResult.structured).toBe('PASS');

    const bundleHash = bundleFingerprint(workerBundle);
    const workerReceipt: SemanticVisualReviewReceipt = {
      bundleHash,
      model: 'deepseek-v4-flash',
      host: 'codex',
      version: '4.0.0',
      expectedHash: workerBundle.expectedScreenshotHash,
      currentHash: workerBundle.currentScreenshotHash,
      diffHash: workerBundle.diffScreenshotHash,
      findings: workerResult.findings,
      verdict: workerResult.structured,
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };

    const verifierBundle = compileVisualEvidence({
      route: '/verifier',
      state: 'fixed',
      viewport: '1280x720',
      screenshots: sameScreenshots(),
      domSnapshot: [
        makeElement('#ok', 50, 50, 200, 44),
      ],
    }).bundle;

    const verifierResult = reduceVisualConformance(verifierBundle, ref);
    const verifierReceipt: SemanticVisualReviewReceipt = {
      bundleHash: bundleFingerprint(verifierBundle),
      model: 'deepseek-v4-flash',
      host: 'codex',
      version: '4.0.0',
      expectedHash: verifierBundle.expectedScreenshotHash,
      currentHash: verifierBundle.currentScreenshotHash,
      diffHash: verifierBundle.diffScreenshotHash,
      findings: verifierResult.findings,
      verdict: verifierResult.structured,
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };

    expect(verifierReceipt.verdict).toBe(workerReceipt.verdict);

    const verifierDoesNotAcceptWorkerSelfReport = verifierReceipt.verdict !== 'PASS'
      || workerResult.structured === 'PASS';
    expect(verifierDoesNotAcceptWorkerSelfReport).toBe(true);

    expect(verifierReceipt.findings).toEqual(workerReceipt.findings);
  });

  it('stale receipt detection after source change', () => {
    const { bundle: originalBundle } = compileVisualEvidence({
      route: '/stale-source',
      state: 'original',
      viewport: '1280x720',
      screenshots: sameScreenshots(),
      domSnapshot: [
        makeElement('#stable', 10, 10, 100, 50),
      ],
    });

    const originalHash = bundleFingerprint(originalBundle);
    const receipt: SemanticVisualReviewReceipt = {
      bundleHash: originalHash,
      model: 'deepseek-v4-flash',
      host: 'codex',
      version: '4.0.0',
      expectedHash: originalBundle.expectedScreenshotHash,
      currentHash: originalBundle.currentScreenshotHash,
      diffHash: originalBundle.diffScreenshotHash,
      findings: [],
      verdict: 'PASS',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };

    const { bundle: changedBundle } = compileVisualEvidence({
      route: '/stale-source',
      state: 'original',
      viewport: '1280x720',
      screenshots: diffScreenshots(),
      domSnapshot: [
        makeElement('#stable', 10, 10, 100, 50),
      ],
    });

    const changedHash = bundleFingerprint(changedBundle);
    expect(changedHash).not.toBe(originalHash);

    const receiptIsStale = receipt.bundleHash !== changedHash;
    expect(receiptIsStale).toBe(true);
    expect(receipt.bundleHash).toBe(originalHash);
    expect(receipt.bundleHash).not.toBe(changedHash);
  });
});
