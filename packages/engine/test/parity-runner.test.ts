import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import type { ParityPair, ParityVerdictResult } from '../src/parity-runner.js';
import { runParityPair, compileParityDiff, decideVerdict, runParityManifest } from '../src/parity-runner.js';

// Paired reference/target browser parity (AM-0019 §9) — non-vision verification.
// REF and TGT both load the same fixture via data: URLs so no server is needed.
// Seeded defects (AM-0019 §12) are injected into the TARGET side only.

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Parity fixture</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; padding: 24px; }
  main { max-width: 640px; }
  h1 { font-size: 28px; margin: 0 0 16px; }
  nav a { display: inline-block; padding: 14px 12px; }
  .card { margin-top: 16px; padding: 16px; border: 1px solid #ccc; border-radius: 8px; }
  label { display: block; margin-bottom: 4px; }
  #q { padding: 12px; width: 240px; }
  #submit { padding: 12px 16px; }
</style>
</head>
<body>
<main>
  <h1>Parity fixture</h1>
  <nav><a href="#home">Home</a><a href="#runs">Runs</a></nav>
  <div class="card">
    <label for="q">Query</label>
    <input id="q" type="text">
    <button id="submit" type="button">Submit</button>
  </div>
</main>
</body>
</html>`;

function dataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

const REFERENCE_URL = dataUrl(FIXTURE_HTML);
const TARGET_URL = dataUrl(FIXTURE_HTML);

function makePair(overrides: Partial<ParityPair> = {}): ParityPair {
  return {
    id: 'c7-fixture',
    referenceUrl: REFERENCE_URL,
    referenceRevisionHash: `sha256:${'a'.repeat(64)}`,
    targetUrl: TARGET_URL,
    candidateHash: `sha256:${'b'.repeat(64)}`,
    fixture: 'parity-fixture',
    role: 'visitor',
    locale: 'en-US',
    timezone: 'UTC',
    viewport: { width: 1280, height: 720 },
    dpr: 1,
    theme: 'light',
    reducedMotion: 'no-preference',
    actionSequence: [{ kind: 'wait', delayMs: 60 }],
    stateCheckpoint: '{"h1": "Parity fixture"}',
    semanticAnchors: ['heading:h1:Parity fixture', 'button:Submit'],
    allowedDeviations: [],
    ...overrides,
  };
}

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
}, 15_000);

function reasonsOf(result: ParityVerdictResult): string {
  return result.reasons.join(' | ');
}

describe('paired two-context lease (REF + TGT)', () => {
  it('opens both isolated sides and PASSes a clean pair', async () => {
    const result = await runParityPair(browser, makePair());
    expect(result.sidesOpened).toEqual({ ref: true, tgt: true });
    expect(result.verdict).toBe('PASS');
    expect(result.reasons).toEqual([]);
    expect(result.bundleHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.refEvidence.semanticAnchors.length).toBeGreaterThan(0);
    expect(result.tgtEvidence.semanticAnchors.length).toBeGreaterThan(0);
  }, 30_000);

  it('cannot PASS when only the REFERENCE side opened (target fails to load)', async () => {
    const result = await runParityPair(browser, makePair({ targetUrl: 'file:///nonexistent-c7-target.html' }));
    expect(result.verdict).toBe('FAIL');
    expect(result.sidesOpened).toEqual({ ref: true, tgt: false });
    expect(reasonsOf(result)).toContain('case cannot PASS if only one side was opened');
  }, 30_000);

  it('cannot PASS when only the TARGET side opened (reference fails to load)', async () => {
    const result = await runParityPair(browser, makePair({ referenceUrl: 'file:///nonexistent-c7-ref.html' }));
    expect(result.verdict).toBe('FAIL');
    expect(result.sidesOpened).toEqual({ ref: false, tgt: true });
    expect(reasonsOf(result)).toContain('case cannot PASS if only one side was opened');
  }, 30_000);
});

describe('seeded defects are caught by the non-vision compiler (AM-0019 §12)', () => {
  it.each([
    ['missing-control', 'missing control in target'],
    ['hierarchy', 'heading hierarchy drift'],
    ['overflow', 'clips beyond viewport width'],
    ['spacing', 'horizontal alignment drift'],
    ['style', 'font size drift'],
    ['focus-order', 'focus order drift'],
    ['console-error', 'console evidence present'],
    ['network-error', 'network error in target'],
  ] as const)('seed %s → FAIL with %s finding', async (seed, expectedHint) => {
    const result = await runParityPair(browser, makePair({ defectSeed: seed }));
    expect(result.verdict).toBe('FAIL');
    expect(reasonsOf(result)).toContain(expectedHint);
  }, 30_000);
});

describe('allowed deviations handling', () => {
  it('honors declared deviations and still PASSes', async () => {
    const result = await runParityPair(
      browser,
      makePair({
        defectSeed: 'spacing',
        allowedDeviations: [
          { id: 'dev-spacing', scope: 'geometry', reason: 'layout shift accepted' },
          { id: 'dev-pixel', scope: 'pixel', reason: 'rendered pixels may shift' },
        ],
      }),
    );
    expect(result.verdict).toBe('PASS');
    expect(result.acceptedDeviationIds).toContain('dev-spacing');
    expect(result.acceptedDeviationIds).toContain('dev-pixel');
  }, 30_000);

  it('does not accept a deviation whose scope does not match the finding', async () => {
    const result = await runParityPair(
      browser,
      makePair({
        defectSeed: 'missing-control',
        allowedDeviations: [{ id: 'dev-styling-only', scope: 'style', reason: 'only style accepted' }],
      }),
    );
    expect(result.verdict).toBe('FAIL');
    expect(result.acceptedDeviationIds).toEqual([]);
  }, 30_000);
});

describe('WAITING_EXTERNAL states', () => {
  it('waits externally when an http reference lacks checkout/revision binding', async () => {
    const result = await runParityPair(
      browser,
      makePair({ referenceUrl: 'https://reference.example.test/page', referenceRevisionHash: undefined, referenceCheckout: undefined, referenceMhtml: undefined }),
    );
    expect(result.verdict).toBe('WAITING_EXTERNAL');
    expect(reasonsOf(result)).toContain('requires referenceCheckout');
  });

  it('waits externally when deterministic parity is clean but vision review is required', async () => {
    const result = await runParityPair(browser, makePair({ visionReviewRequired: true }));
    expect(result.verdict).toBe('WAITING_EXTERNAL');
    expect(result.sidesOpened).toEqual({ ref: true, tgt: true });
    expect(result.diff.allFindings.length).toBe(0);
  }, 30_000);
});

describe('machine-readable coordinates + heatmap', () => {
  it('emits pixel heatmap cells and findings with viewport coordinates', async () => {
    const result = await runParityPair(browser, makePair({ defectSeed: 'spacing' }));
    const { diff } = result;

    expect(diff.pixel.heatmapCells.length).toBeGreaterThan(0);
    const cell = diff.pixel.heatmapCells.find((c) => c.diffPercent > 0);
    expect(cell).toBeDefined();
    expect(typeof cell!.x).toBe('number');
    expect(typeof cell!.y).toBe('number');
    expect(typeof cell!.width).toBe('number');
    expect(typeof cell!.height).toBe('number');

    expect(diff.pixel.regionDiffMetrics.length).toBe(5);
    expect(diff.pixel.globalDiffPercent).toBeGreaterThan(0);

    const findingWithCoordinate = diff.allFindings.find((f) => f.coordinate);
    expect(findingWithCoordinate).toBeDefined();
    expect(typeof findingWithCoordinate!.coordinate!.x).toBe('number');
  }, 30_000);

  it('pure compiler emits coordinates without a browser', () => {
    const side = (opened: boolean) => ({
      opened,
      screenshotHash: '',
      ariaSnapshot: '',
      semanticAnchors: [],
      domSnapshot: [],
      focusOrder: [],
      axeViolations: [],
      axeIncomplete: [],
      consoleErrors: [],
      networkErrors: [],
      harEntries: [],
      storageSnapshot: {},
      loadTimeMs: 0,
      stateMatches: [],
    });
    const ref = {
      ...side(true),
      semanticAnchors: [{ role: 'button', name: 'Submit', selector: '#submit' }],
    };
    const tgt = {
      ...side(true),
      semanticAnchors: [{ role: 'link', name: 'Help', selector: '#help' }],
    };
    const refShot = Buffer.from('ref-png-bytes');
    const tgtShot = Buffer.from('tgt-png-bytes');
    const compiled = compileParityDiff(ref, tgt, refShot, tgtShot, makePair());
    expect(compiled.semantic.some((f) => f.sourceHint === 'missing control in target')).toBe(true);
    const decision = decideVerdict(compiled, { ref: true, tgt: true }, makePair());
    expect(decision.verdict).toBe('FAIL');
  });
});

describe('manifest runner', () => {
  it('aggregates pass/fail/waiting across pairs and honors one-side FAIL', async () => {
    const run = await runParityManifest({
      name: 'c7-manifest',
      pairs: [
        makePair({ id: 'clean' }),
        makePair({ id: 'seeded', defectSeed: 'console-error' }),
        makePair({ id: 'waiting', referenceUrl: 'https://reference.example.test/x', referenceRevisionHash: undefined, referenceCheckout: undefined, referenceMhtml: undefined }),
      ],
    });
    expect(run.summary).toEqual({ total: 3, pass: 1, fail: 1, waitingExternal: 1 });
    expect(run.results.find((r) => r.pairId === 'clean')?.verdict).toBe('PASS');
    expect(run.results.find((r) => r.pairId === 'seeded')?.verdict).toBe('FAIL');
    expect(run.results.find((r) => r.pairId === 'waiting')?.verdict).toBe('WAITING_EXTERNAL');
  }, 60_000);
});
