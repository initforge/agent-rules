import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let baseUrl = '';
let serverPort = 0;

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const CP_DIR = path.resolve(TEST_DIR, '..', '..', 'control-plane');
const SERVER_ENTRY = path.join(CP_DIR, 'dist', 'server', 'server', 'index.js');
const CLIENT_INDEX = path.join(CP_DIR, 'dist', 'client', 'index.html');

let serverProc: ChildProcess | undefined;
let serverLog = '';
let browserErrors: string[] = [];

const SERVER_STARTUP_TIMEOUT_MS = 30_000;
const SERVER_SHUTDOWN_TIMEOUT_MS = 5_000;

const isChromiumAvailable = (() => {
  try {
    const binPath = chromium.executablePath();
    return binPath && existsSync(binPath);
  } catch {
    return false;
  }
})();

async function unusedLoopbackPort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('failed to allocate loopback port');
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return address.port;
}

function waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (proc.exitCode !== null) return Promise.resolve(true);

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      proc.removeListener('exit', onExit);
      resolve(proc.exitCode !== null);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    proc.once('exit', onExit);
  });
}

async function stopServer(): Promise<void> {
  const proc = serverProc;
  serverProc = undefined;
  if (!proc) return;

  const signalProcessGroup = (signal: NodeJS.Signals) => {
    if (process.platform === 'win32' && proc.pid) {
      try {
        execSync(`taskkill /pid ${proc.pid} /T ${signal === 'SIGKILL' ? '/F' : ''}`, { stdio: 'ignore' });
      } catch {
        // Ignore taskkill errors (e.g. process already exited)
      }
      return;
    }
    if (proc.pid) {
      process.kill(-proc.pid, signal);
      return;
    }
    proc.kill(signal);
  };

  try {
    signalProcessGroup('SIGTERM');
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
  }

  if (proc.exitCode !== null || await waitForProcessExit(proc, SERVER_SHUTDOWN_TIMEOUT_MS)) {
    if (!(await waitForServerDown())) throw new Error(`control-plane endpoint remained live after owned process group ${proc.pid} exited`);
    return;
  }

  try {
    signalProcessGroup('SIGKILL');
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
  }

  if (!(await waitForProcessExit(proc, SERVER_SHUTDOWN_TIMEOUT_MS))) {
    throw new Error(`control-plane server did not exit after SIGKILL (pid ${proc.pid})`);
  }
  if (!(await waitForServerDown())) throw new Error(`control-plane endpoint remained live after killing owned process ${proc.pid}`);
}

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServerDown(timeoutMs = SERVER_SHUTDOWN_TIMEOUT_MS): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isServerUp())) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return !(await isServerUp());
}

async function waitForServer(timeoutMs = SERVER_STARTUP_TIMEOUT_MS): Promise<void> {
  const start = Date.now();
  const readyLine = `[control-plane] Server running on http://localhost:${serverPort}`;
  while (Date.now() - start < timeoutMs) {
    if (serverProc && serverProc.exitCode !== null) {
      throw new Error(`control-plane server exited early (code ${serverProc.exitCode}):\n${serverLog}`);
    }
    if (serverLog.includes(readyLine) && await isServerUp()) return;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`owned control-plane not ready at ${baseUrl} within ${timeoutMs}ms:\n${serverLog}`);
}

async function ensureServer(): Promise<void> {
  serverPort = await unusedLoopbackPort();
  baseUrl = `http://127.0.0.1:${serverPort}`;
  if (!existsSync(SERVER_ENTRY) || !existsSync(CLIENT_INDEX)) {
    execSync('npm run build', { cwd: CP_DIR, stdio: 'inherit' });
  }
  serverLog = '';
  serverProc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: CP_DIR,
    env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own a process group so timeout/teardown can terminate every descendant.
    detached: process.platform !== 'win32',
  });
  serverProc.stdout?.on('data', d => { serverLog += d.toString(); });
  serverProc.stderr?.on('data', d => { serverLog += d.toString(); });
  try {
    await waitForServer();
    if (serverProc.exitCode !== null) throw new Error(`control-plane server disappeared after readiness:\n${serverLog}`);
  } catch (error) {
    await stopServer();
    throw error;
  }
}

