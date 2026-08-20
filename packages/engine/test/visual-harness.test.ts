import { describe, expect, it } from 'vitest';
import type {
  VisionCapabilityAttestation,
  VisualEvidenceBundle,
  VisualFinding,
  StructuredVisualClaim,
  SemanticVisualReviewReceipt,
  VisualVerdict,
  VisionInputStatus,
} from '../src/visual-contracts.js';
import { compileVisualEvidence, bundleFingerprint } from '../src/visual-compiler.js';

const hash64 = 'a'.repeat(64);

function validScreenshots(): { expected: Buffer; current: Buffer } {
  return {
    expected: Buffer.from('fake-png-expected-data'),
    current: Buffer.from('fake-png-current-data'),
  };
}

function sameScreenshots(): { expected: Buffer; current: Buffer } {
  const data = Buffer.from('identical-screenshot-data');
  return { expected: data, current: Buffer.from(data) };
}

describe('VisionCapabilityAttestation', () => {
  it('validates all required fields', () => {
    const attestation: VisionCapabilityAttestation = {
      model: 'deepseek-v4-flash',
      provider: 'deepseek',
      host: 'codex',
      version: '4.0.0',
      capabilitySource: 'host-native',
      canaryInputHash: hash64,
      canaryOutputHash: hash64,
      visionInput: 'SUPPORTED',
      timestamp: '2026-07-27T00:00:00.000Z',
      expiry: '2026-07-28T00:00:00.000Z',
    };
    expect(attestation.model).toBe('deepseek-v4-flash');
    expect(attestation.provider).toBe('deepseek');
    expect(attestation.host).toBe('codex');
    expect(attestation.version).toBe('4.0.0');
    expect(attestation.capabilitySource).toBe('host-native');
    expect(attestation.canaryInputHash).toBe(hash64);
    expect(attestation.canaryOutputHash).toBe(hash64);
    expect(attestation.visionInput).toBe('SUPPORTED');
    expect(attestation.timestamp).toBeTruthy();
    expect(attestation.expiry).toBeTruthy();
  });

  it('rejects missing visionInput', () => {
    const attestation: VisionCapabilityAttestation = {
      model: 'deepseek-v4-flash',
      provider: 'deepseek',
      host: 'codex',
      version: '4.0.0',
      capabilitySource: 'host-native',
      canaryInputHash: hash64,
      canaryOutputHash: hash64,
      visionInput: '' as VisionInputStatus,
      timestamp: '2026-07-27T00:00:00.000Z',
      expiry: '2026-07-28T00:00:00.000Z',
    };
    expect(attestation.visionInput).toBe('');
  });

  it('accepts all VisionInputStatus values', () => {
    const statuses: VisionInputStatus[] = ['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN'];
    for (const status of statuses) {
      const attestation: VisionCapabilityAttestation = {
        model: 'm', provider: 'p', host: 'h', version: '1',
        capabilitySource: 's', canaryInputHash: hash64, canaryOutputHash: hash64,
        visionInput: status, timestamp: new Date().toISOString(), expiry: new Date().toISOString(),
      };
      expect(attestation.visionInput).toBe(status);
    }
  });

  it('supports closed type for visionInput', () => {
    const attestation: VisionCapabilityAttestation = {
      model: 'm', provider: 'p', host: 'h', version: '1',
      capabilitySource: 's', canaryInputHash: hash64, canaryOutputHash: hash64,
      // @ts-expect-error invalid status should be caught by the type system
      visionInput: 'INVALID',
      timestamp: new Date().toISOString(), expiry: new Date().toISOString(),
    };
    expect(attestation.visionInput).toBe('INVALID');
  });
});

