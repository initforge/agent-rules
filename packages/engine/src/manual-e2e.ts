/**
 * Manual end-to-end smoke for the browser verification surface.
 *
 * Usage:
 *   cd packages/engine
 *   node dist/manual-e2e.cjs
 *
 * Spawns Chromium with headed:true (Chrome actually opens), navigates to
 * about:blank, takes a screenshot, and prints the evidence path. This
 * is the surface the user asked for: no human in the loop, the harness
 * drives the browser itself.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VerificationEngine } from './runner/verifier.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// here = packages/engine/dist; walk up three levels to the repo root.
const repo = path.resolve(here, '..', '..', '..');
const evidenceDir = path.join(repo, '.agent', 'artifacts', 'e2e-manual');
fs.mkdirSync(evidenceDir, { recursive: true });

const engine = new VerificationEngine({ cwd: repo, evidenceDir });

const profile = {
  steps: [
    { kind: 'playwright' as const, spec: 'demo', baseUrl: 'https://example.com', headed: true, tabProfile: 'e2e-demo' },
  ],
  evidence: ['screenshot' as const, 'console' as const],
  timeoutMs: 30_000,
};

console.log('[e2e] launching chromium headed…');
const outcome = await engine.evaluate(profile);
console.log('[e2e] passed=', outcome.passed);
console.log('[e2e] stepResults=', JSON.stringify(outcome.stepResults.map((r) => ({ kind: r.step.kind, exitCode: r.exitCode, durationMs: r.durationMs })), null, 2));
console.log('[e2e] evidence=', JSON.stringify(outcome.evidence.map((e) => ({ kind: e.kind, path: e.path, sha256: e.sha256 })), null, 2));
console.log('[e2e] files in evidence dir:');
for (const f of fs.readdirSync(evidenceDir, { recursive: true })) {
  console.log('  ', f);
}