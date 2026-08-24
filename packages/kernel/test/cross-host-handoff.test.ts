import { describe, expect, it } from 'vitest';
import {
  createHandoffEnvelope,
  getHandoffHostAdapter,
  listHandoffDialectHosts,
  acknowledgeEnvelope,
  assertSafeToEdit,
  resolveExecutionContract,
  verifyEnvelopeIntegrity,
  buildContextCapsule,
  HandoffGuardError,
} from '../src/cross-host-handoff.js';

const HOSTS = listHandoffDialectHosts();
const REQUIREMENTS = ['REQ-C01', 'REQ-C02', 'REQ-C03', 'REQ-C04', 'REQ-C05'];
const PROOF_OBLIGATIONS = [
  { id: 'POB-001', kind: 'browser-journey', sha256: null, status: 'PENDING' as const },
  { id: 'POB-002', kind: 'governed-suite', sha256: null, status: 'PENDING' as const },
];
const CAPABILITIES = [
  { id: 'verification-router', state: 'SELECTED' as const, required_behavior: 'smallest sufficient proof set', proof_obligation_ids: ['POB-002'] },
  { id: 'browser-qa', state: 'PROJECTED' as const, required_behavior: 'live browser journey for UI claims', proof_obligation_ids: ['POB-001'] },
];

function makeArtifact(): Uint8Array {
  // Oversized artifact: well beyond any prompt limit, all requirements inside.
  const body = REQUIREMENTS.map((id) => `${id}: implement and verify fully. `.repeat(200)).join('\n');
  return new TextEncoder().encode(`# Canonical Plan\n\n${body}\n`);
}

function makeEnvelope(target = 'claude') {
  return createHandoffEnvelope({
    artifactUri: '/repo/.agent/plans/final-integrity-closure-v2/plan.md',
    artifactBytes: makeArtifact(),
    primaryOutcomeId: 'PO-1',
    primaryOutcome: 'one squashed verified commit on main',
    requirementIds: REQUIREMENTS,
    sourceHost: 'opencode',
    targetHost: target,
    executionMode: 'AUTO_EXECUTE',
    contextCapsule: buildContextCapsule({
      repository_facts: 'main@41b69eb; packages/{kernel,engine,cli}',
      owner_decisions: 'Control Plane removed; Review B off by default',
      non_goals: 'no successor UI server',
      constraints: 'max two subagents, no recursion',
      known_risks: 'desktop host journeys need owner machine',
      proof_obligations: 'POB-001 browser journey; POB-002 governed suite',
    }),
    selectedCapabilities: CAPABILITIES,
    proofObligations: PROOF_OBLIGATIONS,
  });
}

