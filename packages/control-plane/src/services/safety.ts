import path from 'path';
import fs from 'fs';

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

export function safeResolve(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error('Absolute paths are not allowed');
  }
  if (relativePath.includes('\0')) {
    throw new Error('Null byte detected in path');
  }
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..' + path.sep) || normalized === '..') {
    throw new Error('Path traversal detected');
  }
  const cleaned = normalized.replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(ROOT, cleaned);
  const rootNormalized = path.resolve(ROOT) + path.sep;
  if (!resolved.startsWith(rootNormalized) && resolved !== path.resolve(ROOT)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

export function safeResolveAgainst(root: string, relativePath: string): string {
  if (relativePath.includes('\0')) {
    throw new Error('Null byte detected in path');
  }
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..' + path.sep) || normalized === '..') {
    throw new Error('Path traversal detected');
  }
  const cleaned = normalized.replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(root, cleaned);
  const rootNormalized = path.resolve(root) + path.sep;
  if (!resolved.startsWith(rootNormalized) && resolved !== path.resolve(root)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

export function apiError(res: any, code: number, err: unknown): void {
  if (err instanceof Error && err.message.includes('Path traversal')) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return;
  }
  res.status(code).json({ ok: false, error: 'An internal error occurred' });
}

export { ROOT };
