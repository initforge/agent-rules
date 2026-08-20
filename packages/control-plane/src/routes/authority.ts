import { Router, type Response } from 'express';
import { readExecutionAuthority } from '@initforge/agent-rules-engine/state/execution-authority';
import { findRoot } from '../schemas/plan-workspace.js';

const router = Router();

/** Read-only operator view of the same current-pointer authority used by the runner. */
router.get('/', (_req, res: Response) => {
  try {
    const root = findRoot();
    const authority = readExecutionAuthority(root);
    res.json({
      ok: true,
      data: {
        ...authority,
        state: authority.source === 'current-pointer' ? 'BOUND' : 'UNBOUND',
        pointer_file: '.agent/current.json',
      },
    });
  } catch (err) {
    res.status(409).json({ ok: false, code: 'AUTHORITY_INVALID', error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
