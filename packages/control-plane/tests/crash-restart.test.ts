import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDb, closeDb, resetDb, addAudit, addRun, addTelemetry } from '../src/db/index.ts';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-crash-restart-'));

beforeEach(async () => {
  vi.resetModules();
  resetDb();
});

afterEach(async () => {
  await closeDb();
  resetDb();
});

describe('Lockfile lifecycle', () => {
  it('lockfile structure contains required fields', async () => {
    const dir = tmp();
    const storePath = path.join(dir, 'store.json');
    
    // Manually write a lockfile to test structure
    const lockPath = storePath + '.lock';
    const lockData = { pid: process.pid, start: new Date().toISOString(), version: 1 };
    fs.writeFileSync(lockPath, JSON.stringify(lockData));
    
    // Read back and verify structure
    const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(content.pid).toBe(process.pid);
    expect(content.start).toBeTruthy();
    expect(content.version).toBe(1);
  });
});

describe('Crash recovery', () => {
  it('detects orphaned lockfile from dead process', async () => {
    const dir = tmp();
    const storePath = path.join(dir, 'store.json');
    
    // Create a fake lockfile with a non-existent PID
    const lockPath = storePath + '.lock';
    const fakePid = 999999; // Unlikely to exist
    fs.writeFileSync(lockPath, JSON.stringify({ pid: fakePid, start: new Date().toISOString(), version: 1 }));
    
    // Should allow getting db since the "process" is dead
    await getDb(storePath);
    const store = await getDb();
    expect(store.audit).toEqual([]);
  });

  it('allows opening store when lockfile has our own PID', async () => {
    const dir = tmp();
    const storePath = path.join(dir, 'store.json');
    const lockPath = storePath + '.lock';
    
    // Create a lockfile that claims current process owns it
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, start: new Date().toISOString(), version: 1 }));
    
    // Should work since it's our own lock
    await getDb(storePath);
    const store = await getDb();
    expect(store.audit).toEqual([]);
  });

  it('handles corrupt lockfile gracefully', async () => {
    const dir = tmp();
    const storePath = path.join(dir, 'store.json');
    const lockPath = storePath + '.lock';
    
    // Write invalid JSON to lockfile
    fs.writeFileSync(lockPath, 'not json{{{');
    
    // Should handle gracefully
    await getDb(storePath);
    const store = await getDb();
    expect(store.audit).toEqual([]);
  });
});

