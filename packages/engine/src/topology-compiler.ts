/**
 * topology-compiler.ts — C6 whole-system topology compiler + layered verification
 * (AM-0019 §8, M11-R18 / M11-R19).
 *
 * - `SystemTopology` carries every §8 field: services/processes/images, ingress
 *   + internal ports, DB/queue/object store/worker, external boundaries,
 *   migrations, seed, health, startup/shutdown, auth roles, user journeys,
 *   persistence, rollback. Missing source fields compile as honest GAP markers —
 *   nothing is invented as EXISTS.
 * - `topologyHash()` is a deterministic sha256 over canonical JSON, so the same
 *   topology always binds to the same digest regardless of YAML key order.
 * - `verifyLayers()` evaluates the mandatory chain unit → component → contract →
 *   service-integration → exact-deployed-topology → public-ingress-journey →
 *   release-rollback. Required topology gates can never PASS via SKIPPED: a
 *   skipped claim collapses to nonterminal WAITING_EXTERNAL. Worker/component
 *   evidence cannot close a release claim (system-verifier source check plus
 *   cross-layer evidence dedup).
 * - `runIngressJourney()` drives HTTP through the PUBLIC ingress port only and
 *   records source SHA, image digest, topology hash, health, migrations, logs,
 *   data effects, restart persistence, rollback and cleanup on a live fixture.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { isSha256, type Sha256 } from './contracts.js';

export type TopoStatus = 'EXISTS' | 'GAP';

export const TOPOLOGY_VERIFICATION_LAYERS = [
  'unit', 'component', 'contract', 'service-integration',
  'exact-deployed-topology', 'public-ingress-journey', 'release-rollback',
] as const;
export type TopologyVerificationLayer = (typeof TOPOLOGY_VERIFICATION_LAYERS)[number];

/** Layers a whole-system verifier must close itself — no worker skip, no worker evidence. */
export const REQUIRED_TOPOLOGY_GATES: readonly TopologyVerificationLayer[] = [
  'exact-deployed-topology', 'public-ingress-journey', 'release-rollback',
];

export type TopologyGateStatus = 'PASS' | 'FAIL' | 'WAITING_EXTERNAL' | 'NOT_RUN';
export type TopologyEvidenceSource = 'worker' | 'system-verifier' | 'external';

// ── SystemTopology (AM-0019 §8) ─────────────────────────────────────────────

export interface TopologyService {
  id: string;
  kind: string;
  status: TopoStatus;
  path?: string;
  image?: string;
  note?: string;
}

export interface TopologyProcess { id: string; kind: string; status: TopoStatus; command?: string; note?: string; }
export interface TopologyImage { id: string; status: TopoStatus; digest?: string; tag?: string; note?: string; }
export interface TopologyPort { service: string; port: number | string; host: string; class: 'public' | 'internal'; protocol?: string; note?: string; }
export interface TopologyIngress { public_ingress: TopoStatus; url?: string; note?: string; }
export interface TopologyDatabase { id: string; kind: string; status: TopoStatus; path?: string; note?: string; }
export interface TopologyQueue { id: string; status: TopoStatus; note?: string; }
export interface TopologyObjectStore { id: string; status: TopoStatus; note?: string; }
export interface TopologyWorker { id: string; status: TopoStatus; command?: string; note?: string; }
export interface TopologyExternalBoundary { id: string; status: TopoStatus; direction: 'inbound' | 'outbound' | 'none'; endpoint?: string; note?: string; }
export interface TopologyMigration { id: string; status: TopoStatus; note?: string; }
export interface TopologySeed { status: TopoStatus; command?: string; note?: string; }
export interface TopologyHealth { probe?: string; status: TopoStatus; note?: string; }
export interface TopologyLifecycleEntry { id: string; status: TopoStatus; command?: string; note?: string; }
export interface TopologyAuthRoles { status: TopoStatus; roles?: string[]; note?: string; }
export interface TopologyJourney { id: string; status: TopoStatus; steps?: string[]; note?: string; }
export interface TopologyPersistence { status: TopoStatus; note?: string; }
export interface TopologyRollback { [key: string]: string | undefined; }

