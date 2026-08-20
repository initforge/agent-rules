// Dev mock middleware — intercepts API calls in dev mode and returns mock data
// Only active when DEV_MOCK=1 is set in environment

import {
  mockPlans,
  mockRuns,
  mockEvaluations,
  mockArchitecture,
  mockProfiles,
  mockAuditLog
} from '../db/mock-data.js';

interface DevMockRequest { path: string; method: string; }
interface DevMockResponse { json(body: unknown): unknown; status(code: number): DevMockResponse; }
type DevMockNext = () => unknown;

export function devMockMiddleware(req: DevMockRequest, res: DevMockResponse, next: DevMockNext) {
  if (process.env.DEV_MOCK !== '1') return next();

  const { path, method } = req;

  // Plans endpoints
  if (path === '/api/plans' && method === 'GET') {
    return res.json({ ok: true, data: mockPlans, count: mockPlans.length });
  }
  if (path.match(/^\/api\/plans\/[^/]+$/) && method === 'GET') {
    const planId = path.split('/').pop();
    const plan = mockPlans.find(p => p.id === planId);
    if (plan) {
      return res.json({ ok: true, data: plan });
    }
    return res.status(404).json({ ok: false, error: 'Plan not found' });
  }

  // Runs endpoints
  if (path === '/api/runs' && method === 'GET') {
    return res.json({ ok: true, data: mockRuns, count: mockRuns.length });
  }

  // Evaluations endpoints
  if (path === '/api/evaluations' && method === 'GET') {
    return res.json({ ok: true, data: mockEvaluations, count: mockEvaluations.length });
  }

  // Architecture endpoints
  if (path === '/api/architecture' && method === 'GET') {
    return res.json({ ok: true, data: mockArchitecture });
  }

  // Profiles endpoints
  if (path === '/api/profiles' && method === 'GET') {
    return res.json({ ok: true, data: mockProfiles, count: mockProfiles.length });
  }

  // Audit log endpoints
  if (path === '/api/audit' && method === 'GET') {
    return res.json({ ok: true, data: mockAuditLog, count: mockAuditLog.length });
  }

  // Config endpoints
  if (path === '/api/config/all' && method === 'GET') {
    return res.json({
      ok: true,
      data: {
        manifest: { version: '2.0.0', name: 'agent-rules' },
        registry: { integrations: ['playwright', 'chrome-devtools', 'context7'] }
      }
    });
  }

  // Health endpoint
  if (path === '/api/health' && method === 'GET') {
    return res.json({ ok: true, status: 'healthy', mock: true });
  }

  next();
}
