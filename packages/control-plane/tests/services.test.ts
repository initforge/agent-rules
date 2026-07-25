import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as differ from '../src/services/differ';
import * as validator from '../src/services/validator';
import * as writer from '../src/services/writer';

describe('differ', () => {
  it('detects no changes', () => {
    const result = differ.computeDiff('hello\nworld\n', 'hello\nworld\n', 'test.txt');
    expect(result.hasChanges).toBe(false);
    expect(result.linesAdded).toBe(0);
    expect(result.linesRemoved).toBe(0);
  });

  it('detects added lines', () => {
    const result = differ.computeDiff('a\nb\n', 'a\nb\nc\n', 'test.txt');
    expect(result.hasChanges).toBe(true);
    expect(result.linesAdded).toBe(1);
  });

  it('detects removed lines', () => {
    const result = differ.computeDiff('a\nb\nc\n', 'a\nb\n', 'test.txt');
    expect(result.hasChanges).toBe(true);
    expect(result.linesRemoved).toBe(1);
  });

  it('produces patch string', () => {
    const result = differ.computeDiff('old\n', 'new\n', 'test.txt');
    expect(result.patch).toContain('@@');
    expect(result.patch).toContain('old');
    expect(result.patch).toContain('new');
  });

  it('identifies hunks correctly', () => {
    const result = differ.computeDiff('line1\nline2\nline3\n', 'line1\nchanged\nline3\n', 'test.txt');
    expect(result.hunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('validator', () => {
  it('validates profile-enabled target', () => {
    const valid = validator.validateEdit('profile-enabled', { version: 1, profiles: { test: {} } });
    expect(valid.valid).toBe(true);
  });

  it('rejects invalid profile-enabled target', () => {
    const invalid = validator.validateEdit('profile-enabled', { version: 'abc' });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('validates trigger-audit target', () => {
    const valid = validator.validateEdit('trigger-audit', { phrase: 'test phrase', skill: 'test-skill' });
    expect(valid.valid).toBe(true);
  });

  it('rejects trigger-audit without phrase', () => {
    const invalid = validator.validateEdit('trigger-audit', { skill: 'test' });
    expect(invalid.valid).toBe(false);
  });

  it('validates integration target', () => {
    const valid = validator.validateEdit('integration', { id: 'test-integration', kind: 'mcp', policy: 'optional' });
    expect(valid.valid).toBe(true);
  });

  it('validates against model-policy schema', () => {
    const valid = validator.validateAgainstSchema('automation/model-policy.json', {
      version: 4,
      platforms: { codex: {} },
    });
    expect(valid.valid).toBe(true);
  });

  it('rejects invalid data against model-policy schema', () => {
    const invalid = validator.validateAgainstSchema('automation/model-policy.json', { version: 'abc' });
    expect(invalid.valid).toBe(false);
  });

  it('rejects invalid trigger-audit data', () => {
    const invalid = validator.validateAgainstSchema('automation/trigger-audit.json', [{ notPhrase: true }]);
    expect(invalid.valid).toBe(false);
  });

  it('validates against registry schema', () => {
    const valid = validator.validateAgainstSchema('integrations/registry.json', {
      version: 2,
      integrations: [{ id: 'test' }],
    });
    expect(valid.valid).toBe(true);
  });

  it('passes through for unknown file paths', () => {
    const result = validator.validateAgainstSchema('some/unknown/file.json', { anything: true });
    expect(result.valid).toBe(true);
  });

  it('rejects unknown target type', () => {
    const result = validator.validateEdit('unknown-target' as any, {});
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('unknown');
  });
});

describe('writer', () => {
  const tmpDir = path.join(__dirname, '..', '.test-tmp-' + Date.now());
  const testFile = path.join(tmpDir, 'test.json');
  const relPath = 'packages/control-plane/' + path.basename(tmpDir) + '/test.json';

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(testFile, JSON.stringify({ version: 1, data: 'original' }, null, 2) + '\n', 'utf-8');
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('writes atomically and returns hashes', () => {
    const newContent = JSON.stringify({ version: 1, data: 'modified' }, null, 2) + '\n';
    const result = writer.atomicWrite(relPath, newContent);
    expect(result.success).toBe(true);
    expect(result.oldHash).toBeTruthy();
    expect(result.newHash).toBeTruthy();
    expect(result.backupPath).toBeTruthy();
    expect(result.oldHash).not.toBe(result.newHash);
  });

  it('detects no changes', () => {
    const content = fs.readFileSync(testFile, 'utf-8');
    const result = writer.atomicWrite(relPath, content);
    expect(result.success).toBe(true);
    expect(result.error).toContain('No changes');
  });

  it('reports error for non-existent file', () => {
    const result = writer.atomicWrite('nonexistent/path.json', '{}');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('serializes JSON with proper formatting', () => {
    const result = writer.serializeForFile('test.json', { a: 1, b: 2 });
    expect(result).toContain('"a": 1');
    expect(result).toContain('"b": 2');
  });

  it('serializes YAML for yaml files', () => {
    const result = writer.serializeForFile('test.yaml', { a: 1, b: [1, 2] });
    expect(result).toContain('a: 1');
    expect(result).toContain('b:');
  });
});
