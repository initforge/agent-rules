import { Router } from 'express';
import * as auditService from '../services/audit';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const events = await auditService.getAuditLog(limit, offset);
    res.json({ ok: true, data: events, limit, offset });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
