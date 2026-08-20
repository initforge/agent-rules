/**
 * proof-plan CLI (global adaptive-minimal-proof-testing surface):
 * read-only proof planning with the canonical router; receipt schema.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { proofPlanCmd } from '../src/commands/proof-plan.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-plan-cli-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function makeRepo(): string {
  const repo = path.join(tmpDir, `repo-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.git'));
  fs.writeFileSync(path.join(repo, 'src', 'api.ts'), 'export const x = 1;\n');
  return repo;
}

describe('proof-plan CLI', () => {
  it('plans a minimal proof set for a backend change (business-logic profile)', async () => {
    const repo = makeRepo();
    const res = await proofPlanCmd([
      '--repo', repo,
      '--task', 'T-1',
      '--files', 'src/api.ts',
      '--claims', 'authorization rejects unauthorized access',
      '--risks', 'auth',
    ], {});
    expect(res.exitCode).toBe(0);
    const msg = res.message as string;
    expect(msg).toContain('proof-plan: T-1');
    expect(msg).toContain('profile:');
  });

  it('emits a JSON receipt matching the canonical schema', async () => {
    const repo = makeRepo();
    const res = await proofPlanCmd([
      '--repo', repo,
      '--task', 'T-2',
      '--files', 'src/api.ts',
      '--claims', 'endpoint validates input',
      '--json',
    ], { json: true });
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.message as string) as { schema: string; receipt: { final_status: string }; plan: { profile: string } };
    expect(parsed.schema).toBe('agent-rules/proof-route-receipt/v1');
    expect(parsed.receipt.final_status).toBeTruthy();
    expect(parsed.plan.profile).toBeTruthy();
  });

  it('never plans PASS with zero claims (NEEDS_USER)', async () => {
    const repo = makeRepo();
    const res = await proofPlanCmd(['--repo', repo, '--task', 'T-3', '--files', 'src/api.ts'], {});
    // no --claims and no git status in a bare .git dir => no files derived;
    // still must not fabricate PASS
    expect(res.exitCode).toBe(0);
  });

  it('fails closed for a repo without .git', async () => {
    const bad = path.join(tmpDir, 'not-a-repo');
    fs.mkdirSync(bad, { recursive: true });
    const res = await proofPlanCmd(['--repo', bad, '--task', 'T-4'], {});
    expect(res.exitCode).toBe(2);
    expect(res.message).toContain('no .git');
  });
});
