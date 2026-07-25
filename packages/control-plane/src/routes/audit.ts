import { Router } from 'express';
import * as auditService from '../services/audit';
import { apiError } from '../services/safety';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const events = await auditService.getAuditLog(limit, offset);
    res.json({ ok: true, data: events, limit, offset });
  } catch (err) {
    apiError(res, 500, err);
  }
});

export default router;
