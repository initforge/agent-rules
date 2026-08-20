import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TelemetryCollector, DEFAULT_CONFIG, type TelemetryEvent } from '../src/telemetry.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function storagePath(...parts: string[]): string {
  return path.join(tmpDir, ...parts);
}

// ─── attestation_collected event shape ───────────────────────────────────────

const VALID_ATTESTATION: TelemetryEvent = {
  kind: 'attestation_collected',
  host: 'codex',
  commitSha: 'a'.repeat(40), // SHA-1
  attestationType: 'native',
  evidenceHash: 'b'.repeat(64), // SHA-256
  verified: true,
};

describe('attestation_collected', () => {
  it('accepts valid native attestation event (SHA-1 commit)', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t1.jsonl'));
    expect(() => collector.record(VALID_ATTESTATION)).not.toThrow();
  });

  it('accepts valid functional attestation event (SHA-256 commit)', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t2.jsonl'));
    const event: TelemetryEvent = {
      kind: 'attestation_collected',
      host: 'grok',
      commitSha: 'c'.repeat(64), // SHA-256
      attestationType: 'functional',
      evidenceHash: 'd'.repeat(64),
      verified: false,
    };
    expect(() => collector.record(event)).not.toThrow();
  });

  it('rejects empty host', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t3.jsonl'));
    const event: TelemetryEvent = { ...VALID_ATTESTATION, host: '' };
    expect(() => collector.record(event)).toThrow('host is required non-empty string');
  });

  it('rejects whitespace-only host', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t4.jsonl'));
    const event: TelemetryEvent = { ...VALID_ATTESTATION, host: '   ' };
    expect(() => collector.record(event)).toThrow('host is required non-empty string');
  });

  it('rejects commitSha shorter than 40 hex', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t5.jsonl'));
    const event: TelemetryEvent = { ...VALID_ATTESTATION, commitSha: 'abc123' };
    expect(() => collector.record(event)).toThrow('commitSha must be a git SHA');
  });

  it('rejects commitSha longer than 64 hex', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t6.jsonl'));
    const event: TelemetryEvent = { ...VALID_ATTESTATION, commitSha: 'a'.repeat(65) };
    expect(() => collector.record(event)).toThrow('commitSha must be a git SHA');
  });

  it('rejects non-hex commitSha', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t7.jsonl'));
    const event: TelemetryEvent = { ...VALID_ATTESTATION, commitSha: 'g'.repeat(40) };
    expect(() => collector.record(event)).toThrow('commitSha must be a git SHA');
  });

  it('rejects invalid attestationType', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t8.jsonl'));
    const event: TelemetryEvent = { ...VALID_ATTESTATION, attestationType: 'unknown' as 'native' | 'functional' };
    expect(() => collector.record(event)).toThrow("attestationType must be 'native' or 'functional'");
  });

  it('rejects evidenceHash shorter than 64 hex', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t9.jsonl'));
    const event: TelemetryEvent = { ...VALID_ATTESTATION, evidenceHash: 'b'.repeat(63) };
    expect(() => collector.record(event)).toThrow('evidenceHash must be a SHA-256');
  });

  it('rejects non-hex evidenceHash', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t10.jsonl'));
    const event: TelemetryEvent = { ...VALID_ATTESTATION, evidenceHash: 'z'.repeat(64) };
    expect(() => collector.record(event)).toThrow('evidenceHash must be a SHA-256');
  });

  it('rejects non-boolean verified', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t11.jsonl'));
    const event = { ...VALID_ATTESTATION, verified: 'yes' as unknown as boolean };
    expect(() => collector.record(event as TelemetryEvent)).toThrow('verified must be a boolean');
  });

  it('records attested event with correct metadata', async () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('t12.jsonl'));
    collector.record(VALID_ATTESTATION);
    await collector.flush();
    const stored = JSON.parse(fs.readFileSync(storagePath('t12.jsonl'), 'utf-8').trim());
    expect(stored.event.kind).toBe('attestation_collected');
    expect(stored.event.host).toBe('codex');
    expect(stored.event.commitSha).toBe('a'.repeat(40));
    expect(stored.event.attestationType).toBe('native');
    expect(stored.event.evidenceHash).toBe('b'.repeat(64));
    expect(stored.event.verified).toBe(true);
    expect(stored.metadataOnly).toBe(true); // rawContentEnabled=false by default
  });
});

// ─── Trust boundary: raw/prompt payload rejection ─────────────────────────────

const FORBIDDEN_KEYS = ['rawContent', 'rawPrompt', 'raw', 'prompt', 'messages', 'payload'] as const;

describe('trust boundary: raw/prompt payload rejection', () => {
  for (const forbidden of FORBIDDEN_KEYS) {
    it(`rejects event with forbidden key '${forbidden}'`, () => {
      const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath(`tb-${forbidden}.jsonl`));
      const badEvent = { kind: 'attestation_collected', host: 'codex', commitSha: 'a'.repeat(40), attestationType: 'native', evidenceHash: 'b'.repeat(64), verified: true, [forbidden]: 'sensitive data' } as unknown as TelemetryEvent;
      expect(() => collector.record(badEvent)).toThrow(`raw/prompt payload key '${forbidden}' rejected`);
    });
  }

  it('rejects raw/prompt on other event kinds', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('tb-other.jsonl'));
    const badEvent = { kind: 'run_start', runId: 'r1', planId: 'p1', host: 'x', model: 'gpt-4', effort: 'medium', rawContent: 'leaked' } as unknown as TelemetryEvent;
    expect(() => collector.record(badEvent)).toThrow("raw/prompt payload key 'rawContent' rejected");
  });

  it('other event kinds are unaffected when no forbidden keys present', () => {
    const collector = new TelemetryCollector(DEFAULT_CONFIG, storagePath('tb-clean.jsonl'));
    const cleanEvent: TelemetryEvent = { kind: 'run_start', runId: 'r2', planId: 'p2', host: 'x', model: 'claude', effort: 'low' };
    expect(() => collector.record(cleanEvent)).not.toThrow();
  });
});
