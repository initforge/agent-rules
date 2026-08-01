export type VisionInputStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';

export interface VisionCapabilityAttestation {
  readonly model: string;
  readonly provider: string;
  readonly host: string;
  readonly version: string;
  readonly capabilitySource: string;
  readonly canaryInputHash: string;
  readonly canaryOutputHash: string;
  readonly visionInput: VisionInputStatus;
  readonly timestamp: string;
  readonly expiry: string;
}

export interface VisualEvidenceBundle {
  readonly route: string;
  readonly state: string;
  readonly viewport: string;
  readonly browser: string;
  readonly version: string;
  readonly os: string;
  readonly fonts: readonly string[];
  readonly locale: string;
  readonly timezone: string;
  readonly dpr: number;
  readonly fixtureIdentity: string;
  readonly expectedScreenshotPath: string;
  readonly currentScreenshotPath: string;
  readonly diffScreenshotPath: string;
  readonly expectedScreenshotHash: string;
  readonly currentScreenshotHash: string;
  readonly diffScreenshotHash: string;
  readonly globalDiffPercent: number;
  readonly regionDiffMetrics: ReadonlyArray<{ readonly region: string; readonly diffPercent: number }>;
  readonly ariaSnapshot: string;
  readonly domSnapshot: ReadonlyArray<{
    readonly selector: string;
    readonly boundingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly paintOrder: number;
    readonly computedStyles: Readonly<Record<string, string>>;
  }>;
  readonly axeViolations: readonly string[];
  readonly axeIncomplete: readonly string[];
  readonly consoleEvidence: readonly string[];
  readonly networkEvidence: readonly string[];
  readonly findings: readonly VisualFinding[];
  readonly acceptedDeviationIds: readonly string[];
  readonly baselineIdentity: string;
  readonly baselineApprovalState: 'APPROVED' | 'PENDING' | 'REJECTED';
}

export interface VisualFinding {
  readonly selector: string;
  readonly component: string;
  readonly sourceHint: string;
  readonly detector: string;
  readonly severity: 'critical' | 'serious' | 'moderate' | 'minor';
  readonly expected: string;
  readonly actual: string;
  readonly acceptedDeviationId?: string;
}

export interface StructuredVisualClaim {
  readonly route: string;
  readonly state: string;
  readonly viewport: string;
  readonly bundleHash: string;
  readonly runtimeVerdict: VisualVerdict;
  readonly structuralVerdict: VisualVerdict;
  readonly semanticVerdict: VisualVerdict;
  readonly timestamp: string;
}

export type VisualVerdict = 'PASS' | 'FAIL' | 'FLAKY' | 'UNVERIFIED';

export interface SemanticVisualReviewReceipt {
  readonly bundleHash: string;
  readonly model: string;
  readonly host: string;
  readonly version: string;
  readonly expectedHash: string;
  readonly currentHash: string;
  readonly diffHash: string;
  readonly findings: readonly VisualFinding[];
  readonly verdict: VisualVerdict;
  readonly timestamp: string;
  readonly expiry: string;
}

// ── Paired reference/target browser parity (AM-0019 §9 / M11-R20/R21) ──────

export interface ParityBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ParityViewport {
  readonly width: number;
  readonly height: number;
}

export type ParityActionKind = 'goto' | 'click' | 'type' | 'press' | 'wait';

export interface ParityActionStep {
  readonly kind: ParityActionKind;
  readonly target?: string;
  readonly value?: string;
  readonly delayMs?: number;
}

export interface ParityAllowedDeviation {
  readonly id: string;
  readonly scope: string;
  readonly reason: string;
}

export type ParityDefectSeed =
  | 'missing-control'
  | 'hierarchy'
  | 'overflow'
  | 'spacing'
  | 'style'
  | 'focus-order'
  | 'console-error'
  | 'network-error';

/**
 * §9 binding contract. A ParityPair binds exact reference identity, target
 * ingress + candidate hash, fixture, role, locale, timezone, viewport, DPR,
 * theme, reduced motion, action sequence, state checkpoint, semantic anchors
 * and allowed deviations.
 */
export interface ParityPair {
  readonly id: string;
  readonly referenceUrl: string;
  readonly referenceCheckout?: string;
  readonly referenceRevisionHash?: string;
  readonly referenceMhtml?: string;
  readonly targetUrl: string;
  readonly candidateHash?: string;
  readonly fixture: string;
  readonly role: string;
  readonly locale: string;
  readonly timezone: string;
  readonly viewport: ParityViewport;
  readonly dpr: number;
  readonly theme: 'light' | 'dark' | 'no-preference';
  readonly reducedMotion: 'reduce' | 'no-preference';
  readonly actionSequence: readonly ParityActionStep[];
  readonly stateCheckpoint: string;
  readonly semanticAnchors: readonly string[];
  readonly allowedDeviations: readonly ParityAllowedDeviation[];
  readonly visionReviewRequired?: boolean;
  /** Seed mode: injects the defect into the TARGET side before capture. */
  readonly defectSeed?: ParityDefectSeed;
}

export interface ParityFinding extends VisualFinding {
  /** Machine-readable viewport coordinates of the offending region. */
  readonly coordinate?: ParityBox;
  /** Reference into the heatmap cell set (pixel diff) for this finding. */
  readonly heatmapRef?: string;
}

export type ParityVerdict = 'PASS' | 'FAIL' | 'WAITING_EXTERNAL';

export interface ParityHeatmapCell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly diffPercent: number;
}

export interface ParitySideEvidence {
  readonly opened: boolean;
  readonly screenshotHash: string;
  readonly ariaSnapshot: string;
  readonly semanticAnchors: readonly { readonly role: string; readonly name: string; readonly selector: string }[];
  readonly domSnapshot: VisualEvidenceBundle['domSnapshot'];
  readonly focusOrder: readonly string[];
  readonly axeViolations: readonly string[];
  readonly axeIncomplete: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly networkErrors: readonly string[];
  readonly harEntries: readonly { readonly method: string; readonly url: string; readonly status: number }[];
  readonly storageSnapshot: Readonly<Record<string, string>>;
  readonly loadTimeMs: number;
  readonly stateMatches: readonly { readonly anchor: string; readonly ok: boolean; readonly expected: string; readonly actual: string }[];
}

export interface ParityDiffReport {
  readonly pixel: {
    readonly expectedHash: string;
    readonly currentHash: string;
    readonly diffHash: string;
    readonly globalDiffPercent: number;
    readonly regionDiffMetrics: ReadonlyArray<{ readonly region: string; readonly diffPercent: number }>;
    readonly heatmapCells: readonly ParityHeatmapCell[];
  };
  readonly semantic: readonly ParityFinding[];
  readonly geometry: readonly ParityFinding[];
  readonly style: readonly ParityFinding[];
  readonly accessibility: readonly ParityFinding[];
  readonly overflow: readonly ParityFinding[];
  readonly runtime: readonly ParityFinding[];
  readonly allFindings: readonly ParityFinding[];
}

export interface ParityVerdictResult {
  readonly pairId: string;
  readonly verdict: ParityVerdict;
  readonly sidesOpened: { readonly ref: boolean; readonly tgt: boolean };
  readonly reasons: readonly string[];
  readonly acceptedDeviationIds: readonly string[];
  readonly diff: ParityDiffReport;
  readonly refEvidence: ParitySideEvidence;
  readonly tgtEvidence: ParitySideEvidence;
  readonly bundleHash: string;
}
