/**
 * REQ-011 — read-only project audit of agent-rules, ZaloAI-Ecommerce and
 * pos-ops: test runners, categories, baseline counts, slow suites, duplicate
 * patterns, browser/live capability, CI commands, missing proof layers,
 * recommended minimal proof profile, escalation rules. The audit never
 * modifies the audited projects.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditProject, type ProjectAudit } from '../../src/northstar/project-audit.js';

const HOME = os.homedir();
const TARGETS = [
  { name: 'agent-rules', root: path.join(HOME, 'Projects', 'agent-rules') },
  { name: 'ZaloAI-Ecommerce', root: path.join(HOME, 'Projects', 'ZaloAI-Ecommerce') },
  { name: 'pos-ops', root: path.join(HOME, 'Projects', 'pos-ops') },
];

describe('project audit — read-only, three projects', () => {
  it('audits agent-rules without modifying it', () => {
    const target = TARGETS[0];
    expect(fs.existsSync(path.join(target.root, '.git'))).toBe(true);
    const before = fs.readdirSync(target.root).length;
    const audit = auditProject({ repoRoot: target.root });
    expect(audit.read_only).toBe(true);
    expect(audit.repository).toBe(target.root);
    expect(audit.test_runners.length).toBeGreaterThan(0);
    expect(audit.baseline.files).toBeGreaterThan(0);
    expect(audit.baseline.tests).toBeGreaterThan(0);
    expect(audit.recommended_profile.length).toBeGreaterThan(0);
    expect(fs.readdirSync(target.root).length).toBe(before);
  });

  it('audits ZaloAI-Ecommerce read-only', () => {
    const target = TARGETS[1];
    if (!fs.existsSync(target.root)) return; // environment-dependent; skip silently in CI without the project
    const before = fs.readdirSync(target.root).length;
    const audit = auditProject({ repoRoot: target.root });
    expect(audit.read_only).toBe(true);
    expect(audit.baseline.files).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(audit.test_categories)).toBe(true);
    expect(fs.readdirSync(target.root).length).toBe(before);
  });

  it('audits pos-ops read-only', () => {
    const target = TARGETS[2];
    if (!fs.existsSync(target.root)) return;
    const before = fs.readdirSync(target.root).length;
    const audit = auditProject({ repoRoot: target.root });
    expect(audit.read_only).toBe(true);
    expect(audit.repository).toBe(target.root);
    expect(fs.readdirSync(target.root).length).toBe(before);
  });

  it('produces the owner §13 report fields', () => {
    const audit = auditProject({ repoRoot: TARGETS[0].root });
    expect(audit.schema).toBe('agent-rules/project-audit/v1');
    expect(audit.test_runners).toBeInstanceOf(Array);
    expect(audit.test_categories).toBeInstanceOf(Array);
    expect(audit.baseline).toHaveProperty('files');
    expect(audit.baseline).toHaveProperty('tests');
    expect(audit.slow_suites).toBeInstanceOf(Array);
    expect(audit.duplicate_patterns).toBeInstanceOf(Array);
    expect(typeof audit.browser_live_capability).toBe('boolean');
    expect(audit.ci_commands).toBeInstanceOf(Array);
    expect(audit.missing_proof_layers).toBeInstanceOf(Array);
    expect(audit.recommended_profile).toBeTruthy();
    expect(audit.escalation_rules).toBeInstanceOf(Array);
  });
});
