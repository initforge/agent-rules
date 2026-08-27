#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pointer = JSON.parse(read('.agent/current.json'));
const plan = JSON.parse(read('.agent/runs/agent-workflow-native-readiness-v3/plan.json'));
const checks = [
  ['active v3 pointer', pointer.work_id === 'agent-workflow-native-readiness-v3'],
  ['v3 plan has all prior requirements plus OMP injection and current amendment', plan.requirements?.length === 23 && plan.requirements.some((requirement) => requirement.id === 'REQ-123' && requirement.kind === 'injection') && plan.amendments?.some((amendment) => amendment.id === 'AMD-1')],
  ['pasted plans route proof', read('packages/cli/src/commands/northstar-ux.ts').includes('proofRouter: planProofRoute')],
  ['runtime uses managed workflow', read('packages/kernel/src/northstar/runtime.ts').includes('resolveManagedWorkflow')],
  ['core projector never syncs MCP directly', !read('packages/cli/src/runtime/composed-installer.ts').includes('syncPlatformMcpConfig(platform)')],
  ['setup registers Command Code MCP through its native surface', read('packages/cli/src/services/native-installer.ts').includes('writeCommandCodeMcpConfig')],
  ['status is live-pointer based', !read('packages/cli/src/commands/northstar-ux.ts').includes('behavior-index.json')],
  ['Grok uses canonical rules path', JSON.parse(read('platforms/platform-contracts.json')).native_contracts.grok.paths.instructionPath === '$GROK_HOME/rules'],
  ['OMP is a profile-aware native host', JSON.parse(read('platforms/platform-contracts.json')).native_contracts.omp.paths.instructionPath === '$PI_CODING_AGENT_DIR/AGENTS.md'],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
if (failed.length) process.exit(1);
