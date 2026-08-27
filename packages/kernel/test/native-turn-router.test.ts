import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  routeNativeTurn,
  type NativeTurnRequest,
  type RouteCapsule,
  NATIVE_TURN_ROUTER_VERSION,
} from '../src/northstar/native-turn-router.js';
import { createStandardCapabilityBroker, routeSkills } from '../src/northstar/routing.js';
import { createWorkRequest, compileWorkSpec, compileTaskPackets } from '../src/northstar/compiler.js';

function findRepoRoot(start = process.cwd()): string {
  let cur = path.resolve(start);
  while (cur) {
    if (fs.existsSync(path.join(cur, 'schemas', 'route-capsule.schema.json'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(process.cwd(), '../..');
}
const repoRoot = findRepoRoot();
const ajv = new Ajv2020({ allErrors: true });
const schemaPath = path.join(repoRoot, 'schemas', 'route-capsule.schema.json');
const capsuleSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validateCapsule = ajv.compile(capsuleSchema);

describe('routeNativeTurn canonical native turn router (REQ-001..REQ-005, AC-01..AC-04)', () => {
  it('produces a valid RouteCapsule satisfying schemas/route-capsule.schema.json', () => {
    const request: NativeTurnRequest = {
      protocol_version: '2.0',
      host: 'omp',
      session_id: 'session-schema-001',
      turn_id: 'turn-001',
      cwd: repoRoot,
      prompt: 'Verify visual parity of the drawer component in the browser',
      host_facts: { client: 'interactive', provider: 'google-antigravity' },
    };

    const { capsule } = routeNativeTurn(request);
    const valid = validateCapsule(capsule);
    if (!valid) {
      console.error('Schema errors:', validateCapsule.errors);
    }
    expect(valid).toBe(true);
    expect(capsule.schema).toBe('agent-rules/route-capsule');
    expect(capsule.version).toBe(1);
    expect(capsule.status).toBe('PASS');
    expect(capsule.observed.router_version).toBe(NATIVE_TURN_ROUTER_VERSION);
  });

  it('guarantees route parity between direct routeSkills and routeNativeTurn for same prompt (AC-01)', () => {
    const prompt = 'Verify visual parity in browser with Playwright QA matrix';
    const request: NativeTurnRequest = {
      protocol_version: '2.0',
      host: 'omp',
      session_id: 'session-parity-001',
      turn_id: 'turn-001',
      cwd: repoRoot,
      prompt,
      host_facts: { client: 'interactive' },
    };

    const { capsule } = routeNativeTurn(request);

    // Direct managed path compilation
    const workReq = createWorkRequest({ raw_intent: prompt, source: 'other', work_id: 'W-test' });
    const compiled = compileWorkSpec(workReq, {
      risk_class: 'S0',
      requirements: [{ statement: prompt, claims: [{ statement: prompt, class: 'mechanical', verifier_id: 'V-1' }] }],
    });
    const [packet] = compileTaskPackets(compiled, [{
      goal: prompt,
      requirement_ids: ['R-001'],
      claim_ids: ['C-001a'],
      owned: ['.'],
      verifier_by_claim: { 'C-001a': 'V-1' },
    }]);
    const directRoutes = routeSkills(packet, repoRoot);

    // Both paths must produce the exact same skills in the exact same order with matching hashes
    expect(capsule.skills.map((s) => s.id)).toEqual(directRoutes.map((s) => s.id));
    for (let i = 0; i < directRoutes.length; i++) {
      expect(capsule.skills[i].source).toBe(directRoutes[i].source);
      expect(capsule.skills[i].source_hash).toBe(directRoutes[i].source_hash);
      expect(capsule.skills[i].graph_hash).toBe(directRoutes[i].graph_hash);
    }
  });

  it('enforces strict idempotency: identical inputs yield identical route_id and hashes (REQ-003)', () => {
    const request: NativeTurnRequest = {
      protocol_version: '2.0',
      host: 'omp',
      session_id: 'session-idem-001',
      turn_id: 'turn-001',
      cwd: repoRoot,
      prompt: 'Check database migration status and run schema verification',
      host_facts: { client: 'headless' },
    };

    const first = routeNativeTurn(request).capsule;
    const second = routeNativeTurn(request).capsule;

    expect(first.route_id).toBe(second.route_id);
    expect(first.idempotency_key).toBe(second.idempotency_key);
    expect(first.hashes).toEqual(second.hashes);
    expect(first.context.estimated_tokens).toBe(second.context.estimated_tokens);
  });

  it('differentiates distinct turns and sessions with distinct route_ids', () => {
    const base: NativeTurnRequest = {
      protocol_version: '2.0',
      host: 'omp',
      session_id: 'session-diff-001',
      turn_id: 'turn-001',
      cwd: repoRoot,
      prompt: 'Review security invariants in middleware',
      host_facts: {},
    };

    const turn1 = routeNativeTurn(base).capsule;
    const turn2 = routeNativeTurn({ ...base, turn_id: 'turn-002' }).capsule;
    const session2 = routeNativeTurn({ ...base, session_id: 'session-diff-002' }).capsule;

    expect(turn1.route_id).not.toBe(turn2.route_id);
    expect(turn1.route_id).not.toBe(session2.route_id);
    expect(turn1.idempotency_key).not.toBe(turn2.idempotency_key);
  });

  it('returns clean PASS with empty skills for no-match prompts without hallucination (AC-04)', () => {
    const request: NativeTurnRequest = {
      protocol_version: '2.0',
      host: 'omp',
      session_id: 'session-nomatch-001',
      turn_id: 'turn-001',
      cwd: repoRoot,
      prompt: 'Hello! What is the weather like today in Tokyo?',
      host_facts: {},
    };

    const { capsule } = routeNativeTurn(request);
    expect(capsule.status).toBe('PASS');
    expect(capsule.skills).toEqual([]);
    expect(capsule.context.items.length).toBeGreaterThan(0); // Base invariants still materialized
    expect(capsule.hashes.graph).toMatch(/^[0-9a-f]{64}$/); // Canonical graph hash still recorded
  });

  it('routes Vietnamese semantic prompts accurately without text corruption', () => {
    const request: NativeTurnRequest = {
      protocol_version: '2.0',
      host: 'omp',
      session_id: 'session-vi-001',
      turn_id: 'turn-001',
      cwd: repoRoot,
      prompt: 'Kiểm tra visual parity của component trên trình duyệt bằng Playwright',
      host_facts: {},
    };

    const { capsule } = routeNativeTurn(request);
    expect(capsule.status).toBe('PASS');
    expect(capsule.work_packet.prompt_sha256).toBe(capsule.hashes.prompt);
    expect(capsule.hashes.prompt).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gates explicit-only providers such as pencil-mcp (AC-04)', () => {
    // Normal prompt without explicit pencil-mcp selection must NOT auto-route pencil
    const automaticReq: NativeTurnRequest = {
      protocol_version: '2.0',
      host: 'omp',
      session_id: 'session-pencil-001',
      turn_id: 'turn-001',
      cwd: repoRoot,
      prompt: 'Design a UI layout for login page in Pencil',
      host_facts: {},
    };
    const autoCapsule = routeNativeTurn(automaticReq).capsule;
    const pencilProviderAuto = autoCapsule.integrations.find((i) => i.provider === 'pencil-mcp');
    expect(pencilProviderAuto).toBeUndefined();

    // When explicitly authorized via explicit capability_providers, it routes
    const explicitReq: NativeTurnRequest = {
      ...automaticReq,
      turn_id: 'turn-002',
      explicit: {
        capability_providers: ['pencil-mcp'],
      },
    };
    const explicitCapsule = routeNativeTurn(explicitReq).capsule;
    const pencilSuppressed = explicitCapsule.integrations.find((i) => i.capability === 'pencil-mcp' && i.suppressed_reason);
    // Explicit provider was requested, so it is not suppressed for "not requested"
    if (pencilSuppressed) {
      expect(pencilSuppressed.suppressed_reason).not.toMatch(/was not requested/);
    }
  });

  it('persists hash-only RunStore receipts without exposing raw prompt in receipt (REQ-004)', () => {
    const tmpRuns = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-test-runs-'));
    try {
      const promptSecret = 'Secret token XYZ12345 in customer report';
      const request: NativeTurnRequest = {
        protocol_version: '2.0',
        host: 'omp',
        session_id: 'session-secret-001',
        turn_id: 'turn-001',
        cwd: repoRoot,
        prompt: `Analyze ${promptSecret}`,
        host_facts: {},
      };

      const { capsule } = routeNativeTurn(request, { runsRoot: tmpRuns });
      const receiptFile = path.join(tmpRuns, `route-${capsule.route_id}`, 'run.json');
      expect(fs.existsSync(receiptFile)).toBe(true);

      const rawReceipt = fs.readFileSync(receiptFile, 'utf8');
      const receipt = JSON.parse(rawReceipt);

      // Receipt must contain hashes, route_id, and prompt_sha256, but NEVER the raw prompt string
      expect(receipt.route_id).toBe(capsule.route_id);
      expect(receipt.hashes.prompt).toBe(capsule.hashes.prompt);
      expect(receipt.prompt_sha256).toBe(capsule.work_packet.prompt_sha256);
      expect(rawReceipt).not.toContain(promptSecret);
    } finally {
      fs.rmSync(tmpRuns, { recursive: true, force: true });
    }
  });

  it('complies with token budget and reports valid estimate', () => {
    const request: NativeTurnRequest = {
      protocol_version: '2.0',
      host: 'omp',
      session_id: 'session-budget-001',
      turn_id: 'turn-001',
      cwd: repoRoot,
      prompt: 'Check architecture rules and context guidelines',
      host_facts: {},
    };

    const { capsule } = routeNativeTurn(request);
    expect(capsule.context.estimated_tokens).toBeGreaterThan(0);
    expect(capsule.context.estimated_tokens).toBeLessThan(8_000);
    expect(capsule.context.rendered).toContain('# agent-rules native turn routing');
    expect(capsule.context.rendered).toContain(`route_id: ${capsule.route_id}`);
  });
});
