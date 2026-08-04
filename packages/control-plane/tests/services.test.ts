import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as differ from '../src/services/differ';
import * as validator from '../src/services/validator';
import * as writer from '../src/services/writer';
import * as safety from '../src/services/safety';
import { redactSensitive, redactStringJson, redactTextContent, containsSensitiveContent, redactSensitiveValue } from '../src/services/redact';

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

describe('redact', () => {
  it('redacts api_key case-insensitively', () => {
    const input = { api_key: 'sk-1234567890abcdef', name: 'test' }
    const result = redactSensitive(input)
    expect(result.redacted).toHaveProperty('api_key', '[REDACTED]')
    expect(result.redacted).toHaveProperty('name', 'test')
    expect(result.hadRedactions).toBe(true)
  })

  it('redacts ApiKey camelCase', () => {
    const input = { ApiKey: 'secret-value', data: 'visible' }
    const result = redactSensitive(input)
    expect(result.redacted).toHaveProperty('ApiKey', '[REDACTED]')
    expect(result.redacted).toHaveProperty('data', 'visible')
  })

  it('redacts API-KEY hyphenated', () => {
    const input = { 'API-KEY': 'supersecret', normal: 'ok' }
    const result = redactSensitive(input)
    expect(result.redacted).toHaveProperty('API-KEY', '[REDACTED]')
  })

  it('redacts nested objects', () => {
    const input = { outer: { api_key: 'nested-secret', inner: { token: 'deep-token' } }, ok: true }
    const result = redactSensitive(input)
    expect(result.redacted).toHaveProperty('outer')
    expect((result.redacted as Record<string, unknown>).outer).toHaveProperty('api_key', '[REDACTED]')
    expect(((result.redacted as Record<string, unknown>).outer as Record<string, unknown>).inner).toHaveProperty('token', '[REDACTED]')
    expect(result.redacted).toHaveProperty('ok', true)
    expect(result.hadRedactions).toBe(true)
  })

  it('redacts nested arrays of objects', () => {
    const input = { items: [{ api_key: 'secret1' }, { token: 'secret2', name: 'test' }] }
    const result = redactSensitive(input)
    const items = result.redacted as Array<Record<string, unknown>>
    expect(items[0]).toHaveProperty('api_key', '[REDACTED]')
    expect(items[1]).toHaveProperty('token', '[REDACTED]')
    expect(items[1]).toHaveProperty('name', 'test')
    expect(result.hadRedactions).toBe(true)
  })

  it('redacts string JSON via redactStringJson', () => {
    const json = JSON.stringify({ apiKey: 'sk-xxx', data: { token: 'tok-abc' } })
    const redacted = redactStringJson(json)
    const parsed = JSON.parse(redacted)
    expect(parsed).toHaveProperty('apiKey', '[REDACTED]')
    expect(parsed.data).toHaveProperty('token', '[REDACTED]')
  })

  it('returns non-JSON string unchanged', () => {
    expect(redactStringJson('not-json')).toBe('not-json')
  })

  it('handles null/undefined', () => {
    expect(redactSensitive(null).redacted).toBe(null)
    expect(redactSensitive(undefined).redacted).toBe(undefined)
  })

  it('reports hadRedactions flag correctly', () => {
    const noSecret = redactSensitive({ name: 'test', value: 42 })
    expect(noSecret.hadRedactions).toBe(false)
    const withSecret = redactSensitive({ api_key: 'secret' })
    expect(withSecret.hadRedactions).toBe(true)
  })

  it('redactSensitiveValue backward compatibility', () => {
    const result = redactSensitiveValue({ password: 'secret' })
    expect(result).toHaveProperty('password', '[REDACTED]')
  })
})

