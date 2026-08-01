// Paired reference/target browser parity (AM-0019 §9, M11-R20/R21).
//
// Each ParityPair leases TWO isolated browser contexts — REF:<pair-id> and
// TGT:<pair-id>. A case can never PASS with only one side opened. Playwright
// drives journeys and assertions; screenshots/ARIA/DOM/computed styles/paint
// order/focus order/console/network/HAR/storage/performance are captured per
// side (Playwright talks to Chromium over CDP). The non-vision compiler emits
// semantic / geometry / style / accessibility / overflow / runtime diffs plus
// a per-pixel RGB equality diff (grid-aggregated) with machine-readable
// coordinates and a heatmap.
// Deterministic evidence stays mandatory; vision opinion can only gate a case
// into WAITING_EXTERNAL, never manufacture a PASS.

import { createHash } from 'node:crypto';
import type { Browser, BrowserContext, Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { compileVisualEvidence, bundleFingerprint } from './visual-compiler.js';
import { reduceVisualConformance, type ReductionReference } from './visual-reducer.js';
import { computePixelDiff, PIXEL_REGION_NAMES } from './parity-pixels.js';
import type {
  ParityAllowedDeviation,
  ParityDefectSeed,
  ParityDiffReport,
  ParityFinding,
  ParityHeatmapCell,
  ParityPair,
  ParitySideEvidence,
  ParityVerdict,
  ParityVerdictResult,
  VisualEvidenceBundle,
  VisualFinding,
} from './visual-contracts.js';

export type {
  ParityAllowedDeviation,
  ParityBox,
  ParityDefectSeed,
  ParityDiffReport,
  ParityFinding,
  ParityHeatmapCell,
  ParityPair,
  ParitySideEvidence,
  ParityVerdict,
  ParityVerdictResult,
  ParityViewport,
} from './visual-contracts.js';

// ── primitives ──────────────────────────────────────────────────────────────

function sha256Bytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function emptyPixel(regionDiffPercent = 0): ParityDiffReport['pixel'] {
  return {
    expectedHash: '',
    currentHash: '',
    diffHash: '',
    globalDiffPercent: 0,
    regionDiffMetrics: PIXEL_REGION_NAMES.map((region) => ({ region, diffPercent: regionDiffPercent })),
    heatmapCells: [],
  };
}

function emptyEvidence(opened: boolean): ParitySideEvidence {
  return {
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
  };
}

function emptyDiff(): ParityDiffReport {
  return {
    pixel: emptyPixel(),
    semantic: [],
    geometry: [],
    style: [],
    accessibility: [],
    overflow: [],
    runtime: [],
    allFindings: [],
  };
}


// ── in-page evidence collector (single self-contained page.evaluate fn) ──────

function collectInPageEvidence(): {
  domSnapshot: Array<{
    selector: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    paintOrder: number;
    computedStyles: Record<string, string>;
  }>;
  semanticAnchors: Array<{ role: string; name: string; selector: string }>;
  ariaSnapshot: string;
} {
  const styleKeys = [
    'font-family', 'font-size', 'font-weight', 'line-height', 'color',
    'background-color', 'border-radius', 'box-shadow', 'width', 'height',
    'margin', 'padding', 'display', 'overflow', 'text-overflow',
  ];
  function cssPath(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1) {
      const current: Element = node;
      const tag = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const parent: Element | null = current.parentElement;
      let nth = '';
      if (parent) {
        const siblings: Element[] = Array.from(parent.children).filter((c: Element) => c.tagName === current.tagName);
        if (siblings.length > 1) nth = `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(`${tag}${nth}`);
      node = parent;
    }
    return parts.join(' > ');
  }

  const domSnapshot: Array<{ selector: string; boundingBox: { x: number; y: number; width: number; height: number }; paintOrder: number; computedStyles: Record<string, string> }> = [];
  let paintOrder = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (el.matches('script,style,meta,link,title,noscript,svg,path')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const hasVisibleChild = Array.from(el.children).some((c) => {
      const cr = c.getBoundingClientRect();
      return cr.width > 0 && cr.height > 0;
    });
    const interactive = el.matches('button,a,input,select,textarea,[role],h1,h2,h3,h4,h5,h6,[tabindex],[aria-label],[onclick]');
    // Skip plain containers so parent/child boxes never collide in overlap detection.
    if (!interactive && hasVisibleChild) continue;
    const cs = getComputedStyle(el);
    const computedStyles: Record<string, string> = {};
    for (const key of styleKeys) computedStyles[key] = cs.getPropertyValue(key).trim();
    domSnapshot.push({
      selector: cssPath(el),
      boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height },
      paintOrder: paintOrder++,
      computedStyles,
    });
  }

  const semanticAnchors: Array<{ role: string; name: string; selector: string }> = [];
  for (const el of document.querySelectorAll('button,a[href],input,select,textarea,[role],h1,h2,h3,h4,h5,h6,[aria-label],[tabindex]')) {
    const tag = el.tagName.toLowerCase();
    let role = el.getAttribute('role');
    if (!role) {
      if (el.matches('h1,h2,h3,h4,h5,h6')) role = `heading:${tag}`;
      else if (tag === 'button') role = 'button';
      else if (tag === 'a') role = 'link';
      else if (tag === 'input') role = `textbox:${el.getAttribute('type') || 'text'}`;
      else if (tag === 'select') role = 'combobox';
      else if (tag === 'textarea') role = 'textbox';
      else if (el.hasAttribute('tabindex')) role = 'focusable';
    }
    const name = el.getAttribute('aria-label')
      || el.getAttribute('placeholder')
      || (el.textContent || '').trim().slice(0, 60)
      || '';
    if (role) semanticAnchors.push({ role, name, selector: cssPath(el) });
  }

  const ariaLines: string[] = [];
  for (const el of document.querySelectorAll('[aria-label],[aria-labelledby],[role],[aria-expanded],[aria-hidden],[aria-pressed],[aria-selected],[aria-checked]')) {
    const attrs: string[] = [];
    for (const attr of el.attributes) {
      if (attr.name.startsWith('aria-') || attr.name === 'role') attrs.push(`${attr.name}="${attr.value}"`);
    }
    const text = (el.textContent || '').trim().slice(0, 40);
    ariaLines.push(`${cssPath(el)} ${attrs.join(' ')}${text ? ` "${text}"` : ''}`);
  }

  return { domSnapshot, semanticAnchors, ariaSnapshot: ariaLines.join('\n') };
}

function evaluateStateCheckpointInPage(entries: Array<{ anchor: string; expected: string }>): Array<{ anchor: string; ok: boolean; expected: string; actual: string }> {
  return entries.map(({ anchor, expected }) => {
    let el: Element | null = null;
    try {
      el = document.querySelector(anchor);
    } catch {
      // invalid selector → treated as mismatch
    }
    let actual = '';
    if (el) {
      const input = el as HTMLInputElement;
      actual = input.value !== undefined ? input.value : (el.textContent || '').trim();
    }
    return { anchor, ok: actual.includes(expected), expected, actual };
  });
}

// ── playwright-side capture ─────────────────────────────────────────────────

interface OpenSideResult {
  context: BrowserContext | null;
  page: Page | null;
  consoleErrors: string[];
  networkErrors: string[];
  harEntries: Array<{ method: string; url: string; status: number }>;
}

async function openSide(browser: Browser, pair: ParityPair, url: string, sideErrors: string[]): Promise<OpenSideResult> {
  const context = await browser.newContext({
    viewport: { width: pair.viewport.width, height: pair.viewport.height },
    deviceScaleFactor: pair.dpr,
    colorScheme: pair.theme === 'no-preference' ? undefined : pair.theme,
    reducedMotion: pair.reducedMotion === 'no-preference' ? undefined : pair.reducedMotion,
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  const harEntries: Array<{ method: string; url: string; status: number }> = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => networkErrors.push(`${req.url()} failed: ${req.failure()?.errorText ?? 'unknown'}`));
  page.on('response', (res) => harEntries.push({ method: res.request().method(), url: res.url(), status: res.status() }));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  } catch (error) {
    sideErrors.push(`side ${url} failed to open: ${error instanceof Error ? error.message : String(error)}`);
    await context.close().catch(() => {});
    return { context: null, page: null, consoleErrors, networkErrors, harEntries };
  }
  return { context, page, consoleErrors, networkErrors, harEntries };
}

async function driveActions(page: Page, actions: ParityPair['actionSequence'], sideErrors: string[]): Promise<void> {
  for (const step of actions) {
    try {
      switch (step.kind) {
        case 'goto':
          await page.goto(step.target ?? '', { waitUntil: 'domcontentloaded', timeout: 15_000 });
          break;
        case 'click':
          await page.click(step.target ?? '');
          break;
        case 'type':
          await page.fill(step.target ?? '', step.value ?? '');
          break;
        case 'press':
          await page.keyboard.press(step.value ?? 'Enter');
          break;
        case 'wait':
          await page.waitForTimeout(step.delayMs ?? 100);
          break;
      }
    } catch (error) {
      sideErrors.push(`action ${step.kind} on ${step.target ?? ''} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function collectFocusOrder(page: Page): Promise<string[]> {
  const out: string[] = [];
  await page.keyboard.press('Tab');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(20);
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const role = el.getAttribute('role');
      const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
      const tag = el.tagName.toLowerCase();
      return role ? `${tag}[role=${role}]:${name}` : `${tag}:${name}`;
    });
    if (info === null) break;
    out.push(info);
    await page.keyboard.press('Tab');
  }
  return out;
}

async function runAxe(page: Page): Promise<{ violations: string[]; incomplete: string[] }> {
  try {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    return {
      violations: results.violations
        .filter((v) => v.impact === 'critical' || v.impact === 'serious')
        .map((v) => `${v.id}: ${v.help} (${v.impact})`),
      incomplete: results.incomplete.map((v) => `${v.id}: ${v.help}`),
    };
  } catch {
    return { violations: [], incomplete: [] };
  }
}

function parseStateCheckpoint(checkpoint: string): Array<{ anchor: string; expected: string }> {
  if (!checkpoint || checkpoint.trim() === '') return [];
  try {
    const parsed = JSON.parse(checkpoint) as Record<string, string>;
    return Object.entries(parsed).map(([anchor, expected]) => ({ anchor, expected: String(expected) }));
  } catch {
    return [];
  }
}

async function captureSideEvidence(
  page: Page,
  side: OpenSideResult,
  checkpointEntries: Array<{ anchor: string; expected: string }>,
): Promise<{ evidence: ParitySideEvidence; screenshot: Buffer }> {
  const screenshot = await page.screenshot();
  const inPage = await page.evaluate(collectInPageEvidence);
  const { domSnapshot, semanticAnchors, ariaSnapshot } = inPage;
  const axe = await runAxe(page);
  const focusOrder = await collectFocusOrder(page);
  const stateMatches = await page.evaluate(evaluateStateCheckpointInPage, checkpointEntries);
  let storageSnapshot: Record<string, string> = {};
  try {
    storageSnapshot = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null) out[`local:${key}`] = localStorage.getItem(key) ?? '';
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key !== null) out[`session:${key}`] = sessionStorage.getItem(key) ?? '';
      }
      return out;
    });
  } catch {
    storageSnapshot = {};
  }
  const loadTimeMs = await page.evaluate(() => Math.max(0, Math.round(performance.now())));

  const evidence: ParitySideEvidence = {
    opened: true,
    screenshotHash: sha256Bytes(screenshot),
    ariaSnapshot,
    semanticAnchors,
    domSnapshot,
    focusOrder,
    axeViolations: axe.violations,
    axeIncomplete: axe.incomplete,
    consoleErrors: [...side.consoleErrors],
    networkErrors: [...side.networkErrors],
    harEntries: [...side.harEntries],
    storageSnapshot,
    loadTimeMs,
    stateMatches,
  };
  return { evidence, screenshot };
}

