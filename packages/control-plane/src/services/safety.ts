import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import type { Response } from 'express';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'rules', 'manifest.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..', '..');
}

const ROOT = findRoot();

const CANONICAL_READ_ALLOWLIST = new Set([
  'rules/manifest.yaml',
  'integrations/registry.json',
  'profiles/manifest.yaml',
  'automation/model-policy.json',
  'automation/evidence-profiles.json',
  'automation/trigger-audit.json',
  'automation/context-route-cases.json',
  'automation/efficiency-policy.json',
  'automation/trace-schema.json',
  'automation/context-graph.schema.json',
  'automation/work-ledger.schema.json',
  'docs/guides/06-platform-capability.md',
  'docs/guides/01-runtime-model.md',
  'docs/guides/03-integrations-and-sync.md',
  'platforms/platform-contracts.json',
])

// ponytail: AM22 = Writer W2 authority; W2 may mutate local non-production config
// but must NEVER mutate push/deploy/production artifacts.  Fail-closed here.
const AM22_PRODUCTION_PATTERNS: Array<{ prefix: string }> = [
  { prefix: 'generated/' },
  { prefix: '.agent/' },
  { prefix: '.github/' },
]

export function checkAM22Production(relativePath: string): void {
  for (const p of AM22_PRODUCTION_PATTERNS) {
    if (relativePath.startsWith(p.prefix)) {
      throw new Error(`AM22: production path denied: ${relativePath}`)
    }
  }
}

const MUTATION_ALLOWLIST = new Set([
  'automation/model-policy.json',
  'automation/trigger-audit.json',
  'integrations/registry.json',
  'profiles/manifest.yaml',
])

export function checkCanonicalAllowlist(relativePath: string): void {
  if (!CANONICAL_READ_ALLOWLIST.has(relativePath)) {
    const dirs = relativePath.split('/')
    if (dirs[0] === 'platforms' || dirs[0] === 'skills' || dirs[0] === 'profiles') return
    throw new Error(`Path not in canonical read allowlist: ${relativePath}`)
  }
}

export function checkMutationAllowlist(relativePath: string): void {
  if (!MUTATION_ALLOWLIST.has(relativePath)) {
    throw new Error(`Path not in mutation allowlist: ${relativePath}`)
  }
}

function normalizeRelativePath(relativePath: string): string {
  const hasWindowsRoot = /^[A-Za-z]:/.test(relativePath)
    || /^(?:\\\\|\/\/)/.test(relativePath);
  if (hasWindowsRoot || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw new Error('Absolute paths are not allowed');
  }
  if (relativePath.includes('\0')) {
    throw new Error('Null byte detected in path');
  }

  const normalized = path.posix.normalize(relativePath.replaceAll('\\', '/'));
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Path traversal detected');
  }
  return normalized;
}

export function safeResolve(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(ROOT, normalized);
  const rootNormalized = path.resolve(ROOT) + path.sep;
  if (!resolved.startsWith(rootNormalized) && resolved !== path.resolve(ROOT)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

export function safeResolveAgainst(root: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(root, normalized);
  const rootNormalized = path.resolve(root) + path.sep;
  if (!resolved.startsWith(rootNormalized) && resolved !== path.resolve(root)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

export function apiError(res: Response, code: number, err: unknown): void {
  if (err instanceof Error) {
    if (err.message.includes('Path traversal') || err.message.includes('not allowed') || err.message.includes('allowlist') || err.message.includes('AM22')) {
      res.status(403).json({ ok: false, error: 'Forbidden' });
      return;
    }
  }
  res.status(code).json({ ok: false, error: 'An internal error occurred' });
}

export { ROOT, MUTATION_ALLOWLIST };
