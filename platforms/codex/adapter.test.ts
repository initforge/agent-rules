import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir } from 'node:fs/promises';
import {
  codexAdapter,
  HOST_UNOBSERVABLE,
  parseModelEvidence,
  validateCapsule,
} from './adapter.js';

let homeDir: string;
let savedHome: string | undefined;

beforeEach(async () => {
  homeDir = await mkdtemp(path.join(os.tmpdir(), 'codex-adapter-test-'));
  await mkdir(homeDir, { recursive: true });
  savedHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = homeDir;
});

afterEach(() => {
  if (savedHome !== undefined) process.env.CODEX_HOME = savedHome;
  else delete process.env.CODEX_HOME;
});

describe('codex adapter — model evidence triple', () => {
  it('1. HOST_UNOBSERVABLE is exported and deterministic', () => {
    expect(HOST_UNOBSERVABLE).toBe('HOST_UNOBSERVABLE');
    expect(typeof HOST_UNOBSERVABLE).toBe('string');
  });

  it('2. parseModelEvidence returns HOST_UNOBSERVABLE for all slots when host exposes nothing', () => {
    const evidence = parseModelEvidence('some codex stdout', undefined);
    expect(evidence).toEqual({
      requested: HOST_UNOBSERVABLE,
      resolved: HOST_UNOBSERVABLE,
      observed: HOST_UNOBSERVABLE,
    });
  });

  it('3. parseModelEvidence records requested when provided, never fabricates resolved/observed', () => {
    const evidence = parseModelEvidence('{}', 'gpt-4o');
    expect(evidence.requested).toBe('gpt-4o');
    expect(evidence.resolved).toBe(HOST_UNOBSERVABLE);
    expect(evidence.observed).toBe(HOST_UNOBSERVABLE);
  });

  it('4. evidence triple is deterministic across calls', () => {
    const a = parseModelEvidence('stdout-a', 'model-x');
    const b = parseModelEvidence('stdout-b', 'model-x');
    expect(a).toEqual(b);
  });
});

describe('codex adapter — bounded capsule schema validation', () => {
  it('5. validateCapsule accepts a valid capsule', () => {
    const result = validateCapsule({ task: 'run tests', rules: ['a'], model: 'gpt-4o' });
    expect(result.valid).toBe(true);
  });

  it('6. validateCapsule rejects null and undefined (fail closed)', () => {
    expect(validateCapsule(null).valid).toBe(false);
    expect(validateCapsule(undefined).valid).toBe(false);
  });

  it('7. validateCapsule rejects non-object input', () => {
    expect(validateCapsule('string').valid).toBe(false);
    expect(validateCapsule(42).valid).toBe(false);
    expect(validateCapsule([1, 2]).valid).toBe(false);
  });

  it('8. validateCapsule rejects unknown top-level fields (bounded schema)', () => {
    const result = validateCapsule({ task: 'x', evil: 'payload' });
    expect(result.valid).toBe(false);
    if (result.error) expect(result.error).toContain('unknown field');
  });

  it('9. validateCapsule rejects wrong types for known fields', () => {
    expect(validateCapsule({ task: 42 }).valid).toBe(false);
    expect(validateCapsule({ rules: 'not-array' }).valid).toBe(false);
    expect(validateCapsule({ model: 42 }).valid).toBe(false);
  });

  it('10. validateCapsule accepts empty object (all fields optional)', () => {
    expect(validateCapsule({}).valid).toBe(true);
  });
});

describe('codex adapter — stage/activate fail closed', () => {
  it('11. stage throws on malformed staging input, writes nothing', async () => {
    await expect(codexAdapter.stage({ evil: true })).rejects.toThrow(/stage rejected/);
    const stagingDir = path.join(homeDir, 'staging');
    expect(fs.existsSync(path.join(stagingDir, 'activation-capsule.json'))).toBe(false);
  });

  it('12. stage throws on non-object staging input', async () => {
    await expect(codexAdapter.stage('plain string')).rejects.toThrow(/stage rejected/);
  });

  it('13. stage accepts a valid capsule and writes it', async () => {
    const file = await codexAdapter.stage({ task: 'demo', model: 'gpt-4o' });
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ task: 'demo', model: 'gpt-4o' });
  });

  it('14. activate refuses malformed staged capsule without consuming it', async () => {
    const stagingDir = path.join(homeDir, 'staging');
    await mkdir(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'activation-capsule.json'), JSON.stringify({ nope: true }), 'utf-8');
    const result = await codexAdapter.activate();
    expect(result.ok).toBe(false);
    expect(fs.existsSync(path.join(stagingDir, 'activation-capsule.json'))).toBe(true);
    expect(fs.existsSync(path.join(homeDir, 'active-capsule.json'))).toBe(false);
  });

  it('15. activate refuses non-JSON staged capsule', async () => {
    const stagingDir = path.join(homeDir, 'staging');
    await mkdir(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'activation-capsule.json'), 'not json{', 'utf-8');
    const result = await codexAdapter.activate();
    expect(result.ok).toBe(false);
  });

  it('16. activate promotes a valid staged capsule', async () => {
    await codexAdapter.stage({ task: 'promote me' });
    const result = await codexAdapter.activate();
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(homeDir, 'active-capsule.json'))).toBe(true);
    expect(fs.existsSync(path.join(homeDir, 'staging', 'activation-capsule.json'))).toBe(false);
  });
});
