/**
 * REQ-012 — ContextBudgetReceipt measures the installed graph AND the actual
 * model-visible subset, never the whole graph. Receipt is hash-bound.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildContextBudgetReceipt, estimateInstalledGraph } from '../../src/northstar/context-budget.js';

describe('REQ-012 — context budget receipt', () => {
  it('totals model-visible tokens and distinguishes input-token buckets', () => {
    const receipt = buildContextBudgetReceipt({
      run_id: 'RUN-1',
      work_id: 'W-1',
      measurement_source: 'EXACT_SERIALIZED',
      model_visible: {
        rules: [{ tokens: 100 }, { tokens: 50 }],
        skill_metadata: [{ tokens: 20 }],
        skill_bodies: [{ tokens: 300 }],
        tool_schemas: [{ tokens: 40 }],
        mcp_schemas: [{ tokens: 10 }],
        subagent_advertisements: [{ tokens: 5 }],
      },
      input_tokens: { tool_results: 200, repair_retries: 30, repeated_reads: 40 },
    });
    expect(receipt.model_visible.total_tokens).toBe(100 + 50 + 20 + 300 + 40 + 10 + 5);
    expect(receipt.input_tokens.total).toBe(270);
    expect(receipt.input_tokens.repeated_reads).toBe(40);
    expect(receipt.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('defaults to zeros when nothing is measured (never fabricates a budget)', () => {
    const receipt = buildContextBudgetReceipt({ run_id: 'R', work_id: 'W', measurement_source: 'ESTIMATED' });
    expect(receipt.model_visible.total_tokens).toBe(0);
    expect(receipt.installed_graph).toEqual({ files: 0, nodes: 0, estimated_tokens: 0 });
  });

  it('estimates the installed graph size from a real directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-budget-'));
    try {
      fs.mkdirSync(path.join(root, 'a'));
      fs.writeFileSync(path.join(root, 'a', 'one.ts'), 'export const one = 1;\n');
      fs.writeFileSync(path.join(root, 'two.ts'), 'export const two = 2;\n');
      const graph = estimateInstalledGraph(root);
      expect(graph.files).toBe(2);
      expect(graph.nodes).toBeGreaterThanOrEqual(1);
      expect(graph.estimated_tokens).toBeGreaterThan(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('records excluded cold/inactive context explicitly', () => {
    const receipt = buildContextBudgetReceipt({
      run_id: 'R',
      work_id: 'W',
      measurement_source: 'HOST_OBSERVED',
      excluded: [{ kind: 'cold_references', count: 12, reason: 'references load on demand' }],
    });
    expect(receipt.excluded[0].count).toBe(12);
  });
});
