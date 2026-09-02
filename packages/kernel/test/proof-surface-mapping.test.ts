import { describe, expect, it } from 'vitest';
import { deriveProofTrigger } from '../src/northstar/proof-testing.js';

describe('proof surface mapping (exact lock)', () => {
  it('maps network to process (never "integration" cast as a ProofSurface)', () => {
    const trigger = deriveProofTrigger({ changed_files: [], runtime_surfaces: ['network'] });
    expect(trigger.surfaces).toContain('process');
    expect(trigger.surfaces).not.toContain('integration' as never);
  });

  it('maps host-integration to both process and session', () => {
    const trigger = deriveProofTrigger({ changed_files: [], runtime_surfaces: ['host-integration'] });
    expect(trigger.surfaces).toContain('process');
    expect(trigger.surfaces).toContain('session');
  });

  it('keeps integration/live candidate evidence via the canonical surface mapping', () => {
    const trigger = deriveProofTrigger({ changed_files: [], runtime_surfaces: ['network', 'host-integration'] });
    // process/session surfaces carry integration + live candidate categories
    expect(trigger.candidate_categories).toContain('integration');
    expect(trigger.candidate_categories).toContain('live');
    // runtime/live fidelity is never downgraded to static
    expect(trigger.required_fidelity).toBe('live');
  });

  it('never uses the raw evidence-category "integration" as a change surface', () => {
    const trigger = deriveProofTrigger({ changed_files: [], runtime_surfaces: ['network'] });
    for (const surface of trigger.surfaces) {
      expect(['feature','bugfix','refactor','source','dependency','schema','migration','api','backend','frontend','browser','accessibility','mcp','desktop','process','session','workspace','security','performance','concurrency','build','package','install','release','qa','verification','parity','regression','test','claim-evidence','other']).toContain(surface);
    }
  });

  it('escalates fidelity for live claim surfaces', () => {
    expect(deriveProofTrigger({ changed_files: ['src/x.ts'], runtime_surfaces: ['desktop'] }).required_fidelity).toBe('live');
  });
});