export interface SystemTopology {
  schema_version: number;
  services: TopologyService[];
  processes: TopologyProcess[];
  images: TopologyImage[];
  ports: TopologyPort[];
  ingress: TopologyIngress;
  databases: TopologyDatabase[];
  queues: TopologyQueue[];
  object_stores: TopologyObjectStore[];
  workers: TopologyWorker[];
  external_boundaries: TopologyExternalBoundary[];
  migrations: TopologyMigration[];
  seed: TopologySeed;
  health: TopologyHealth;
  startup: TopologyLifecycleEntry[];
  shutdown: TopologyLifecycleEntry[];
  auth_roles: TopologyAuthRoles;
  journeys: TopologyJourney[];
  persistence: TopologyPersistence;
  rollback: TopologyRollback;
}

export interface CompiledTopology {
  topology: SystemTopology;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function rec(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function normStatus(v: unknown): TopoStatus {
  return v === 'EXISTS' ? 'EXISTS' : 'GAP';
}
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (isRecord(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

// ── compile ─────────────────────────────────────────────────────────────────

function service(v: unknown): TopologyService {
  const r = rec(v);
  return { id: str(r.id, 'unnamed'), kind: str(r.kind, 'process'), status: normStatus(r.status), path: r.path === undefined ? undefined : str(r.path), image: r.image === undefined ? undefined : str(r.image), note: r.note === undefined ? undefined : str(r.note) };
}
function processEntry(v: unknown): TopologyProcess {
  const r = rec(v);
  return { id: str(r.id, 'unnamed'), kind: str(r.kind, 'process'), status: normStatus(r.status), command: r.command === undefined ? undefined : str(r.command), note: r.note === undefined ? undefined : str(r.note) };
}
function image(v: unknown): TopologyImage {
  const r = rec(v);
  return { id: str(r.id, 'unnamed'), status: normStatus(r.status), digest: r.digest === undefined ? undefined : str(r.digest), tag: r.tag === undefined ? undefined : str(r.tag), note: r.note === undefined ? undefined : str(r.note) };
}
function port(v: unknown): TopologyPort {
  const r = rec(v);
  return { service: str(r.service, 'unnamed'), port: typeof r.port === 'number' ? r.port : str(r.port, 'TBD'), host: str(r.host, '127.0.0.1'), class: r.class === 'public' ? 'public' : 'internal', protocol: r.protocol === undefined ? undefined : str(r.protocol), note: r.note === undefined ? undefined : str(r.note) };
}
function db(v: unknown): TopologyDatabase {
  const r = rec(v);
  return { id: str(r.id, 'unnamed'), kind: str(r.kind, 'db'), status: normStatus(r.status), path: r.path === undefined ? undefined : str(r.path), note: r.note === undefined ? undefined : str(r.note) };
}
function statusEntry(id: string, status: TopoStatus, note: string): TopologyQueue {
  return { id, status, note };
}
function migration(v: unknown): TopologyMigration {
  const r = rec(v);
  return { id: str(r.id, 'unnamed'), status: normStatus(r.status), note: r.note === undefined ? undefined : str(r.note) };
}
function journey(v: unknown): TopologyJourney {
  const r = rec(v);
  return { id: str(r.id, 'unnamed'), status: normStatus(r.status), steps: r.steps === undefined ? undefined : arr(r.steps).map(String), note: r.note === undefined ? undefined : str(r.note) };
}
function boundary(v: unknown): TopologyExternalBoundary {
  const r = rec(v);
  const d = str(r.direction, 'none');
  return { id: str(r.id, 'unnamed'), status: normStatus(r.status), direction: d === 'inbound' || d === 'outbound' ? d : 'none', endpoint: r.endpoint === undefined ? undefined : str(r.endpoint), note: r.note === undefined ? undefined : str(r.note) };
}
function worker(v: unknown): TopologyWorker {
  const r = rec(v);
  return { id: str(r.id, 'unnamed'), status: normStatus(r.status), command: r.command === undefined ? undefined : str(r.command), note: r.note === undefined ? undefined : str(r.note) };
}
function lifecycle(v: unknown): TopologyLifecycleEntry {
  const r = rec(v);
  return { id: str(r.id, 'unnamed'), status: normStatus(r.status), command: r.command === undefined ? undefined : str(r.command), note: r.note === undefined ? undefined : str(r.note) };
}

/**
 * Compile a raw YAML string or object into a fully-typed SystemTopology.
 * Any §8 section missing from the source is filled with honest GAP markers and
 * recorded as a warning — never invented as EXISTS.
 */
export function compileTopology(input: string | Record<string, unknown>): CompiledTopology {
  let raw: Record<string, unknown>;
  try {
    raw = typeof input === 'string' ? ((parseYaml(input) as Record<string, unknown> | null) ?? {}) : input;
  } catch (e) {
    return { topology: emptyTopology(), valid: false, errors: [`YAML parse failed: ${e instanceof Error ? e.message : String(e)}`], warnings: [] };
  }
  if (!isRecord(raw)) {
    return { topology: emptyTopology(), valid: false, errors: ['topology source is not an object'], warnings: [] };
  }
  const warnings: string[] = [];

  const present = (key: string): boolean => raw[key] !== undefined;
  const absent = (key: string, what: string): void => {
    if (!present(key)) warnings.push(`${key} absent in source — compiled as honest GAP markers for ${what}`);
  };

  absent('processes', 'processes');
  absent('images', 'images');
  absent('object_stores', 'object stores');
  absent('workers', 'workers');
  absent('external_boundaries', 'external boundaries');
  absent('seed', 'seed');
  absent('startup', 'startup');
  absent('shutdown', 'shutdown');
  absent('auth_roles', 'auth roles');
  absent('persistence', 'persistence');

  const ingressRaw = rec(raw.ingress);
  const seedRaw = rec(raw.seed);
  const healthRaw = rec(raw.health);
  const authRaw = rec(raw.auth_roles);
  const persistRaw = rec(raw.persistence);
  const rollbackRaw = rec(raw.rollback);

  const topology: SystemTopology = {
    schema_version: typeof raw.schema_version === 'number' ? raw.schema_version : 1,
    services: arr(raw.services).map(service),
    processes: arr(raw.processes).map(processEntry),
    images: arr(raw.images).map(image),
    ports: arr(raw.ports).map(port),
    ingress: {
      public_ingress: normStatus(ingressRaw.public_ingress),
      url: ingressRaw.url === undefined ? undefined : str(ingressRaw.url),
      note: ingressRaw.note === undefined ? undefined : str(ingressRaw.note),
    },
    databases: arr(raw.databases).map(db),
    queues: arr(raw.queues).map((q) => statusEntry(str(rec(q).id, 'unnamed'), normStatus(rec(q).status), str(rec(q).note))),
    object_stores: arr(raw.object_stores).map((o) => statusEntry(str(rec(o).id, 'unnamed'), normStatus(rec(o).status), str(rec(o).note))),
    workers: arr(raw.workers).map(worker),
    external_boundaries: arr(raw.external_boundaries).map(boundary),
    migrations: arr(raw.migrations).map(migration),
    seed: {
      status: normStatus(seedRaw.status),
      command: seedRaw.command === undefined ? undefined : str(seedRaw.command),
      note: seedRaw.note === undefined ? undefined : str(seedRaw.note),
    },
    health: {
      probe: healthRaw.probe === undefined ? undefined : str(healthRaw.probe),
      status: normStatus(healthRaw.status),
      note: healthRaw.note === undefined ? undefined : str(healthRaw.note),
    },
    startup: arr(raw.startup).map(lifecycle),
    shutdown: arr(raw.shutdown).map(lifecycle),
    auth_roles: {
      status: normStatus(authRaw.status),
      roles: arr(authRaw.roles).map(String),
      note: authRaw.note === undefined ? undefined : str(authRaw.note),
    },
    journeys: arr(raw.journeys).map(journey),
    persistence: {
      status: normStatus(persistRaw.status),
      note: persistRaw.note === undefined ? undefined : str(persistRaw.note),
    },
    rollback: ((): TopologyRollback => {
      const out: TopologyRollback = {};
      for (const [k, v] of Object.entries(rollbackRaw)) {
        if (v === undefined || typeof v === 'string') out[k] = v;
      }
      return out;
    })(),
  };

  return { topology, valid: validateTopology(topology).length === 0, errors: validateTopology(topology), warnings };
}

function emptyTopology(): SystemTopology {
  return {
    schema_version: 1, services: [], processes: [], images: [], ports: [],
    ingress: { public_ingress: 'GAP' }, databases: [], queues: [], object_stores: [],
    workers: [], external_boundaries: [], migrations: [], seed: { status: 'GAP' },
    health: { status: 'GAP' }, startup: [], shutdown: [], auth_roles: { status: 'GAP' },
    journeys: [], persistence: { status: 'GAP' }, rollback: {},
  };
}

/** Structural validation of the compiled topology. Returns a list of errors (empty = valid). */
export function validateTopology(t: SystemTopology): string[] {
  const errors: string[] = [];
  if (typeof t.schema_version !== 'number' || t.schema_version < 1) errors.push('schema_version must be a number >= 1');
  if (!Array.isArray(t.services) || t.services.length === 0) errors.push('services must be a non-empty array');
  for (const s of t.services) {
    if (typeof s.id !== 'string' || s.id.trim().length === 0) errors.push('every service needs a non-empty id');
    if (s.status !== 'EXISTS' && s.status !== 'GAP') errors.push(`service ${s.id}: status must be EXISTS or GAP`);
  }
  if (!Array.isArray(t.ports)) errors.push('ports must be an array');
  for (const p of t.ports) {
    if (p.class !== 'public' && p.class !== 'internal') errors.push(`port ${p.service}: class must be public or internal`);
    if (p.port !== 'TBD' && typeof p.port !== 'number' && p.port !== undefined && typeof p.port !== 'string') errors.push(`port ${p.service}: port must be a number or TBD`);
  }
  if (!isRecord(t.ingress) || (t.ingress.public_ingress !== 'EXISTS' && t.ingress.public_ingress !== 'GAP')) errors.push('ingress.public_ingress must be EXISTS or GAP');
  for (const key of ['databases', 'queues', 'object_stores', 'workers', 'external_boundaries', 'migrations', 'journeys'] as const) {
    if (!Array.isArray(t[key])) errors.push(`${key} must be an array`);
  }
  if (!isRecord(t.health) || (t.health.status !== 'EXISTS' && t.health.status !== 'GAP')) errors.push('health.status must be EXISTS or GAP');
  if (!isRecord(t.seed) || (t.seed.status !== 'EXISTS' && t.seed.status !== 'GAP')) errors.push('seed.status must be EXISTS or GAP');
  if (!isRecord(t.persistence) || (t.persistence.status !== 'EXISTS' && t.persistence.status !== 'GAP')) errors.push('persistence.status must be EXISTS or GAP');
  if (!isRecord(t.auth_roles) || (t.auth_roles.status !== 'EXISTS' && t.auth_roles.status !== 'GAP')) errors.push('auth_roles.status must be EXISTS or GAP');
  if (typeof t.rollback !== 'object' || t.rollback === null || Array.isArray(t.rollback)) errors.push('rollback must be an object');
  return errors;
}

/** Deterministic sha256 over canonical JSON of the topology. */
export function topologyHash(t: SystemTopology): Sha256 {
  return createHash('sha256').update(canonicalJson(t)).digest('hex') as Sha256;
}

// ── layered verification (AM-0019 §8) ───────────────────────────────────────

export interface TopologyEvidence {
  layer: TopologyVerificationLayer;
  claims: string[];
  evidenceRefs: string[];
  evidenceHashes: string[];
  source: TopologyEvidenceSource;
  skipped?: boolean;
  observedAt?: string;
}

export interface LayerResult {
  layer: TopologyVerificationLayer;
  status: TopologyGateStatus;
  required: boolean;
  reason: string;
  evidenceRefs: string[];
  fingerprint: string | null;
}
export interface CrossLayerCheck {
  dedupViolations: string[];
  releaseClosedByComponent: boolean;
}
export interface RequiredGateSummary {
  name: TopologyVerificationLayer | null;
  status: TopologyGateStatus | null;
  skippedClaimed: boolean;
}
export interface TopologyVerificationResult {
  topologyHash: Sha256;
  verdict: 'PASS' | 'FAIL' | 'WAITING_EXTERNAL';
  layers: LayerResult[];
  crossLayer: CrossLayerCheck;
  requiredGate: RequiredGateSummary;
}

const FRESH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function evidenceFingerprint(evs: TopologyEvidence[]): { fp: string; pairs: string[] } {
  const pairs = [...new Set(
    evs.flatMap((e) => e.evidenceRefs.map((uri, i) => `${uri}:${e.evidenceHashes[i]}`)),
  )].sort();
  return { fp: pairs.join('|'), pairs };
}

/**
 * Evaluate every mandatory verification layer against evidence.
 *
 * Required gates (exact-deployed-topology, public-ingress-journey,
 * release-rollback) cannot be closed by worker evidence, by a SKIPPED claim, or
 * by evidence deduplicated from lower layers — those collapse to WAITING_EXTERNAL
 * (nonterminal) or FAIL, never PASS.
 */
export function verifyLayers(topology: SystemTopology, evidence: TopologyEvidence[], now = Date.now()): TopologyVerificationResult {
  const layers: LayerResult[] = [];
  const dedupViolations: string[] = [];
  const fingerprints = new Map<TopologyVerificationLayer, { fp: string; pairs: string[] }>();
  let skippedRequired: TopologyVerificationLayer | null = null;

  for (const layer of TOPOLOGY_VERIFICATION_LAYERS) {
    const required = REQUIRED_TOPOLOGY_GATES.includes(layer);
    const evs = evidence.filter((e) => e.layer === layer);

    if (evs.length === 0) {
      layers.push({
        layer, required,
        status: required ? 'WAITING_EXTERNAL' : 'NOT_RUN',
        reason: required
          ? `required topology gate ${layer}: no evidence — nonterminal WAITING_EXTERNAL`
          : 'no evidence; not run',
        evidenceRefs: [], fingerprint: null,
      });
      continue;
    }

    if (evs.some((e) => e.skipped === true)) {
      if (required) {
        skippedRequired = layer;
        layers.push({
          layer, required, status: 'WAITING_EXTERNAL', evidenceRefs: [], fingerprint: null,
          reason: `required topology gate ${layer}: SKIPPED claim rejected — a required gate cannot PASS via SKIPPED; move to a capable runner or stay nonterminal WAITING_EXTERNAL`,
        });
      } else {
        layers.push({ layer, required, status: 'NOT_RUN', evidenceRefs: [], fingerprint: null, reason: 'skipped; optional layer' });
      }
      continue;
    }

    const refs = [...new Set(evs.flatMap((e) => e.evidenceRefs))];
    const { fp, pairs } = evidenceFingerprint(evs);
    const freshnessOk = evs.every((e) => {
      if (!e.observedAt) return true;
      const at = Date.parse(e.observedAt);
      return !Number.isNaN(at) && at <= now && now - at <= FRESH_MAX_AGE_MS;
    });
    const wellFormed = evs.every((e) => e.claims.length > 0
      && e.evidenceRefs.length === e.evidenceHashes.length
      && e.evidenceHashes.every((h) => isSha256(h)));
    if (refs.length === 0 || !wellFormed || !freshnessOk) {
      layers.push({ layer, required, status: 'FAIL', reason: 'evidence malformed (empty claims, ref/hash mismatch, invalid sha256, or stale observedAt)', evidenceRefs: refs, fingerprint: fp });
      continue;
    }

    let failed = false;
    let reason = `fresh evidence: ${evs.map((e) => e.source).join(',')}`;
    if (required) {
      if (!evs.some((e) => e.source === 'system-verifier')) {
        layers.push({ layer, required, status: 'FAIL', reason: `required gate ${layer}: evidence source must be system-verifier — worker/component evidence cannot close a release claim`, evidenceRefs: refs, fingerprint: fp });
        continue;
      }
      for (const [lower, lowerF] of fingerprints) {
        if (pairs.every((p) => lowerF.pairs.includes(p))) {
          failed = true;
          dedupViolations.push(`${layer} evidence is a subset of ${lower} evidence`);
          reason = `cross-layer dedup: ${layer} reuses ${lower} evidence — component evidence cannot close a release claim`;
          break;
        }
      }
    }

    if (failed) {
      layers.push({ layer, required, status: 'FAIL', reason, evidenceRefs: refs, fingerprint: fp });
      continue;
    }
    layers.push({ layer, required, status: 'PASS', reason, evidenceRefs: refs, fingerprint: fp });
    fingerprints.set(layer, { fp, pairs });
  }

  const failed = layers.filter((l) => l.status === 'FAIL');
  const waiting = layers.filter((l) => l.status === 'WAITING_EXTERNAL');
  const verdict = failed.length > 0 ? 'FAIL' : waiting.length > 0 ? 'WAITING_EXTERNAL' : 'PASS';

  return {
    topologyHash: topologyHash(topology),
    verdict,
    layers,
    crossLayer: { dedupViolations, releaseClosedByComponent: dedupViolations.length > 0 },
    requiredGate: skippedRequired
      ? { name: skippedRequired, status: 'WAITING_EXTERNAL', skippedClaimed: true }
      : { name: null, status: null, skippedClaimed: false },
  };
}

// ── public-ingress journey verifier (AM-0019 §8/§12) ────────────────────────

export interface TopologyDriver {
  readonly stateDir: string;
  start(): Promise<{ ingressUrl: string }>;
  restart(): Promise<{ ingressUrl: string }>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
  logs(): string[];
}

export interface JourneyCheckpoint { name: string; ok: boolean; detail: string; }
export interface JourneyRequest { method: string; path: string; status: number; }

export interface IngressJourneyEvidence {
  sourceSha: string;
  imageDigest: string;
  topologyHash: Sha256;
  ingressBaseUrl: string;
  checkpoints: JourneyCheckpoint[];
  requests: JourneyRequest[];
  logs: Array<{ path: string; sha256: Sha256 }>;
  startedAt: string;
  completedAt: string;
  evidenceHash: Sha256;
  passed: boolean;
}

export interface IngressJourneyOptions {
  driver: TopologyDriver;
  topologyHash: string;
  sourceSha?: string;
  imageDigest?: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

async function httpJson(base: string, method: string, pathname: string, body?: unknown, timeoutMs = 4000): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${pathname}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function sha256File(p: string): Sha256 {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex') as Sha256;
}

/**
 * Drive a clean fixture exclusively through its PUBLIC ingress port. Never hits
 * internal ports directly. Records health, migrations, data effects, async
 * journey (queue + worker), restart persistence, rollback revert, log hashes and
 * cleanup as one content-addressed evidence packet.
 */
export async function runIngressJourney(opts: IngressJourneyOptions): Promise<IngressJourneyEvidence> {
  const { driver, topologyHash: th, sourceSha = 'none', imageDigest = 'none' } = opts;
  const startedAt = new Date().toISOString();
  const checkpoints: JourneyCheckpoint[] = [];
  const requests: JourneyRequest[] = [];
  const ck = (name: string, ok: boolean, detail: string): void => { checkpoints.push({ name, ok, detail }); };

  let base = '';
  let ingressBaseUrl = '';
  let logEntries: Array<{ path: string; sha256: Sha256 }> = [];
  try {
    const up = await driver.start();
    base = up.ingressUrl;
    ingressBaseUrl = base;
    const req = async (method: string, pathname: string, body?: unknown): Promise<{ status: number; body: unknown }> => {
      const r = await httpJson(base, method, pathname, body);
      requests.push({ method, path: pathname, status: r.status });
      return r;
    };
    const rec = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});

    const health = await req('GET', '/health');
    const healthOk = health.status === 200 && rec(health.body).ok === true;
    ck('ingress-up', healthOk, healthOk ? 'GET /health through public ingress ok' : `GET /health failed (status ${health.status})`);

    const version = await req('GET', '/version');
    const schemaVersion = rec(version.body).schemaVersion;
    const migrationLog = rec(version.body).migrationLog;
    const migrationsOk = version.status === 200 && typeof schemaVersion === 'number' && Array.isArray(migrationLog) && migrationLog.length >= 1;
    ck('migrations-applied', migrationsOk, migrationsOk ? `schemaVersion=${schemaVersion}, ${migrationLog.length} migration(s)` : `version endpoint unexpected: ${JSON.stringify(version.body)}`);

    const journey = await req('POST', '/api/journey');
    const itemId = rec(journey.body).itemId;
    const jobId = rec(journey.body).jobId;
    const wrote = journey.status === 200 && typeof itemId === 'string' && typeof jobId === 'string';
    ck('data-written', wrote, wrote ? `item ${String(itemId)} + job ${String(jobId)} created through ingress` : `journey failed: ${JSON.stringify(journey.body)}`);

    let processed = false;
    const deadline = Date.now() + (opts.pollTimeoutMs ?? 5000);
    while (Date.now() < deadline) {
      const jr = await req('GET', `/api/journey/${String(jobId)}`);
      if (rec(jr.body).status === 'done') { processed = true; break; }
      await new Promise((r) => setTimeout(r, opts.pollIntervalMs ?? 40));
    }
    ck('async-journey', processed, processed ? `job ${String(jobId)} reached done through queue + worker` : `job ${String(jobId)} did not complete in time`);

    try { logEntries = driver.logs().map((p) => ({ path: p, sha256: sha256File(p) })); } catch { logEntries = []; }

    const restarted = await driver.restart();
    base = restarted.ingressUrl;
    const items = await req('GET', '/api/items');
    const itemList = rec(items.body).items;
    const persisted = items.status === 200 && Array.isArray(itemList) && itemList.some((i) => rec(i).id === itemId);
    ck('restart-persisted', persisted, persisted ? `item ${String(itemId)} survived restart` : 'item lost after restart');

    const rb = await req('POST', '/api/rollback');
    const before = rec(rb.body).before;
    const after = rec(rb.body).after;
    const revertedRes = await req('POST', '/api/rollback/revert');
    const restored = rec(revertedRes.body).restored;
    const markerRes = await req('GET', '/api/rollback/marker');
    const marker = rec(markerRes.body).marker;
    const rollbackOk = rb.status === 200 && typeof before === 'string' && typeof after === 'string'
      && before !== after && restored === before && marker === before;
    ck('rollback-reverted', rollbackOk, rollbackOk ? `rollback ${String(before)} -> ${String(after)} -> ${String(marker)}` : `rollback mismatch before=${String(before)} after=${String(after)} restored=${String(restored)} marker=${String(marker)}`);

    await driver.cleanup();
    const removed = !fs.existsSync(driver.stateDir);
    ck('cleanup', removed, removed ? `state dir ${driver.stateDir} removed` : `state dir ${driver.stateDir} still present`);
  } catch (e) {
    ck('run', false, `ingress journey errored: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    try { await driver.stop(); } catch { /* best effort */ }
  }

  const completedAt = new Date().toISOString();
  const evidence = {
    sourceSha, imageDigest, topologyHash: th as Sha256, ingressBaseUrl, checkpoints, requests,
    logs: logEntries,
    startedAt, completedAt,
  };
  const evidenceHash = createHash('sha256').update(canonicalJson(evidence)).digest('hex') as Sha256;
  const passed = checkpoints.length > 0 && checkpoints.every((c) => c.ok);
  return { ...evidence, evidenceHash, passed };
}