describe('redactTextContent', () => {
  it('redacts password=value patterns', () => {
    expect(redactTextContent('password=supersecret')).toBe('password=[REDACTED]')
  })

  it('redacts api_key patterns', () => {
    expect(redactTextContent('api_key=sk-abc123')).toBe('api_key=[REDACTED]')
  })

  it('redacts AWS/GCP/Azure patterns', () => {
    expect(redactTextContent('AWS_SECRET=mykey')).toBe('AWS_SECRET=[REDACTED]')
    expect(redactTextContent('GCP_TOKEN=token')).toBe('GCP_TOKEN=[REDACTED]')
    expect(redactTextContent('azure_key=key')).toBe('azure_key=[REDACTED]')
  })

  it('redacts bearer token', () => {
    const result = redactTextContent('Authorization: Bearer eyJhbGc...')
    expect(result).toContain('[REDACTED]')
    expect(result).not.toContain('eyJ')
  })

  it('redacts multiple secrets', () => {
    const result = redactTextContent('api_key=sk-1 token=tok-1 password=pass-1')
    expect(result).toBe('api_key=[REDACTED] token=[REDACTED] password=[REDACTED]')
  })

  it('returns unchanged with no secrets', () => {
    expect(redactTextContent('All systems operational')).toBe('All systems operational')
  })

  it('handles npm/pip/maven tokens', () => {
    expect(redactTextContent('npm_token=abc123')).toBe('npm_token=[REDACTED]')
    expect(redactTextContent('pip_auth_token=xyz')).toBe('pip_auth_token=[REDACTED]')
  })
})

describe('containsSensitiveContent', () => {
  it('detects sensitive content', () => {
    expect(containsSensitiveContent('api_key=sk-secret')).toBe(true)
    expect(containsSensitiveContent('password=12345')).toBe(true)
    expect(containsSensitiveContent('AWS_SECRET=key')).toBe(true)
  })

  it('returns false for clean content', () => {
    expect(containsSensitiveContent('Build successful. No errors.')).toBe(false)
    expect(containsSensitiveContent('User: admin, Status: active')).toBe(false)
  })
})

describe('safety', () => {
  it('rejects absolute paths', () => {
    const absPath = path.isAbsolute('C:\\') ? 'C:\\etc\\passwd' : '/etc/passwd';
    expect(() => safety.safeResolve(absPath)).toThrow('Absolute paths are not allowed');
  });

  it.each([
    'C:relative\\file.txt',
    'C:\\absolute\\file.txt',
    '\\\\server\\share\\file.txt',
    '\\\\?\\C:\\device\\file.txt',
    '\\\\.\\C:\\device\\file.txt',
  ])('rejects Windows rooted or drive-prefixed path %s', (candidate) => {
    expect(() => safety.safeResolveAgainst(path.resolve('.'), candidate)).toThrow('Absolute paths are not allowed');
  });

  it('rejects null bytes', () => {
    expect(() => safety.safeResolve('valid\0path')).toThrow('Null byte detected in path');
  });

  it('rejects path traversal with ../', () => {
    expect(() => safety.safeResolve('../')).toThrow('Path traversal detected');
    expect(() => safety.safeResolve('../../etc/passwd')).toThrow('Path traversal detected');
    expect(() => safety.safeResolve('safe/../../etc/passwd')).toThrow('Path traversal detected');
  });

  it('accepts valid relative paths', () => {
    const result = safety.safeResolve('rules/manifest.yaml');
    expect(result).toBeTruthy();
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.startsWith(safety.ROOT)).toBe(true);
  });

  it('safeResolveAgainst works with custom root', () => {
    const customRoot = path.resolve('.');
    const result = safety.safeResolveAgainst(customRoot, 'some/path/file.txt');
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.startsWith(customRoot)).toBe(true);
  });

  it('safeResolveAgainst rejects traversal', () => {
    expect(() => safety.safeResolveAgainst(path.resolve('.'), '..\\..\\..\\etc\\passwd')).toThrow('Path traversal detected');
    expect(() => safety.safeResolveAgainst(path.resolve('.'), '../..\\..\\etc/passwd')).toThrow('Path traversal detected');
  });

  it('path must stay within ROOT', () => {
    expect(() => safety.safeResolve('../')).toThrow('Path traversal detected');
    const valid = safety.safeResolve('rules/manifest.yaml');
    expect(valid.startsWith(safety.ROOT)).toBe(true);
  });
});