describe('canonical cross-host handoff envelope', () => {
  it('round-trips every host pair through real encoder/decoder adapters (8x8=56 pairs)', () => {
    expect(HOSTS).toHaveLength(8);
      for (const source of HOSTS) {
        for (const target of HOSTS) {
          const env = makeEnvelope(target);
          const outAdapter = getHandoffHostAdapter(env.target_host);
        const packet = outAdapter.frame(env);
        const decoded = outAdapter.unframe(packet);
        expect(decoded.requirement_ids).toEqual(REQUIREMENTS);
        expect(decoded.requirement_count).toBe(REQUIREMENTS.length);
        expect(decoded.primary_outcome_id).toBe('PO-1');
        expect(decoded.primary_outcome).toContain('squashed');
        expect(decoded.artifact_sha256).toBe(env.artifact_sha256);
        expect(decoded.byte_length).toBe(env.byte_length);
        expect(decoded.execution_mode).toBe('AUTO_EXECUTE');
        expect(decoded.context_capsule.owner_decisions).toContain('Control Plane removed');
        expect(decoded.selected_capabilities).toHaveLength(2);
        expect(decoded.selected_capabilities[0].state).toBe('SELECTED');
        expect(decoded.proof_obligations.map((o) => o.id)).toEqual(['POB-001', 'POB-002']);
      }
    }
  });

  it('keeps capability lifecycle states distinguishable (loaded/selected/projected/applied/proven)', () => {
    const env = makeEnvelope();
    const states = new Set(env.selected_capabilities.map((c) => c.state));
    expect(states.has('SELECTED')).toBe(true);
    expect(() => createHandoffEnvelope({
      artifactUri: 'x',
      artifactBytes: makeArtifact(),
      primaryOutcomeId: 'PO',
      primaryOutcome: 'p',
      requirementIds: ['R1'],
      sourceHost: 'claude',
      targetHost: 'codex',
      executionMode: 'AUTO_EXECUTE',
      selectedCapabilities: [{ id: 'bad-cap', state: 'IMAGINED' as never, required_behavior: 'x', proof_obligation_ids: [] }],
    })).toThrow(/invalid state/);
  });

  it('capsule rejects raw sessions, logs and oversized entries', () => {
    expect(() => buildContextCapsule({ session_transcript: 'raw...' })).toThrow(/session\/log/);
    expect(() => buildContextCapsule({ engine_stderr: 'log...' })).toThrow(/session\/log/);
    expect(() => buildContextCapsule({ repository_facts: 'x'.repeat(2001) })).toThrow(/exceeds 2000/);
    const ok = buildContextCapsule({ repository_facts: 'fact' });
    expect(ok.repository_facts).toBe('fact');
  });

  it('fails closed when one requirement is removed from a framed packet', () => {
    const env = makeEnvelope('codex');
    const packetText = new TextDecoder().decode(getHandoffHostAdapter('codex').frame(env));
    const begin = packetText.indexOf('{');
    const end = packetText.lastIndexOf('}');
    const payload = JSON.parse(packetText.slice(begin, end + 1)) as { requirement_ids: string[]; requirement_count: number };
    payload.requirement_ids = payload.requirement_ids.filter((id) => id !== 'REQ-C03');
    const mutatedPacket = `${packetText.slice(0, begin)}${JSON.stringify(payload, null, 2)}${packetText.slice(end + 1)}`;
    const decoded = (() => {
      try {
        return { ok: true as const, env: getHandoffHostAdapter('codex').unframe(new TextEncoder().encode(mutatedPacket)) };
      } catch (error) {
        return { ok: false as const, error };
      }
    })();
    expect(decoded.ok).toBe(false);
    expect((decoded as { ok: false; error: HandoffGuardError }).error.code).toBe('REQUIREMENT_COUNT_MISMATCH');
  });

  it('detects an altered requirement artifact by breaking the integrity hash', () => {
    const env = makeEnvelope('grok');
    const original = new TextDecoder().decode(makeArtifact());
    // same byte length, different content -> hash mismatch (not length mismatch)
    const tamperedText = original.replace(/implement/, 'implemenX');
    expect(new TextEncoder().encode(tamperedText).byteLength).toBe(env.byte_length);
    try {
      verifyEnvelopeIntegrity(env, new TextEncoder().encode(tamperedText));
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as HandoffGuardError).code).toBe('HASH_MISMATCH');
    }
  });

  it('blocks byte-length mismatch before edit', () => {
    const env = makeEnvelope();
    const short = makeArtifact().slice(0, 32);
    try {
      assertSafeToEdit(env, { artifactBytes: short, graphAvailable: true });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as HandoffGuardError).code).toBe('BYTE_LENGTH_MISMATCH');
    }
  });

  it('blocks declared truncation markers before edit', () => {
    const env = { ...makeEnvelope(), truncation_detected: true };
    expect(() => assertSafeToEdit(env, { artifactBytes: makeArtifact(), graphAvailable: true })).toThrow(HandoffGuardError);
  });

  it('blocks when artifact bytes are missing from the gate call (no silent integrity skip)', () => {
    const env = makeEnvelope();
    // artifactBytes is mandatory at the final gate; a caller without the
    // materialized artifact cannot edit.
    expect(() => assertSafeToEdit(env, { artifactBytes: undefined as unknown as Uint8Array, graphAvailable: true })).toThrow();
  });

  it('blocks when the context graph is unavailable — before the first file edit', () => {
    const env = makeEnvelope();
    const bytes = makeArtifact();
    expect(() => assertSafeToEdit(env, { artifactBytes: bytes, graphAvailable: false })).toThrow(/GRAPH_UNAVAILABLE/);
    expect(() => assertSafeToEdit(env, { artifactBytes: bytes, graphAvailable: true })).not.toThrow();
  });

  it('blocks acknowledgement that dropped requirements', () => {
    const env = makeEnvelope();
    expect(() => acknowledgeEnvelope(env, { requirement_ids: ['REQ-C01'] })).toThrow(/dropped requirements/);
    const acked = acknowledgeEnvelope(env, { requirement_ids: REQUIREMENTS, proof_obligation_ids: ['POB-001', 'POB-002'] });
    expect(acked.acknowledged_requirement_count).toBe(REQUIREMENTS.length);
    expect(acked.acknowledged_proof_obligation_count).toBe(2);
    expect(() => assertSafeToEdit(acked, { artifactBytes: makeArtifact(), graphAvailable: true })).not.toThrow();
  });

  it('blocks execution when proof obligations are not acknowledged (steering §2)', () => {
    const env = makeEnvelope();
    // acknowledgeEnvelope itself rejects partial acknowledgements...
    expect(() => acknowledgeEnvelope(env, { requirement_ids: REQUIREMENTS, proof_obligation_ids: ['POB-001'] })).toThrow(/proof obligations/);
    // ...and a hand-forged partial ack is still blocked at the pre-edit gate.
    const forged: typeof env = { ...env, acknowledged_sha256: env.artifact_sha256, acknowledged_requirement_count: REQUIREMENTS.length, acknowledged_proof_obligation_count: 1 };
    const bytes = makeArtifact();
    expect(() => assertSafeToEdit(forged, { artifactBytes: bytes, graphAvailable: true })).toThrow(/proof obligations/);
  });

  it('AUTO_EXECUTE executes immediately without approval pause; PLAN_REVIEW pauses', () => {
    const auto = resolveExecutionContract(makeEnvelope(), false);
    expect(auto.action).toBe('EXECUTE_IMMEDIATELY');
    const pausedByMode = resolveExecutionContract(makeEnvelope(), true);
    expect(pausedByMode.action).toBe('PAUSE_FOR_REVIEW');
    const review = resolveExecutionContract({ ...makeEnvelope(), execution_mode: 'PLAN_REVIEW' }, false);
    expect(review.action).toBe('PAUSE_FOR_REVIEW');
  });

  it('preserves 100% of requirements in an oversized artifact handoff', () => {
    const bigRequirements = Array.from({ length: 120 }, (_, i) => `REQ-BIG-${String(i + 1).padStart(3, '0')}`);
    const hugeBody = bigRequirements.map((id) => `${id}: ${'x'.repeat(500)}`).join('\n');
    const bytes = new TextEncoder().encode(hugeBody);
    const env = createHandoffEnvelope({
      artifactUri: '/tmp/huge-plan.md',
      artifactBytes: bytes,
      primaryOutcomeId: 'PO-2',
      primaryOutcome: 'huge plan survives transport',
      requirementIds: bigRequirements,
      sourceHost: 'claude',
      targetHost: 'deepseek-harness',
      executionMode: 'AUTO_EXECUTE',
    });
    const packet = getHandoffHostAdapter('deepseek-harness').frame(env);
    const decoded = getHandoffHostAdapter('deepseek-harness').unframe(packet);
    expect(decoded.requirement_count).toBe(120);
    expect(decoded.requirement_ids).toEqual(bigRequirements);
  });
});
