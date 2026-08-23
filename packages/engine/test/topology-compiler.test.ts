import { describe, expect, it, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  compileTopology,
  topologyHash,
  verifyLayers,
  runIngressJourney,
  REQUIRED_TOPOLOGY_GATES,
  TOPOLOGY_VERIFICATION_LAYERS,
  type SystemTopology,
  type TopologyEvidence,
  type TopologyDriver,
} from '../src/topology-compiler.js';

const FIXTURE_DIR = path.join(import.meta.dirname, 'fixtures', 'topology');
const RUNNER = path.join(FIXTURE_DIR, 'runner.mjs');
const C1_STUB = path.join(FIXTURE_DIR, 'c1-system-topology.yaml');

function fixtureTopology(): SystemTopology {
  return {
    schema_version: 1,
    services: [
      { id: 'ingress', kind: 'node', status: 'EXISTS', path: 'test/fixtures/topology/fixture.mjs', note: 'public HTTP ingress; verifier drives this port only' },
      { id: 'api', kind: 'node', status: 'EXISTS', note: 'internal api; owns db.json + migrations + seed' },
      { id: 'worker', kind: 'process', status: 'EXISTS', note: 'polls queue.json; async processing' },
    ],
    processes: [{ id: 'worker', kind: 'process', status: 'EXISTS', command: 'node fixture.mjs worker' }],
    images: [{ id: 'fixture', status: 'EXISTS', tag: 'test-only', note: 'plain node processes; no container image' }],
    ports: [
      { service: 'ingress', port: 0, host: '127.0.0.1', class: 'public', protocol: 'http' },
      { service: 'api', port: 0, host: '127.0.0.1', class: 'internal', protocol: 'http' },
    ],
    ingress: { public_ingress: 'EXISTS', note: 'fixture public ingress (ephemeral port)' },
    databases: [{ id: 'db', kind: 'json-file', status: 'EXISTS', path: 'state/db.json', note: 'versioned schema + migrationLog' }],
    queues: [{ id: 'queue', status: 'EXISTS', note: 'state/queue.json consumed by worker' }],
    object_stores: [{ id: 'rollback-state', status: 'EXISTS', note: 'state/rollback.json generation marker' }],
    workers: [{ id: 'worker', status: 'EXISTS', command: 'node fixture.mjs worker' }],
    external_boundaries: [{ id: 'none', status: 'GAP', direction: 'none', note: 'fixture is fully local; no outbound network' }],
    migrations: [
      { id: 'm1-items', status: 'EXISTS', note: 'schema 1: items + meta' },
      { id: 'm2-seed', status: 'EXISTS', note: 'schema 2: meta.seeded flag' },
    ],
    seed: { status: 'EXISTS', command: 'POST /seed', note: 'idempotent seed step' },
    health: { probe: 'GET /health', status: 'EXISTS', note: 'aggregate health through ingress' },
    startup: [{ id: 'ingress', status: 'EXISTS', command: 'node fixture.mjs ingress' }],
    shutdown: [{ id: 'sigterm', status: 'EXISTS', command: 'SIGTERM graceful close' }],
    auth_roles: { status: 'GAP', note: 'fixture is local-only; no auth roles' },
    journeys: [
      { id: 'user-journey', status: 'EXISTS', steps: ['health', 'seed', 'create-item', 'enqueue', 'worker-done'] },
      { id: 'full-stack-public-ingress', status: 'EXISTS', steps: ['ingress-up', 'migrations', 'data-written', 'async-journey', 'restart-persist', 'rollback', 'cleanup'] },
    ],
    persistence: { status: 'EXISTS', note: 'db.json survives restart' },
    rollback: { marker: 'rollback.json generation restore' },
  };
}

function hashOf(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function makeDriver(stateDir: string): TopologyDriver {
  const run = (args: string[]): string => execFileSync(process.execPath, [RUNNER, ...args], { encoding: 'utf8', timeout: 20_000 });
  return {
    stateDir,
    async start() {
      const out = run(['start', stateDir]);
      const m = out.match(/READY (.+)/);
      const ep = m ? JSON.parse(m[1]) : {};
      return { ingressUrl: ep.ingressUrl };
    },
    async restart() {
      const out = run(['restart', stateDir]);
      const m = out.match(/READY (.+)/);
      const ep = m ? JSON.parse(m[1]) : JSON.parse(fs.readFileSync(path.join(stateDir, 'endpoints.json'), 'utf8'));
      return { ingressUrl: ep.ingressUrl };
    },
    async stop() { run(['stop', stateDir]); },
    async cleanup() { run(['cleanup', stateDir]); },
    logs() {
      const dir = path.join(stateDir, 'logs');
      return fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => path.join(dir, f)) : [];
    },
  };
}