describe('VisualEvidenceBundle', () => {
  it('rejects missing evidence', () => {
    const result = compileVisualEvidence({
      route: '',
      state: 'default',
      viewport: '1280x720',
      screenshots: validScreenshots(),
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('route');
  });

  it('rejects missing screenshots', () => {
    const result = compileVisualEvidence({
      route: '/home',
      state: 'default',
      viewport: '1280x720',
      // @ts-expect-error testing missing screenshots
      screenshots: undefined,
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects missing expected screenshot', () => {
    const result = compileVisualEvidence({
      route: '/home',
      state: 'default',
      viewport: '1280x720',
      // @ts-expect-error testing missing expected
      screenshots: { current: Buffer.from('data') },
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects missing state', () => {
    const result = compileVisualEvidence({
      route: '/home',
      state: '',
      viewport: '1280x720',
      screenshots: validScreenshots(),
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects missing viewport', () => {
    const result = compileVisualEvidence({
      route: '/home',
      state: 'default',
      viewport: '',
      screenshots: validScreenshots(),
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects empty route', () => {
    const result = compileVisualEvidence({
      route: '',
      state: 'default',
      viewport: '1280x720',
      screenshots: validScreenshots(),
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('compileVisualEvidence', () => {
  it('produces deterministic bundle', () => {
    const input = { route: '/test', state: 'idle', viewport: '1024x768', screenshots: sameScreenshots() };
    const a = compileVisualEvidence(input);
    const b = compileVisualEvidence(input);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.bundle.expectedScreenshotHash).toBe(b.bundle.expectedScreenshotHash);
    expect(a.bundle.currentScreenshotHash).toBe(b.bundle.currentScreenshotHash);
    expect(a.bundle.diffScreenshotHash).toBe(b.bundle.diffScreenshotHash);
    expect(a.bundle.globalDiffPercent).toBe(b.bundle.globalDiffPercent);
  });

  it('returns errors for missing screenshots', () => {
    const result = compileVisualEvidence({
      route: '/fail',
      state: 'loading',
      viewport: '800x600',
      // @ts-expect-error testing undefined screenshots
      screenshots: undefined,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/screenshot/i);
  });

  it('different inputs produce different bundle hashes', () => {
    const inputA = { route: '/a', state: 'idle', viewport: '1024x768', screenshots: sameScreenshots() };
    const inputB = { route: '/b', state: 'active', viewport: '1280x1024', screenshots: validScreenshots() };
    const a = compileVisualEvidence(inputA);
    const b = compileVisualEvidence(inputB);
    expect(bundleFingerprint(a.bundle)).not.toBe(bundleFingerprint(b.bundle));
  });

  it('same inputs produce same bundle hashes', () => {
    const input = { route: '/stable', state: 'default', viewport: '1920x1080', screenshots: sameScreenshots() };
    const a = compileVisualEvidence(input);
    const b = compileVisualEvidence(input);
    expect(bundleFingerprint(a.bundle)).toBe(bundleFingerprint(b.bundle));
  });

  it('includes optional evidence fields when provided', () => {
    const result = compileVisualEvidence({
      route: '/form', state: 'submitting', viewport: '1440x900',
      screenshots: validScreenshots(),
      ariaSnapshot: 'role=dialog name=Submit',
      domSnapshot: [{ selector: '#submit-btn', boundingBox: { x: 10, y: 20, width: 100, height: 40 }, paintOrder: 1, computedStyles: { 'font-size': '16px' } }],
      axeResults: { violations: ['color-contrast'], incomplete: ['target-size'] },
      consoleLogs: ['[error] network timeout'],
      networkLogs: ['GET /api/status 200'],
    });
    expect(result.errors).toEqual([]);
    expect(result.bundle.ariaSnapshot).toBe('role=dialog name=Submit');
    expect(result.bundle.axeViolations).toContain('color-contrast');
    expect(result.bundle.consoleEvidence).toContain('[error] network timeout');
  });

  it('produces zero diff for identical screenshots', () => {
    const result = compileVisualEvidence({ route: '/same', state: 'a', viewport: '800x600', screenshots: sameScreenshots() });
    expect(result.errors).toEqual([]);
    expect(result.bundle.globalDiffPercent).toBe(0);
    expect(result.bundle.expectedScreenshotHash).toBe(result.bundle.currentScreenshotHash);
  });

  it('produces non-zero diff for different screenshots', () => {
    const result = compileVisualEvidence({ route: '/diff', state: 'b', viewport: '800x600', screenshots: validScreenshots() });
    expect(result.errors).toEqual([]);
    expect(result.bundle.globalDiffPercent).toBeGreaterThan(0);
    expect(result.bundle.expectedScreenshotHash).not.toBe(result.bundle.currentScreenshotHash);
  });
});

describe('VisualEvidenceBundle structure', () => {
  it('includes all required fields', () => {
    const result = compileVisualEvidence({ route: '/all-fields', state: 'check', viewport: '1280x720', screenshots: sameScreenshots() });
    expect(result.errors).toEqual([]);
    const bundle = result.bundle;
    expect(bundle.route).toBe('/all-fields');
    expect(bundle.state).toBe('check');
    expect(bundle.viewport).toBe('1280x720');
    expect(bundle.expectedScreenshotHash).toBeTruthy();
    expect(bundle.currentScreenshotHash).toBeTruthy();
    expect(bundle.diffScreenshotHash).toBeTruthy();
    expect(typeof bundle.globalDiffPercent).toBe('number');
    expect(Array.isArray(bundle.regionDiffMetrics)).toBe(true);
    expect(bundle.regionDiffMetrics.length).toBe(5);
    expect(typeof bundle.ariaSnapshot).toBe('string');
    expect(Array.isArray(bundle.domSnapshot)).toBe(true);
    expect(Array.isArray(bundle.axeViolations)).toBe(true);
    expect(Array.isArray(bundle.axeIncomplete)).toBe(true);
    expect(Array.isArray(bundle.consoleEvidence)).toBe(true);
    expect(Array.isArray(bundle.networkEvidence)).toBe(true);
    expect(Array.isArray(bundle.findings)).toBe(true);
    expect(Array.isArray(bundle.acceptedDeviationIds)).toBe(true);
    expect(bundle.baselineIdentity).toBeTruthy();
    expect(['APPROVED', 'PENDING', 'REJECTED']).toContain(bundle.baselineApprovalState);
  });
});
