/**
 * REQ-012/REQ-013 — 5fedu deterministic activation and disclosure.
 * Activation is explicit-only; the reference broker returns a receipt and the
 * renderer appends the short footer ONLY when a reference was actually
 * consumed. No "intent detected", no "template checked", no banner without a
 * receipt.
 */
import { describe, it, expect } from 'vitest';
import { consumeDomainReference, deriveComponentFromPath, renderDomainReferenceFooters, type DomainReferenceReceipt } from '../../src/northstar/domain-packs.js';

describe('REQ-013 — reference receipts and footer disclosure', () => {
  function receipt(over: Partial<DomainReferenceReceipt> = {}): DomainReferenceReceipt {
    return {
      schema: 'agent-rules/domain-reference-receipt',
      version: 1,
      pack_id: '5fedu',
      manifest_id: 'd0c004b0181f609050630520210914e45e8a966687e3c158c190cb1690647d8b',
      path: 'features/he-thong/chuc-vu/core/types.ts',
      sha256: 'a'.repeat(64),
      component: 'he-thong/chuc-vu',
      consumed_at: '2026-08-19T00:00:00Z',
      ...over,
    };
  }

  it('renders the short footer with component, anchor and short hash when consumed', () => {
    const footer = renderDomainReferenceFooters([receipt({ anchor: 'PositionFieldMeta' })]);
    expect(footer).toContain('5fedu reference used: he-thong/chuc-vu');
    expect(footer).toContain('features/he-thong/chuc-vu/core/types.ts#PositionFieldMeta');
    expect(footer).toContain(`sha256:${'a'.repeat(12)}`);
  });

  it('renders nothing (empty string) when no receipt was consumed', () => {
    expect(renderDomainReferenceFooters([])).toBe('');
  });

  it('never emits banner strings or "template checked"', () => {
    const footer = renderDomainReferenceFooters([receipt()]);
    expect(footer).not.toContain('template checked');
    expect(footer).not.toContain('intent detected');
    expect(footer).not.toContain('Domain pack activated');
  });

  it('deduplicates identical reference receipts', () => {
    const footer = renderDomainReferenceFooters([receipt(), receipt()]);
    expect(footer.match(/5fedu reference used/g)).toHaveLength(1);
  });

  it('derives a component label from the first two path segments', () => {
    expect(deriveComponentFromPath('features/he-thong/chuc-vu/core/types.ts')).toBe('features/he-thong');
    expect(deriveComponentFromPath('lib/utils.ts')).toBe('lib/utils.ts');
    expect(deriveComponentFromPath('components/auth/Can.tsx')).toBe('components/auth');
  });
});

describe('REQ-012 — activation stays explicit', () => {
  it('the canonical activation field is explicit-project-profile', async () => {
    const fs = await import('node:fs');
    const pack = JSON.parse(fs.readFileSync(new URL('../../../../profiles/5fedu/domain-pack.json', import.meta.url), 'utf8')) as { activation: string };
    expect(pack.activation).toBe('explicit-project-profile');
  });
});
