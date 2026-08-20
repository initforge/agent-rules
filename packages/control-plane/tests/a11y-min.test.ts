/**
 * C6 minimum a11y source-level tests.
 * Verifies accessibility attributes are present in source files.
 * Uses static analysis only - no browser/server required.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const CP_DIR = path.resolve(TEST_DIR, '..');
const LAYOUT_SRC = readFileSync(path.join(CP_DIR, 'src/client/components/Layout.tsx'), 'utf-8');
const ERROR_BOUNDARY_SRC = readFileSync(path.join(CP_DIR, 'src/client/components/ErrorBoundary.tsx'), 'utf-8');
const OVERVIEW_SRC = readFileSync(path.join(CP_DIR, 'src/client/pages/Overview.tsx'), 'utf-8');
const PLAN_WORKSPACE_SRC = readFileSync(path.join(CP_DIR, 'src/client/PlanWorkspace.tsx'), 'utf-8');
const STYLES_CSS = readFileSync(path.join(CP_DIR, 'src/client/styles.css'), 'utf-8');

describe('C6 minimum a11y source-level', () => {
  describe('skip link', () => {
    it('Layout renders skip link targeting main-content', () => {
      expect(LAYOUT_SRC).toMatch(/<a[^>]+href="#main-content"[^>]+className="skip-link"[^>]*>Skip to main content<\/a>/);
    });

    it('main element has id="main-content"', () => {
      expect(LAYOUT_SRC).toMatch(/<main[^>]+id="main-content"[^>]*>/);
    });

    it('styles.css defines .skip-link with off-screen positioning', () => {
      expect(STYLES_CSS).toMatch(/\.skip-link\s*\{[^}]*position:\s*absolute/);
      expect(STYLES_CSS).toMatch(/\.skip-link\s*\{[^}]*left:\s*-9999px/);
    });

    it('skip link focus style brings it into view', () => {
      expect(STYLES_CSS).toMatch(/\.skip-link:focus\s*\{[^}]*left:\s*8px/);
    });
  });

  describe('aria-hidden decorative shell elements', () => {
    it('decorative brand mark is aria-hidden (rendered via map)', () => {
      // The design shell renders the brand mark decoratively; it must be hidden
      // from assistive tech while the nav list stays semantic.
      const hasBrandPattern = /<span\s+className="cp-brand-mark"[^>]+aria-hidden="true"/.test(LAYOUT_SRC);
      expect(hasBrandPattern).toBe(true);
      // NAV_ITEMS array defines the nav entries rendered via map
      expect(LAYOUT_SRC).toMatch(/NAV_ITEMS\.map/);
    });
  });

  describe('role=alert error boundary', () => {
    it('ErrorBoundary renders role="alert" aria-live="assertive" on error state', () => {
      expect(ERROR_BOUNDARY_SRC).toMatch(/role="alert"[^>]+aria-live="assertive"/);
    });

    it('Overview error state uses role="alert" aria-live="assertive"', () => {
      // Find the error return block
      const errorBlock = OVERVIEW_SRC.match(/if\s*\(\s*loadState\s*===\s*['"]error['"]\s*\)\s*\{[\s\S]*?return\s*\([\s\S]*?<\/div>\s*\)\s*;?\s*\}/);
      expect(errorBlock?.[0]).toMatch(/role="alert"[^>]+aria-live="assertive"/);
    });
  });

  describe('aria-live/aria-busy loading semantics', () => {
    it('Overview loading state has aria-busy and aria-live="polite"', () => {
      const loadingBlock = OVERVIEW_SRC.match(/if\s*\(\s*loadState\s*===\s*['"]loading['"]\s*\)\s*\{[\s\S]*?return\s*\([\s\S]*?<\/div>\s*\)\s*;?\s*\}/);
      expect(loadingBlock?.[0]).toMatch(/aria-busy="true"/);
      expect(loadingBlock?.[0]).toMatch(/aria-live="polite"/);
    });

    it('Overview loading indicator has role="status"', () => {
      const loadingBlock = OVERVIEW_SRC.match(/if\s*\(\s*loadState\s*===\s*['"]loading['"]\s*\)\s*\{[\s\S]*?return\s*\([\s\S]*?<\/div>\s*\)\s*;?\s*\}/);
      expect(loadingBlock?.[0]).toMatch(/<div[^>]+className="state-loading"[^>]+role="status"/);
    });

    it('PlanWorkspace loading state has aria-busy and aria-live="polite"', () => {
      const loadingBlocks = PLAN_WORKSPACE_SRC.match(/if\s*\([^)]*loadState[^)]*===\s*['"]loading['"][^)]*\)\s*\{[\s\S]*?return\s*\([\s\S]*?<\/div>\s*\)\s*;?\s*\}/g);
      expect(loadingBlocks).not.toBeNull();
      for (const block of loadingBlocks!) {
        expect(block).toMatch(/aria-busy="true"/);
        expect(block).toMatch(/aria-live="polite"/);
      }
    });

    it('PlanWorkspace loading indicator has role="status"', () => {
      const loadingBlocks = PLAN_WORKSPACE_SRC.match(/if\s*\([^)]*loadState[^)]*===\s*['"]loading['"][^)]*\)\s*\{[\s\S]*?return\s*\([\s\S]*?<\/div>\s*\)\s*;?\s*\}/g);
      expect(loadingBlocks).not.toBeNull();
      for (const block of loadingBlocks!) {
        expect(block).toMatch(/<div[^>]+className="state-loading"[^>]+role="status"/);
      }
    });

    it('PlanWorkspace error state uses role="alert" aria-live="assertive"', () => {
      const errorBlocks = PLAN_WORKSPACE_SRC.match(/if\s*\([^)]*loadState[^)]*===\s*['"]error['"][^)]*\)\s*\{[\s\S]*?return\s*\([\s\S]*?<\/div>\s*\)\s*;?\s*\}/g);
      expect(errorBlocks).not.toBeNull();
      for (const block of errorBlocks!) {
        expect(block).toMatch(/role="alert"[^>]+aria-live="assertive"/);
      }
    });
  });
});
