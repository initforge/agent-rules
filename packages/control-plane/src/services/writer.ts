import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import yaml from 'js-yaml';
import { safeResolve, safeResolveAgainst } from './safety';

const BACKUP_DIR = path.join(safeResolve('.'), 'packages', 'control-plane', 'backups');

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
  const fullPath = safeResolve(relativePath);
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
  const safeBackup = safeResolveAgainst(BACKUP_DIR, path.basename(backupPath));
  const safeTarget = safeResolve(targetPath);
  if (!fs.existsSync(safeBackup)) return false;
  fs.copyFileSync(safeBackup, safeTarget);
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
