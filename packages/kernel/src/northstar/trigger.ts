import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createWorkRequest } from './compiler.js';
import { NORTH_STAR_PROTOCOL_VERSION, assertWorkRequest, newId, type RiskClass, type WorkRequest, type WorkSource } from './protocol.js';
import { isCurrentExecution, readExecutionAuthority, staleExecutionReason, type ExecutionAuthority } from '../state/execution-authority.js';

export interface TriggerEnvelope {
  source: WorkSource;
  intent: string;
  constraints?: string[];
  non_goals?: string[];
  references?: string[];
  risk_hint?: RiskClass;
  source_id?: string;
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${label} must be a string[]`);
}

/** Strict provider-neutral trigger parser. Host/webhook adapters must reduce their payload to this envelope first. */
export function parseTriggerEnvelope(value: unknown): TriggerEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('trigger envelope must be an object');
  const raw = value as Record<string, unknown>;
  const allowed = new Set(['source', 'intent', 'constraints', 'non_goals', 'references', 'risk_hint', 'source_id']);
  const extras = Object.keys(raw).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`trigger envelope contains unknown field(s): ${extras.join(', ')}`);
  if (!['cli', 'issue', 'pr', 'ci', 'webhook', 'schedule', 'plan', 'other'].includes(String(raw.source))) throw new Error(`invalid trigger source: ${String(raw.source)}`);
  if (typeof raw.intent !== 'string' || raw.intent.trim().length === 0) throw new Error('trigger intent must be a non-empty string');
  if (raw.constraints !== undefined) assertStringArray(raw.constraints, 'trigger constraints');
  if (raw.non_goals !== undefined) assertStringArray(raw.non_goals, 'trigger non_goals');
  if (raw.references !== undefined) assertStringArray(raw.references, 'trigger references');
  if (raw.risk_hint !== undefined && !['S0', 'S1', 'S2', 'S3'].includes(String(raw.risk_hint))) throw new Error(`invalid trigger risk_hint: ${String(raw.risk_hint)}`);
  if (raw.source_id !== undefined && (typeof raw.source_id !== 'string' || raw.source_id.trim().length === 0)) throw new Error('trigger source_id must be a non-empty string');
  return {
    source: raw.source as WorkSource,
    intent: raw.intent,
    ...(raw.constraints !== undefined ? { constraints: [...raw.constraints as string[]] } : {}),
    ...(raw.non_goals !== undefined ? { non_goals: [...raw.non_goals as string[]] } : {}),
    ...(raw.references !== undefined ? { references: [...raw.references as string[]] } : {}),
    ...(raw.risk_hint !== undefined ? { risk_hint: raw.risk_hint as RiskClass } : {}),
    ...(raw.source_id !== undefined ? { source_id: raw.source_id as string } : {}),
  };
}

/** Normalize every trigger into the same immutable, provider-neutral WorkRequest. */
export function normalizeTrigger(input: TriggerEnvelope | unknown): WorkRequest {
  const trigger = parseTriggerEnvelope(input);
  const request = createWorkRequest({
    raw_intent: trigger.intent,
    source: trigger.source,
    explicit_constraints: trigger.constraints,
    explicit_non_goals: trigger.non_goals,
    reference_inputs: trigger.references,
    risk_hint: trigger.risk_hint,
    // External IDs are untrusted strings and must never become filesystem names.
    // Hashing also makes repeated delivery of the same provider/source ID idempotent.
    work_id: trigger.source_id ? newId('W', `${trigger.source}:${trigger.source_id}`) : undefined,
  });
  if (request.raw_intent !== trigger.intent) throw new Error('trigger normalization distorted raw intent');
  return request;
}

export type TriggerQueueStatus = 'READY' | 'RUNNING' | 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED' | 'CANCELED' | 'SUPERSEDED';

export interface TriggerQueueRecord {
  protocol_version: '2.0';
  request: WorkRequest;
  status: TriggerQueueStatus;
  /** Owner generation captured when this request entered the durable queue. */
  execution_generation: number;
  source_id?: string;
  normalized_at: string;
  started_at?: string;
  completed_at?: string;
  attempts: number;
  run_id?: string;
  proof_of_work?: string;
  result?: string;
  reason?: string;
}

export interface TriggerClaim {
  record: TriggerQueueRecord;
  record_path: string;
  claim_path: string;
  token: string;
}

export interface TriggerCompletion {
  status: Exclude<TriggerQueueStatus, 'READY' | 'RUNNING' | 'SUPERSEDED'>;
  run_id?: string;
  proof_of_work?: string;
  result?: string;
  reason?: string;
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readQueueRecord(file: string): TriggerQueueRecord {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<TriggerQueueRecord>;
  // Generation zero is the explicit compatibility state for isolated trigger
  // queues that have no current pointer yet. Bound queues are never allowed to
  // treat it as current once a pointer exists.
  const record = { ...raw, execution_generation: raw.execution_generation ?? 0 } as TriggerQueueRecord;
  if (record.protocol_version !== NORTH_STAR_PROTOCOL_VERSION) throw new Error(`unsupported trigger queue protocol in ${file}`);
  assertWorkRequest(record.request);
  if (!['READY', 'RUNNING', 'PASS', 'PARTIAL', 'BLOCKED', 'FAILED', 'CANCELED', 'SUPERSEDED'].includes(record.status)) throw new Error(`invalid trigger queue status in ${file}`);
  if (!Number.isSafeInteger(record.execution_generation) || record.execution_generation < 0) throw new Error(`invalid trigger execution generation in ${file}`);
  if (!Number.isInteger(record.attempts) || record.attempts < 0) throw new Error(`invalid trigger queue attempts in ${file}`);
  return record;
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Durable provider-neutral request queue used by unattended trigger adapters. */
export class TriggerQueue {
  readonly root: string;
  constructor(repoRoot: string) {
    this.root = path.join(path.resolve(repoRoot), '.agent', 'requests');
  }

  enqueue(input: TriggerEnvelope | unknown): { record: TriggerQueueRecord; path: string; created: boolean } {
    const envelope = parseTriggerEnvelope(input);
    const request = normalizeTrigger(envelope);
    const file = path.join(this.root, `${request.work_id}.json`);
    if (fs.existsSync(file)) {
      const existing = readQueueRecord(file);
      if (JSON.stringify(existing.request) !== JSON.stringify(request)) throw new Error(`trigger work id collision: ${request.work_id}`);
      return { record: existing, path: file, created: false };
    }
    const record: TriggerQueueRecord = {
      protocol_version: NORTH_STAR_PROTOCOL_VERSION,
      request,
      status: 'READY',
      execution_generation: readExecutionAuthority(path.resolve(this.root, '..', '..')).execution_generation,
      ...(envelope.source_id ? { source_id: envelope.source_id } : {}),
      normalized_at: new Date().toISOString(),
      attempts: 0,
    };
    atomicJson(file, record);
    return { record, path: file, created: true };
  }

  list(): Array<{ record: TriggerQueueRecord; path: string }> {
    if (!fs.existsSync(this.root)) return [];
    return fs.readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.claim.json'))
      .map((entry) => {
        const file = path.join(this.root, entry.name);
        return { record: readQueueRecord(file), path: file, mtime: fs.statSync(file).mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime)
      .map(({ record, path: file }) => ({ record, path: file }));
  }

  recoverStaleClaims(staleMs = 24 * 60 * 60 * 1000): number {
    if (!fs.existsSync(this.root)) return 0;
    let recovered = 0;
    for (const entry of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.claim.json')) continue;
      const claimPath = path.join(this.root, entry.name);
      let claim: { pid?: number } = {};
      try { claim = JSON.parse(fs.readFileSync(claimPath, 'utf8')) as { pid?: number }; } catch { /* malformed stale claim is recoverable */ }
      const stale = Date.now() - fs.statSync(claimPath).mtimeMs > staleMs;
      if (!stale && processAlive(Number(claim.pid))) continue;
      const recordPath = claimPath.replace(/\.claim\.json$/, '.json');
      if (fs.existsSync(recordPath)) {
        const record = readQueueRecord(recordPath);
        if (record.status === 'RUNNING') {
          const authority = readExecutionAuthority(path.resolve(this.root, '..', '..'));
          const current = isCurrentExecution({ work_id: record.request.work_id, execution_generation: record.execution_generation }, authority);
          atomicJson(recordPath, {
            ...record,
            status: current ? 'READY' : 'SUPERSEDED',
            reason: current ? 'recovered stale unattended claim' : staleExecutionReason({ work_id: record.request.work_id, execution_generation: record.execution_generation }, authority),
            started_at: undefined,
          });
        }
      }
      fs.rmSync(claimPath, { force: true });
      recovered += 1;
    }
    return recovered;
  }

  claimNext(): TriggerClaim | null {
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.recoverStaleClaims();
    const authority = readExecutionAuthority(path.resolve(this.root, '..', '..'));
    for (const item of this.list()) {
      if (item.record.status !== 'READY') continue;
      if (!isCurrentExecution({ work_id: item.record.request.work_id, execution_generation: item.record.execution_generation }, authority)) {
        atomicJson(item.path, {
          ...item.record,
          status: 'SUPERSEDED',
          reason: staleExecutionReason({ work_id: item.record.request.work_id, execution_generation: item.record.execution_generation }, authority),
          completed_at: new Date().toISOString(),
        });
        continue;
      }
      const claimPath = item.path.replace(/\.json$/, '.claim.json');
      const token = crypto.randomUUID();
      try {
        fs.writeFileSync(claimPath, `${JSON.stringify({ token, pid: process.pid, claimed_at: new Date().toISOString() })}\n`, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw error;
      }
      const current = readQueueRecord(item.path);
      if (current.status !== 'READY') { fs.rmSync(claimPath, { force: true }); continue; }
      const running: TriggerQueueRecord = { ...current, status: 'RUNNING', started_at: new Date().toISOString(), attempts: current.attempts + 1, reason: undefined };
      atomicJson(item.path, running);
      return { record: running, record_path: item.path, claim_path: claimPath, token };
    }
    return null;
  }

  complete(claim: TriggerClaim, completion: TriggerCompletion): TriggerQueueRecord {
    const claimBody = JSON.parse(fs.readFileSync(claim.claim_path, 'utf8')) as { token?: string };
    if (claimBody.token !== claim.token) throw new Error(`trigger claim ownership mismatch: ${claim.record.request.work_id}`);
    const current = readQueueRecord(claim.record_path);
    if (current.status !== 'RUNNING') throw new Error(`trigger completion requires RUNNING status: ${current.status}`);
    const authority = readExecutionAuthority(path.resolve(this.root, '..', '..'));
    const identity = { work_id: current.request.work_id, execution_generation: current.execution_generation };
    if (!isCurrentExecution(identity, authority)) {
      const stale: TriggerQueueRecord = {
        ...current,
        status: 'SUPERSEDED',
        completed_at: new Date().toISOString(),
        reason: staleExecutionReason(identity, authority),
      };
      atomicJson(claim.record_path, stale);
      fs.rmSync(claim.claim_path, { force: true });
      return stale;
    }
    const completed: TriggerQueueRecord = {
      ...current,
      status: completion.status,
      completed_at: new Date().toISOString(),
      ...(completion.run_id ? { run_id: completion.run_id } : {}),
      ...(completion.proof_of_work ? { proof_of_work: completion.proof_of_work } : {}),
      ...(completion.result ? { result: completion.result } : {}),
      ...(completion.reason ? { reason: completion.reason } : {}),
    };
    atomicJson(claim.record_path, completed);
    fs.rmSync(claim.claim_path, { force: true });
    return completed;
  }

  /**
   * Explicitly retire all durable records for a superseded owner goal. The
   * current pointer transaction remains the authority; this method only makes
   * queue membership converge and never promotes old work.
   */
  supersedeWork(workId: string, reason = 'owner goal superseded'): number {
    let changed = 0;
    for (const item of this.list()) {
      if (item.record.request.work_id !== workId || !['READY', 'RUNNING'].includes(item.record.status)) continue;
      atomicJson(item.path, { ...item.record, status: 'SUPERSEDED', reason, completed_at: new Date().toISOString() });
      const claimPath = item.path.replace(/\.json$/, '.claim.json');
      fs.rmSync(claimPath, { force: true });
      changed += 1;
    }
    return changed;
  }
}

export interface GitHubIssueTriggerInput {
  repository: string;
  number: number;
  title: string;
  body?: string | null;
  html_url?: string;
}

export interface GitHubPullRequestTriggerInput extends GitHubIssueTriggerInput {
  head_sha?: string;
  base_ref?: string;
}

export interface CiTriggerInput {
  provider: string;
  run_id: string;
  summary: string;
  url?: string;
  commit_sha?: string;
  branch?: string;
}

export interface GenericWebhookTriggerInput {
  event_id: string;
  intent: string;
  references?: string[];
  constraints?: string[];
  risk_hint?: RiskClass;
}

/** Thin edge adapters: provider payloads stop here and never leak into the kernel. */
export function adaptGitHubIssue(input: GitHubIssueTriggerInput): TriggerEnvelope {
  if (!input.repository || !Number.isInteger(input.number) || input.number <= 0 || !input.title.trim()) throw new Error('invalid GitHub issue trigger');
  const intent = [input.title.trim(), input.body?.trim()].filter(Boolean).join('\n\n');
  return {
    source: 'issue',
    source_id: `${input.repository}#${input.number}`,
    intent,
    ...(input.html_url ? { references: [input.html_url] } : {}),
  };
}

