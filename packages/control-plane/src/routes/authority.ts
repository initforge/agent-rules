import { Router, type Request, type Response } from 'express';
import { readExecutionAuthority } from '@initforge/agent-rules-engine/state/execution-authority';
import { supersedeGoal } from '@initforge/agent-rules-engine/state/goal-supersession';
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

/**
 * Canonical goal switch. The UI supplies an already-created, hash-bound target
 * contract; it never constructs authority from labels or session history.
 */
router.post('/supersede', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== 'object' || !body.target || typeof body.target !== 'object') {
      res.status(400).json({ ok: false, code: 'INVALID_SUPERSESSION', error: 'target and reason are required' });
      return;
    }
    const expectedGeneration = Number(body.expected_generation);
    if (!Number.isSafeInteger(expectedGeneration)) {
      res.status(400).json({ ok: false, code: 'INVALID_SUPERSESSION', error: 'expected_generation must be an integer' });
      return;
    }
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const result = supersedeGoal(findRoot(), {
      expected_generation: expectedGeneration,
      target: body.target as never,
      reason,
    });
    res.status(200).json({ ok: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('STALE_EXPECTED') || message.includes('generation') ? 409 : 400;
    res.status(status).json({ ok: false, code: status === 409 ? 'STALE_AUTHORITY' : 'SUPERSESSION_REJECTED', error: message });
  }
});

export default router;