// ── seeded defect injection (AM-0019 §12 list) ──────────────────────────────

async function injectDefect(page: Page, seed: ParityDefectSeed): Promise<void> {
  switch (seed) {
    case 'missing-control':
      await page.locator('#submit').evaluate((el) => el.remove()).catch(() => {});
      break;
    case 'hierarchy':
      await page.locator('h1').evaluate((el) => {
        const div = document.createElement('div');
        div.id = 'title';
        div.textContent = el.textContent;
        el.replaceWith(div);
      }).catch(() => {});
      break;
    case 'overflow':
      await page.evaluate(() => {
        const d = document.createElement('div');
        d.id = 'wide';
        d.style.cssText = 'width:2000px;height:60px;background:#ddd;';
        d.textContent = 'wide overflow';
        document.body.appendChild(d);
      });
      break;
    case 'spacing':
      await page.locator('#q').evaluate((el) => {
        const node = el as HTMLElement;
        node.style.position = 'relative';
        node.style.left = '-60px';
      }).catch(() => {});
      break;
    case 'style':
      await page.locator('h1').evaluate((el) => {
        (el as HTMLElement).style.fontSize = '48px';
      }).catch(() => {});
      break;
    case 'focus-order':
      await page.evaluate(() => {
        const b = document.createElement('button');
        b.id = 'first';
        b.textContent = 'First';
        b.tabIndex = 1;
        document.body.prepend(b);
      });
      break;
    case 'console-error':
      await page.evaluate(() => console.error('seeded-console-error'));
      break;
    case 'network-error':
      await page.evaluate(() => {
        const img = document.createElement('img');
        img.src = 'http://127.0.0.1:1/missing.png';
        img.alt = 'broken';
        document.body.appendChild(img);
      });
      break;
  }
  await page.waitForTimeout(60);
}

