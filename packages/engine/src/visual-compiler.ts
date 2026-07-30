import { createHash } from 'node:crypto';
import type {
  VisualEvidenceBundle,
  VisualFinding,
  VisualVerdict,
} from './visual-contracts.js';

export { type Sha256 } from './contracts.js';

function sha256Bytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function boundedText(value: string, max = 256): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

interface DiffResult {
  expectedHash: string;
  currentHash: string;
  diffHash: string;
  globalDiffPercent: number;
  regionDiffMetrics: Array<{ region: string; diffPercent: number }>;
}

const REGIONS = ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'] as const;

function computeStructuralDiff(expected: Buffer, current: Buffer): DiffResult {
  const expectedHash = sha256Bytes(expected);
  const currentHash = sha256Bytes(current);

  if (expectedHash === currentHash) {
    return {
      expectedHash,
      currentHash,
      diffHash: sha256Bytes(Buffer.alloc(0)),
      globalDiffPercent: 0,
      regionDiffMetrics: REGIONS.map((region) => ({ region, diffPercent: 0 })),
    };
  }

  const maxLen = Math.max(expected.length, current.length);
  const minLen = Math.min(expected.length, current.length);

  const diffBuffer = Buffer.alloc(maxLen, 0);
  let totalDiffBytes = 0;

  for (let i = 0; i < minLen; i++) {
    const diff = expected[i] !== current[i] ? 1 : 0;
    diffBuffer[i] = diff;
    totalDiffBytes += diff;
  }

  for (let i = minLen; i < maxLen; i++) {
    diffBuffer[i] = 1;
    totalDiffBytes++;
  }

  const globalDiffPercent = maxLen > 0
    ? Math.round((totalDiffBytes / maxLen) * 10_000) / 100
    : 0;

  const regionSize = Math.max(1, Math.floor(minLen / REGIONS.length));
  const regionDiffMetrics = REGIONS.map((region, index) => {
    const start = index * regionSize;
    const end = index === REGIONS.length - 1 ? minLen : Math.min(start + regionSize, minLen);
    const size = end - start;
    let regionDiffCount = 0;
    for (let i = start; i < end; i++) {
      if (expected[i] !== current[i]) regionDiffCount++;
    }
    return {
      region,
      diffPercent: size > 0 ? Math.round((regionDiffCount / size) * 10_000) / 100 : 0,
    };
  });

  const diffHash = sha256Bytes(diffBuffer);

  return { expectedHash, currentHash, diffHash, globalDiffPercent, regionDiffMetrics };
}

export interface CompileInput {
  route: string;
  state: string;
  viewport: string;
  screenshots: { expected: Buffer; current: Buffer };
  ariaSnapshot?: string;
  domSnapshot?: unknown[];
  axeResults?: { violations: string[]; incomplete: string[] };
  consoleLogs?: string[];
  networkLogs?: string[];
}

export function compileVisualEvidence(input: CompileInput): {
  bundle: VisualEvidenceBundle;
  errors: string[];
} {
  const errors: string[] = [];

  try {
    requireValue(typeof input.route === 'string' && input.route.trim().length > 0, 'route is required');
    requireValue(typeof input.state === 'string' && input.state.trim().length > 0, 'state is required');
    requireValue(typeof input.viewport === 'string' && input.viewport.trim().length > 0, 'viewport is required');
    requireValue(input.screenshots?.expected instanceof Buffer, 'expected screenshot is required');
    requireValue(input.screenshots?.current instanceof Buffer, 'current screenshot is required');
  } catch (error) {
    return {
      bundle: null as unknown as VisualEvidenceBundle,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  const diff = computeStructuralDiff(input.screenshots.expected, input.screenshots.current);

  const domSnapshot = (input.domSnapshot ?? []).map((item: unknown) => {
    const node = item as {
      selector?: string;
      boundingBox?: { x?: number; y?: number; width?: number; height?: number };
      paintOrder?: number;
      computedStyles?: Record<string, string>;
    };
    return {
      selector: node.selector ?? '',
      boundingBox: {
        x: node.boundingBox?.x ?? 0,
        y: node.boundingBox?.y ?? 0,
        width: node.boundingBox?.width ?? 0,
        height: node.boundingBox?.height ?? 0,
      },
      paintOrder: node.paintOrder ?? 0,
      computedStyles: { ...node.computedStyles },
    };
  });

  const findings: VisualFinding[] = [];

  if (diff.globalDiffPercent > 0) {
    findings.push({
      selector: 'root',
      component: 'screenshot',
      sourceHint: 'global pixel diff',
      detector: 'compileVisualEvidence',
      severity: diff.globalDiffPercent > 5 ? 'critical' : diff.globalDiffPercent > 1 ? 'serious' : 'moderate',
      expected: `diff ≤ 0%`,
      actual: `diff = ${diff.globalDiffPercent}%`,
    });
  }

  const bundle: VisualEvidenceBundle = {
    route: input.route,
    state: input.state,
    viewport: input.viewport,
    browser: 'chromium',
    version: '0.0.0',
    os: process.platform,
    fonts: [],
    locale: 'en-US',
    timezone: 'UTC',
    dpr: 1,
    fixtureIdentity: `${input.route}::${input.state}::${input.viewport}`,
    expectedScreenshotPath: `/screenshots/expected/${input.route}/${input.state}/${input.viewport}.png`,
    currentScreenshotPath: `/screenshots/current/${input.route}/${input.state}/${input.viewport}.png`,
    diffScreenshotPath: `/screenshots/diff/${input.route}/${input.state}/${input.viewport}.png`,
    expectedScreenshotHash: diff.expectedHash,
    currentScreenshotHash: diff.currentHash,
    diffScreenshotHash: diff.diffHash,
    globalDiffPercent: diff.globalDiffPercent,
    regionDiffMetrics: diff.regionDiffMetrics,
    ariaSnapshot: input.ariaSnapshot ?? '',
    domSnapshot,
    axeViolations: [...(input.axeResults?.violations ?? [])],
    axeIncomplete: [...(input.axeResults?.incomplete ?? [])],
    consoleEvidence: [...(input.consoleLogs ?? [])],
    networkEvidence: [...(input.networkLogs ?? [])],
    findings,
    acceptedDeviationIds: [],
    baselineIdentity: 'baseline-default',
    baselineApprovalState: 'PENDING',
  };

  return { bundle, errors: [] };
}

export function bundleFingerprint(bundle: VisualEvidenceBundle): string {
  const canonical = JSON.stringify([
    bundle.route,
    bundle.state,
    bundle.viewport,
    bundle.expectedScreenshotHash,
    bundle.currentScreenshotHash,
    bundle.diffScreenshotHash,
    bundle.globalDiffPercent,
    [...bundle.regionDiffMetrics].sort((a, b) => a.region < b.region ? -1 : 1),
    [...bundle.axeViolations].sort(),
    [...bundle.consoleEvidence].sort(),
    [...bundle.networkEvidence].sort(),
    [...bundle.domSnapshot].sort((a, b) => a.selector < b.selector ? -1 : 1),
    [...bundle.findings].sort((a, b) => a.selector < b.selector ? -1 : 1),
  ]);
  return sha256Bytes(new TextEncoder().encode(canonical));
}
