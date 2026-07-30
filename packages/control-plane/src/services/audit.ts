import { addAudit, getStore } from '../db/index.js';

export interface AuditEvent {
  id?: number;
  ts: string;
  action: string;
  target_file: string;
  description: string | null;
  old_hash: string | null;
  new_hash: string | null;
  backup_path: string | null;
  user: string;
  status: string;
}

export async function recordAudit(event: Omit<AuditEvent, 'id' | 'ts'>): Promise<void> {
  addAudit({
    ts: new Date().toISOString(),
    action: event.action,
    target_file: event.target_file,
    description: event.description,
    old_hash: event.old_hash,
    new_hash: event.new_hash,
    backup_path: event.backup_path,
    user: event.user,
    status: event.status,
  });
}

export async function getAuditLog(limit: number = 50, offset: number = 0): Promise<AuditEvent[]> {
  const store = getStore();
  return store.audit.slice(offset, offset + limit);
}

export async function recordMutation(action: string, targetFile: string, oldHash: string, newHash: string, backupPath: string): Promise<void> {
  await recordAudit({
    action,
    target_file: targetFile,
    description: `${action} on ${targetFile}`,
    old_hash: oldHash || null,
    new_hash: newHash || null,
    backup_path: backupPath || null,
    user: 'control-plane',
    status: 'committed',
  });
}