function runE(ev: Array<Partial<TopologyEvidence>>): TopologyEvidence[] {
  const now = new Date().toISOString();
  return ev.map((e, i) => ({
    claims: ['test claim'],
    evidenceRefs: [`evidence://test/${i}`],
    evidenceHashes: ['a'.repeat(64)],
    observedAt: now,
    ...e,
  })) as TopologyEvidence[];
}

describe('topology-compiler (C6, AM-0019 §8)', () => {
  describe('compile + validate + GAP honesty', () => {
    it('parses the C1 stub system-topology.yaml and keeps it valid', () => {
      const src = hashOf(C1_STUB);
      const compiled = compileTopology(src);
      expect(compiled.valid).toBe(true);
      expect(compiled.errors).toEqual([]);
      expect(compiled.topology.schema_version).toBe(1);
      expect(compiled.topology.services.length).toBe(5);
      expect(compiled.topology.ingress.public_ingress).toBe('GAP');
      // C1 stub already declares its gaps honestly
      const gaps = compiled.topology.services.filter((s) => s.status === 'GAP');
      expect(gaps.length).toBe(2);
    });

    it('fills missing §8 sections with honest GAP markers + warnings', () => {
      const compiled = compileTopology('services:\n  - id: engine\n    kind: node\n    status: EXISTS\n');
      expect(compiled.valid).toBe(true);
      // absent sections must be GAP, never EXISTS
      expect(compiled.topology.seed.status).toBe('GAP');
      expect(compiled.topology.persistence.status).toBe('GAP');
      expect(compiled.topology.auth_roles.status).toBe('GAP');
      expect(compiled.topology.health.status).toBe('GAP');
      expect(compiled.topology.ingress.public_ingress).toBe('GAP');
      expect(compiled.warnings.some((w) => w.includes('seed absent'))).toBe(true);
      expect(compiled.topology.rollback).toEqual({});
    });

    it('rejects malformed topologies', () => {
      const bad = compileTopology('schema_version: "1"\nservices: nope\n');
      expect(bad.valid).toBe(false);
      expect(bad.errors.length).toBeGreaterThan(0);
    });

    it('stays YAML-compatible with the C9 topology view (M11Views.tsx)', () => {
      const compiled = compileTopology(hashOf(C1_STUB));
      const yaml = stringifyYaml(compiled.topology);
      const roundTrip = parseYaml(yaml) as Record<string, unknown>;
      // C9 topologyView() reads exactly these top-level keys
      for (const key of ['services', 'ports', 'ingress', 'databases', 'queues', 'migrations', 'health', 'journeys', 'rollback']) {
        expect(roundTrip[key]).toBeDefined();
      }
      expect(compileTopology(yaml).valid).toBe(true);
    });
  });

  describe('topologyHash', () => {
    it('is deterministic and content-sensitive', () => {
      const t = fixtureTopology();
      expect(topologyHash(t)).toBe(topologyHash(t));
      const mutated: SystemTopology = { ...t, services: [...t.services, { id: 'extra', kind: 'process', status: 'GAP' }] };
      expect(topologyHash(mutated)).not.toBe(topologyHash(t));
      // object key insertion order must not change the hash (arrays stay ordered)
      const reordered = { ...t } as SystemTopology & Record<string, unknown>;
      delete reordered.journeys;
      reordered.journeys = t.journeys;
      expect(topologyHash(reordered)).toBe(topologyHash(t));
    });
  });

  describe('layered verification', () => {
    it('requires evidence at every mandatory layer before PASS', () => {
      const result = verifyLayers(fixtureTopology(), []);
      expect(result.verdict).toBe('WAITING_EXTERNAL');
      const required = result.layers.filter((l) => REQUIRED_TOPOLOGY_GATES.includes(l.layer));
      expect(required.every((l) => l.status === 'WAITING_EXTERNAL')).toBe(true);
      const optional = result.layers.filter((l) => !REQUIRED_TOPOLOGY_GATES.includes(l.layer));
      expect(optional.every((l) => l.status === 'NOT_RUN')).toBe(true);
    });

    it('component-only evidence cannot close a release claim (cross-layer gate)', () => {
      // unit/component/contract/service-integration closed by component tests
      const evidence = runE([
        { layer: 'unit', source: 'worker' },
        { layer: 'component', source: 'worker' },
        { layer: 'contract', source: 'system-verifier' },
        { layer: 'service-integration', source: 'system-verifier' },
        // release-rollback claims PASS with only component-level evidence
        { layer: 'release-rollback', source: 'worker' },
      ]);
      const result = verifyLayers(fixtureTopology(), evidence);
      const rr = result.layers.find((l) => l.layer === 'release-rollback');
      expect(rr?.status).toBe('FAIL');
      expect(rr?.reason).toContain('worker/component evidence cannot close a release claim');
      expect(result.verdict).toBe('FAIL');
    });

    it('rejects release claims deduplicated from component evidence', () => {
      const now = new Date().toISOString();
      const componentEvidence = { claims: ['unit+component pass'], evidenceRefs: ['evidence://t/1'], evidenceHashes: ['b'.repeat(64)], observedAt: now };
      const evidence = [
        { layer: 'component' as const, ...componentEvidence, source: 'worker' as const },
        { layer: 'release-rollback' as const, ...componentEvidence, source: 'system-verifier' as const },
      ];
      const result = verifyLayers(fixtureTopology(), evidence);
      const rr = result.layers.find((l) => l.layer === 'release-rollback');
      expect(rr?.status).toBe('FAIL');
      expect(rr?.reason).toContain('cross-layer dedup');
      expect(result.crossLayer.dedupViolations.length).toBeGreaterThan(0);
    });

    it('PASS requires fresh system-verifier evidence for required gates', () => {
      const evidence = runE([
        { layer: 'unit', source: 'worker' },
        { layer: 'component', source: 'worker' },
        { layer: 'contract', source: 'system-verifier' },
        { layer: 'service-integration', source: 'system-verifier' },
        { layer: 'exact-deployed-topology', source: 'system-verifier' },
        { layer: 'public-ingress-journey', source: 'system-verifier' },
        { layer: 'release-rollback', source: 'system-verifier' },
      ]);
      const result = verifyLayers(fixtureTopology(), evidence);
      expect(result.verdict).toBe('PASS');
      expect(result.layers.every((l) => l.status === 'PASS')).toBe(true);
    });

    it('rejects stale required-gate evidence', () => {
      const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const evidence = runE([
        { layer: 'unit', source: 'worker' },
        { layer: 'component', source: 'worker' },
        { layer: 'contract', source: 'system-verifier' },
        { layer: 'service-integration', source: 'system-verifier' },
        { layer: 'exact-deployed-topology', source: 'system-verifier', observedAt: stale },
        { layer: 'public-ingress-journey', source: 'system-verifier', observedAt: stale },
        { layer: 'release-rollback', source: 'system-verifier', observedAt: stale },
      ]);
      const result = verifyLayers(fixtureTopology(), evidence);
      expect(result.verdict).toBe('FAIL');
      expect(result.layers.some((l) => l.status === 'FAIL')).toBe(true);
    });
  });

  describe('required gate: cannot PASS via SKIPPED', () => {
    it('a SKIPPED-claimed required gate collapses to WAITING_EXTERNAL', () => {
      const evidence = runE([
        { layer: 'unit', source: 'worker' },
        { layer: 'component', source: 'worker' },
        { layer: 'contract', source: 'system-verifier' },
        { layer: 'service-integration', source: 'system-verifier' },
        { layer: 'exact-deployed-topology', source: 'system-verifier' },
        { layer: 'public-ingress-journey', source: 'system-verifier' },
        { layer: 'release-rollback', source: 'system-verifier', skipped: true },
      ]);
      const result = verifyLayers(fixtureTopology(), evidence);
      const rr = result.layers.find((l) => l.layer === 'release-rollback');
      expect(rr?.status).toBe('WAITING_EXTERNAL');
      expect(rr?.reason).toContain('cannot PASS via SKIPPED');
      expect(result.verdict).toBe('WAITING_EXTERNAL');
      expect(result.verdict).not.toBe('PASS');
      expect(result.requiredGate).toEqual({ name: 'release-rollback', status: 'WAITING_EXTERNAL', skippedClaimed: true });
    });

    it('skipping an optional layer does not block', () => {
      const evidence = runE([
        { layer: 'component', source: 'worker', skipped: true },
        { layer: 'unit', source: 'worker' },
      ]);
      const result = verifyLayers(fixtureTopology(), evidence);
      expect(result.layers.find((l) => l.layer === 'component')?.status).toBe('NOT_RUN');
      expect(result.verdict).toBe('WAITING_EXTERNAL'); // required gates still wait for evidence
    });
  });

  describe('public-ingress journey (controlled fixture, AM-0019 §12)', () => {
    const stateDir = path.join(os.tmpdir(), `topology-fixture-${process.pid}-${Date.now()}`);
    const driver = makeDriver(stateDir);
    afterAll(() => { try { driver.cleanup(); } catch { /* already gone */ } });

    it('cleanup terminates detached fixture processes before deleting their pid registry', { timeout: 30_000 }, () => {
      const isolatedState = path.join(os.tmpdir(), `topology-cleanup-${process.pid}-${Date.now()}`);
      const out = execFileSync(process.execPath, [RUNNER, 'start', isolatedState], { encoding: 'utf8', timeout: 20_000 });
      expect(out).toContain('READY ');
      const pidFile = path.join(isolatedState, 'pids.json');
      const { pids } = JSON.parse(fs.readFileSync(pidFile, 'utf8')) as { pids: number[] };
      expect(pids).toHaveLength(3);

      execFileSync(process.execPath, [RUNNER, 'cleanup', isolatedState], { encoding: 'utf8', timeout: 20_000 });
      expect(fs.existsSync(isolatedState)).toBe(false);
      const alive = pids.filter((pid) => {
        try { process.kill(pid, 0); return true; } catch { return false; }
      });
      expect(alive).toEqual([]);
    });

    it('self-terminates detached fixture processes when the owning test process disappears', { timeout: 30_000 }, async () => {
      const isolatedState = path.join(os.tmpdir(), `topology-owner-exit-${process.pid}-${Date.now()}`);
      const ownerScript = `const { execFileSync } = require('node:child_process'); execFileSync(process.execPath, [${JSON.stringify(RUNNER)}, 'start', ${JSON.stringify(isolatedState)}], { encoding: 'utf8', timeout: 20000 });`;
      execFileSync(process.execPath, ['-e', ownerScript], { encoding: 'utf8', timeout: 25_000 });
      const pidFile = path.join(isolatedState, 'pids.json');
      const { pids } = JSON.parse(fs.readFileSync(pidFile, 'utf8')) as { pids: number[] };
      expect(pids).toHaveLength(3);

      const deadline = Date.now() + 5_000;
      let alive = [...pids];
      while (alive.length && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        alive = pids.filter((pid) => {
          try { process.kill(pid, 0); return true; } catch { return false; }
        });
      }
      fs.rmSync(isolatedState, { recursive: true, force: true });
      expect(alive).toEqual([]);
    });

    it('drives the fixture through the public port: health/migrations/data/async/restart/rollback/cleanup', { timeout: 60_000 }, async () => {
      const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(import.meta.dirname, '..', '..', '..'), encoding: 'utf8' }).trim();
      const evidence = await runIngressJourney({
        driver,
        topologyHash: topologyHash(fixtureTopology()),
        sourceSha,
        imageDigest: `sha256:${topologyHash(fixtureTopology())}`,
        pollTimeoutMs: 30000,
      });

      expect(evidence.passed, evidence.checkpoints.map((checkpoint) => `${checkpoint.name}=${checkpoint.ok}: ${checkpoint.detail}`).join(' | ')).toBe(true);
      const names = evidence.checkpoints.map((c) => c.name);
      expect(names).toEqual(['ingress-up', 'migrations-applied', 'data-written', 'async-journey', 'restart-persisted', 'rollback-reverted', 'cleanup']);
      for (const c of evidence.checkpoints) {
        expect(c.ok, `checkpoint ${c.name}: ${c.detail}`).toBe(true);
      }
      // every request went through the public ingress only
      expect(evidence.requests.length).toBeGreaterThanOrEqual(7);
      // log evidence is content-hashed
      expect(evidence.logs.length).toBeGreaterThanOrEqual(3);
      for (const l of evidence.logs) expect(l.sha256).toMatch(/^[a-f0-9]{64}$/);
      // evidence packet binds sha + topology hash + is deterministic hashable
      expect(evidence.sourceSha).toMatch(/^[a-f0-9]{40}$/);
      expect(evidence.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
      // state was cleaned up
      expect(fs.existsSync(stateDir)).toBe(false);
    });
  });

  describe('verification layer contract', () => {
    it('exposes the exact AM-0019 §8 chain', () => {
      expect(TOPOLOGY_VERIFICATION_LAYERS).toEqual([
        'unit', 'component', 'contract', 'service-integration',
        'exact-deployed-topology', 'public-ingress-journey', 'release-rollback',
      ]);
    });
  });
});