// ── non-vision diff compiler (reuses visual-reducer primitives) ─────────────

function buildReductionReference(ref: ParitySideEvidence, pair: ParityPair): ReductionReference {
  return {
    geometry: {
      viewport: { width: pair.viewport.width, height: pair.viewport.height },
      elements: ref.domSnapshot.map((d) => ({ selector: d.selector, boundingBox: d.boundingBox })),
    },
    styles: { elements: ref.domSnapshot.map((d) => ({ selector: d.selector, computedStyles: d.computedStyles })) },
    accessibility: { violations: [...ref.axeViolations], incomplete: [...ref.axeIncomplete] },
  };
}

function boxOf(side: ParitySideEvidence, selector: string): { x: number; y: number; width: number; height: number } | undefined {
  const node = side.domSnapshot.find((d) => d.selector === selector);
  return node?.boundingBox;
}

function categorizeReductionFindings(
  findings: readonly VisualFinding[],
  tgt: ParitySideEvidence,
): { geometry: ParityFinding[]; style: ParityFinding[]; accessibility: ParityFinding[]; overflow: ParityFinding[]; runtime: ParityFinding[] } {
  const geometry: ParityFinding[] = [];
  const style: ParityFinding[] = [];
  const accessibility: ParityFinding[] = [];
  const overflow: ParityFinding[] = [];
  const runtime: ParityFinding[] = [];
  for (const f of findings) {
    const box = boxOf(tgt, f.selector);
    const pf: ParityFinding = { ...f, coordinate: box ?? undefined };
    if (f.component === 'styling') style.push(pf);
    else if (f.component === 'accessibility') accessibility.push(pf);
    else if (f.component === 'runtime') runtime.push(pf);
    else if (f.sourceHint.includes('text overflow') || f.sourceHint.includes('ellipsis')) overflow.push(pf);
    else geometry.push(pf);
  }
  return { geometry, style, accessibility, overflow, runtime };
}

