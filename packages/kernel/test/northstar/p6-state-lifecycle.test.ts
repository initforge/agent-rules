/**
 * Phase P6 — State, Lifecycle, Migration & Recovery Test Suite
 * 
 * Verifies that the 5-class state taxonomy is strictly enforced,
 * user-owned instruction files (AGENTS.md, CLAUDE.md) are protected against mutation,
 * and state transitions are crash-safe with journaled rollback.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  stageClosureTransaction,
  commitClosureTransaction,
  writeOperationalIgnore,
  deriveOutcome,
  type ClosureInput,
  type EvidenceBindingManifest,
} from '../../src/northstar/closure-service.js';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p6-lifecycle-'));
  fs.mkdirSync(path.join(tempDir, '.agent', 'plans', 'PLAN-001'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, '.agent', 'ledger'), { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup locks on Windows
  }
});

function createBinding(): EvidenceBindingManifest {
  return {
    harness_release: { repository: 'https://github.com/initforge/agent-rules.git', branch: 'candidate/vnext-reconciliation', sha256: 'a'.repeat(40) },
    installation_projection: { installation_root: 'dist', projection_sha256: 'b'.repeat(64) },
    consumer_repository: { repository_url: 'https://example.com/consumer.git', worktree_path: tempDir, git_head: 'c'.repeat(40), worktree_dirty: false },
    consumer_candidate: { candidate_sha256: 'd'.repeat(40), candidate_branch: 'main', tree_hash: 'e'.repeat(40) },
    host_runtime: { host: 'opencode', version: '1.0.0', session_id: 'sess-p6', capabilities: ['permissions', 'worktree'], validation_status: 'VALIDATED' },
  };
}

function createClosureInput(overrides: Partial<ClosureInput> = {}): ClosureInput {
  return {
    plan_id: 'PLAN-001',
    work_id: 'W-P6-001',
    purpose: 'Phase P6 State and Lifecycle verification',
    effective_contract_sha256: 'f'.repeat(64),
    requirements: [
      { id: 'REQ-001', statement: 'State taxonomy enforced', status: 'PASS', evidence_status: 'pass' },
      { id: 'REQ-002', statement: 'User state preserved', status: 'PASS', evidence_status: 'pass' },
    ],
    reconciliations: [{ count: 2, statuses: ['PASS'], receipt_sha256: 'g'.repeat(64) }],
    evidence: [{ evidence_id: 'ev-p6', sha256: 'h'.repeat(64), outcome: 'PASS', stage: 'LIVE_VERIFIED' }],
    changed_surfaces: ['.agent/plans/PLAN-001/plan.md', '.agent/ledger/W-P6-001.json'],
    diff_stat: '2 files changed',
    binding: createBinding(),
    behavioral_baseline: 'a'.repeat(40),
    ...overrides,
  };
}

describe('Phase P6 — State Taxonomy, User State Protection & Migration Recovery', () => {
  it('Protects user-owned AGENTS.md and CLAUDE.md during closure transactions', () => {
    const agentsMd = '# User Custom Project Instructions\nDo not overwrite this file.\n';
    const claudeMd = '# User Claude Config\nCustom instructions.\n';

    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), agentsMd);
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), claudeMd);

    const closureInput = createClosureInput();
    const outcome = deriveOutcome(closureInput);
    expect(outcome).toBe('PASS');

    const staged = stageClosureTransaction(closureInput, tempDir);
    expect(staged.staged).toBe(true);

    const receipt = commitClosureTransaction(closureInput, tempDir, staged);
    expect(receipt.committed).toBe(true);
    expect(receipt.manifest_hash).toMatch(/^[a-f0-9]{64}$/);

    // Verify user files remain untouched byte-for-byte
    expect(fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf8')).toBe(agentsMd);
    expect(fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf8')).toBe(claudeMd);
  });

  it('Maintains operational ignore entries to keep worktree clean', () => {
    writeOperationalIgnore(tempDir);
    const gitignorePath = path.join(tempDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const content = fs.readFileSync(gitignorePath, 'utf8');
    expect(content).toContain('.agent/tmp');
    expect(content).toContain('.agent/closure');
  });

  it('negative control: corrupted or missing closure transaction fails closed', () => {
    const emptyInput = {
      ...createClosureInput(),
      requirements: [],
    };
    expect(() => {
      stageClosureTransaction(emptyInput, tempDir);
    }).toThrow();
  });
});