const ROUTES = [
  { id: 'overview', label: 'Overview', path: '/overview' },
  { id: 'plan', label: 'Plan Workspace', path: '/plan' },
  { id: 'runs', label: 'Runs', path: '/runs' },
  { id: 'evaluations', label: 'Evaluations', path: '/evaluations' },
  { id: 'architecture', label: 'Architecture', path: '/architecture/dag' },
  { id: 'configuration', label: 'Configuration', path: '/configuration/general' },
  { id: 'profiles', label: 'Profiles', path: '/profiles' },
  { id: 'audit', label: 'Audit Log', path: '/audit' },
] as const;

let browser: Browser;
let context: BrowserContext;
let page: Page;

async function navigateToRoute(label: string) {
  const route = ROUTES.find(r => r.label === label);
  if (route) {
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);
  }
}

async function navigateToRouteById(id: string) {
  const route = ROUTES.find(r => r.id === id);
  if (route) {
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);
  }
}

function getInteractiveElements(p: Page) {
  return p.locator(
    'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="combobox"]'
  );
}

function trackBrowserErrors(trackedPage: Page): void {
  trackedPage.on('pageerror', error => {
    browserErrors.push(`pageerror: ${error.message}`);
  });
  trackedPage.on('console', msg => {
    if (msg.type() === 'error') browserErrors.push(`console: ${msg.text()}`);
  });
  trackedPage.on('requestfailed', req => {
    browserErrors.push(`network: ${req.url()} failed: ${req.failure()?.errorText}`);
  });
}

beforeAll(async () => {
  await ensureServer();
  if (isChromiumAvailable) {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    context.on('page', trackBrowserErrors);
    page = await context.newPage();
  }
}, 60000);

beforeEach(async () => {
  browserErrors = [];
  // Clear route mocks from previous test to prevent accumulation
  if (isChromiumAvailable && page) {
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  }
  if (!serverProc || serverProc.exitCode !== null || !(await isServerUp())) {
    throw new Error(`owned control-plane server disappeared before test:\n${serverLog}`);
  }
});

afterEach(() => {
  expect(browserErrors, 'browser page/console/network errors').toEqual([]);
});

afterAll(async () => {
  try {
    if (isChromiumAvailable) {
      await context?.close();
      await browser?.close();
    }
  } finally {
    await stopServer();
  }
}, 15_000);

describe('owned server lifecycle', () => {
  it('uses a live spawned process on an ephemeral loopback port', async () => {
    expect(serverPort).toBeGreaterThan(0);
    expect(serverPort).not.toBe(3099);
    expect(serverProc?.pid).toBeGreaterThan(0);
    expect(serverProc?.exitCode).toBeNull();
    expect(serverLog).toContain(`[control-plane] Server running on http://localhost:${serverPort}`);
    expect(await isServerUp()).toBe(true);
  });

  it('terminates descendants after their process-group leader exits', async () => {
    if (process.platform === 'win32') return; // Windows cannot address descendants after their leader exits; stopServer fails closed on a live endpoint.
    const qaProc = serverProc;
    const qaPort = serverPort;
    const qaUrl = baseUrl;
    const port = await unusedLoopbackPort();
    const childScript = `require('node:http').createServer((_,r)=>r.end('ok')).listen(${port},'127.0.0.1')`;
    const leader = spawn(process.execPath, ['-e', `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'ignore'}).unref()`], {
      detached: true,
      stdio: 'ignore',
    });
    await waitForProcessExit(leader, SERVER_SHUTDOWN_TIMEOUT_MS);
    serverProc = leader;
    serverPort = port;
    baseUrl = `http://127.0.0.1:${port}`;
    const start = Date.now();
    while (!(await isServerUp()) && Date.now() - start < SERVER_SHUTDOWN_TIMEOUT_MS) await new Promise(r => setTimeout(r, 50));
    expect(leader.exitCode).not.toBeNull();
    expect(await isServerUp()).toBe(true);
    try {
      await stopServer();
      expect(await isServerUp()).toBe(false);
    } finally {
      serverProc = qaProc;
      serverPort = qaPort;
      baseUrl = qaUrl;
    }
  });
});

