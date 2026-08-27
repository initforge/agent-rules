import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { NativeInstaller } from '../src/services/native-installer.js';
import { resolveOmpAgentHome } from '../src/native/omp.js';

const repoRoot = path.resolve(process.cwd(), '../..');

describe('OMP Bootstrap Gate (S2, REQ-006, AC-02)', () => {
  beforeAll(async () => {
    const installer = new NativeInstaller();
    await installer.install('omp');
  });

  it('proves all 5 bootstrap points in an end-to-end OMP lifecycle turn using installed global extension', () => {
    const installedExtPath = path.join(resolveOmpAgentHome(), 'extensions', 'agent-rules.ts');
    expect(fs.existsSync(installedExtPath)).toBe(true);

    const script = `
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const installedExtPath = path.join(os.homedir(), '.omp', 'agent', 'extensions', 'agent-rules.ts');
const mod = await import(pathToFileURL(installedExtPath).href);
const agentRulesOmpExtension = mod.default;

const handlers = {};
const debugLogs = [];
const mockPi = {
  setLabel: () => {},
  on: (event, handler) => { handlers[event] = handler; },
  logger: {
    debug: (msg) => debugLogs.push(msg),
    warn: (msg) => console.warn(msg),
    info: (msg) => {},
  },
};

agentRulesOmpExtension(mockPi);
const canaryNonce = 'CANARY_BOOTSTRAP_NONCE_' + Date.now();
const prompt = 'Verify visual parity of the drawer component in the browser. Nonce: ' + canaryNonce;
const mockCtx = {
  cwd: ${JSON.stringify(repoRoot)},
  sessionManager: { getSessionId: () => 'sess-123' },
  model: { provider: 'google-antigravity', id: 'gemini-3.7-flash' },
};

const result = handlers['before_agent_start']({ type: 'before_agent_start', prompt, systemPrompt: 'BASE_SYSTEM' }, mockCtx);

// Also verify context hook
handlers['context']({}, mockCtx);

// Also verify turn cleanup
handlers['session_shutdown']({}, mockCtx);

const out = {
  proof1_router_called_once: debugLogs.filter(l => l.includes('agent-rules routed turn')).length === 1,
  proof2_correct_skill_selected: debugLogs[0]?.includes('parity-verification'),
  proof3_route_id_valid: /RT-[0-9a-f]{24}/.test(debugLogs[0] || ''),
  proof4_context_injected: typeof result?.systemPrompt === 'string' && result.systemPrompt.includes('# agent-rules native turn routing') && result.systemPrompt.includes('parity-verification'),
  proof5_canary_preserved: result?.systemPrompt?.includes(canaryNonce),
  context_capsule_active: debugLogs.some(l => l.includes('agent-rules active context capsule')),
  route_log: debugLogs[0],
};
process.stdout.write(JSON.stringify(out));
`;

    const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });

    expect(res.status).toBe(0);
    const proof = JSON.parse(res.stdout);
    expect(proof.proof1_router_called_once).toBe(true);
    expect(proof.proof2_correct_skill_selected).toBe(true);
    expect(proof.proof3_route_id_valid).toBe(true);
    expect(proof.proof4_context_injected).toBe(true);
    expect(proof.proof5_canary_preserved).toBe(true);
    expect(proof.context_capsule_active).toBe(true);
  });
});
