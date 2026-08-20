// Mock data for dev mode — provides realistic local data for all API endpoints
// This file is only used when DEV_MOCK=1 is set

export const mockPlans = [
  {
    id: 'plan-001',
    name: 'Demo Active Plan',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    description: 'This is a demo plan for development testing'
  },
  {
    id: 'plan-002',
    name: 'Completed Plan',
    status: 'completed',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    description: 'This plan has been completed'
  },
  {
    id: 'plan-003',
    name: 'Blocked Plan',
    status: 'blocked',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date().toISOString(),
    description: 'This plan is blocked waiting for approval'
  }
];

export const mockRuns = [
  {
    id: 'run-001',
    planId: 'plan-001',
    status: 'running',
    startedAt: new Date().toISOString(),
    agent: 'claude',
    taskCount: 5,
    completedTasks: 2
  },
  {
    id: 'run-002',
    planId: 'plan-001',
    status: 'completed',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date().toISOString(),
    agent: 'mimo',
    taskCount: 3,
    completedTasks: 3
  }
];

export const mockEvaluations = [
  {
    id: 'eval-001',
    planId: 'plan-001',
    runId: 'run-001',
    result: 'pass',
    score: 95,
    executedAt: new Date().toISOString(),
    details: { testsPassed: 19, testsFailed: 1, coverage: 87 }
  },
  {
    id: 'eval-002',
    planId: 'plan-002',
    runId: 'run-002',
    result: 'partial',
    score: 72,
    executedAt: new Date(Date.now() - 1800000).toISOString(),
    details: { testsPassed: 15, testsFailed: 5, coverage: 65 }
  }
];

export const mockArchitecture = {
  packages: [
    { name: 'engine', path: 'packages/engine', tests: 1452, coverage: 89 },
    { name: 'cli', path: 'packages/cli', tests: 379, coverage: 76 },
    { name: 'control-plane', path: 'packages/control-plane', tests: 372, coverage: 82 }
  ],
  integrations: ['playwright', 'chrome-devtools', 'context7', 'codebase-memory'],
  platforms: ['claude', 'codex', 'cursor', 'antigravity', 'grok']
};

export const mockProfiles = [
  {
    id: '5fedu',
    name: '5fedu ERP',
    modules: ['nhan-vien', 'phong-ban', 'chuc-vu', 'phan-quyen', 'thong-tin-cong-ty'],
    status: 'active'
  }
];

export const mockAuditLog = [
  {
    id: 'audit-001',
    action: 'plan.created',
    timestamp: new Date().toISOString(),
    details: { planId: 'plan-001', name: 'Demo Active Plan' }
  },
  {
    id: 'audit-002',
    action: 'run.started',
    timestamp: new Date().toISOString(),
    details: { runId: 'run-001', agent: 'claude' }
  },
  {
    id: 'audit-003',
    action: 'evaluation.passed',
    timestamp: new Date().toISOString(),
    details: { evalId: 'eval-001', score: 95 }
  }
];