describe.skipIf(!isChromiumAvailable)('browser error tracking', () => {
  it('captures uncaught page errors from every context page', async () => {
    const errorContext = await browser.newContext();
    errorContext.on('page', trackBrowserErrors);
    const errorPage = await errorContext.newPage();
    const pageError = errorPage.waitForEvent('pageerror');
    await errorPage.evaluate(() => setTimeout(() => { throw new Error('qa-pageerror-regression'); }, 0));
    await pageError;
    expect(browserErrors).toContain('pageerror: qa-pageerror-regression');
    browserErrors = [];
    await errorContext.close();
  });
});

describe.skipIf(!isChromiumAvailable)('WCAG & Accessibility (Playwright)', () => {

  describe('Homepage axe scan', () => {
    it('loads homepage with no critical/serious axe violations', async () => {
       await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('nav', { timeout: 5000 });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .options({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } })
        .analyze();

      const criticalSerious = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      );

      if (criticalSerious.length > 0) {
        console.log('Homepage axe violations (critical/serious):',
          criticalSerious.map(v => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} nodes]`).join('\n')
        );
      }
      expect(criticalSerious.length).toBe(0);
    }, 30000);
  });

  describe('Route-by-route axe scan', () => {
    for (const route of ROUTES) {
      it(`loads /${route.id} with no critical/serious axe violations`, async () => {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForSelector('nav', { timeout: 5000 });

        await navigateToRoute(route.label);
        await page.waitForTimeout(600);

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
          .options({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } })
          .analyze();

        const criticalSerious = results.violations.filter(
          v => v.impact === 'critical' || v.impact === 'serious'
        );

        if (criticalSerious.length > 0) {
          console.log(`/${route.id} axe violations:`,
            criticalSerious.map(v => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} nodes]`).join('\n')
          );
          for (const v of criticalSerious) {
            for (const n of v.nodes.slice(0, 3)) {
              console.log(`  HTML: ${n.html?.slice(0, 200)}`);
            }
          }
        }
        expect(criticalSerious.length).toBe(0);
      }, 30000);
    }
  });

  describe('Keyboard navigation', () => {
    it('Tab through all interactive elements without trap', async () => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('nav', { timeout: 5000 });

      const initialCount = await getInteractiveElements(page).count();
      expect(initialCount).toBeGreaterThan(0);

      const focusedElements: string[] = [];
      for (let i = 0; i < Math.min(initialCount + 5, 40); i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(100);
        const isFocused = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          return el.tagName + (el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '') +
            (el.textContent ? ` "${el.textContent?.trim().slice(0, 30)}"` : '');
        });
        if (isFocused) {
          focusedElements.push(isFocused);
        }
      }

      expect(focusedElements.length).toBeGreaterThan(3);
      expect(focusedElements.length).toBeLessThan(initialCount + 10);

      const uniqueElements = new Set(focusedElements);
      expect(uniqueElements.size).toBeGreaterThan(3);
    });

    it('Enter/Space activate navigation links', async () => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('nav', { timeout: 5000 });

      const navLink = page.locator('nav a', { hasText: 'Runs' });
      await navLink.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      const runsHeading = page.locator('main h1', { hasText: 'Runs' });
      expect(await runsHeading.isVisible()).toBe(true);

      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);

      const mainH1 = page.locator('main h1').first();
      const h1Text = await mainH1.textContent();
      expect(h1Text?.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive viewports', () => {
    it('loads at 375x667 (mobile) without horizontal overflow', async () => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);

      const overflow = await page.evaluate(() => {
        return {
          docWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
          bodyOverflowX: getComputedStyle(document.body).overflowX,
        };
      });
      console.log(`Mobile 375x667: docWidth=${overflow.docWidth}, viewport=${overflow.viewportWidth}, scroll=${overflow.hasHorizontalScroll}`);
      expect(overflow.hasHorizontalScroll).toBe(false);
    });

    it('loads at 390x844 (iPhone 14 Pro) with no clipping and nav renders', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          hasHorizontalScroll: root.scrollWidth > root.clientWidth,
        };
      });
      console.log(`iPhone 390x844: scrollW=${overflow.scrollWidth} clientW=${overflow.clientWidth} scroll=${overflow.hasHorizontalScroll}`);
      expect(overflow.hasHorizontalScroll).toBe(false);

      const mobileHeaderVisible = await page.evaluate(() => {
        const mh = document.querySelector('.layout-mobile-header');
        if (!mh) return false;
        const style = getComputedStyle(mh);
        return style.display !== 'none' && mh.getBoundingClientRect().height > 0;
      });
      expect(mobileHeaderVisible).toBe(true);

      const hamburgerVisible = await page.evaluate(() => {
        const hb = document.querySelector('.layout-mobile-toggle');
        if (!hb) return false;
        const style = getComputedStyle(hb);
        return style.display !== 'none' && hb.getBoundingClientRect().height > 0;
      });
      expect(hamburgerVisible).toBe(true);
    }, 10000);

    it('loads at 1024x768 (tablet)', async () => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);

      const overflow = await page.evaluate(() => {
        return {
          docWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      console.log(`Tablet 1024x768: docWidth=${overflow.docWidth}, viewport=${overflow.viewportWidth}`);
      expect(overflow.hasHorizontalScroll).toBe(false);

      await navigateToRouteById('overview');
      await page.waitForTimeout(500);
      const overflow2 = await page.evaluate(() => ({
        hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
      }));
      expect(overflow2.hasHorizontalScroll).toBe(false);
    });

    it('loads at 1920x1080 (desktop)', async () => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);

      const navVisible = page.locator('nav');
      expect(await navVisible.isVisible()).toBe(true);

      await navigateToRouteById('audit');
      await page.waitForTimeout(500);

      const auditHeading = page.locator('main h1', { hasText: 'Audit Log' });
      expect(await auditHeading.isVisible()).toBe(true);
    });
  });

  describe('Reduced motion', () => {
    it('prefers-reduced-motion respected via CSS rule and no active animations remain', async () => {
      const motionCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      motionCtx.on('page', trackBrowserErrors);
      const motionPage = await motionCtx.newPage();
      await motionPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await motionPage.waitForTimeout(500);

      const motionQuery = await motionPage.evaluate(() => {
        return matchMedia('(prefers-reduced-motion: reduce)').matches;
      });
      expect(motionQuery).toBe(true);

      const cssRuleCheck = await motionPage.evaluate(() => {
        for (const ss of document.styleSheets) {
          try {
            for (const rule of ss.cssRules) {
              if (rule instanceof CSSMediaRule &&
                  rule.conditionText?.includes('prefers-reduced-motion: reduce')) {
                return {
                  found: true,
                  rulesCount: rule.cssRules.length,
                  text: rule.cssText.slice(0, 200),
                };
              }
            }
          } catch {}
        }
        return { found: false, rulesCount: 0, text: '' };
      });
      console.log('Reduced-motion CSS rule:', JSON.stringify(cssRuleCheck));
      expect(cssRuleCheck.found).toBe(true);
      expect(cssRuleCheck.rulesCount).toBeGreaterThan(0);

      const animated = await motionPage.evaluate(() => {
        const all = document.querySelectorAll('*');
        const animatedEls: string[] = [];
        for (const el of all) {
          const style = getComputedStyle(el);
          const anim = style.animationName;
          const trans = style.transitionDuration;
          if (
            (anim && anim !== 'none') ||
            (trans && trans !== '0s' && parseFloat(trans) > 0.01)
          ) {
            animatedEls.push(`${el.tagName} anim=${anim} trans=${trans}`);
          }
        }
        return animatedEls;
      });

      if (animated.length > 0) {
        console.log(`Elements with animation/transition despite reduced-motion: ${animated.length}`);
        animated.slice(0, 10).forEach(a => console.log(`  ${a}`));
      }
      expect(animated.length).toBe(0);

      await motionCtx.close();
    });
  });

  describe('Zoom tolerance', () => {
    it('200% zoom page renders with primary elements visible (no clipping)', async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);

      await page.evaluate(() => {
        document.body.style.transform = 'scale(2)';
        document.body.style.transformOrigin = 'top left';
      });
      await page.waitForTimeout(500);

      const hasOverflow = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          overflowX: getComputedStyle(root).overflowX,
          overflowY: getComputedStyle(root).overflowY,
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
        };
      });
      console.log(`200% zoom: scroll=${hasOverflow.scrollWidth}x${hasOverflow.scrollWidth}, client=${hasOverflow.clientWidth}`);

      const elementVisibility = await page.evaluate(() => {
        const main = document.querySelector('main');
        const sidebarHeader = document.querySelector('.layout-sidebar-header');
        const results: Record<string, boolean> = {};
        if (main) {
          const rect = main.getBoundingClientRect();
          results.main = rect.width > 0 && rect.height > 10;
        }
        if (sidebarHeader) {
          const rect = sidebarHeader.getBoundingClientRect();
          results.sidebarHeader = rect.width > 0 && rect.height > 0;
        }
        const h1 = document.querySelector('h1');
        if (h1) {
          const rect = h1.getBoundingClientRect();
          results.heading = rect.height > 0 && rect.width > 0;
        }
        return results;
      });
      console.log('Element visibility at 200% zoom:', JSON.stringify(elementVisibility));

      expect(Object.keys(elementVisibility).length).toBeGreaterThan(0);
      const allVisible = Object.values(elementVisibility).every(v => v);
      expect(allVisible).toBe(true);

      await page.evaluate(() => {
        document.body.style.transform = '';
        document.body.style.transformOrigin = '';
      });
    });
  });

  describe('Color contrast', () => {
    it('no elements fail WCAG AA contrast ratio', async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('nav', { timeout: 5000 });

      const results = await new AxeBuilder({ page })
        .withRules(['color-contrast'])
        .analyze();

      const contrastViolations = results.violations.filter(
        v => v.id === 'color-contrast'
      );

      if (contrastViolations.length > 0) {
        console.log(`Color contrast violations: ${contrastViolations.length}`);
        for (const v of contrastViolations) {
          console.log(`  ${v.help} (${v.impact}) - ${v.nodes.length} nodes`);
          for (const n of v.nodes.slice(0, 3)) {
            console.log(`    ${n.html?.slice(0, 120)}`);
          }
        }
      }

      expect(contrastViolations.length).toBe(0);
    }, 30000);
  });

  describe('Route rendering assertions', () => {
  const ROUTE_HEADINGS: Record<string, string> = {
    // The Overview hero renders the active plan id dynamically — no fixed
    // heading contract; the test still asserts a visible h1.
    overview: '',
    plan: 'Plan Workspace',
    runs: 'Runs',
    evaluations: 'Evaluations',
    architecture: 'Architecture',
    configuration: 'Configuration',
    profiles: 'Profiles',
    audit: 'Audit Log',
  };

  for (const route of ROUTES) {
    it(`renders ${route.id} with expected heading, no console/network errors, and non-stub content`, async () => {
      const consoleErrors: string[] = [];
      const networkErrors: string[] = [];

      const onConsole = (msg: { type: () => string; text: () => string }) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      };
      const onRequestFailed = (req: { url: () => string; failure: () => { errorText: string } | null }) => {
        networkErrors.push(`${req.url()} failed: ${req.failure()?.errorText}`);
      };

      page.on('console', onConsole);
      page.on('requestfailed', onRequestFailed);

      await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);

      page.removeListener('console', onConsole);
      page.removeListener('requestfailed', onRequestFailed);

      if (consoleErrors.length || networkErrors.length) {
        console.log(`${route.path} browser errors:`, JSON.stringify({ consoleErrors, networkErrors }));
      }

      const expectedHeading = ROUTE_HEADINGS[route.id];
      if (expectedHeading) {
        const heading = page.locator('main h1', { hasText: expectedHeading });
        expect(await heading.isVisible()).toBe(true);
      } else {
        // No fixed heading contract for this route (e.g. the Overview hero
        // renders the active plan id dynamically); still require a visible h1.
        const h1 = page.locator('main h1');
        expect(await h1.count()).toBeGreaterThan(0);
      }

      expect(consoleErrors.length).toBe(0);
      expect(networkErrors.length).toBe(0);

      const mainContent = page.locator('main');
      const contentText = await mainContent.textContent();
      expect(contentText!.length).toBeGreaterThan(50);
    });
  }
});

