import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { assertWorkLedger } from '../src/contracts.js';
import { migrateLegacyLedger } from '../src/ledger-migration.js';

function sha(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function legacyFixture() {
  const originalText = [
    '# Legacy plan',
    '',
    '## P0',
    'Keep the original plan immutable.',
    '## P1',
    'Migrate the context without losing live claims.',
    '',
  ].join('\n');
  const originalBytes = new TextEncoder().encode(originalText);
  const planSha = sha(originalBytes);
  const anchor = (sectionHeading: string, lineStart: number, lineEnd: number, requirementId: string) => ({
    plan_sha256: planSha,
    section_heading: sectionHeading,
    line_start: lineStart,
    line_end: lineEnd,
    anchor_text_sha256: sha(originalText.split('\n').slice(lineStart - 1, lineEnd).map((line) => `${line}\n`).join('')),
    requirement_id: requirementId,
  });
  return {
    originalBytes,
    legacy: {
      schema_version: '1.0',
      plan_id: 'legacy-plan',
      status: 'ADOPTED',
      execution_state: 'NEEDS_REMEDIATION',
      original_plan: {
        path: '.agent/plans/legacy-plan/original.md',
        sha256: planSha,
        bytes: originalBytes.byteLength,
        source_kind: 'assistant_proposed_plan_raw_body_including_terminal_lf',
        source_captured_at: '2026-07-30T00:00:00.000Z',
      },
      repository_baseline: { commit: 'a'.repeat(40), branch: 'legacy/main', status: [] },
      execution_authorization: { message_id: 'owner-decision-1' },
      plan_anchors: [
        anchor('P0', 3, 4, 'REQ-001'),
        anchor('P1', 5, 6, 'REQ-002'),
      ],
      assignments: [{
        assignment_id: 'ASN-1',
        task_id: 'T-1',
        owner: 'legacy-worker',
        owned_paths: ['packages/engine/src'],
        acceptance_criteria: ['original bytes preserved', 'independent review'],
        plan_anchor_requirement_id: 'REQ-001',
      }],
      batches: [{ batch_id: 'P0', status: 'PARTIAL', anchor_requirement_id: 'REQ-001' }],
      amendments: [{
        amendment_id: 'AM-0001',
        status: 'OWNER_APPROVED_EFFECTIVE',
        path: '.agent/plans/legacy-plan/amendments/0001.md',
        sha256: 'b'.repeat(64),
      }],
      findings: [],
    },
  };
}

describe('legacy ledger migration', () => {
  it('exposes the adapter through the public package subpath', async () => {
    const exported = await import('@initforge/agent-rules-engine/ledger-migration');
    expect(exported.migrateLegacyLedger).toBeTypeOf('function');
  });

  it('creates a deterministic canonical ledger without promoting evidence', () => {
    const fixture = legacyFixture();
    const input = {
      legacy: fixture.legacy,
      originalBytes: fixture.originalBytes,
      ownerIdentity: 'owner:test',
      authorIdentity: 'author:test',
      hostTask: { host: 'migration', taskRef: 'task-1', sessionRef: 'session-1' },
      sourceKind: 'chat_plan_artifact',
    } as const;
    const first = migrateLegacyLedger(input);
    const second = migrateLegacyLedger(input);

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.ledger).toEqual(second.ledger);
    expect(first.ledger.status).toBe('needs-remediation');
    expect(first.ledger.attestations).toEqual([]);
    expect(first.ledger.receipts).toEqual([]);
    expect(first.ledger.verificationClaims).toEqual([]);
    expect(first.ledger.reconciliations).toEqual([]);
    expect(first.ledger.plan.original.sha256).toBe(sha(fixture.originalBytes));
    expect(first.ledger.amendments).toEqual([{
      amendmentId: 'AM-0001',
      approved: true,
      sha256: 'b'.repeat(64),
      sourceRef: '.agent/plans/legacy-plan/amendments/0001.md',
    }]);
    expect(first.ledger.plan.requirements.map((item) => item.requirementId)).toEqual(['REQ-001', 'REQ-002']);
    expect(first.ledger.plan.taskDag).toHaveLength(2);
    expect(first.ledger.repairSlices[0].status).toBe('PENDING');
    expect(first.ledger.legacyMigration.nonPromotedFields).toContain('ci_checks');
    expect(first.shadows['tasks.md']).toBeInstanceOf(Uint8Array);
    assertWorkLedger(first.ledger, first.originalBytes, first.shadows);
  });

  it('rejects a legacy anchor that is not physically bound to original bytes', () => {
    const fixture = legacyFixture();
    fixture.legacy.plan_anchors[0].anchor_text_sha256 = 'c'.repeat(64);
    expect(() => migrateLegacyLedger({
      legacy: fixture.legacy,
      originalBytes: fixture.originalBytes,
      ownerIdentity: 'owner:test',
      authorIdentity: 'author:test',
      hostTask: { host: 'migration', taskRef: 'task-1', sessionRef: 'session-1' },
      sourceKind: 'chat_plan_artifact',
    })).toThrow(/anchor bytes do not match/);
  });

  it('rejects an amendment without explicit approval', () => {
    const fixture = legacyFixture();
    fixture.legacy.amendments[0].status = 'PENDING';
    expect(() => migrateLegacyLedger({
      legacy: fixture.legacy,
      originalBytes: fixture.originalBytes,
      ownerIdentity: 'owner:test',
      authorIdentity: 'author:test',
      hostTask: { host: 'migration', taskRef: 'task-1', sessionRef: 'session-1' },
      sourceKind: 'chat_plan_artifact',
    })).toThrow(/not explicitly approved/);
  });

  it('does not promote a legacy completed batch or resolved finding', () => {
    const fixture = legacyFixture();
    fixture.legacy.batches[0].status = 'COMPLETE_BOOTSTRAP';
    fixture.legacy.findings = [{ finding_id: 'F-1', status: 'RESOLVED', path: 'src/legacy.ts' }];
    const result = migrateLegacyLedger({
      legacy: fixture.legacy,
      originalBytes: fixture.originalBytes,
      ownerIdentity: 'owner:test',
      authorIdentity: 'author:test',
      hostTask: { host: 'migration', taskRef: 'task-1', sessionRef: 'session-1' },
      sourceKind: 'chat_plan_artifact',
    });

    expect(result.ledger.batches).toEqual([{ batchId: 'P0', status: 'BLOCKED', taskIds: ['MIG-T-1'] }]);
    expect(result.ledger.orphanFindings.find((finding) => finding.findingId === 'F-1')).toMatchObject({ status: 'OPEN' });
    expect(result.ledger.status).toBe('needs-remediation');
    assertWorkLedger(result.ledger, result.originalBytes, result.shadows);
  });

  it('rejects unsupported source classification rather than guessing it', () => {
    const fixture = legacyFixture();
    expect(() => migrateLegacyLedger({
      legacy: fixture.legacy,
      originalBytes: fixture.originalBytes,
      ownerIdentity: 'owner:test',
      authorIdentity: 'author:test',
      hostTask: { host: 'migration', taskRef: 'task-1', sessionRef: 'session-1' },
    })).toThrow(/provide sourceKind explicitly/);
  });

  it('rejects fabricated legacy approval and duplicate canonical task IDs', () => {
    const fixture = legacyFixture();
    delete fixture.legacy.execution_authorization.message_id;
    expect(() => migrateLegacyLedger({
      legacy: fixture.legacy,
      originalBytes: fixture.originalBytes,
      ownerIdentity: 'owner:test',
      authorIdentity: 'author:test',
      hostTask: { host: 'migration', taskRef: 'task-1', sessionRef: 'session-1' },
      sourceKind: 'chat_plan_artifact',
    })).toThrow(/execution_authorization.message_id/);

    const duplicate = legacyFixture();
    duplicate.legacy.assignments.push({ ...duplicate.legacy.assignments[0], assignment_id: 'ASN-2', task_id: 'T 1' });
    expect(() => migrateLegacyLedger({
      legacy: duplicate.legacy,
      originalBytes: duplicate.originalBytes,
      ownerIdentity: 'owner:test',
      authorIdentity: 'author:test',
      hostTask: { host: 'migration', taskRef: 'task-1', sessionRef: 'session-1' },
      sourceKind: 'chat_plan_artifact',
    })).toThrow(/duplicate canonical task ID/);
  });
});
