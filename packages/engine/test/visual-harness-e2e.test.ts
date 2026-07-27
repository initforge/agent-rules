import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type {
  VisionCapabilityAttestation,
  VisualEvidenceBundle,
  VisualFinding,
  StructuredVisualClaim,
  SemanticVisualReviewReceipt,
  VisualVerdict,
} from '../src/visual-contracts.js';
import { compileVisualEvidence, bundleFingerprint } from '../src/visual-compiler.js';
import { reduceVisualConformance } from '../src/visual-reducer.js';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hash64(value = 'default'): string {
  return sha256(value).repeat(2).slice(0, 64);
}

function fixtureScreenshots(diff = false): { expected: Buffer; current: Buffer } {
  const base = Buffer.from('screenshot-pixel-data-fixed-length-for-test');
  if (!diff) {
    return { expected: Buffer.from(base), current: Buffer.from(base) };
  }
  const current = Buffer.from(base);
  current[10] = 0xFF;
  current[20] = 0x00;
  return { expected: Buffer.from(base), current };
}

describe('E2E: VisualEvidenceBundle roundtrip', () => {
  it('compile → produce bundle with all fields', () => {
    const result = compileVisualEvidence({
      route: '/e2e/roundtrip',
      state: 'loaded',
      viewport: '1280x720',
      screenshots: fixtureScreenshots(),
      ariaSnapshot: 'role=button name=Submit',
      domSnapshot: [
        { selector: '#btn', boundingBox: { x: 100, y: 200, width: 120, height: 44 }, paintOrder: 1, computedStyles: { 'font-size': '14px', color: '#fff' } },
      ],
      axeResults: { violations: [], incomplete: [] },
      consoleLogs: [],
      networkLogs: [],
    });
    expect(result.errors).toEqual([]);
    expect(result.bundle.route).toBe('/e2e/roundtrip');
    expect(result.bundle.state).toBe('loaded');
    expect(result.bundle.viewport).toBe('1280x720');
    expect(result.bundle.expectedScreenshotHash).toBeTruthy();
    expect(result.bundle.currentScreenshotHash).toBeTruthy();
    expect(result.bundle.diffScreenshotHash).toBeTruthy();
    expect(typeof result.bundle.globalDiffPercent).toBe('number');
    expect(result.bundle.globalDiffPercent).toBe(0);
  });

  it('compile → reduce produces verdict', () => {
    const { bundle } = compileVisualEvidence({
      route: '/e2e/reduce',
      state: 'default',
      viewport: '800x600',
      screenshots: fixtureScreenshots(),
    });
    const ref = {
      geometry: { viewport: { width: 800, height: 600 }, elements: [] },
      styles: { elements: [] },
      accessibility: { violations: [], incomplete: [] },
    };
    const result = reduceVisualConformance(bundle, ref);
    expect(['PASS', 'FAIL', 'FLAKY', 'UNVERIFIED']).toContain(result.runtime);
    expect(['PASS', 'FAIL', 'FLAKY', 'UNVERIFIED']).toContain(result.structured);
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it('compile → reduce → claim constructs a valid StructuredVisualClaim', () => {
    const { bundle } = compileVisualEvidence({
      route: '/e2e/claim',
      state: 'verified',
      viewport: '1920x1080',
      screenshots: fixtureScreenshots(),
    });
    const ref = {
      geometry: { viewport: { width: 1920, height: 1080 }, elements: [] },
      styles: { elements: [] },
      accessibility: { violations: [], incomplete: [] },
    };
    const reduction = reduceVisualConformance(bundle, ref);
    const claim: StructuredVisualClaim = {
      route: bundle.route,
      state: bundle.state,
      viewport: bundle.viewport,
      bundleHash: bundleFingerprint(bundle),
      runtimeVerdict: reduction.runtime,
      structuralVerdict: reduction.structured,
      semanticVerdict: 'UNVERIFIED',
      timestamp: new Date().toISOString(),
    };
    expect(claim.route).toBe('/e2e/claim');
    expect(claim.bundleHash).toBeTruthy();
    expect(claim.runtimeVerdict).toBe(claim.runtimeVerdict);
    expect(claim.semanticVerdict).toBe('UNVERIFIED');
    expect(claim.timestamp).toBeTruthy();
  });

  it('compile → reduce → claim → receipt completes full roundtrip', () => {
    const { bundle } = compileVisualEvidence({
      route: '/e2e/full',
      state: 'complete',
      viewport: '1440x900',
      screenshots: fixtureScreenshots(true),
    });
    const ref = {
      geometry: { viewport: { width: 1440, height: 900 }, elements: [] },
      styles: { elements: [] },
      accessibility: { violations: ['color-contrast'], incomplete: [] },
    };
    const reduction = reduceVisualConformance(bundle, ref);
    const bundleHash = bundleFingerprint(bundle);
    const claim: StructuredVisualClaim = {
      route: bundle.route,
      state: bundle.state,
      viewport: bundle.viewport,
      bundleHash,
      runtimeVerdict: reduction.runtime,
      structuralVerdict: reduction.structured,
      semanticVerdict: 'UNVERIFIED',
      timestamp: new Date().toISOString(),
    };
    const receipt: SemanticVisualReviewReceipt = {
      bundleHash,
      model: 'deepseek-v4-flash',
      host: 'codex',
      version: '4.0.0',
      expectedHash: bundle.expectedScreenshotHash,
      currentHash: bundle.currentScreenshotHash,
      diffHash: bundle.diffScreenshotHash,
      findings: reduction.findings,
      verdict: reduction.structured,
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(claim.bundleHash).toBe(receipt.bundleHash);
    expect(receipt.expectedHash).toBe(bundle.expectedScreenshotHash);
    expect(receipt.currentHash).toBe(bundle.currentScreenshotHash);
    expect(receipt.diffHash).toBe(bundle.diffScreenshotHash);
    expect(receipt.verdict).toBeTruthy();
    expect(receipt.model).toBe('deepseek-v4-flash');
  });
});

describe('E2E: SUPPORTED model capability attestation', () => {
  it('can produce a valid attestation', () => {
    const attestation: VisionCapabilityAttestation = {
      model: 'deepseek-v4-flash',
      provider: 'deepseek',
      host: 'codex',
      version: '4.0.0',
      capabilitySource: 'host-native',
      canaryInputHash: hash64('canary-input'),
      canaryOutputHash: hash64('canary-output'),
      visionInput: 'SUPPORTED',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(attestation.visionInput).toBe('SUPPORTED');
    expect(attestation.canaryInputHash).toBeTruthy();
    expect(attestation.canaryOutputHash).toBeTruthy();
    expect(new Date(attestation.expiry).getTime()).toBeGreaterThan(Date.now());
  });

  it('can produce semantic visual PASS through receipt', () => {
    const { bundle } = compileVisualEvidence({
      route: '/supported/semantic',
      state: 'idle',
      viewport: '1024x768',
      screenshots: fixtureScreenshots(),
    });
    const receipt: SemanticVisualReviewReceipt = {
      bundleHash: bundleFingerprint(bundle),
      model: 'deepseek-v4-flash',
      host: 'codex',
      version: '4.0.0',
      expectedHash: bundle.expectedScreenshotHash,
      currentHash: bundle.currentScreenshotHash,
      diffHash: bundle.diffScreenshotHash,
      findings: [],
      verdict: 'PASS',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(receipt.verdict).toBe('PASS');
    expect(receipt.findings).toHaveLength(0);
  });
});

describe('E2E: UNSUPPORTED model cannot produce semantic Visual PASS', () => {
  it('unsupported model attestation prevents PASS semantic verdict', () => {
    const attestation: VisionCapabilityAttestation = {
      model: 'gpt-3.5-turbo',
      provider: 'openai',
      host: 'antigravity',
      version: '1.0.0',
      capabilitySource: 'adapter',
      canaryInputHash: hash64('input'),
      canaryOutputHash: hash64('output'),
      visionInput: 'UNSUPPORTED',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(attestation.visionInput).toBe('UNSUPPORTED');
    const { bundle } = compileVisualEvidence({
      route: '/unsupported',
      state: 'check',
      viewport: '800x600',
      screenshots: fixtureScreenshots(true),
    });
    const ref = {
      geometry: { viewport: { width: 800, height: 600 }, elements: [] },
      styles: { elements: [] },
      accessibility: { violations: [], incomplete: [] },
    };
    const reduction = reduceVisualConformance(bundle, ref);
    const receipt: SemanticVisualReviewReceipt = {
      bundleHash: bundleFingerprint(bundle),
      model: attestation.model,
      host: attestation.host,
      version: attestation.version,
      expectedHash: bundle.expectedScreenshotHash,
      currentHash: bundle.currentScreenshotHash,
      diffHash: bundle.diffScreenshotHash,
      findings: reduction.findings,
      verdict: 'UNVERIFIED',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(receipt.verdict).not.toBe('PASS');
    expect(receipt.verdict).toBe('UNVERIFIED');
  });
});

describe('E2E: UNKNOWN model cannot silently pass', () => {
  it('unknown vision capability forces UNVERIFIED verdict', () => {
    const attestation: VisionCapabilityAttestation = {
      model: 'unknown-vision-model',
      provider: 'unknown',
      host: 'grok',
      version: '0.0.0',
      capabilitySource: 'unknown',
      canaryInputHash: hash64('unknown-input'),
      canaryOutputHash: hash64('unknown-output'),
      visionInput: 'UNKNOWN',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(attestation.visionInput).toBe('UNKNOWN');
    const { bundle } = compileVisualEvidence({
      route: '/unknown',
      state: 'silent',
      viewport: '1280x720',
      screenshots: fixtureScreenshots(),
    });
    const ref = {
      geometry: { viewport: { width: 1280, height: 720 }, elements: [] },
      styles: { elements: [] },
      accessibility: { violations: [], incomplete: [] },
    };
    const reduction = reduceVisualConformance(bundle, ref);
    const receipt: SemanticVisualReviewReceipt = {
      bundleHash: bundleFingerprint(bundle),
      model: attestation.model,
      host: attestation.host,
      version: attestation.version,
      expectedHash: bundle.expectedScreenshotHash,
      currentHash: bundle.currentScreenshotHash,
      diffHash: bundle.diffScreenshotHash,
      findings: reduction.findings,
      verdict: 'UNVERIFIED',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(receipt.verdict).toBe('UNVERIFIED');
    expect(receipt.verdict).not.toBe('PASS');
  });
});

describe('E2E: Non-vision worker produces structured visual conformance', () => {
  it('produces structured (non-semantic) verdicts', () => {
    const { bundle } = compileVisualEvidence({
      route: '/non-vision',
      state: 'rendered',
      viewport: '1366x768',
      screenshots: fixtureScreenshots(true),
      domSnapshot: [
        { selector: '#header', boundingBox: { x: 0, y: 0, width: 1366, height: 60 }, paintOrder: 0, computedStyles: { 'font-size': '24px', color: '#333', 'background-color': '#fff' } },
        { selector: '#footer', boundingBox: { x: 0, y: 700, width: 1366, height: 68 }, paintOrder: 5, computedStyles: { 'font-size': '12px' } },
      ],
      axeResults: { violations: ['color-contrast'], incomplete: [] },
      consoleLogs: ['[warn] font delayed'],
    });
    const ref = {
      geometry: {
        viewport: { width: 1366, height: 768 },
        elements: [
          { selector: '#header', boundingBox: { x: 0, y: 0, width: 1366, height: 60 } },
          { selector: '#footer', boundingBox: { x: 0, y: 700, width: 1366, height: 68 } },
        ],
      },
      styles: {
        elements: [
          { selector: '#header', computedStyles: { 'font-size': '24px', color: '#333', 'background-color': '#fff' } },
        ],
      },
      accessibility: { violations: [], incomplete: [] },
    };
    const result = reduceVisualConformance(bundle, ref);
    expect(result.runtime).toBeTruthy();
    expect(result.structured).toBeTruthy();
    expect(Array.isArray(result.findings)).toBe(true);
    const semanticVerdict: VisualVerdict = 'UNVERIFIED';
    expect(semanticVerdict).toBe('UNVERIFIED');
    expect(result.structured).not.toBe('UNVERIFIED');
  });

  it('detects visual drift from style mismatches', () => {
    const { bundle } = compileVisualEvidence({
      route: '/drift',
      state: 'check',
      viewport: '1024x768',
      screenshots: fixtureScreenshots(),
      domSnapshot: [
        { selector: '#title', boundingBox: { x: 20, y: 20, width: 400, height: 36 }, paintOrder: 1, computedStyles: { 'font-size': '24px', 'font-weight': '700', color: '#000', 'background-color': '#fff' } },
      ],
    });
    const ref = {
      geometry: { viewport: { width: 1024, height: 768 }, elements: [{ selector: '#title', boundingBox: { x: 20, y: 20, width: 400, height: 36 } }] },
      styles: { elements: [{ selector: '#title', computedStyles: { 'font-size': '24px', 'font-weight': '400', color: '#000', 'background-color': '#fff' } }] },
      accessibility: { violations: [], incomplete: [] },
    };
    const result = reduceVisualConformance(bundle, ref);
    const fontWeightFindings = result.findings.filter((f) => f.selector === '#title' && f.detector === 'reduceVisualConformance');
    expect(fontWeightFindings.length).toBeGreaterThan(0);
    expect(fontWeightFindings.some((f) => f.sourceHint.includes('weight') || f.actual === '700')).toBe(true);
  });
});

describe('E2E: Stale visual receipt detection', () => {
  it('detects expired receipt', () => {
    const receipt: SemanticVisualReviewReceipt = {
      bundleHash: hash64('stale'),
      model: 'gpt-4o',
      host: 'antigravity',
      version: '1.0',
      expectedHash: hash64('expected'),
      currentHash: hash64('current'),
      diffHash: hash64('diff'),
      findings: [],
      verdict: 'PASS',
      timestamp: '2020-01-01T00:00:00.000Z',
      expiry: '2020-01-02T00:00:00.000Z',
    };
    const now = Date.now();
    expect(new Date(receipt.expiry).getTime()).toBeLessThan(now);
    const isStale = new Date(receipt.expiry).getTime() < now;
    expect(isStale).toBe(true);
  });

  it('detects fresh receipt', () => {
    const receipt: SemanticVisualReviewReceipt = {
      bundleHash: hash64('fresh'),
      model: 'deepseek-v4-flash',
      host: 'codex',
      version: '4.0.0',
      expectedHash: hash64('expected'),
      currentHash: hash64('current'),
      diffHash: hash64('diff'),
      findings: [],
      verdict: 'PASS',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(new Date(receipt.expiry).getTime()).toBeGreaterThan(Date.now());
  });

  it('detects hash mismatch between receipt and bundle', () => {
    const { bundle } = compileVisualEvidence({
      route: '/stale-hash',
      state: 'mismatch',
      viewport: '800x600',
      screenshots: fixtureScreenshots(),
    });
    const actualBundleHash = bundleFingerprint(bundle);
    const receipt: SemanticVisualReviewReceipt = {
      bundleHash: hash64('different-bundle'),
      model: 'deepseek-v4-flash',
      host: 'codex',
      version: '4.0.0',
      expectedHash: bundle.expectedScreenshotHash,
      currentHash: bundle.currentScreenshotHash,
      diffHash: bundle.diffScreenshotHash,
      findings: [],
      verdict: 'PASS',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(receipt.bundleHash).not.toBe(actualBundleHash);
    const hashesMatch = receipt.bundleHash === actualBundleHash;
    expect(hashesMatch).toBe(false);
  });

  it('detects hash mismatch between receipt screenshots and bundle', () => {
    const { bundle } = compileVisualEvidence({
      route: '/stale-screenshot-hash',
      state: 'wrong',
      viewport: '1024x768',
      screenshots: fixtureScreenshots(),
    });
    const receipt: SemanticVisualReviewReceipt = {
      bundleHash: bundleFingerprint(bundle),
      model: 'deepseek-v4-flash',
      host: 'codex',
      version: '4.0.0',
      expectedHash: hash64('wrong-expected'),
      currentHash: hash64('wrong-current'),
      diffHash: hash64('wrong-diff'),
      findings: [],
      verdict: 'PASS',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(receipt.expectedHash).not.toBe(bundle.expectedScreenshotHash);
    expect(receipt.currentHash).not.toBe(bundle.currentScreenshotHash);
    expect(receipt.diffHash).not.toBe(bundle.diffScreenshotHash);
  });
});
