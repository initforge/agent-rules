import { Router } from 'express';
import { getStore, addRun, addTelemetry } from '../db/index.js';
import { apiError } from '../services/safety.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const store = getStore();
    res.json({ ok: true, data: store.runs, total: store.runs.length, limit: 50, offset: 0 });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.get('/telemetry', async (_req, res) => {
  try {
    const store = getStore();
    res.json({ ok: true, data: store.telemetry, total: store.telemetry.length, limit: 50, offset: 0 });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.post('/import-telemetry', async (req, res) => {
  try {
    const { events } = req.body as { events: Array<Record<string, unknown>> };
    if (!Array.isArray(events)) {
      res.status(400).json({ ok: false, error: 'events array required' });
      return;
    }
    let count = 0;
    for (const ev of events) {
      const eid = String((ev as any).event_id || '');
      addTelemetry({
        event_id: eid,
        ts: String((ev as any).ts || new Date().toISOString()),
        event_type: String((ev as any).event_type || 'unknown'),
        platform: (ev as any).platform || null,
        model: (ev as any).model || null,
        effort: (ev as any).effort || null,
        outcome: (ev as any).outcome || null,
        payload: JSON.stringify(ev),
      });
      count++;
    }
    res.json({ ok: true, imported: count });
  } catch (err) {
    apiError(res, 500, err);
  }
});

router.post('/record-run', async (req, res) => {
  try {
    const { run_id, platform, model, outcome, input_tokens, output_tokens, tool_calls, duration_ms, details } = req.body as Record<string, unknown>;
    if (!run_id) {
      res.status(400).json({ ok: false, error: 'run_id required' });
      return;
    }
    addRun({
      ts: new Date().toISOString(),
      run_id: run_id as string,
      platform: (platform as string) || null,
      model: (model as string) || null,
      outcome: (outcome as string) || null,
      input_tokens: (input_tokens as number) || null,
      output_tokens: (output_tokens as number) || null,
      tool_calls: (tool_calls as number) || null,
      duration_ms: (duration_ms as number) || null,
      details: details ? JSON.stringify(details) : null,
    });
    res.json({ ok: true });
  } catch (err) {
    apiError(res, 500, err);
  }
});

export default router;
