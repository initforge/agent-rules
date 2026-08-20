/**
 * adversarial-fixture.ts — shared fixture plan / topology / claims for the
 * M11-R30 adversarial compiler suite (engine test + evals/m11 aggregation).
 */
import type { PlanInvariantProfile, ClaimDef } from '../src/adversarial-compiler.js';
import type { SystemTopology } from '../src/topology-compiler.js';

export const FIXTURE_PLAN: PlanInvariantProfile = {
  plan_id: 'hv3-m11-r30-fixture',
  domains_required: ['finance_concurrency', 'authorization_security', 'browser_parity', 'release'],
  finance: {
    tenants: ['acme', 'globex'],
    approvals_required: 2,
    idempotency_keys: true,
    capacity_limit: 100,
    uses_transactions: true,
  },
  security: {
    roles: ['admin', 'member'],
    default_deny: true,
    token_auth: true,
    proxy_aware: true,
  },
  browser: {
    routes: ['/runs', '/runs/:id'],
    viewports: [{ width: 1280, height: 720 }],
    themes: ['light', 'dark'],
    roles: ['visitor', 'member'],
    uses_cdp: true,
  },
  release: {
    migrations: ['001-init', '002-ledger'],
    uses_images: true,
    tracks_untracked: true,
  },
};

export const FIXTURE_TOPOLOGY: SystemTopology = {
  schema_version: 1,
  services: [{ id: 'ledger-api', kind: 'http', status: 'EXISTS', path: 'services/ledger' }],
  processes: [{ id: 'ledger', kind: 'web', status: 'EXISTS' }],
  images: [{ id: 'ledger-api:1.0.0', status: 'EXISTS', digest: `sha256:${'a'.repeat(64)}` }],
  ports: [{ service: 'ledger-api', port: 8080, host: '127.0.0.1', class: 'public', protocol: 'http' }],
  ingress: { public_ingress: 'EXISTS', url: 'http://127.0.0.1:8080' },
  databases: [{ id: 'ledger-db', kind: 'postgres', status: 'EXISTS' }],
  queues: [{ id: 'ledger-queue', status: 'EXISTS' }],
  object_stores: [{ id: 'ledger-store', status: 'EXISTS' }],
  workers: [{ id: 'ledger-worker', status: 'EXISTS', command: 'node worker.js' }],
  external_boundaries: [{ id: 'payments', status: 'EXISTS', direction: 'outbound', endpoint: 'https://payments.example.test' }],
  migrations: [
    { id: '001-init', status: 'EXISTS' },
    { id: '002-ledger', status: 'EXISTS' },
  ],
  seed: { status: 'EXISTS', command: 'npm run seed' },
  health: { probe: '/health', status: 'EXISTS' },
  startup: [{ id: 'migrate', status: 'EXISTS', command: 'npm run migrate' }],
  shutdown: [{ id: 'drain', status: 'EXISTS', command: 'npm run drain' }],
  auth_roles: { status: 'EXISTS', roles: ['admin', 'member'] },
  journeys: [{ id: 'submit-transfer', status: 'EXISTS', steps: ['login', 'transfer'] }],
  persistence: { status: 'EXISTS' },
  rollback: { migrations: 'revert-to-001-init' },
};

export const FIXTURE_CLAIMS: readonly ClaimDef[] = [
  {
    claim_id: 'claim-fin-1',
    risk_tier: 'T3',
    scope: 'finance/concurrency transfer integrity',
    domains: ['finance_concurrency'],
  },
  {
    claim_id: 'claim-auth-1',
    risk_tier: 'T2',
    scope: 'authorization boundary',
    domains: ['authorization_security'],
  },
  {
    claim_id: 'claim-browser-1',
    risk_tier: 'T-Visual',
    scope: 'browser parity',
    domains: ['browser_parity'],
  },
  {
    claim_id: 'claim-release-1',
    risk_tier: 'T3',
    scope: 'release/migration integrity',
    domains: ['release'],
  },
  {
    claim_id: 'claim-t0-mechanical',
    risk_tier: 'T0',
    scope: 'mechanical deterministic formatting',
    domains: [],
  },
];
