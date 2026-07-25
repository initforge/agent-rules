import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import yaml from 'js-yaml';

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
const BACKUP_DIR = path.join(ROOT, 'control-plane', 'backups');

function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export interface WriteResult {
  success: boolean;
  oldHash: string;
  newHash: string;
  backupPath: string;
  error?: string;
}

export function atomicWrite(relativePath: string, newContent: string): WriteResult {
  const fullPath = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    return { success: false, oldHash: '', newHash: '', backupPath: '', error: `File not found: ${relativePath}` };
  }

  const oldContent = fs.readFileSync(fullPath, 'utf-8');
  const oldHash = hashContent(oldContent);
  const newHash = hashContent(newContent);

  if (oldHash === newHash) {
    return { success: true, oldHash, newHash, backupPath: '', error: 'No changes detected' };
  }

  ensureBackupDir();
  const backupName = `${relativePath.replace(/[\/\\]/g, '_')}_${oldHash.slice(0, 12)}.bak`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  fs.copyFileSync(fullPath, backupPath);

  const tmpPath = fullPath + '.tmp';
  fs.writeFileSync(tmpPath, newContent, 'utf-8');
  fs.renameSync(tmpPath, fullPath);

  return { success: true, oldHash, newHash, backupPath };
}

export function rollback(backupPath: string, targetPath: string): boolean {
  if (!fs.existsSync(backupPath)) return false;
  const fullTarget = path.resolve(ROOT, targetPath);
  fs.copyFileSync(backupPath, fullTarget);
  return true;
}

export function listBackups(): string[] {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR).sort().reverse();
}

function detectFormat(filePath: string): 'json' | 'yaml' | 'unknown' {
  if (filePath.endsWith('.json')) return 'json';
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) return 'yaml';
  return 'unknown';
}

export function serializeForFile(filePath: string, data: unknown): string {
  const format = detectFormat(filePath);
  if (format === 'json') {
    return JSON.stringify(data, null, 2) + '\n';
  }
  if (format === 'yaml') {
    return yaml.dump(data, { indent: 2, lineWidth: -1, noRefs: true });
  }
  return String(data);
}
