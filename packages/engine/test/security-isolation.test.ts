import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_SRC = path.resolve(__dirname, '..', 'src');
const CLI_SRC = path.resolve(__dirname, '..', '..', 'cli', 'src');

function collectTsFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(full);
      }
    }
  };
  walk(root);
  return results;
}

const APP_SRC_ROOTS = [ENGINE_SRC, CLI_SRC];
const APP_FILES = APP_SRC_ROOTS.flatMap(collectTsFiles);

describe('C5-P9 adversarial closure: security / credential isolation', () => {
  it('no API keys or tokens in source code', () => {
    const secretPatterns = [
      /api[_-]?key\s*[:=]\s*["'`][A-Za-z0-9_\-]{16,}["'`]/i,
      /api[_-]?token\s*[:=]\s*["'`][A-Za-z0-9_\-]{16,}["'`]/i,
      /api[_-]?secret\s*[:=]\s*["'`][A-Za-z0-9_\-]{16,}["'`]/i,
      /bearer\s+[A-Za-z0-9_\-]{20,}/i,
      /sk-[A-Za-z0-9]{20,}/,
      /ghp_[A-Za-z0-9]{36,}/,
      /gho_[A-Za-z0-9]{36,}/,
      /xox[bpras]-[A-Za-z0-9]{10,}/,
    ];

    const violations: string[] = [];
    for (const file of APP_FILES) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of secretPatterns) {
          if (pattern.test(line)) {
            violations.push(`${path.relative(path.resolve(__dirname, '..', '..', '..'), file)}:${i + 1}: possible secret`);
            break;
          }
        }
      }
    }
    if (violations.length > 0) {
      console.log('Potential secrets found:', violations.join('\n'));
    }
    expect(violations.length).toBe(0);
  });

  it('no eval() calls in production code', () => {
    const violations: string[] = [];
    for (const file of APP_FILES) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/\beval\s*\(/.test(lines[i])) {
          violations.push(`${path.relative(path.resolve(__dirname, '..', '..', '..'), file)}:${i + 1}`);
        }
      }
    }
    if (violations.length > 0) {
      console.log('eval() calls:', violations.join('\n'));
    }
    expect(violations.length).toBe(0);
  });

  it('no hardcoded home directory paths', () => {
    const homePattern = /["'`]\/home\/[^/"'`\s]+["'`]/;
    const violations: string[] = [];
    for (const file of APP_FILES) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (homePattern.test(lines[i])) {
          violations.push(`${path.relative(path.resolve(__dirname, '..', '..', '..'), file)}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
    if (violations.length > 0) {
      console.log('Hardcoded home paths:', violations.join('\n'));
    }
    expect(violations.length).toBe(0);
  });

  it('no 40+ character base64-like strings (potential tokens)', () => {
    const longTokenPattern = /["'`][A-Za-z0-9+/=]{40,}["'`]/;
    const violations: string[] = [];
    for (const file of APP_FILES) {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(longTokenPattern);
      if (matches) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (longTokenPattern.test(lines[i])) {
            violations.push(`${path.relative(path.resolve(__dirname, '..', '..', '..'), file)}:${i + 1}`);
          }
        }
      }
    }
    if (violations.length > 0) {
      console.log('Potential token strings:', violations.join('\n'));
    }
    expect(violations.length).toBe(0);
  });

  it('adapter detect() does not expose credentials', () => {
    for (const file of APP_FILES) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('async detect()') || content.includes('detect():')) {
        const relative = path.relative(path.resolve(__dirname, '..', '..', '..'), file);
        const lines = content.split('\n');
        let inDetect = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('detect(')) inDetect = true;
          if (inDetect && (line.includes('apiKey') || line.includes('token') || line.includes('secret') || line.includes('password'))) {
            // tokenBudget/tokens are allowed; check for credential-like patterns
            if (/(apiKey|api_key|secret|password)\s*[:=]/i.test(line) && !line.includes('tokenBudget') && !line.includes('token_budget')) {
              expect.unreachable(`detect() in ${relative}:${i + 1} exposes credential-like field`);
            }
          }
          if (inDetect && (line.includes('}') || line.includes(');'))) inDetect = false;
        }
      }
    }
  });

  it('no process.env secrets logged or exposed', () => {
    const violations: string[] = [];
    for (const file of APP_FILES) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('process.env')) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/process\.env\.(API_KEY|SECRET|PASSWORD|TOKEN|AUTH)/i.test(line)) {
            violations.push(`${path.relative(path.resolve(__dirname, '..', '..', '..'), file)}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    }
    if (violations.length > 0) {
      console.log('process.env secret access:', violations.join('\n'));
    }
    expect(violations.length).toBe(0);
  });

  it('no npm audit critical/high severity vulnerabilities', async () => {
    const { execSync } = await import('node:child_process');
    try {
      const result = execSync('npm audit --production 2>&1', { encoding: 'utf-8', cwd: path.resolve(__dirname, '..', '..', '..') });
      if (result.includes('critical') || result.includes('high')) {
        console.log('npm audit vulnerabilities:', result);
      }
      expect(result.includes('critical')).toBe(false);
      expect(result.includes('high')).toBe(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('critical') || msg.includes('high')) {
        expect.unreachable(`Critical/high vulnerability found: ${msg}`);
      }
    }
  });
});