function parityGeometryDiffs(ref: ParitySideEvidence, tgt: ParitySideEvidence, pair: ParityPair): ParityFinding[] {
  const out: ParityFinding[] = [];
  // The reducer's viewport-clip checks only run for reference-matched selectors;
  // new/extra TGT elements must still be checked for overflow/off-screen.
  const refSelectors = new Set(ref.domSnapshot.map((d) => d.selector));
  for (const node of tgt.domSnapshot) {
    if (refSelectors.has(node.selector)) continue;
    const box = node.boundingBox;
    if (box.x < 0 || box.y < 0) {
      out.push({
        selector: node.selector,
        component: 'layout',
        sourceHint: 'element is positioned off-screen',
        detector: 'compileParityDiff',
        severity: 'serious',
        expected: 'position ≥ (0, 0)',
        actual: `(${box.x}, ${box.y})`,
        coordinate: box,
      });
    }
    if (box.x + box.width > pair.viewport.width) {
      out.push({
        selector: node.selector,
        component: 'layout',
        sourceHint: 'element clips beyond viewport width',
        detector: 'compileParityDiff',
        severity: 'serious',
        expected: `right edge ≤ ${pair.viewport.width}`,
        actual: `right edge = ${box.x + box.width}`,
        coordinate: box,
      });
    }
    if (box.y + box.height > pair.viewport.height) {
      out.push({
        selector: node.selector,
        component: 'layout',
        sourceHint: 'element clips beyond viewport height',
        detector: 'compileParityDiff',
        severity: 'serious',
        expected: `bottom edge ≤ ${pair.viewport.height}`,
        actual: `bottom edge = ${box.y + box.height}`,
        coordinate: box,
      });
    }
  }
  return out;
}