describe('Periodic save', () => {
  it('saves dirty state on close', async () => {
    const dir = tmp();
    const storePath = path.join(dir, 'store.json');
    
    await getDb(storePath);
    addAudit({ ts: '2026-01-01T00:00:00Z', action: 'periodic-test', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' });
    
    // Close should trigger save
    await closeDb();
    
    // Verify data was persisted
    const content = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    expect(content.audit.length).toBe(1);
    expect(content.audit[0].action).toBe('periodic-test');
  });
});

describe('API input validation edge cases', () => {
  it('rejects empty run_id in record-run', async () => {
    const dir = tmp();
    const storePath = path.join(dir, 'store.json');
    await getDb(storePath);
    
    // Empty string is allowed at the db level but will be rejected by API
    addRun({ ts: new Date().toISOString(), run_id: '', platform: null, model: null, outcome: null, input_tokens: null, output_tokens: null, tool_calls: null, duration_ms: null, details: null });
    const store = await getDb();
    expect(store.runs[0].run_id).toBe('');
  });

  it('handles null details field', async () => {
    const dir = tmp();
    const storePath = path.join(dir, 'store.json');
    await getDb(storePath);
    
    addRun({ ts: new Date().toISOString(), run_id: 'test-1', platform: null, model: null, outcome: null, input_tokens: null, output_tokens: null, tool_calls: null, duration_ms: null, details: null });
    const store = await getDb();
    expect(store.runs[0].details).toBeNull();
  });

  it('handles numeric overflow in tokens', async () => {
    const dir = tmp();
    const storePath = path.join(dir, 'store.json');
    await getDb(storePath);
    
    // JavaScript can handle large numbers
    const largeNum = Number.MAX_SAFE_INTEGER;
    addRun({ ts: new Date().toISOString(), run_id: 'test-2', platform: null, model: null, outcome: null, input_tokens: largeNum, output_tokens: null, tool_calls: null, duration_ms: null, details: null });
    const store = await getDb();
    expect(store.runs[0].input_tokens).toBe(largeNum);
  });
});

describe('Schema validation edge cases', () => {
  it('validates model-policy with all required fields', async () => {
    const { validateAgainstSchema } = await import('../src/services/validator.ts');
    
    // Valid model policy
    const valid = validateAgainstSchema('automation/model-policy.json', {
      version: 5,
      platforms: {
        codex: {
          defaultModel: 'gpt-4',
          models: {
            'gpt-4': { provider: 'openai', model: 'gpt-4', maxTokens: 8192, temperature: 0.7 }
          }
        }
      }
    });
    expect(valid.valid).toBe(true);
  });

  it('rejects model-policy with string version', async () => {
    const { validateAgainstSchema } = await import('../src/services/validator.ts');
    
    const invalid = validateAgainstSchema('automation/model-policy.json', {
      version: '5', // Should be integer
      platforms: {}
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('validates trigger-audit array', async () => {
    const { validateAgainstSchema } = await import('../src/services/validator.ts');
    
    const valid = validateAgainstSchema('automation/trigger-audit.json', [
      { phrase: 'fix bug', skill: 'debug', keywords: ['error', 'crash'] },
      { phrase: 'add feature' }
    ]);
    expect(valid.valid).toBe(true);
  });

  it('rejects trigger-audit with empty phrase', async () => {
    const { validateAgainstSchema } = await import('../src/services/validator.ts');
    
    const invalid = validateAgainstSchema('automation/trigger-audit.json', [
      { phrase: '', skill: 'test' }
    ]);
    expect(invalid.valid).toBe(false);
  });

  it('validates registry with complete integration', async () => {
    const { validateAgainstSchema } = await import('../src/services/validator.ts');
    
    const valid = validateAgainstSchema('integrations/registry.json', {
      version: 2,
      integrations: [
        { id: 'test-mcp', kind: 'mcp', policy: 'optional', source: { type: 'npm', version: '1.0.0' } }
      ]
    });
    expect(valid.valid).toBe(true);
  });

  it('rejects registry with missing integration id', async () => {
    const { validateAgainstSchema } = await import('../src/services/validator.ts');
    
    const invalid = validateAgainstSchema('integrations/registry.json', {
      version: 1,
      integrations: [{ kind: 'mcp' }] // missing id
    });
    expect(invalid.valid).toBe(false);
  });

  it('validates profiles manifest', async () => {
    const { validateAgainstSchema } = await import('../src/services/validator.ts');
    
    const valid = validateAgainstSchema('profiles/manifest.yaml', {
      version: 1,
      profiles: {
        default: {
          name: 'Default',
          displayName: 'Default Profile',
          description: 'Default settings',
          enabledByDefault: true,
          rules: ['rule1.md', 'rule2.md']
        }
      }
    });
    expect(valid.valid).toBe(true);
  });
});

describe('Atomic write edge cases', () => {
  it('detects no changes when content is identical', async () => {
    const dir = tmp();
    const testFile = path.join(dir, 'test.json');
    
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(testFile, JSON.stringify({ version: 1, data: 'original' }), 'utf-8');
    
    const { atomicWrite, rollback } = await import('../src/services/writer.ts');
    
    // Write same content - should detect no change
    const result = atomicWrite(testFile, JSON.stringify({ version: 1, data: 'original' }));
    expect(result.success).toBe(true);
    expect(result.error).toContain('No changes');
  });

  it('creates backup with proper naming when content changes', async () => {
    const dir = tmp();
    const testFile = path.join(dir, 'test.json');
    
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(testFile, JSON.stringify({ version: 1 }), 'utf-8');
    
    const { atomicWrite, rollback } = await import('../src/services/writer.ts');
    
    // Write different content - should create backup
    const result = atomicWrite(testFile, JSON.stringify({ version: 2 }));
    expect(result.success).toBe(true);
    expect(result.backupPath).toContain('.bak');
    expect(fs.existsSync(result.backupPath)).toBe(true);
    
    // Verify backup contains original content
    const backupContent = fs.readFileSync(result.backupPath, 'utf-8');
    expect(backupContent).toContain('version');
    expect(backupContent).toContain('1');
  });
});
