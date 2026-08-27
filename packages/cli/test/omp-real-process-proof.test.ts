import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');

describe('OMP Real Process & Live Model Turn Proof (Phase 4, REQ-006, AC-02)', () => {
  it('executes real OMP binary, proves pre-model context injection, and asserts model output matches the EXACT cryptographic route_id in the extension receipt on disk', () => {
    // User prompt contains ZERO route_id information. The model can ONLY return
    // the route_id if the extension dynamically injected it into systemPrompt before the turn.
    const prompt = 'Inspect your system prompt for this turn. What is the exact route_id declared in the "# agent-rules native turn routing (route_id: ...)" header? Return ONLY the route_id string starting with RT- and nothing else.';
    const promptSha = crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');

    const res = spawnSync('cmd.exe', ['/c', 'omp', '-p', prompt], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 45000,
    });

    expect(res.status).toBe(0);
    const stdout = (res.stdout ?? '').trim();
    const match = stdout.match(/RT-[0-9a-f]{24}/);
    expect(match).not.toBeNull();
    const modelReportedRouteId = match![0];

    // Cryptographic binding: Read the extension receipt on disk created for this turn
    const receiptPath = path.join(repoRoot, '.agent', 'runs', `route-${modelReportedRouteId}`, 'run.json');
    expect(fs.existsSync(receiptPath)).toBe(true);

    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    // 1. Model returned the EXACT route_id written by the router
    expect(receipt.route_id).toBe(modelReportedRouteId);
    // 2. Receipt prompt hash matches the exact prompt sent
    expect(receipt.hashes.prompt).toBe(promptSha);
    // 3. Receipt status is PASS
    expect(receipt.status).toBe('PASS');
    // 4. Raw prompt is never stored in receipt
    expect(fs.readFileSync(receiptPath, 'utf8')).not.toContain(prompt);
  }, 60000);
});