function paritySemanticDiffs(ref: ParitySideEvidence, tgt: ParitySideEvidence, pair: ParityPair): ParityFinding[] {
  const out: ParityFinding[] = [];
  const keyOf = (a: { role: string; name: string }) => `${a.role}:${a.name}`;
  const refByKey = new Map(ref.semanticAnchors.map((a) => [keyOf(a), a]));
  const tgtByKey = new Map(tgt.semanticAnchors.map((a) => [keyOf(a), a]));

  for (const [key, anchor] of refByKey) {
    if (!tgtByKey.has(key)) {
      out.push({
        selector: anchor.selector,
        component: 'semantic',
        sourceHint: 'missing control in target',
        detector: 'compileParityDiff',
        severity: 'serious',
        expected: `control ${key} present in target`,
        actual: 'absent',
        coordinate: boxOf(ref, anchor.selector),
      });
    }
  }
  for (const [key, anchor] of tgtByKey) {
    if (!refByKey.has(key)) {
      out.push({
        selector: anchor.selector,
        component: 'semantic',
        sourceHint: 'unexpected control in target',
        detector: 'compileParityDiff',
        severity: 'moderate',
        expected: `no unexpected control ${key}`,
        actual: 'present in target',
        coordinate: boxOf(tgt, anchor.selector),
      });
    }
  }
  for (const anchor of pair.semanticAnchors) {
    if (!tgtByKey.has(anchor)) {
      out.push({
        selector: 'root',
        component: 'semantic',
        sourceHint: 'missing declared semantic anchor',
        detector: 'compileParityDiff',
        severity: 'serious',
        expected: `declared anchor ${anchor} present`,
        actual: 'absent from target',
      });
    }
  }

  const headingSeq = (side: ParitySideEvidence): string[] =>
    side.semanticAnchors.filter((a) => /^heading:h[1-6]$/.test(a.role)).map((a) => a.role);
  const refHeadings = headingSeq(ref);
  const tgtHeadings = headingSeq(tgt);
  if (JSON.stringify(refHeadings) !== JSON.stringify(tgtHeadings)) {
    out.push({
      selector: 'root',
      component: 'semantic',
      sourceHint: 'heading hierarchy drift',
      detector: 'compileParityDiff',
      severity: 'serious',
      expected: `heading sequence [${refHeadings.join(', ')}]`,
      actual: `[${tgtHeadings.join(', ')}]`,
    });
  }

  const n = Math.min(ref.focusOrder.length, tgt.focusOrder.length);
  for (let i = 0; i < n; i++) {
    if (ref.focusOrder[i] !== tgt.focusOrder[i]) {
      out.push({
        selector: 'root',
        component: 'semantic',
        sourceHint: 'focus order drift',
        detector: 'compileParityDiff',
        severity: 'moderate',
        expected: `focus #${i} = ${ref.focusOrder[i]}`,
        actual: tgt.focusOrder[i],
      });
      break;
    }
  }
  if (ref.focusOrder.length !== tgt.focusOrder.length) {
    out.push({
      selector: 'root',
      component: 'semantic',
      sourceHint: 'focus order length drift',
      detector: 'compileParityDiff',
      severity: 'moderate',
      expected: `target focus length ${ref.focusOrder.length}`,
      actual: String(tgt.focusOrder.length),
    });
  }

  for (const m of tgt.stateMatches) {
    if (!m.ok) {
      out.push({
        selector: m.anchor,
        component: 'semantic',
        sourceHint: 'state checkpoint mismatch',
        detector: 'compileParityDiff',
        severity: 'serious',
        expected: m.expected,
        actual: m.actual || '(empty)',
        coordinate: boxOf(tgt, m.anchor),
      });
    }
  }
  return out;
}

