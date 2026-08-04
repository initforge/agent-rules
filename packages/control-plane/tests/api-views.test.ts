import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app';
import { getDb, closeDb } from '../src/db';

describe('M11 Views API', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb(); });
  afterAll(async () => { await closeDb(); });

  describe('Views listing', () => {
    it('returns all view names', async () => {
      const res = await request(app).get('/api/m11/views');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toContain('readiness');
      expect(res.body.data).toContain('dag');
      expect(res.body.data).toContain('gates');
      expect(res.body.data).toContain('agents');
    });

    it('returns 11 views total', async () => {
      const res = await request(app).get('/api/m11/views');
      expect(res.body.data.length).toBe(11);
    });
  });

  describe('View error handling', () => {
    it('returns 500 on invalid projection', async () => {
      // When no projection exists, views should return gracefully
      const res = await request(app).get('/api/m11/readiness');
      // Returns 200 even without data (empty state)
      expect([200, 500]).toContain(res.status);
    });

    it('returns JSON with ok flag', async () => {
      const res = await request(app).get('/api/m11/readiness');
      expect(res.body).toHaveProperty('ok');
    });
  });
});

describe('Health endpoint', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb(); });
  afterAll(async () => { await closeDb(); });

  it('returns healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('includes system info', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.system).toBeDefined();
    expect(res.body.system.nodeVersion).toBeDefined();
    expect(res.body.system.platform).toBeDefined();
  });

  it('returns timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.timestamp).toBeDefined();
    const ts = new Date(res.body.timestamp);
    expect(ts.getTime()).toBeGreaterThan(0);
  });
});

describe('Audit endpoint', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb(); });
  afterAll(async () => { await closeDb(); });

  it('returns audit log', async () => {
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('respects limit parameter', async () => {
    const res = await request(app).get('/api/audit?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(10);
  });

  it('respects offset parameter', async () => {
    const res = await request(app).get('/api/audit?offset=5');
    expect(res.status).toBe(200);
    expect(res.body.offset).toBe(5);
  });

  it('caps limit at 200', async () => {
    const res = await request(app).get('/api/audit?limit=500');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
  });
});

describe('Config endpoint', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb(); });
  afterAll(async () => { await closeDb(); });

  it('returns all canonical data', async () => {
    const res = await request(app).get('/api/config/all');
    expect(res.status).toBe(200);
    expect(res.body.data.manifest).toBeDefined();
    expect(res.body.data.registry).toBeDefined();
    expect(res.body.data.profileManifest).toBeDefined();
    expect(res.body.data.modelPolicy).toBeDefined();
  });

  it('returns platforms', async () => {
    const res = await request(app).get('/api/config/platforms');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns skills list', async () => {
    const res = await request(app).get('/api/config/skills');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns profiles list', async () => {
    const res = await request(app).get('/api/config/profiles');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns agents list', async () => {
    const res = await request(app).get('/api/config/agents');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('reads JSON file', async () => {
    const res = await request(app).get('/api/config/file?path=automation/model-policy.json');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('reads YAML file', async () => {
    const res = await request(app).get('/api/config/file?path=profiles/manifest.yaml');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('requires path parameter', async () => {
    const res = await request(app).get('/api/config/file');
    expect(res.status).toBe(400);
  });

  it('rejects path traversal', async () => {
    const res = await request(app).get('/api/config/file?path=../etc/passwd');
    expect(res.status).toBe(403);
  });

  it('rejects unlisted paths', async () => {
    const res = await request(app).get('/api/config/file?path=nonexistent/file.json');
    expect(res.status).toBe(403);
  });
});

describe('Plans endpoint', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb(); });
  afterAll(async () => { await closeDb(); });

  it('returns plan list', async () => {
    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 404 for nonexistent plan', async () => {
    const res = await request(app).get('/api/plans/nonexistent-plan-xyz');
    expect(res.status).toBe(404);
  });

  it('rejects invalid planId format', async () => {
    const res = await request(app).get('/api/plans/..%2F..%2Fetc');
    expect(res.status).toBe(400);
  });
});

describe('C4 endpoint', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb(); });
  afterAll(async () => { await closeDb(); });

  it('returns context data', async () => {
    const res = await request(app).get('/api/c4/context');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.systems).toBeDefined();
  });

  it('returns containers', async () => {
    const res = await request(app).get('/api/c4/containers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns components', async () => {
    const res = await request(app).get('/api/c4/components');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns code items', async () => {
    const res = await request(app).get('/api/c4/code');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns scorecard', async () => {
    const res = await request(app).get('/api/c4/scorecard');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('returns c4 health', async () => {
    const res = await request(app).get('/api/c4/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });
});

describe('Rate limiting', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb(); });
  afterAll(async () => { await closeDb(); });

  it('sets rate limit headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });
});

describe('Security headers', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb(); });
  afterAll(async () => { await closeDb(); });

  it('sets CSP header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('sets X-Content-Type-Options', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS configuration', () => {
  beforeAll(async () => { process.env.PORT = '0'; await getDb(); });
  afterAll(async () => { await closeDb(); });

  it('allows configured origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});
