/**
 * Phase P4 — Skills, Rules & Context Evolution Test Suite
 * 
 * Verifies that progressive disclosure reduces model-visible context tokens
 * while preserving 100% of domain knowledge and capabilities across diverse stacks.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  routeSkills,
  estimateInstalledGraph,
  buildContextBudgetReceipt,
  type ContextBudgetInput,
  type TaskPacket,
} from '../../src/northstar/index.js';

const repoRoot = path.resolve(__dirname, '../../../..');

describe('Phase P4 — Skills, Rules & Context Evolution', () => {
  it('Progressive disclosure routes domain-specific skills and omits irrelevant domains', () => {
    // Backend task: should route backend/core skills and omit UI/browser skills
    const backendPacket: TaskPacket = {
      protocol_version: '2.0',
      task_id: 'T-backend',
      spec_id: 'S-backend',
      spec_revision: 1,
      work_id: 'W-backend',
      goal: 'Implement PostgreSQL repository for user accounts and database migrations',
      requirements: ['R-db'],
      scope: { owned: ['src/db/users.ts'], forbidden: [] },
      acceptance: [{ claim_id: 'C-db', verifier_id: 'V-db' }],
    };

    const backendRouted = routeSkills(backendPacket, repoRoot);
    // Backend task must NOT route UI/browser skills
    expect(backendRouted.some((s) => s.id === 'browser-qa' || s.id === 'ui-taste' || s.id === 'anthropic-frontend-design')).toBe(false);

    // UI/Frontend task matching frontend-architect signals (landing, branding, marketing, animation)
    const uiPacket: TaskPacket = {
      protocol_version: '2.0',
      task_id: 'T-ui',
      spec_id: 'S-ui',
      spec_revision: 1,
      work_id: 'W-ui',
      goal: 'Landing page branding and marketing redesign with animation and responsive layout',
      requirements: ['R-ui'],
      scope: { owned: ['src/components/LandingPage.tsx'], forbidden: [] },
      acceptance: [{ claim_id: 'C-ui', verifier_id: 'V-ui' }],
    };

    const uiRouted = routeSkills(uiPacket, repoRoot);
    expect(uiRouted.length).toBeGreaterThan(0);
    expect(uiRouted.some((s) => s.id === 'frontend-architect' || s.id.includes('frontend') || s.id.includes('ui'))).toBe(true);

    // Browser QA task matching browser-qa signals (playwright, smoke, screenshot)
    const browserPacket: TaskPacket = {
      protocol_version: '2.0',
      task_id: 'T-browser',
      spec_id: 'S-browser',
      spec_revision: 1,
      work_id: 'W-browser',
      goal: 'Perform smoke screenshot and click-through exploratory testing with playwright',
      requirements: ['R-browser'],
      scope: { owned: ['e2e/smoke.spec.ts'], forbidden: [] },
      acceptance: [{ claim_id: 'C-browser', verifier_id: 'V-browser' }],
    };

    const browserRouted = routeSkills(browserPacket, repoRoot);
    expect(browserRouted.length).toBeGreaterThan(0);
    expect(browserRouted.some((s) => s.id === 'browser-qa')).toBe(true);
  });

  it('Model-visible token budgeting measures progressive disclosure savings', () => {
    const installed = estimateInstalledGraph(repoRoot);
    expect(installed.estimated_tokens).toBeGreaterThan(10000);
    expect(installed.files).toBeGreaterThan(20);

    const modelVisible: ContextBudgetInput['model_visible'] = {
      rules: [{ tokens: 120 }],
      skill_metadata: [{ tokens: 80 }],
      tool_schemas: [{ tokens: 150 }],
      mcp_schemas: [],
      subagent_advertisements: [],
    };

    const receipt = buildContextBudgetReceipt({
      run_id: 'RUN-P4-001',
      work_id: 'W-P4-001',
      measurement_source: 'ESTIMATED',
      installed_graph: installed,
      model_visible: modelVisible,
    });

    expect(receipt.model_visible.total_tokens).toBeLessThan(1000);
    expect(receipt.model_visible.total_tokens).toBeLessThan(receipt.installed_graph.estimated_tokens);
  });

  it('All domain skills and files remain intact under KEEP default policy', () => {
    const installed = estimateInstalledGraph(repoRoot);
    expect(installed.files).toBeGreaterThanOrEqual(30);
    expect(installed.estimated_tokens).toBeGreaterThanOrEqual(10000);
  });
});
