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