function parityRuntimeDiffs(tgt: ParitySideEvidence): ParityFinding[] {
  const out: ParityFinding[] = [];
  for (const error of tgt.networkErrors) {
    out.push({
      selector: 'root',
      component: 'runtime',
      sourceHint: 'network error in target',
      detector: 'compileParityDiff',
      severity: 'serious',
      expected: 'no failed requests',
      actual: error,
    });
  }
  for (const entry of tgt.harEntries) {
    if (entry.status >= 400) {
      out.push({
        selector: 'root',
        component: 'runtime',
        sourceHint: 'HTTP error status in target',
        detector: 'compileParityDiff',
        severity: 'serious',
        expected: 'status < 400',
        actual: `${entry.method} ${entry.url} ${entry.status}`,
      });
    }
  }
  return out;
}

export interface CompiledParityDiff extends ParityDiffReport {
  readonly bundleHash: string;
}

export function compileParityDiff(
  ref: ParitySideEvidence,
  tgt: ParitySideEvidence,
  refScreenshot: Buffer,
  tgtScreenshot: Buffer,
  pair: ParityPair,
): CompiledParityDiff {
  const compiled = compileVisualEvidence({
    route: pair.id,
    state: `parity:${pair.role}`,
    viewport: `${pair.viewport.width}x${pair.viewport.height}`,
    screenshots: { expected: refScreenshot, current: tgtScreenshot },
    ariaSnapshot: tgt.ariaSnapshot,
    domSnapshot: [...tgt.domSnapshot],
    axeResults: { violations: [...tgt.axeViolations], incomplete: [...tgt.axeIncomplete] },
    consoleLogs: [...tgt.consoleErrors],
    networkLogs: [...tgt.networkErrors],
  });

  const reduction = reduceVisualConformance(compiled.bundle, buildReductionReference(ref, pair));
  const categorized = categorizeReductionFindings(reduction.findings, tgt);
  const geometry = [...categorized.geometry, ...parityGeometryDiffs(ref, tgt, pair)];
  const semantic = paritySemanticDiffs(ref, tgt, pair);
  const runtime = [...categorized.runtime, ...parityRuntimeDiffs(tgt)];
  const pixel = computePixelDiff(refScreenshot, tgtScreenshot, pair.viewport.width, pair.viewport.height);

  const allFindings: ParityFinding[] = [...semantic, ...geometry, ...categorized.style, ...categorized.accessibility, ...categorized.overflow, ...runtime];

  const diff: ParityDiffReport = {
    pixel,
    semantic,
    geometry,
    style: categorized.style,
    accessibility: categorized.accessibility,
    overflow: categorized.overflow,
    runtime,
    allFindings,
  };
  return { ...diff, bundleHash: bundleFingerprint(compiled.bundle) };
}

// ── verdict decision ─────────────────────────────────────────────────────────

function deviationIdForScope(pair: ParityPair, scope: string): string | undefined {
  return pair.allowedDeviations.find((d) => d.scope === scope)?.id;
}

