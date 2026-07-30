import type {
  VisualEvidenceBundle,
  VisualFinding,
  VisualVerdict,
} from './visual-contracts.js';

export interface ReductionReference {
  geometry: unknown;
  styles: unknown;
  accessibility: unknown;
}

export interface ReductionResult {
  runtime: VisualVerdict;
  structured: VisualVerdict;
  findings: VisualFinding[];
}

interface ParsedReference {
  geometry: { viewport: { width: number; height: number }; elements: Map<string, { x: number; y: number; width: number; height: number }> };
  styles: Map<string, Record<string, string>>;
  accessibility: { violations: readonly string[]; incomplete: readonly string[] };
}

function parseReference(ref: ReductionReference): ParsedReference {
  const geo = (ref.geometry as { viewport?: { width?: number; height?: number }; elements?: Array<{ selector?: string; boundingBox?: { x?: number; y?: number; width?: number; height?: number } }> }) ?? {};
  const style = (ref.styles as { elements?: Array<{ selector?: string; computedStyles?: Record<string, string> }> }) ?? {};
  const acc = (ref.accessibility as { violations?: readonly string[]; incomplete?: readonly string[] }) ?? {};

  const elementMap = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const el of geo.elements ?? []) {
    if (el.selector) {
      elementMap.set(el.selector, {
        x: el.boundingBox?.x ?? 0,
        y: el.boundingBox?.y ?? 0,
        width: el.boundingBox?.width ?? 0,
        height: el.boundingBox?.height ?? 0,
      });
    }
  }

  const styleMap = new Map<string, Record<string, string>>();
  for (const el of style.elements ?? []) {
    if (el.selector) {
      styleMap.set(el.selector, { ...el.computedStyles });
    }
  }

  return {
    geometry: {
      viewport: {
        width: geo.viewport?.width ?? 1280,
        height: geo.viewport?.height ?? 720,
      },
      elements: elementMap,
    },
    styles: styleMap,
    accessibility: {
      violations: acc.violations ?? [],
      incomplete: acc.incomplete ?? [],
    },
  };
}

const STYLE_KEYS = [
  'font-family', 'font-size', 'font-weight', 'line-height', 'color',
  'background-color', 'background', 'border-radius', 'box-shadow',
  'width', 'height', 'margin', 'padding', 'display',
] as const;

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pairKey(i: number, j: number): string {
  return `${Math.min(i, j)}:${Math.max(i, j)}`;
}

function detectOverlaps(doms: VisualEvidenceBundle['domSnapshot']): VisualFinding[] {
  const findings: VisualFinding[] = [];
  const checked = new Set<string>();
  for (let i = 0; i < doms.length; i++) {
    for (let j = i + 1; j < doms.length; j++) {
      const key = pairKey(i, j);
      if (checked.has(key)) continue;
      checked.add(key);
      const a = doms[i];
      const b = doms[j];
      if (a.boundingBox.width === 0 || a.boundingBox.height === 0 || b.boundingBox.width === 0 || b.boundingBox.height === 0) continue;
      if (rectsOverlap(a.boundingBox, b.boundingBox)) {
        findings.push({
          selector: `${a.selector} / ${b.selector}`,
          component: 'layout',
          sourceHint: 'element overlap detected',
          detector: 'reduceVisualConformance',
          severity: 'critical',
          expected: `no overlap between elements`,
          actual: `${a.selector} (${a.boundingBox.x},${a.boundingBox.y},${a.boundingBox.width}×${a.boundingBox.height}) overlaps ${b.selector} (${b.boundingBox.x},${b.boundingBox.y},${b.boundingBox.width}×${b.boundingBox.height})`,
        });
      }
    }
  }
  return findings;
}

