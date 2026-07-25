import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import * as reader from '../services/reader';
import * as writer from '../services/writer';
import * as differ from '../services/differ';
import * as validator from '../services/validator';
import * as audit from '../services/audit';
import { computeDiff } from '../services/differ';
import { safeResolve } from '../services/safety';

const router = Router();

function apiError(res: any, code: number, err: unknown): void {
  if (err instanceof Error && err.message.includes('Path traversal')) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return;
  }
  res.status(code).json({ ok: false, error: 'An internal error occurred' });
}

router.post('/diff', (req, res) => {
  try {
    const { filePath: fp, content } = req.body as { filePath: string; content: string };
    if (!fp || content === undefined) {
      res.status(400).json({ ok: false, error: 'filePath and content required' });
      return;
    }
    const fullPath = safeResolve(fp);
    const oldContent = fs.readFileSync(fullPath, 'utf-8');
    const diff = computeDiff(oldContent, content, fp);
    res.json({ ok: true, diff });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.post('/preview', (req, res) => {
  try {
    const { target, filePath: fp, data } = req.body as { target: string; filePath: string; data: unknown };
    if (!fp || data === undefined) {
      res.status(400).json({ ok: false, error: 'filePath and data required' });
      return;
    }

    const fullPath = safeResolve(fp);
    const currentRawStr = fs.readFileSync(fullPath, 'utf-8');
    const newRaw = writer.serializeForFile(fp, data);
    const diff = computeDiff(currentRawStr, newRaw, fp);

    res.json({ ok: true, diff, current: currentRawStr, proposed: newRaw });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.post('/apply', async (req, res) => {
  try {
    const { target, filePath: fp, data } = req.body as { target: string; filePath: string; data: unknown };
    if (!fp || data === undefined) {
      res.status(400).json({ ok: false, error: 'filePath and data required' });
      return;
    }

    const validation = validator.validateAgainstSchema(fp, data);
    if (!validation.valid) {
      res.status(400).json({ ok: false, error: `Validation failed: ${validation.errors.join('; ')}` });
      return;
    }

    const newContent = writer.serializeForFile(fp, data);
    const fullPath = safeResolve(fp);
    const currentRawStr = fs.readFileSync(fullPath, 'utf-8');
    const diff = computeDiff(currentRawStr, newContent, fp);

    if (!diff.hasChanges) {
      res.json({ ok: true, applied: false, reason: 'No changes' });
      return;
    }

    const result = writer.atomicWrite(fp, newContent);
    if (!result.success) {
      res.status(500).json({ ok: false, error: result.error });
      return;
    }

    await audit.recordMutation('edit', fp, result.oldHash, result.newHash, result.backupPath);

    res.json({
      ok: true,
      applied: true,
      oldHash: result.oldHash,
      newHash: result.newHash,
      backupPath: result.backupPath,
      diff,
    });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.post('/rollback', async (req, res) => {
  try {
    const { backupPath, targetPath } = req.body as { backupPath: string; targetPath: string };
    if (!backupPath || !targetPath) {
      res.status(400).json({ ok: false, error: 'backupPath and targetPath required' });
      return;
    }
    safeResolve(targetPath);
    const ok = writer.rollback(backupPath, targetPath);
    if (!ok) {
      res.status(404).json({ ok: false, error: 'Backup not found' });
      return;
    }
    await audit.recordMutation('rollback', targetPath, '', '', backupPath);
    res.json({ ok: true, rolledBack: true, targetPath, backupPath });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.get('/backups', (_req, res) => {
  try {
    const backups = writer.listBackups();
    res.json({ ok: true, data: backups });
  } catch (err) {
    apiError(res, 500, err);
  }
});

export default router;