export function adaptGitHubPullRequest(input: GitHubPullRequestTriggerInput): TriggerEnvelope {
  if (!input.repository || !Number.isInteger(input.number) || input.number <= 0 || !input.title.trim()) throw new Error('invalid GitHub pull-request trigger');
  const metadata = [input.head_sha ? `head=${input.head_sha}` : '', input.base_ref ? `base=${input.base_ref}` : ''].filter(Boolean).join(' ');
  const intent = [input.title.trim(), input.body?.trim(), metadata].filter(Boolean).join('\n\n');
  return {
    source: 'pr',
    source_id: `${input.repository}#pr-${input.number}`,
    intent,
    ...(input.html_url ? { references: [input.html_url] } : {}),
  };
}

export function adaptCiRun(input: CiTriggerInput): TriggerEnvelope {
  if (!input.provider || !input.run_id || !input.summary.trim()) throw new Error('invalid CI trigger');
  const context = [input.commit_sha ? `commit=${input.commit_sha}` : '', input.branch ? `branch=${input.branch}` : ''].filter(Boolean).join(' ');
  return {
    source: 'ci',
    source_id: `${input.provider}:${input.run_id}`,
    intent: [input.summary.trim(), context].filter(Boolean).join('\n\n'),
    ...(input.url ? { references: [input.url] } : {}),
  };
}

export function adaptWebhook(input: GenericWebhookTriggerInput): TriggerEnvelope {
  if (!input.event_id || !input.intent.trim()) throw new Error('invalid webhook trigger');
  return parseTriggerEnvelope({
    source: 'webhook',
    source_id: input.event_id,
    intent: input.intent,
    ...(input.references ? { references: input.references } : {}),
    ...(input.constraints ? { constraints: input.constraints } : {}),
    ...(input.risk_hint ? { risk_hint: input.risk_hint } : {}),
  });
}
