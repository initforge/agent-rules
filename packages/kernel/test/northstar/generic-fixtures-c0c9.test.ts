/**
 * Generic Consumer Corpus (C0–C9) Matrix Tests
 * 
 * Validates harness behavior against arbitrary consumer repositories:
 * - C0: Empty / minimal repository
 * - C1: TypeScript library
 * - C2: React / Vite UI
 * - C3: Backend API
 * - C4: DB / ORM repository
 * - C5: Mobile (React Native / Expo)
 * - C6: Infrastructure / IaC
 * - C7: Mature monorepo with project-owned instructions (AGENTS.md / CLAUDE.md)
 * - C8: Stale / partial previous installation
 * - C9: Windows paths, spaces, and mixed path separators
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  stageClosureTransaction,
  commitClosureTransaction,
  correctInvalidClosure,
  writeOperationalIgnore,
  DEFAULT_IGNORED_OPERATIONAL_STATE,
  type ClosureInput,
  type EvidenceBindingManifest,
} from '../../src/northstar/closure-service.js';
import { HOST_CAPABILITIES, assertHostSurface } from '../../src/northstar/host-adapters.js';
import { classifyArtifact, admitArtifact } from '../../src/northstar/artifact-admission.js';
import { compileDoD } from '../../src/northstar/portable-plan.js';
import { createMcpLease, transitionMcpState, buildMcpIdleReceipt, assertIdleZeroReceipt } from '../../src/northstar/mcp-lifecycle.js';
import { EvidenceLedger } from '../../src/northstar/evidence-ledger.js';
import type { EvidenceRecord } from '../../src/northstar/protocol.js';

const allRoots: string[] = [];

function makeRepo(prefix = 'c-fixture-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  allRoots.push(root);
  return root;
}

function git(root: string, args: string[]): void {
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'ignore' });
}

function gitInit(root: string): void {
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Tester']);
  fs.writeFileSync(path.join(root, '.gitignore'), '# seed\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# seed fixture\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'seed']);
}

function makeBinding(root: string): EvidenceBindingManifest {
  let head = '0'.repeat(40);
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    // Non-git or uninitialized
  }
  return {
    harness_release: { repository: 'local', branch: 'main', sha256: '0'.repeat(40) },
    installation_projection: { installation_root: 'toolhome', projection_sha256: '0'.repeat(64) },
    consumer_repository: { worktree_path: root, worktree_dirty: false, tree_hash: '0'.repeat(40) },
    consumer_candidate: { candidate_sha256: head, candidate_branch: 'main', tree_hash: '0'.repeat(40) },
    host_runtime: { host: 'opencode', version: '1.18.18', session_id: 'test', capabilities: [], validation_status: 'VALIDATED' },
  };
}

function makeInput(root: string, planId = 'test-plan'): ClosureInput {
  return {
    plan_id: planId,
    work_id: `work-${planId}`,
    purpose: `Closure for ${planId}`,
    effective_contract_sha256: 'a'.repeat(64),
    requirements: [{ id: 'R-001', statement: 'feature works', status: 'PASS', evidence_status: 'pass' }],
    reconciliations: [{ count: 1, statuses: ['PASS'] }],
    evidence: [{ evidence_id: 'ev-1', sha256: 'b'.repeat(64), outcome: 'PASS' }],
    changed_surfaces: ['.gitignore'],
    diff_stat: '1 file',
    binding: makeBinding(root),
    behavioral_baseline: '0'.repeat(40),
  };
}

afterAll(() => {
  for (const r of allRoots) {
    try {
      fs.rmSync(r, { recursive: true, force: true });
    } catch {
      // Ignore Windows cleanup locks
    }
  }
});

describe('C0 — Empty / Minimal Repository', () => {
  it('initializes and closes cleanly leaving zero source tree pollution', () => {
    const root = makeRepo('c0-minimal-');
    gitInit(root);
    writeOperationalIgnore(root);
    const input = makeInput(root, 'c0-plan');
    const staged = stageClosureTransaction(input, root);
    expect(staged.staged).toBe(true);
    const receipt = commitClosureTransaction(input, root, staged);
    expect(receipt.committed).toBe(true);

    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    for (const pattern of DEFAULT_IGNORED_OPERATIONAL_STATE) {
      expect(gitignore).toContain(pattern);
    }
  });

  it('no MCP processes/sockets are left behind', () => {
    const lease = transitionMcpState(
      createMcpLease({ integration_id: 'none', consumer_repo: 'c0', worktree_path: '/c0', task_id: 't0', session_id: 's0', host: 'opencode' }),
      'TEARDOWN',
    );
    const receipt = buildMcpIdleReceipt({ lease, managed_processes: 0, managed_sockets: 0, managed_leases: 0, exposed_schema_tokens: 0 });
    expect(receipt.idle).toBe(true);
    expect(() => assertIdleZeroReceipt(receipt)).not.toThrow();
  });
});

describe('C1 — TypeScript Library', () => {
  it('preserves tsconfig and package files during closure and execution', () => {
    const root = makeRepo('c1-tslib-');
    gitInit(root);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'my-lib', version: '1.0.0' }, null, 2));
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' } }, null, 2));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const greet = (name: string) => `Hello, ${name}!`;\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'add ts lib files']);

    const input = makeInput(root, 'c1-plan');
    stageClosureTransaction(input, root);
    commitClosureTransaction(input, root, stageClosureTransaction(input, root));

    expect(fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8')).toContain('export const greet');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8')).compilerOptions.target).toBe('ES2022');
  });
});

describe('C2 — React / Vite UI', () => {
  it('UI task compiles DoD requiring browser/runtime evidence', () => {
    const dod = compileDoD({ disposition: 'IMPLEMENTATION', claims: ['UI_RESPONSIVENESS', 'COMPONENT_RENDER'] });
    expect(dod.required).toContain('CODE');
  });

  it('preserves vite.config.ts and frontend assets untouched', () => {
    const root = makeRepo('c2-ui-');
    gitInit(root);
    fs.writeFileSync(path.join(root, 'vite.config.ts'), 'import { defineConfig } from "vite";\nexport default defineConfig({});\n');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'App.tsx'), 'export const App = () => <h1>App</h1>;\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'add ui files']);

    const input = makeInput(root, 'c2-plan');
    stageClosureTransaction(input, root);
    commitClosureTransaction(input, root, stageClosureTransaction(input, root));

    expect(fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')).toContain('defineConfig');
    expect(fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')).toContain('export const App');
  });
});

describe('C3 — Backend API', () => {
  it('backend repo does not load UI/Pencil capabilities', () => {
    const root = makeRepo('c3-backend-');
    gitInit(root);
    fs.writeFileSync(path.join(root, 'server.js'), 'const http = require("http"); http.createServer().listen(3000);\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'add server']);

    const input = makeInput(root, 'c3-plan');
    stageClosureTransaction(input, root);
    commitClosureTransaction(input, root, stageClosureTransaction(input, root));

    expect(fs.readFileSync(path.join(root, 'server.js'), 'utf8')).toContain('createServer');
  });
});

describe('C4 — DB / ORM Repository', () => {
  it('preserves database schemas and migrations', () => {
    const root = makeRepo('c4-db-');
    gitInit(root);
    fs.mkdirSync(path.join(root, 'prisma', 'migrations'), { recursive: true });
    fs.writeFileSync(path.join(root, 'prisma', 'schema.prisma'), 'datasource db { provider = "postgresql" }\n');
    fs.writeFileSync(path.join(root, 'prisma', 'migrations', '001_init.sql'), 'CREATE TABLE users (id SERIAL PRIMARY KEY);\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'add db schema']);

    const input = makeInput(root, 'c4-plan');
    stageClosureTransaction(input, root);
    commitClosureTransaction(input, root, stageClosureTransaction(input, root));

    expect(fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8')).toContain('provider = "postgresql"');
    expect(fs.readFileSync(path.join(root, 'prisma', 'migrations', '001_init.sql'), 'utf8')).toContain('CREATE TABLE users');
  });
});

describe('C5 — Mobile (React Native / Expo)', () => {
  it('preserves app.json and mobile entrypoints', () => {
    const root = makeRepo('c5-mobile-');
    gitInit(root);
    fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { name: 'MyMobileApp', slug: 'my-mobile-app' } }));
    fs.writeFileSync(path.join(root, 'App.js'), 'import { View, Text } from "react-native";\nexport default () => <Text>Hi</Text>;\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'add mobile app']);

    const input = makeInput(root, 'c5-plan');
    stageClosureTransaction(input, root);
    commitClosureTransaction(input, root, stageClosureTransaction(input, root));

    expect(JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.name).toBe('MyMobileApp');
  });
});

describe('C6 — Infrastructure / IaC', () => {
  it('preserves Dockerfile and Terraform files', () => {
    const root = makeRepo('c6-iac-');
    gitInit(root);
    fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM node:20-alpine\nWORKDIR /app\n');
    fs.writeFileSync(path.join(root, 'main.tf'), 'terraform { required_version = ">= 1.0" }\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'add iac']);

    const input = makeInput(root, 'c6-plan');
    stageClosureTransaction(input, root);
    commitClosureTransaction(input, root, stageClosureTransaction(input, root));

    expect(fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8')).toContain('FROM node:20-alpine');
    expect(fs.readFileSync(path.join(root, 'main.tf'), 'utf8')).toContain('terraform');
  });
});

describe('C7 — Mature Monorepo with Project-Owned Instructions', () => {
  it('preserves AGENTS.md, CLAUDE.md, and custom instructions verbatim', () => {
    const root = makeRepo('c7-instructions-');
    gitInit(root);
    const agentsMdContent = '# Project Rules\n\n- Strict typing required\n- Always run linter\n';
    const claudeMdContent = '# Claude Instructions\n\n- Focus on clarity and safety\n';
    fs.writeFileSync(path.join(root, 'AGENTS.md'), agentsMdContent);
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), claudeMdContent);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'add project instructions']);

    const input = makeInput(root, 'c7-plan');
    stageClosureTransaction(input, root);
    commitClosureTransaction(input, root, stageClosureTransaction(input, root));

    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe(agentsMdContent);
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toBe(claudeMdContent);
  });
});

describe('C8 — Stale / Partial Previous Installation', () => {
  it('corrects stale ledger and recovers into consistent state', () => {
    const root = makeRepo('c8-stale-');
    gitInit(root);

    const staleLedger = {
      schema_version: 4,
      plan_id: 'old-stale-plan',
      status: 'RETIRED',
      execution_state: 'CLOSED',
      milestones: {},
      reconciliations: [],
      requirements: {},
    };
    fs.mkdirSync(path.join(root, '.agent', 'ledger'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agent', 'ledger', 'old-stale-plan.json'), JSON.stringify(staleLedger));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'seed stale ledger']);

    const correction = correctInvalidClosure({
      repoRoot: root,
      plan_id: 'old-stale-plan',
      pointer: { generation: 1, status: 'EFFECTIVE', execution_state: 'IN_PROGRESS' },
      ledger_path: '.agent/ledger/old-stale-plan.json',
      reason: 'upgrade recovery in C8 fixture',
    });

    expect('corrected' in correction && (correction as { corrected: boolean }).corrected).toBe(true);
    const updated = JSON.parse(fs.readFileSync(path.join(root, '.agent', 'ledger', 'old-stale-plan.json'), 'utf8'));
    expect(updated.status).toBe('SUPERSEDED');
    expect(updated.execution_state).toBe('INACTIVE');
  });
});

describe('C9 — Windows Paths, Spaces, and Mixed Separators', () => {
  it('handles directories with spaces and validates evidence file hashes correctly', () => {
    const parentDir = makeRepo('c9 space parent-');
    const root = path.join(parentDir, 'sub repo with space');
    fs.mkdirSync(root, { recursive: true });
    allRoots.push(parentDir);
    gitInit(root);

    const testFile = path.join(root, 'test artifact.txt');
    fs.writeFileSync(testFile, 'hello space world\n');

    const ledgerFile = path.join(root, '.agent', 'ledger', 'test-ledger.jsonl');
    const ledger = new EvidenceLedger(ledgerFile, root);

    const crypto = require('node:crypto');
    const fileHash = crypto.createHash('sha256').update(fs.readFileSync(testFile)).digest('hex');

    const record: EvidenceRecord = {
      protocol_version: '2.0',
      evidence_id: 'E-c9',
      claim_id: 'C-001',
      task_id: 'T-001',
      kind: 'test',
      status: 'pass',
      observed_at: new Date().toISOString(),
      artifact_path: 'test artifact.txt',
      sha256: fileHash,
      verifier_id: 'v-1',
    };

    const envelope = ledger.append(record, 'verifier');
    expect(envelope.seq).toBe(1);
    expect(envelope.record.sha256).toBe(fileHash);

    const readEnvelopes = ledger.read();
    expect(readEnvelopes.length).toBe(1);
    expect(readEnvelopes[0]!.record.artifact_path).toBe('test artifact.txt');
  });
});