function validateBinding(pair: ParityPair): { ok: boolean; reason: string } {
  if (!pair.id || pair.id.trim() === '') return { ok: false, reason: 'pair id is required' };
  if (!pair.referenceUrl || !pair.targetUrl) return { ok: false, reason: 'referenceUrl and targetUrl are required' };
  const httpish = (url: string): boolean => url.startsWith('http://') || url.startsWith('https://');
  if (httpish(pair.referenceUrl) && !pair.referenceCheckout && !pair.referenceRevisionHash && !pair.referenceMhtml) {
    return { ok: false, reason: 'http reference requires referenceCheckout, referenceRevisionHash or referenceMhtml binding' };
  }
  if (httpish(pair.targetUrl) && !pair.candidateHash) {
    return { ok: false, reason: 'http target requires candidateHash binding' };
  }
  return { ok: true, reason: '' };
}

export interface ParityDecision {
  verdict: ParityVerdict;
  reasons: string[];
  acceptedDeviationIds: string[];
}

export function decideVerdict(
  diff: ParityDiffReport,
  sidesOpened: { ref: boolean; tgt: boolean },
  pair: ParityPair,
  sideErrors: readonly string[] = [],
): ParityDecision {
  const reasons: string[] = [];
  if (!sidesOpened.ref) reasons.push('reference side never opened');
  if (!sidesOpened.tgt) reasons.push('target side never opened');
  if (!sidesOpened.ref || !sidesOpened.tgt) {
    return { verdict: 'FAIL', reasons: [...reasons, 'case cannot PASS if only one side was opened'], acceptedDeviationIds: [] };
  }

  const scopeOf = (f: ParityFinding): string => {
    if (diff.semantic.includes(f)) return 'semantic';
    if (diff.geometry.includes(f)) return 'geometry';
    if (diff.style.includes(f)) return 'style';
    if (diff.accessibility.includes(f)) return 'accessibility';
    if (diff.overflow.includes(f)) return 'overflow';
    if (diff.runtime.includes(f)) return 'runtime';
    return 'other';
  };

  const accepted = new Set<string>();
  const unaccepted: ParityFinding[] = [];
  for (const f of diff.allFindings) {
    const scope = scopeOf(f);
    const deviationId = deviationIdForScope(pair, scope);
    if (deviationId) {
      accepted.add(deviationId);
    } else {
      unaccepted.push(f);
    }
  }

  if (diff.pixel.globalDiffPercent > 0) {
    const worst = diff.pixel.regionDiffMetrics.reduce((a, b) => (b.diffPercent > a.diffPercent ? b : a), diff.pixel.regionDiffMetrics[0]);
    const severity: ParityFinding['severity'] = diff.pixel.globalDiffPercent > 5 ? 'critical' : diff.pixel.globalDiffPercent > 1 ? 'serious' : 'moderate';
    const pixelFinding: ParityFinding = {
      selector: 'root',
      component: 'screenshot',
      sourceHint: 'pixel diff exceeds tolerance',
      detector: 'compileParityDiff',
      severity,
      expected: `diff ≤ 0%`,
      actual: `diff = ${diff.pixel.globalDiffPercent}%`,
      heatmapRef: `pixel:${worst.region}`,
    };
    const deviationId = deviationIdForScope(pair, 'pixel');
    if (deviationId) {
      accepted.add(deviationId);
    } else {
      unaccepted.push(pixelFinding);
    }
  }

  if (sideErrors.length > 0) {
    unaccepted.push({
      selector: 'root',
      component: 'runtime',
      sourceHint: 'side journey error',
      detector: 'compileParityDiff',
      severity: 'serious',
      expected: 'no side errors',
      actual: sideErrors.join('; '),
    });
  }

  if (unaccepted.length > 0) {
    return {
      verdict: 'FAIL',
      reasons: unaccepted.map((f) => `${f.detector}: ${f.sourceHint} — ${f.expected} ≠ ${f.actual}`),
      acceptedDeviationIds: [...accepted],
    };
  }

  if (pair.visionReviewRequired === true) {
    return { verdict: 'WAITING_EXTERNAL', reasons: ['deterministic parity clean; vision review required for UI/taste scope before PASS'], acceptedDeviationIds: [...accepted] };
  }
  return { verdict: 'PASS', reasons: [], acceptedDeviationIds: [...accepted] };
}

