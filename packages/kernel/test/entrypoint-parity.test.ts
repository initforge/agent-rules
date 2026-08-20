import { describe, expect, it } from 'vitest';
import {
  assertEntrypointParityReceipt,
  assertWorkRequest,
  compileWorkRequestEntrypoint,
} from '../src/northstar/protocol.js';

describe('canonical WorkRequest entrypoint compilation', () => {
  const intent = 'Goal: Build a portable harness\nConstraint: Never weaken verification';

  it('compiles the same prompt from every adapter with identical semantic identity', () => {
    const adapters = ['conversation', 'command', 'cli', 'api', 'native_host'] as const;
    const receipts = adapters.map((adapter) => compileWorkRequestEntrypoint({ adapter, intent }));
    for (const receipt of receipts) {
      assertEntrypointParityReceipt(receipt);
      assertWorkRequest(receipt.request);
      expect(receipt.request.adapter).toBe(receipt.adapter);
      expect(receipt.request.raw_intent).toBe(intent);
    }
    const semantic = new Set(receipts.map((receipt) => receipt.semantic_sha256));
    const workIds = new Set(receipts.map((receipt) => receipt.work_id));
    expect(semantic.size).toBe(1);
    expect(workIds.size).toBe(1);
    expect(receipts[0].semantic_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps adapter identity distinct while preserving semantic parity', () => {
    const conversation = compileWorkRequestEntrypoint({ adapter: 'conversation', intent });
    const command = compileWorkRequestEntrypoint({ adapter: 'command', intent });
    expect(conversation.adapter).toBe('conversation');
    expect(command.adapter).toBe('command');
    expect(conversation.semantic_sha256).toBe(command.semantic_sha256);
    expect(conversation.receipt_sha256).not.toBe(command.receipt_sha256);
  });

  it('normalizes empty constraint lists and whitespace intent for parity', () => {
    const explicit = compileWorkRequestEntrypoint({ adapter: 'cli', intent: `  ${intent}  `, explicit_constraints: [] });
    const implicit = compileWorkRequestEntrypoint({ adapter: 'conversation', intent });
    expect(explicit.semantic_sha256).toBe(implicit.semantic_sha256);
  });

  it('distinguishes materially different payloads', () => {
    const base = compileWorkRequestEntrypoint({ adapter: 'conversation', intent });
    const constrained = compileWorkRequestEntrypoint({ adapter: 'conversation', intent, explicit_constraints: ['extra'] });
    expect(constrained.semantic_sha256).not.toBe(base.semantic_sha256);
  });

  it('binds an optional plan id without changing the semantic fingerprint', () => {
    const unbound = compileWorkRequestEntrypoint({ adapter: 'conversation', intent });
    const bound = compileWorkRequestEntrypoint({ adapter: 'conversation', intent, plan_id: 'harness-universal-reconciliation-v1' });
    expect(bound.plan_id).toBe('harness-universal-reconciliation-v1');
    expect(bound.semantic_sha256).toBe(unbound.semantic_sha256);
    expect(bound.work_id).toBe(unbound.work_id);
  });

  it('fails closed on invalid adapters and empty intent', () => {
    expect(() => compileWorkRequestEntrypoint({ adapter: 'unknown' as never, intent })).toThrow(/adapter is invalid/);
    expect(() => compileWorkRequestEntrypoint({ adapter: 'conversation', intent: '   ' })).toThrow(/non-empty string/);
  });

  it('rejects a receipt whose hash or adapter drifted', () => {
    const receipt = compileWorkRequestEntrypoint({ adapter: 'conversation', intent });
    expect(() => assertEntrypointParityReceipt({ ...receipt, receipt_sha256: 'a'.repeat(64) })).toThrow(/hash mismatch/);
    expect(() => assertEntrypointParityReceipt({ ...receipt, adapter: 'command' })).toThrow(/adapter drift/);
  });
});
