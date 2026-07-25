import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app';
import { getDb, closeDb } from '../src/db';

describe('API', () => {
  beforeAll(async () => {
    process.env.PORT = '0';
    await getDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('GET /api/health returns status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('healthy');
    expect(res.body.commit).toBeTruthy();
  });

  it('GET /api/config/all returns canonical data', async () => {
    const res = await request(app).get('/api/config/all');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.manifest).toBeTruthy();
    expect(res.body.data.registry).toBeTruthy();
    expect(res.body.data.profileManifest).toBeTruthy();
    expect(res.body.data.modelPolicy).toBeTruthy();
    expect(res.body.data.triggerAudit).toBeTruthy();
  });

  it('GET /api/config/platforms returns platform configs', async () => {
    const res = await request(app).get('/api/config/platforms');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const platforms = res.body.data.platforms ? Object.keys(res.body.data.platforms) : Object.keys(res.body.data);
    expect(platforms.length).toBeGreaterThanOrEqual(4);
  });

  it('GET /api/config/skills returns skills list', async () => {
    const res = await request(app).get('/api/config/skills');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(10);
  });

  it('GET /api/config/agents returns agent definitions', async () => {
    const res = await request(app).get('/api/config/agents');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/config/file reads JSON files', async () => {
    const res = await request(app).get('/api/config/file?path=automation/model-policy.json');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.version).toBe(5);
  });

  it('GET /api/config/file reads YAML files', async () => {
    const res = await request(app).get('/api/config/file?path=profiles/manifest.yaml');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.version).toBe(1);
  });

  it('GET /api/audit returns audit log', async () => {
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/mutation/diff computes diff', async () => {
    const res = await request(app)
      .post('/api/mutation/diff')
      .send({ filePath: 'automation/model-policy.json', content: JSON.stringify({ version: 5, platforms: {} }) });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.diff).toBeTruthy();
  });

  it('POST /api/mutation/preview returns diff before apply', async () => {
    const filePath = 'automation/model-policy.json';
    const res = await request(app)
      .post('/api/mutation/preview')
      .send({ target: 'model-policy', filePath, data: { version: 5, platforms: {} } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.diff.hasChanges).toBe(true);
  });

  it('POST /api/mutation/preview returns no changes when identical', async () => {
    const res1 = await request(app).get('/api/config/file?path=automation/model-policy.json');
    const data = res1.body.data;
    const res = await request(app)
      .post('/api/mutation/preview')
      .send({ target: 'model-policy', filePath: 'automation/model-policy.json', data });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /api/runs/record-run records a run', async () => {
    const res = await request(app)
      .post('/api/runs/record-run')
      .send({ run_id: 'test-run-001', platform: 'test', model: 'test-model', outcome: 'PASS' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/runs returns recorded runs', async () => {
    const res = await request(app).get('/api/runs');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/runs/import-telemetry imports events', async () => {
    const res = await request(app)
      .post('/api/runs/import-telemetry')
      .send({
        events: [{
          event_id: 'test-event-001',
          event_type: 'test',
          ts: new Date().toISOString(),
          platform: 'test',
          model: 'm',
          effort: 'medium',
          outcome: 'PASS',
        }],
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.imported).toBe('number');
  });

  it('GET /api/runs/telemetry returns telemetry events', async () => {
    const res = await request(app).get('/api/runs/telemetry');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/mutation/apply rejects invalid data', async () => {
    const res = await request(app)
      .post('/api/mutation/apply')
      .send({ target: 'model-policy', filePath: 'automation/model-policy.json', data: { version: 'bad' } });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('Validation');
  });

  it('POST /api/mutation/rollback requires valid backup', async () => {
    const res = await request(app)
      .post('/api/mutation/rollback')
      .send({ backupPath: '/nonexistent/backup.bak', targetPath: 'automation/model-policy.json' });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it('GET /api/mutation/backups returns list', async () => {
    const res = await request(app).get('/api/mutation/backups');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
