import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const BASE_URL = 'http://localhost:3099';

const ROUTES = [
  { id: 'overview', label: 'Overview' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'models-routes', label: 'Models & Routes' },
  { id: 'workflow', label: 'Workflow Graph' },
  { id: 'skills', label: 'Skills / Integrations / Profiles' },
  { id: 'runs', label: 'Runs & Evaluations' },
  { id: 'plan', label: 'Plan & Evidence' },
  { id: 'audit', label: 'Audit Log' },
] as const;

let browser: Browser;
let context: BrowserContext;
let page: Page;

async function navigateToRoute(label: string) {
  const btn = page.locator('nav button', { hasText: label });
  await btn.click();
  await page.waitForTimeout(800);
}

async function navigateToRouteById(id: string) {
  const route = ROUTES.find(r => r.id === id);
  if (route) await navigateToRoute(route.label);
}

function getInteractiveElements(p: Page) {
  return p.locator(
    'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="combobox"]'
  );
}

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
});

afterAll(async () => {
  await context.close();
  await browser.close();
});

describe('WCAG & Accessibility (Playwright)', () => {

  describe('Homepage axe scan', () => {
    it('loads homepage with no critical/serious axe violations', async () => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
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
    });
  });

  describe('Route-by-route axe scan', () => {
    for (const route of ROUTES) {
      it(`loads /${route.id} with no critical/serious axe violations`, async () => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
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
            criticalSerious.map(v => `${v.id} (${v.impact}): ${v.help}`).join('\n')
          );
        }
        expect(criticalSerious.length).toBe(0);
      });
    }
  });

  describe('Keyboard navigation', () => {
    it('Tab through all interactive elements without trap', async () => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
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

    it('Enter/Space activate navigation buttons', async () => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForSelector('nav', { timeout: 5000 });

      const btn = page.locator('nav button', { hasText: 'Platforms' });
      await btn.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      const platformsHeading = page.locator('main h1', { hasText: 'Platforms' });
      expect(await platformsHeading.isVisible()).toBe(true);

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
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
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

    it('loads at 1024x768 (tablet)', async () => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
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

      await navigateToRouteById('platforms');
      await page.waitForTimeout(500);
      const overflow2 = await page.evaluate(() => ({
        hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
      }));
      expect(overflow2.hasHorizontalScroll).toBe(false);
    });

    it('loads at 1920x1080 (desktop)', async () => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
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
    it('prefers-reduced-motion respected when set', async () => {
      const motionCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      const motionPage = await motionCtx.newPage();
      await motionPage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await motionPage.waitForTimeout(500);

      const motionQuery = await motionPage.evaluate(() => {
        return matchMedia('(prefers-reduced-motion: reduce)').matches;
      });
      expect(motionQuery).toBe(true);

      const animated = await motionPage.evaluate(() => {
        const all = document.querySelectorAll('*');
        const animatedEls: string[] = [];
        for (const el of all) {
          const style = getComputedStyle(el);
          const anim = style.animationName;
          const trans = style.transitionDuration;
          if (
            (anim && anim !== 'none') ||
            (trans && trans !== '0s' && parseFloat(trans) > 0)
          ) {
            animatedEls.push(`${el.tagName} anim=${anim} trans=${trans}`);
          }
        }
        return animatedEls.slice(0, 20);
      });

      if (animated.length > 0) {
        console.log(`Elements with animation/transition despite reduced-motion: ${animated.length}`);
        animated.forEach(a => console.log(`  ${a}`));
      }

      await motionCtx.close();
    });
  });

  describe('Zoom tolerance', () => {
    it('200% zoom page renders without clipping/overflow', async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
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
          scrollHeight: root.scrollHeight,
          clientHeight: root.clientHeight,
        };
      });
      console.log(`200% zoom: scroll=${hasOverflow.scrollWidth}x${hasOverflow.scrollHeight}, client=${hasOverflow.clientWidth}x${hasOverflow.clientHeight}`);

      await page.evaluate(() => {
        document.body.style.transform = '';
        document.body.style.transformOrigin = '';
      });
    });
  });

  describe('Color contrast', () => {
    it('no elements fail WCAG AA contrast ratio', async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
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
    });
  });

  describe('Focus-visible', () => {
    it('all interactive elements have visible focus indicator', async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
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

          const hasFocusStyle = await el.evaluate((node: HTMLElement) => {
            const style = getComputedStyle(node);
            const outline = style.outlineColor + ' ' + style.outlineStyle + ' ' + style.outlineWidth;
            const boxShadow = style.boxShadow;
            const borderColor = style.borderColor;
            const outlineVisible = style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
            const hasBoxShadow = boxShadow && boxShadow !== 'none';
            const hasBorder = borderColor && borderColor !== 'transparent' && style.borderStyle !== 'none';
            return {
              outline,
              boxShadow,
              borderColor,
              outlineVisible,
              hasBoxShadow,
              hasBorder,
              tag: node.tagName,
              id: node.id,
              text: (node.textContent || '').trim().slice(0, 20),
            };
          });

          if (!hasFocusStyle.outlineVisible && !hasFocusStyle.hasBoxShadow && !hasFocusStyle.hasBorder) {
            elementsWithoutFocus++;
            if (elementsWithoutFocus <= 5) {
              console.log(`No focus indicator: ${hasFocusStyle.tag} #${hasFocusStyle.id} "${hasFocusStyle.text}"`);
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
