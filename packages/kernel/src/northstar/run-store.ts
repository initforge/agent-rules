import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/**
 * RunStore — single writer for all run artifacts (plan 2.4, 3.7).
 * Only RunStore may write run.json, events.jsonl, result.json, artifacts/.
 * All other modules must go through this store; direct writeJsonAtomic to
 * .agent/runs is forbidden by architectural test.
 */

export type ArtifactClass = 'state' | 'evidence' | 'deliverable' | 'diagnostic';

export interface ProofPlan {
  run_id: string;
  selected: string[]; // proof ids selected
  omitted: Array<{ proof: string; reason: string }>;
  claims: string[];
}

export interface EvidenceRecord {
  claim_id: string;
  status: 'pass' | 'fail' | 'blocked';
  kind: string;
  observed_at: string;
  spec_id: string;
  spec_revision: number;
  candidate_epoch: number;
  platform: string;
  artifact_path?: string;
  sha256?: string;
  verifier_id?: string;
  evidence_stage?: string;
}

export interface OutcomeReceipt {
  schema: 'agent-rules/outcome-receipt';
  version: 1;
  run_id: string;
  git_head: string;
  outcome: 'PASS' | 'PARTIAL' | 'BLOCKED' | 'UNSUPPORTED' | 'PRE-EXISTING' | 'NEEDS_USER' | 'FAILED';
  claims: Record<string, { status: string; evidence?: unknown }>;
  proof_plan: ProofPlan;
  evidence_ledger_hash: string;
  created_at: string;
  receipt_sha256: string;
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function atomicWrite(file: string, content: string | Buffer): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${randomUUID()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

export class RunStore {
  constructor(readonly runsRoot: string) {}

  private runDir(runId: string): string {
    return path.join(this.runsRoot, runId);
  }

  putState(runId: string, state: unknown): void {
    const file = path.join(this.runDir(runId), 'run.json');
    // run.json contains raw intent, scope, requirements/claims, host and selections
    atomicWrite(file, JSON.stringify(state, null, 2) + '\n');
  }

  appendEvent(runId: string, event: unknown): { seq: number; hash: string } {
    const file = path.join(this.runDir(runId), 'events.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // hash-chained journal: previous hash is last line's hash or genesis
    let prev = '0'.repeat(64);
    let seq = 1;
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      if (lines.length) {
        const last = JSON.parse(lines[lines.length - 1]) as { envelope_hash?: string; seq?: number };
        prev = last.envelope_hash ?? prev;
        seq = (last.seq ?? lines.length) + 1;
      }
    }
    const body = { seq, previous_hash: prev, event, observed_at: new Date().toISOString() };
    const envelopeHash = sha256(JSON.stringify(body));
    const envelope = { ...body, envelope_hash: envelopeHash };
    fs.appendFileSync(file, JSON.stringify(envelope) + '\n', { encoding: 'utf8', mode: 0o600 });
    return { seq, hash: envelopeHash };
  }

  putArtifact(runId: string, name: string, content: Buffer, artifactClass: ArtifactClass): { path: string; sha256: string } {
    const hash = sha256(content);
    const file = path.join(this.runDir(runId), 'artifacts', `${hash.slice(0,12)}-${name}`);
    // content-addressed
    atomicWrite(file, content);
    // also record artifact admission via ProofPlan binding elsewhere
    return { path: path.relative(this.runsRoot, file), sha256: hash };
  }

  finalize(runId: string, result: Omit<OutcomeReceipt, 'receipt_sha256'>): OutcomeReceipt {
    const file = path.join(this.runDir(runId), 'result.json');
    if (fs.existsSync(file)) throw new Error(`result.json already finalized for run ${runId} — single finalization only`);
    const body = { ...result };
    const receipt: OutcomeReceipt = { ...body, receipt_sha256: sha256(JSON.stringify(body)) };
    atomicWrite(file, JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
  }

  readRun(runId: string): unknown | null {
    const file = path.join(this.runDir(runId), 'run.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  readEvents(runId: string): unknown[] {
    const file = path.join(this.runDir(runId), 'events.jsonl');
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
  }

  readResult(runId: string): OutcomeReceipt | null {
    const file = path.join(this.runDir(runId), 'result.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as OutcomeReceipt;
  }
}

/**
 * Admission must be claim-bound via ProofPlan; never hardcode evidence_required: true.
 * If proof not selected, record omission rather than fake evidence.
 */
export function admitEvidenceWrite(input: {
  claimId: string;
  proofPlan: ProofPlan;
  artifactClass: ArtifactClass;
}): { admitted: boolean; reason?: string } {
  const selected = input.proofPlan.selected.includes(input.claimId) || input.proofPlan.selected.includes(`${input.claimId}:evidence`);
  // Also check if claim is in proofPlan claims
  const claimInPlan = input.proofPlan.claims.includes(input.claimId);
  if (!claimInPlan) return { admitted: false, reason: `claim ${input.claimId} not in ProofPlan claims — omission recorded` };
  if (!selected) {
    // find omission reason
    const omission = input.proofPlan.omitted.find(o=>o.proof===input.claimId || o.proof.startsWith(input.claimId));
    return { admitted: false, reason: omission?.reason ?? `proof for ${input.claimId} not selected in ProofPlan — omitted` };
  }
  if (input.artifactClass !== 'evidence' && input.artifactClass !== 'state' && input.artifactClass !== 'deliverable') {
    return { admitted: false, reason: `artifact class ${input.artifactClass} not admitted for evidence write` };
  }
  return { admitted: true };
}