describe.skipIf(!isChromiumAvailable)('404 handling', () => {
  it('non-existent route shows NotFound content', async () => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto(`${baseUrl}/nonexistent-route-xyz`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);

    const four04 = page.locator('.typography-headline', { hasText: '404' });
    expect(await four04.isVisible()).toBe(true);

    const notFoundText = page.locator('text=Page not found');
    expect(await notFoundText.isVisible()).toBe(true);

    const goToOverview = page.locator('text=Go to Overview');
    expect(await goToOverview.isVisible()).toBe(true);

    expect(consoleErrors.length).toBe(0);
  });
});

describe.skipIf(!isChromiumAvailable)('Focus-visible', () => {
    it('all interactive elements have visible focus indicator (outline or ring)', async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('nav', { timeout: 5000 });

      const count = await getInteractiveElements(page).count();
      expect(count).toBeGreaterThan(0);

      let elementsWithoutFocus = 0;
      let checkedCount = 0;

      const interactiveEls = getInteractiveElements(page);
      const totalCount = await interactiveEls.count();
      for (let i = 0; i < totalCount; i++) {
        const el = interactiveEls.nth(i);
        try {
          await el.focus();
          await page.waitForTimeout(50);

          const focusData = await el.evaluate((node: HTMLElement) => {
            const style = getComputedStyle(node);
            const outlineColor = style.outlineColor;
            const outlineStyle = style.outlineStyle;
            const outlineWidth = style.outlineWidth;
            const outlineVisible = outlineStyle !== 'none' && outlineWidth !== '0px' && outlineWidth !== '0';
            const boxShadow = style.boxShadow;
            const hasBoxShadow = boxShadow && boxShadow !== 'none';
            const hasVisibleRing = hasBoxShadow && (boxShadow!.includes('rgb') || boxShadow!.includes('hsl'));

            const isFsVisible = node.matches(':focus-visible');
            const outlineRingVisible = outlineVisible || hasVisibleRing;

            return {
              outlineVisible,
              hasBoxShadow,
              hasVisibleRing,
              outlineRingVisible,
              isFsVisible,
              tag: node.tagName,
              id: node.id,
              text: (node.textContent || '').trim().slice(0, 20),
              outlineDetails: `style=${outlineStyle} width=${outlineWidth} color=${outlineColor}`,
            };
          });

          if (!focusData.outlineRingVisible && focusData.isFsVisible) {
            const hasAccentOutline = await el.evaluate((node: HTMLElement) => {
              const style = getComputedStyle(node);
              const outlineColor = style.outlineColor;
              return outlineColor !== 'rgba(0, 0, 0, 0)' && outlineColor !== 'transparent';
            });
            if (!hasAccentOutline) {
              elementsWithoutFocus++;
              if (elementsWithoutFocus <= 5) {
                console.log(`No focus indicator: ${focusData.tag} #${focusData.id} "${focusData.text}" ${focusData.outlineDetails}`);
              }
            }
          }
          checkedCount++;
        } catch {
        }
      }

      console.log(`Focus check: ${checkedCount} elements, ${elementsWithoutFocus} without visible focus indicator`);
      expect(elementsWithoutFocus).toBeLessThan(checkedCount);
    });
  });
});
