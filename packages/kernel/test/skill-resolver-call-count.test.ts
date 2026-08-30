import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { CapabilityBroker, createStandardCapabilityBroker } from '../src/northstar/routing.js';
import { routeNativeTurn } from '../src/northstar/native-turn-router.js';
import type { NativeTurnRequest } from '../src/northstar/native-turn-router.js';

describe('skill resolver call count', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  it('resolves skills exactly once per native turn', async () => {
    const resolveSkillsSpy = vi.spyOn(CapabilityBroker.prototype, 'resolveSkills');

    try {
      const request: NativeTurnRequest = {
        host: 'omp',
        session_id: 'SES-CALL-COUNT-1',
        turn_id: 'TRN-CALL-COUNT-1',
        cwd: repoRoot,
        prompt: 'Refactor postgres query and database tooling',
        protocol_version: '2.0',
      };

      const initialCalls = resolveSkillsSpy.mock.calls.length;

      const result = routeNativeTurn(request);

      const finalCalls = resolveSkillsSpy.mock.calls.length;
      const turnCalls = finalCalls - initialCalls;

      // Must be called exactly ONCE for the executable packet generation
      expect(turnCalls).toBe(1);
      expect(result.capsule.skills.length).toBeGreaterThan(0);
      expect(result.capsule.skills[0]?.id).toBe('database-stack');
    } finally {
      resolveSkillsSpy.mockRestore();
    }
  });

  it('uses CapabilityBroker.route as the single resolver gateway', () => {
    const resolveSkillsSpy = vi.spyOn(CapabilityBroker.prototype, 'resolveSkills');

    try {
      const broker = createStandardCapabilityBroker(repoRoot);
      const initialCalls = resolveSkillsSpy.mock.calls.length;

      const routed = broker.route({ prompt: 'Perform security review and auth boundary analysis on token middleware' });

      const finalCalls = resolveSkillsSpy.mock.calls.length;
      expect(finalCalls - initialCalls).toBe(1);
      expect(routed.skills.length).toBeGreaterThan(0);
      expect(routed.skills[0]?.id).toBe('security-review');
    } finally {
      resolveSkillsSpy.mockRestore();
    }
  });
});
