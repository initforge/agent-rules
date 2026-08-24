import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectToAllHosts, readCurrentOverlaySection, operatorProfileStatus } from '../src/services/host-projection.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ALL_HOSTS = ['claude', 'codex', 'opencode', 'cursor', 'antigravity', 'grok', 'deepseek-harness', 'command-code'];

describe('host projection engine (single canonical source)', () => {
  it('projects vibe-product to all 8 host overlays as SYNCED', () => {
    const reports = projectToAllHosts(REPO_ROOT, 'vibe-product', true);
    expect(reports).toHaveLength(8);
    for (const report of reports) {
      expect(report.status).toBe('SYNCED');
    }
  });

  it('reports DRIFTED when an overlay section is tampered with', () => {
    const overlay = path.join(REPO_ROOT, 'platforms', 'cursor', 'cursor-overlay.md');
    const original = fs.readFileSync(overlay, 'utf8');
    try {
      fs.writeFileSync(overlay, original.replace(/version: [0-9.]+/, 'version: 9.9.9-tampered'));
      const before = projectToAllHosts(REPO_ROOT, 'vibe-product', false);
      expect(before.find((r) => r.host === 'cursor')?.status).toBe('DRIFTED');
    } finally {
      fs.writeFileSync(overlay, original);
    }
    const after = projectToAllHosts(REPO_ROOT, 'vibe-product', false);
    expect(after.find((r) => r.host === 'cursor')?.status).toBe('SYNCED');
  });

  it('reports MANUAL_PROJECTION for hosts without a projection surface (fail-honest, not skip)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
    try {
      for (const host of ALL_HOSTS) fs.mkdirSync(path.join(root, 'platforms', host), { recursive: true });
      fs.rmSync(path.join(root, 'platforms', 'grok'), { recursive: true, force: true });
      // canonical profile source is absent in temp root -> UNSUPPORTED is honest
      const reports = projectToAllHosts(root, 'vibe-product', false);
      expect(reports.find((r) => r.host === 'grok')?.status).toBe('MANUAL_PROJECTION');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('every overlay carries the same bound section content from one canonical source', () => {
    const sections = ALL_HOSTS.map((host) => readCurrentOverlaySection(REPO_ROOT, host as (typeof ALL_HOSTS)[number], 'vibe-product'));
    expect(sections.every((s) => s !== null)).toBe(true);
    const normalized = new Set((sections as string[]).map((s) => s.replace(/host: .*/g, '').trim()));
    expect(normalized.size).toBe(1);
  });

  it('status aggregates installed state plus per-host projections', () => {
    const status = operatorProfileStatus(REPO_ROOT);
    expect(status.hosts).toHaveLength(8);
    expect(status.precedence_chain.length).toBeGreaterThan(0);
  });
});