function detectSpacingAlignmentDrift(
  doms: VisualEvidenceBundle['domSnapshot'],
  ref: ParsedReference,
): VisualFinding[] {
  const findings: VisualFinding[] = [];
  const refElements = ref.geometry.elements;

  const domBySelector = new Map(doms.map((d) => [d.selector, d]));

  const alignedByX = new Map<number, string[]>();
  const alignedByY = new Map<number, string[]>();

  for (const domNode of doms) {
    const ex = refElements.get(domNode.selector);
    if (!ex) continue;

    if (domNode.boundingBox.x !== ex.x) {
      const delta = Math.abs(domNode.boundingBox.x - ex.x);
      if (delta > 2) {
        findings.push({
          selector: domNode.selector,
          component: 'layout',
          sourceHint: 'horizontal alignment drift',
          detector: 'reduceVisualConformance',
          severity: 'moderate',
          expected: `x = ${ex.x}`,
          actual: `x = ${domNode.boundingBox.x} (Δ${delta})`,
        });
      }
    }
    if (domNode.boundingBox.y !== ex.y) {
      const delta = Math.abs(domNode.boundingBox.y - ex.y);
      if (delta > 2) {
        findings.push({
          selector: domNode.selector,
          component: 'layout',
          sourceHint: 'vertical alignment drift',
          detector: 'reduceVisualConformance',
          severity: 'moderate',
          expected: `y = ${ex.y}`,
          actual: `y = ${domNode.boundingBox.y} (Δ${delta})`,
        });
      }
    }

    const rx = Math.round(domNode.boundingBox.x / 10) * 10;
    const ry = Math.round(domNode.boundingBox.y / 10) * 10;
    if (!alignedByX.has(rx)) alignedByX.set(rx, []);
    alignedByX.get(rx)!.push(domNode.selector);
    if (!alignedByY.has(ry)) alignedByY.set(ry, []);
    alignedByY.get(ry)!.push(domNode.selector);
  }

  return findings;
}

function detectLineCountDrift(
  doms: VisualEvidenceBundle['domSnapshot'],
): VisualFinding[] {
  const findings: VisualFinding[] = [];
  for (const domNode of doms) {
    const lineHeightStr = domNode.computedStyles['line-height'];
    const height = domNode.boundingBox.height;
    if (lineHeightStr && lineHeightStr.endsWith('px') && height > 0) {
      const lineHeightPx = parseFloat(lineHeightStr);
      if (lineHeightPx > 0) {
        const estimatedLines = Math.round(height / lineHeightPx);
        if (estimatedLines > 5) {
          findings.push({
            selector: domNode.selector,
            component: 'layout',
            sourceHint: 'element exceeds typical line count',
            detector: 'reduceVisualConformance',
            severity: 'moderate',
            expected: `lines ≤ 5`,
            actual: `~${estimatedLines} lines (height=${height}px / line-height=${lineHeightPx}px)`,
          });
        }
      }
    }
  }
  return findings;
}