// ── pair + manifest runners ──────────────────────────────────────────────────

export interface ParityRunOptions {
  headless?: boolean;
}

export async function runParityPair(browser: Browser, pair: ParityPair): Promise<ParityVerdictResult> {
  const binding = validateBinding(pair);
  if (!binding.ok) {
    return {
      pairId: pair.id,
      verdict: 'WAITING_EXTERNAL',
      sidesOpened: { ref: false, tgt: false },
      reasons: [binding.reason],
      acceptedDeviationIds: [],
      diff: emptyDiff(),
      refEvidence: emptyEvidence(false),
      tgtEvidence: emptyEvidence(false),
      bundleHash: '',
    };
  }

  const sideErrors: string[] = [];
  const ref = await openSide(browser, pair, pair.referenceUrl, sideErrors);
  const tgt = await openSide(browser, pair, pair.targetUrl, sideErrors);

  if (!ref.page || !tgt.page) {
    await ref.context?.close().catch(() => {});
    await tgt.context?.close().catch(() => {});    return {
      pairId: pair.id,
      verdict: 'FAIL',
      sidesOpened: { ref: ref.page !== null, tgt: tgt.page !== null },
      reasons: [...sideErrors, 'case cannot PASS if only one side was opened'],
      acceptedDeviationIds: [],
      diff: emptyDiff(),
      refEvidence: emptyEvidence(ref.page !== null),
      tgtEvidence: emptyEvidence(tgt.page !== null),
      bundleHash: '',
    };
  }

  await driveActions(ref.page, pair.actionSequence, sideErrors);
  await driveActions(tgt.page, pair.actionSequence, sideErrors);
  if (pair.defectSeed) await injectDefect(tgt.page, pair.defectSeed);

  const checkpointEntries = parseStateCheckpoint(pair.stateCheckpoint);
  const refCaptured = await captureSideEvidence(ref.page, ref, checkpointEntries);
  const tgtCaptured = await captureSideEvidence(tgt.page, tgt, checkpointEntries);

  const compiled = compileParityDiff(refCaptured.evidence, tgtCaptured.evidence, refCaptured.screenshot, tgtCaptured.screenshot, pair);
  const decision = decideVerdict(compiled, { ref: true, tgt: true }, pair, sideErrors);

  await ref.context?.close().catch(() => {});
  await tgt.context?.close().catch(() => {});

  return {
    pairId: pair.id,
    verdict: decision.verdict,
    sidesOpened: { ref: true, tgt: true },
    reasons: decision.reasons,
    acceptedDeviationIds: decision.acceptedDeviationIds,
    diff: compiled,
    refEvidence: refCaptured.evidence,
    tgtEvidence: tgtCaptured.evidence,
    bundleHash: compiled.bundleHash,
  };
}

export interface ParityManifest {
  name?: string;
  pairs: readonly ParityPair[];
}

export interface ParityRunSummary {
  total: number;
  pass: number;
  fail: number;
  waitingExternal: number;
}

export interface ParityRunResult {
  name: string;
  summary: ParityRunSummary;
  results: readonly ParityVerdictResult[];
}

export async function runParityManifest(manifest: ParityManifest, options: ParityRunOptions = {}): Promise<ParityRunResult> {
  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch({ headless: options.headless ?? true });
  try {
    const results: ParityVerdictResult[] = [];
    for (const pair of manifest.pairs) {
      results.push(await runParityPair(browser, pair));
    }
    const summary: ParityRunSummary = {
      total: results.length,
      pass: results.filter((r) => r.verdict === 'PASS').length,
      fail: results.filter((r) => r.verdict === 'FAIL').length,
      waitingExternal: results.filter((r) => r.verdict === 'WAITING_EXTERNAL').length,
    };
    return { name: manifest.name ?? 'parity', summary, results };
  } finally {
    await browser.close();
  }
}

/** DOM type helper for tests that want the injected browser to stay alive. */
export type { Browser, BrowserContext, Page } from 'playwright';

// Re-export the bundle type for ParitySideEvidence consumers.
export type { VisualEvidenceBundle };
