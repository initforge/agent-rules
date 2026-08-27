#!/usr/bin/env node

/**
 * verify-native-routing.mjs — Comprehensive native turn routing certification runner (S6, REQ-011, AC-09).
 * Verifies canonical router, CLI transport, OMP bootstrap gate, host matrix, and plan schema.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname ?? '.', '..');

console.log('=== VERIFY NATIVE ROUTING: START ===');

// 1. Build kernel, engine, and CLI
console.log('\n[1/4] Building kernel, engine, and CLI...');
const buildRes = spawnSync('npm', ['run', 'build'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
});
if (buildRes.status !== 0) {
  console.error('FAIL: npm run build failed');
  process.exit(1);
}

// 2. Run kernel native routing test suite
console.log('\n[2/4] Running native routing test suites in packages/kernel and packages/cli...');
const kernelTestRes = spawnSync('node', ['../../node_modules/vitest/vitest.mjs', 'run', 'test/native-turn-router.test.ts'], {
  cwd: path.join(repoRoot, 'packages', 'kernel'),
  stdio: 'inherit',
});
if (kernelTestRes.status !== 0) {
  console.error('FAIL: Kernel native routing test suite failed');
  process.exit(1);
}

// 3. Run CLI native routing test suites
const cliTests = [
  'test/route-native.test.ts',
  'test/omp-bootstrap-gate.test.ts',
  'test/omp-real-process-proof.test.ts',
  'test/host-adapters-contract.test.ts',
  'test/mcp-live-canary.test.ts',
];
const cliTestRes = spawnSync('node', ['../../node_modules/vitest/vitest.mjs', 'run', ...cliTests], {
  cwd: path.join(repoRoot, 'packages', 'cli'),
  stdio: 'inherit',
});
if (cliTestRes.status !== 0) {
  console.error('FAIL: CLI native routing test suites failed');
  process.exit(1);
}

// 4. Test CLI stdin transport directly
console.log('\n[3/4] Testing agent-rules route-native --stdin CLI transport directly...');
const cliInput = JSON.stringify({
  protocol_version: '2.0',
  host: 'omp',
  session_id: 'verify-suite-sess-1',
  turn_id: 'turn-1',
  cwd: repoRoot,
  prompt: 'Verify visual parity of the drawer component in the browser',
  host_facts: { client: 'interactive', provider: 'google-antigravity' },
});

const cliRes = spawnSync(process.execPath, [path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js'), 'route-native', '--stdin'], {
  input: cliInput,
  encoding: 'utf8',
});

if (cliRes.status !== 0) {
  console.error(`FAIL: route-native CLI returned exit code ${cliRes.status}: ${cliRes.stderr}`);
  process.exit(1);
}

const capsule = JSON.parse(cliRes.stdout);
if (capsule.schema !== 'agent-rules/route-capsule' || capsule.status !== 'PASS' || !capsule.route_id) {
  console.error('FAIL: route-native CLI returned malformed capsule:', capsule);
  process.exit(1);
}
console.log(`  ✓ route-native CLI produced valid capsule: ${capsule.route_id} (${capsule.skills.length} skills routed)`);

// 5. Validate plan schema
console.log('\n[4/4] Validating plan contract against schemas/plan.schema.json...');
const planPath = path.join(repoRoot, '.agent', 'work', 'native-turn-routing-closure', 'plan.json');
const planSchemaPath = path.join(repoRoot, 'schemas', 'plan.schema.json');

if (fs.existsSync(planPath)) {
  const schemaRes = spawnSync('python', ['-m', 'jsonschema', '-i', planPath, planSchemaPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (schemaRes.status !== 0) {
    console.error('FAIL: plan schema validation failed:', schemaRes.stderr || schemaRes.stdout);
    process.exit(1);
  }
  console.log('  ✓ Plan schema is valid');
} else {
  console.warn(`  [WARN] Plan file not found at ${planPath}`);
}

console.log('\n=== VERIFY NATIVE ROUTING: ALL PASS ===');