function detectIssues(bundle: VisualEvidenceBundle, ref: ParsedReference): VisualFinding[] {
  const findings: VisualFinding[] = [];

  const viewportW = ref.geometry.viewport.width;
  const viewportH = ref.geometry.viewport.height;

  findings.push(...detectOverlaps(bundle.domSnapshot));
  findings.push(...detectSpacingAlignmentDrift(bundle.domSnapshot, ref));
  findings.push(...detectLineCountDrift(bundle.domSnapshot));

  for (const domNode of bundle.domSnapshot) {
    const { selector, boundingBox, computedStyles } = domNode;
    const expectedBox = ref.geometry.elements.get(selector);
    const expectedStyles = ref.styles.get(selector);

    if (!expectedBox && ref.geometry.elements.size > 0) continue;

    if (expectedBox) {
      if (boundingBox.x < 0 || boundingBox.y < 0) {
        findings.push({
          selector, component: 'layout', sourceHint: 'element is positioned off-screen',
          detector: 'reduceVisualConformance', severity: 'serious',
          expected: `position ≥ (0, 0)`, actual: `(${boundingBox.x}, ${boundingBox.y})`,
        });
      }

      if (boundingBox.x + boundingBox.width > viewportW) {
        findings.push({
          selector, component: 'layout', sourceHint: 'element clips beyond viewport width',
          detector: 'reduceVisualConformance', severity: 'serious',
          expected: `right edge ≤ ${viewportW}`, actual: `right edge = ${boundingBox.x + boundingBox.width}`,
        });
      }

      if (boundingBox.y + boundingBox.height > viewportH) {
        findings.push({
          selector, component: 'layout', sourceHint: 'element clips beyond viewport height',
          detector: 'reduceVisualConformance', severity: 'serious',
          expected: `bottom edge ≤ ${viewportH}`, actual: `bottom edge = ${boundingBox.y + boundingBox.height}`,
        });
      }

      if (boundingBox.width < expectedBox.width * 0.5 || boundingBox.height < expectedBox.height * 0.5) {
        findings.push({
          selector, component: 'layout', sourceHint: 'responsive element loss or reflow mismatch',
          detector: 'reduceVisualConformance', severity: 'critical',
          expected: `size ~(${expectedBox.width}×${expectedBox.height})`,
          actual: `size (${boundingBox.width}×${boundingBox.height})`,
        });
      }
    }

    const touchTargetMin = 44;
    if (boundingBox.width < touchTargetMin && boundingBox.height < touchTargetMin) {
      findings.push({
        selector, component: 'accessibility', sourceHint: 'touch-target below minimum size',
        detector: 'reduceVisualConformance', severity: 'serious',
        expected: `touch target ≥ ${touchTargetMin}px in one dimension`,
        actual: `(${boundingBox.width}×${boundingBox.height})`,
      });
    }

    for (const key of STYLE_KEYS) {
      const currentValue = computedStyles[key];
      const expectedValue = expectedStyles?.[key];
      if (expectedValue !== undefined && currentValue !== undefined && currentValue !== expectedValue) {
        const keyToSourceHint: Record<string, string> = {
          'font-family': 'font drift',
          'font-size': 'font size drift',
          'font-weight': 'font weight drift',
          'line-height': 'line-height drift',
          color: 'color drift',
          'background-color': 'background drift',
          background: 'background drift',
          'border-radius': 'radius drift',
          'box-shadow': 'shadow drift',
        };
        findings.push({
          selector, component: 'styling', sourceHint: keyToSourceHint[key] ?? `${key} drift`,
          detector: 'reduceVisualConformance',
          severity: key === 'color' || key === 'background-color' ? 'serious' : 'moderate',
          expected: expectedValue,
          actual: currentValue,
        });
      }
    }

    if (computedStyles['text-overflow'] === 'ellipsis' || computedStyles['overflow'] === 'hidden') {
      findings.push({
        selector, component: 'layout', sourceHint: 'text overflow or ellipsis detected',
        detector: 'reduceVisualConformance', severity: 'moderate',
        expected: 'content fully visible',
        actual: `overflow=${computedStyles['overflow'] ?? 'visible'} text-overflow=${computedStyles['text-overflow'] ?? 'clip'}`,
      });
    }
  }

  for (const violation of bundle.axeViolations) {
    findings.push({
      selector: 'root',
      component: 'accessibility',
      sourceHint: 'axe violation',
      detector: 'reduceVisualConformance',
      severity: violation.toLowerCase().includes('contrast') ? 'serious' : 'moderate',
      expected: 'no axe violations',
      actual: violation,
    });
  }

  for (const violation of bundle.axeIncomplete) {
    findings.push({
      selector: 'root',
      component: 'accessibility',
      sourceHint: 'axe incomplete check',
      detector: 'reduceVisualConformance',
      severity: 'minor',
      expected: 'no axe incomplete checks',
      actual: violation,
    });
  }

  if (bundle.consoleEvidence.length > 0) {
    findings.push({
      selector: 'root',
      component: 'runtime',
      sourceHint: 'console evidence present',
      detector: 'reduceVisualConformance',
      severity: 'moderate',
      expected: 'no console output',
      actual: `${bundle.consoleEvidence.length} console entries`,
    });
  }

  const severityScore: Record<VisualFinding['severity'], number> = {
    critical: 4,
    serious: 3,
    moderate: 2,
    minor: 1,
  };

  findings.sort((a, b) => severityScore[b.severity] - severityScore[a.severity]);

  return findings;
}

export function reduceVisualConformance(
  bundle: VisualEvidenceBundle,
  reference: ReductionReference,
): ReductionResult {
  const ref = parseReference(reference);

  const findings = detectIssues(bundle, ref);

  const hasCritical = findings.some((f) => f.severity === 'critical');
  const hasSerious = findings.some((f) => f.severity === 'serious');
  const hasAny = findings.length > 0;

  let runtime: VisualVerdict;
  if (bundle.globalDiffPercent > 5) {
    runtime = 'FAIL';
  } else if (bundle.globalDiffPercent > 1) {
    runtime = 'FLAKY';
  } else {
    runtime = 'PASS';
  }

  let structured: VisualVerdict;
  if (hasCritical) {
    structured = 'FAIL';
  } else if (hasSerious) {
    structured = 'FLAKY';
  } else if (!hasAny) {
    structured = 'PASS';
  } else {
    structured = 'PASS';
  }

  return { runtime, structured, findings };
}
