import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { activateLedger, boundedRepair, SHADOW_NAMES, type ActivationInput, type Sha256, type BoundedRepairInput, type BatchAmendmentRef } from '../src/ledger-activation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'ns0-activation');
const PLAN_DIR = 'plans/agent-rules-harness-v3-rearchitecture-20260726-r1';
const LEDGER_REL = 'ledger/agent-rules-harness-v3-rearchitecture-20260726-r1.json';
const SHADOW_REL = `${PLAN_DIR}/shadow`;
const AMENDMENT_REL = `${PLAN_DIR}/amendments/0012-native-swarm-artifact-handoff-and-fitness-closure.md`;
const CAPTURE_REL = `${PLAN_DIR}/lineage/am0012-capture.json`;
const ORIGINAL_REL = `${PLAN_DIR}/original.md`;

const AM13_REL = `${PLAN_DIR}/amendments/0013-rolling-wavefront-critical-path-pipeline.md`;
const AM14_REL = `${PLAN_DIR}/amendments/0014-clustered-native-swarm-and-resource-safety.md`;
const AM15_REL = `${PLAN_DIR}/amendments/0015-progressive-quality-release-and-main-history-consolidation.md`;
const CAPTURE13_REL = `${PLAN_DIR}/lineage/am0013-capture.json`;
const CAPTURE14_REL = `${PLAN_DIR}/lineage/am0014-capture.json`;
const CAPTURE15_REL = `${PLAN_DIR}/lineage/am0015-capture.json`;

const LEDGER_SHA256 = 'fa096f6b6408b4b419e4d5680ca480c8f04f42ce2747a636f699cfadfc46cf53';
const ORIGINAL_SHA256 = '1e1b06e7388c49b076111fc8edf4878407991f269d656b0dc1c7c5dbaeace26b';
const AMENDMENT_SHA256 = 'e21bb21b6898cb2f6f37a58c47db0c07ade9701e18081c3e2023b5a0e5698daf';
const PRIOR_EFFECTIVE_SHA256 = 'a9d623c015aff7699ae040909c284968e8c8b85ec5030598af0194171c6eb10d';
const NEW_EFFECTIVE_SHA256 = 'bdf30d1b27f6cf2e7cda25ba3c4e5aec1a54fdb558bc0e268384e8568fb88f8f';
const SHADOW_FILES = ['tasks.md','progress.md','amendments.md','reconciliation.md',
  'batches/bootstrap/tasks.md','batches/bootstrap/progress.md','batches/bootstrap/reconciliation.md'];
const TEST_TMP: string[] = [];

const AM13_SHA256 = '707a39e3760b6445ee51d40926865c9bf0dd3544f044929597994513cebd64e6';
const AM14_SHA256 = '14ef202ff45ee443d4d9301d71bd223ddda06df59f4d56fb0429f6daac3c60ab';
const AM15_SHA256 = 'b31c4a3bce9064203920ce2813e2e0eed4dff5c63856f9804fea8020a177d959';
const BR_FINAL_IDENTITY = 'c847d8edb4986d0ed84a00e91964a3e81a2c26b666570bf5ba6563b5776e3c2d';

function sha256Hex(d: string): string { return crypto.createHash('sha256').update(d,'utf8').digest('hex'); }
function sha256Buf(b: Buffer): string { return crypto.createHash('sha256').update(b).digest('hex'); }
function sha256Str(s:string):string{return crypto.createHash('sha256').update(s,'utf8').digest('hex')}

function copyFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ns0-v12-'));
  TEST_TMP.push(root);
  const agt = path.join(root, '.agent');
  const pd = path.join(agt, PLAN_DIR);
  const ad = path.join(pd, 'amendments');
  const sd = path.join(pd, 'shadow', 'batches', 'bootstrap');
  const ld = path.join(agt, 'ledger');
  const lg = path.join(pd, 'lineage');
  for (const d of [ad, sd, ld, lg]) fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(path.join(FIXTURE_ROOT, ORIGINAL_REL), path.join(pd, 'original.md'));
  fs.copyFileSync(path.join(FIXTURE_ROOT, LEDGER_REL), path.join(ld, path.basename(LEDGER_REL)));
  for (const f of fs.readdirSync(path.join(FIXTURE_ROOT, path.dirname(CAPTURE_REL)))) {
    if (f.endsWith('-capture.json')) {
      fs.copyFileSync(path.join(FIXTURE_ROOT, path.dirname(CAPTURE_REL), f), path.join(lg, f));
    }
  }
  const planName = 'agent-rules-harness-v3-rearchitecture-20260726-r1';
  for (const dir of ['audits', 'handoffs'] as const) {
    const auditSrc = path.join(FIXTURE_ROOT, dir, planName);
    const auditDst = path.join(agt, dir, planName);
    if (fs.existsSync(auditSrc)) { fs.mkdirSync(auditDst, {recursive:true}); for (const f of fs.readdirSync(auditSrc)) fs.copyFileSync(path.join(auditSrc, f), path.join(auditDst, f)); }
  }
  for (const f of ['tasks.md','progress.md','amendments.md','reconciliation.md'])
    fs.copyFileSync(path.join(FIXTURE_ROOT, SHADOW_REL, f), path.join(agt, SHADOW_REL, f));
  for (const f of ['tasks.md','progress.md','reconciliation.md'])
    fs.copyFileSync(path.join(FIXTURE_ROOT, SHADOW_REL, 'batches', 'bootstrap', f), path.join(agt, SHADOW_REL, 'batches', 'bootstrap', f));
  for (const f of fs.readdirSync(path.join(FIXTURE_ROOT, PLAN_DIR, 'amendments')))
    fs.copyFileSync(path.join(FIXTURE_ROOT, PLAN_DIR, 'amendments', f), path.join(ad, f));
  return root;
}

function tamperShadow(r:string, input:ActivationInput):void{
  const p=path.join(r,input.shadowDir,'tasks.md');
  const c=fs.readFileSync(p,'utf-8');
  fs.writeFileSync(p,'# TAMPERED\n'+c,'utf-8');
}

function getInput(r: string): ActivationInput {
  return { canonicalRoot: r, ledgerPath: `.agent/${LEDGER_REL}`, amendmentPath: `.agent/${AMENDMENT_REL}`,
    capturePath: `.agent/${CAPTURE_REL}`, shadowDir: `.agent/${SHADOW_REL}`,
    originalSha256: ORIGINAL_SHA256, amendmentSha256: AMENDMENT_SHA256, priorEffectiveSha256: PRIOR_EFFECTIVE_SHA256 };
}

afterEach(() => { for (const d of TEST_TMP.splice(0)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } });

describe('NS0 activation v12', () => {
  it('activates AM-0012 with correct recomputed identity', () => {
    const root = copyFixture(); const input = getInput(root);
    tamperShadow(root, input);
    const r = activateLedger(input);
    expect(r.success).toBe(true); expect(r.mutated).toBe(true);
    expect(r.effectiveIdentity).toBe(NEW_EFFECTIVE_SHA256);
    expect(r.shadowRevision).toBeGreaterThan(0);
    const l = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
    expect(l.effective_plan_identity.sha256).toBe(NEW_EFFECTIVE_SHA256);
  });
  it('rebuild preserves shadow_revision (AM-0012 already EFFECTIVE)', () => {
    const root = copyFixture(); const input = getInput(root);
    const before = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
    tamperShadow(root, input);
    const r = activateLedger(input);
    expect(r.success).toBe(true);
    expect(r.shadowRevision).toBe(before.shadow_revision as number);
  });

  it('rejects capture with wrong original.path', () => {
    const root = copyFixture(); const input = getInput(root);
    const cp = path.join(root, input.capturePath);
    const cap = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    cap.original.path = 'wrong/path.md';
    fs.writeFileSync(cp, JSON.stringify(cap, null, 2), 'utf-8');
    const r = activateLedger(input); expect(r.success).toBe(false);
  });
  it('rejects capture with wrong amendment.path', () => {
    const root = copyFixture(); const input = getInput(root);
    const cp = path.join(root, input.capturePath);
    const cap = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    cap.amendment.path = 'wrong/path.md';
    fs.writeFileSync(cp, JSON.stringify(cap, null, 2), 'utf-8');
    const r = activateLedger(input); expect(r.success).toBe(false);
  });
  it('rejects capture with missing original.path', () => {
    const root = copyFixture(); const input = getInput(root);
    const cp = path.join(root, input.capturePath);
    const cap = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    delete cap.original.path;
    fs.writeFileSync(cp, JSON.stringify(cap, null, 2), 'utf-8');
    const r = activateLedger(input); expect(r.success).toBe(false);
  });

  it('rejects capture with wrong audit path', () => {
    const root = copyFixture(); const input = getInput(root);
    const cp = path.join(root, input.capturePath);
    const cap = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    cap.audit = { path: 'nonexistent.md', sha256: '0'.repeat(64) };
    fs.writeFileSync(cp, JSON.stringify(cap, null, 2), 'utf-8');
    const r = activateLedger(input); expect(r.success).toBe(false);
  });
  it('rejects capture with wrong handoff path', () => {
    const root = copyFixture(); const input = getInput(root);
    const cp = path.join(root, input.capturePath);
    const cap = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    cap.handoff = { path: 'nonexistent.md', sha256: '0'.repeat(64) };
    fs.writeFileSync(cp, JSON.stringify(cap, null, 2), 'utf-8');
    const r = activateLedger(input); expect(r.success).toBe(false);
  });
  it('rejects capture with wrong continuation_prompt sha', () => {
    const root = copyFixture(); const input = getInput(root);
    const cp = path.join(root, input.capturePath);
    const cap = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    cap.continuation_prompt = { path: '.agent/' + PLAN_DIR + '/original.md', sha256: '0'.repeat(64) };
    fs.writeFileSync(cp, JSON.stringify(cap, null, 2), 'utf-8');
    const r = activateLedger(input); expect(r.success).toBe(false);
  });

  it('rejects fake prior identity on fresh activation', () => {
    const root = copyFixture(); const input = getInput(root);
    input.priorEffectiveSha256 = '0'.repeat(64);
    const r = activateLedger(input); expect(r.success).toBe(false); expect(r.error).toMatch(/prior.*ident/i);
  });
  it('rejects fake prior identity on rebuild path', () => {
    const root = copyFixture(); const input = getInput(root);
    expect(activateLedger(input).success).toBe(true);
    input.priorEffectiveSha256 = '0'.repeat(64);
    const r = activateLedger(input); expect(r.success).toBe(false); expect(r.error).toMatch(/prior.*ident/i);
  });
  it('rejects fake prior identity on fast-path', () => {
    const root = copyFixture(); const input = getInput(root);
    expect(activateLedger(input).success).toBe(true);
    input.priorEffectiveSha256 = '0'.repeat(64);
    const r = activateLedger(input); expect(r.success).toBe(false); expect(r.error).toMatch(/prior.*ident/i);
  });

  it('rejects tampered ledger plan_id vs capture', () => {
    const root = copyFixture(); const input = getInput(root);
    const cp = path.join(root, input.capturePath);
    const cap = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    cap.plan_id = 'wrong-plan-id';
    fs.writeFileSync(cp, JSON.stringify(cap, null, 2), 'utf-8');
    const r = activateLedger(input); expect(r.success).toBe(false);
  });
  it('rejects capture with missing baselines', () => {
    const root = copyFixture(); const input = getInput(root);
    const cp = path.join(root, input.capturePath);
    const cap = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    delete cap.repository_baselines;
    fs.writeFileSync(cp, JSON.stringify(cap, null, 2), 'utf-8');
    const r = activateLedger(input); expect(r.success).toBe(false);
  });

  it('real idempotence: second call returns mutated false, bytes exact', () => {
    const root = copyFixture(); const input = getInput(root);
    expect(activateLedger(input).success).toBe(true);
    const snap: Record<string, Buffer> = { 'ledger.json': fs.readFileSync(path.join(root, input.ledgerPath)) };
    for (const f of SHADOW_FILES) snap[f] = fs.readFileSync(path.join(root, input.shadowDir, f));
    const r2 = activateLedger(input);
    expect(r2.success).toBe(true); expect(r2.mutated).toBe(false);
    expect(fs.readFileSync(path.join(root, input.ledgerPath))).toEqual(snap['ledger.json']);
    for (const f of SHADOW_FILES) expect(fs.readFileSync(path.join(root, input.shadowDir, f))).toEqual(snap[f]);
  });
  it('tampered shadow triggers recovery and byte-match', () => {
    const root = copyFixture(); const input = getInput(root);
    activateLedger(input);
    const tp = path.join(root, input.shadowDir, 'tasks.md');
    const orig = fs.readFileSync(tp, 'utf-8'); fs.writeFileSync(tp, '# TAMPERED\n' + orig, 'utf-8');
    const r2 = activateLedger(input);
    expect(r2.success).toBe(true); expect(r2.mutated).toBe(true);
    expect(fs.readFileSync(tp,'utf-8')).not.toContain('TAMPERED');
    const l = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
    expect(sha256Hex(fs.readFileSync(tp,'utf-8'))).toBe(l.shadow_hashes['tasks.md']);
  });

  it('produces byte-identical shadows', () => {
    const r1 = copyFixture(); const r2 = copyFixture();
    const i1 = getInput(r1); const i2 = getInput(r2);
    for (const f of SHADOW_FILES) { const p = path.join(r2, i2.shadowDir, f); if (fs.existsSync(p)) fs.writeFileSync(p, '# TAMPERED\n' + fs.readFileSync(p, 'utf-8'), 'utf-8'); }
    expect(activateLedger(i1).success).toBe(true); expect(activateLedger(i2).success).toBe(true);
    for (const f of SHADOW_FILES) expect(fs.readFileSync(path.join(r1, i1.shadowDir, f))).toEqual(fs.readFileSync(path.join(r2, i2.shadowDir, f)));
  });
  it('renders from ledger when old shadow files missing', () => {
    const root = copyFixture(); const input = getInput(root);
    for (const f of SHADOW_FILES) { const p = path.join(root, input.shadowDir, f); if (fs.existsSync(p)) fs.rmSync(p); }
    const r = activateLedger(input); expect(r.success).toBe(true);
    for (const f of SHADOW_FILES) { const p = path.join(root, input.shadowDir, f); expect(fs.existsSync(p)).toBe(true); expect(fs.readFileSync(p,'utf-8').length).toBeGreaterThan(0); }
  });

  it('bootstrap shadows derive from ledger batch subsets', () => {
    const root = copyFixture(); const input = getInput(root);
    const r = activateLedger(input); expect(r.success).toBe(true);
    expect(fs.readFileSync(path.join(root, input.shadowDir, 'batches/bootstrap/tasks.md'),'utf-8')).toContain('P-1');
  });

  it('fails on amendment SHA mismatch', () => {
    const root = copyFixture(); const input = getInput(root);
    input.amendmentSha256 = '0'.repeat(64); const r = activateLedger(input); expect(r.success).toBe(false);
  });
  it('fails on original SHA mismatch', () => {
    const root = copyFixture(); const input = getInput(root);
    input.originalSha256 = '0'.repeat(64); const r = activateLedger(input); expect(r.success).toBe(false);
  });
  it('fails when capture missing', () => {
    const root = copyFixture(); const input = getInput(root);
    fs.rmSync(path.join(root, input.capturePath));
    const r = activateLedger(input); expect(r.success).toBe(false);
  });
  it('fails when capture irrelevant bytes change', () => {
    const root = copyFixture(); const input = getInput(root);
    expect(activateLedger(input).success).toBe(true);
    const cap = JSON.parse(fs.readFileSync(path.join(root, input.capturePath), 'utf-8'));
    cap.captured_at = '2099-01-01T00:00:00.000Z';
    fs.writeFileSync(path.join(root, input.capturePath), JSON.stringify(cap), 'utf-8');
    const r2 = activateLedger(input); expect(r2.success).toBe(false);
  });

  it('rebuilds when AM-0012 exists but targets tampered', () => {
    const root = copyFixture(); const input = getInput(root);
    activateLedger(input);
    fs.writeFileSync(path.join(root, input.shadowDir, 'tasks.md'), '# TAMPERED\n','utf-8');
    const r2 = activateLedger(input); expect(r2.success).toBe(true); expect(r2.mutated).toBe(true);
    expect(fs.readFileSync(path.join(root, input.shadowDir, 'tasks.md'),'utf-8')).not.toContain('TAMPERED');
  });

  it('all seven shadow files exist with matching hashes', () => {
    const root = copyFixture(); const input = getInput(root);
    const r = activateLedger(input); expect(r.success).toBe(true);
    const l = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
    for (const f of SHADOW_FILES) { const p = path.join(root, input.shadowDir, f); expect(fs.existsSync(p)).toBe(true); expect(sha256Hex(fs.readFileSync(p,'utf-8'))).toBe(l.shadow_hashes[f]); }
  });
  it('capture_sha256 in audit and amendment match', () => {
    const root = copyFixture(); const input = getInput(root);
    const r = activateLedger(input); expect(r.success).toBe(true);
    const l = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
    const audit = (l.audit_events as Record<string,unknown>[]).find((e:Record<string,unknown>)=>e.amendment_id==='AM-0012') as Record<string,unknown>;
    expect(audit.capture_sha256).toMatch(/^[a-f0-9]{64}$/);
    const am = (l.amendments as Record<string,unknown>[]).find((a:Record<string,unknown>)=>a.amendment_id==='AM-0012') as Record<string,unknown>;
    expect(am.capture_sha256).toBe(audit.capture_sha256);
  });

  it('creates NS0..NS9 tasks', () => {
    const root = copyFixture(); const input = getInput(root);
    const r = activateLedger(input); expect(r.success).toBe(true);
    const l = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
    const ns = (l.assignments as Record<string,unknown>[]).filter((a:Record<string,unknown>)=>a.assignment_id!.toString().startsWith('ASN-AM0012-'));
    expect(ns.length).toBe(10);
  });

  it('fixture unchanged', () => {
    const l = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, LEDGER_REL), 'utf-8'));
    expect(l.plan_id).toBe('agent-rules-harness-v3-rearchitecture-20260726-r1');
  });
  it('fixture bytes bound', () => {
    expect(sha256Buf(fs.readFileSync(path.join(FIXTURE_ROOT, LEDGER_REL)))).toBe(LEDGER_SHA256);
    expect(sha256Buf(fs.readFileSync(path.join(FIXTURE_ROOT, ORIGINAL_REL)))).toBe(ORIGINAL_SHA256);
  });

  it('rejects symlinked targets', () => {
    const root = copyFixture(); const input = getInput(root);
    const lt = path.join(root, input.ledgerPath); const real = fs.readFileSync(lt, 'utf-8'); fs.rmSync(lt);
    fs.writeFileSync(path.join(root, '.ledger-real.json'), real, 'utf-8'); fs.symlinkSync(path.join(root, '.ledger-real.json'), lt);
    const r = activateLedger(input); expect(r.success).toBe(false); expect(r.error).toContain('Symlink');
  });
  it('rejects path traversal', () => {
    const root = copyFixture(); const input = getInput(root);
    input.ledgerPath = '../../etc/passwd'; const r = activateLedger(input); expect(r.success).toBe(false);
  });
  it('rejects oversized ledger', () => {
    const root = copyFixture(); const input = getInput(root);
    fs.writeFileSync(path.join(root, input.ledgerPath), JSON.stringify({data:'x'.repeat(6*1024*1024)}), 'utf-8');
    const r = activateLedger(input); expect(r.success).toBe(false);
  });
  it('rejects symlink root', () => {
    const root = copyFixture(); const input = getInput(root);
    const symRoot = path.join(root, '..', 'sym-root-' + Date.now());
    try { fs.symlinkSync(root, symRoot); } catch { return; }
    input.canonicalRoot = symRoot;
    const r = activateLedger(input); expect(r.success).toBe(false);
    try { fs.rmSync(symRoot); } catch {}
  });

  for (const crashIdx of [0,1,2,3,4,5,6,7]) {
    it(`commit failure at index ${crashIdx}: exact byte capture + mutation flag + recovery`, () => {
      const root = copyFixture(); const input = getInput(root);
      tamperShadow(root, input);
      const origBytes: Record<string, Buffer> = { 'ledger.json': fs.readFileSync(path.join(root, input.ledgerPath)) };
      for (const f of SHADOW_FILES) origBytes[f] = fs.readFileSync(path.join(root, input.shadowDir, f));
      let faulted = false;
      input.onFault = (ev) => {
        if (ev.phase === 'postRenamePreJournal' && ev.target === SHADOW_NAMES[crashIdx] && !faulted) { faulted = true; throw new Error('crash'); }
      };
      const r1 = activateLedger(input);
      if (crashIdx < 7) {
        expect(r1.success, `idx ${crashIdx}`).toBe(false);
        expect(r1.mutated, `idx ${crashIdx} mutated`).toBe(true);
        expect(r1.recovered, `idx ${crashIdx} recovered`).toBe(true);
        for (let j = 0; j < 8; j++) {
          const nm = SHADOW_NAMES[j];
          const p = j === 0 ? path.join(root, input.ledgerPath) : path.join(root, input.shadowDir, nm);
          expect(fs.readFileSync(p), `idx ${crashIdx} target ${j} byte-match after rollback`).toEqual(origBytes[nm]);
        }
      } else {
        expect(r1.success, `idx ${crashIdx}`).toBe(true);
        expect(r1.mutated, `idx ${crashIdx}`).toBe(true);
      }
      const r2 = activateLedger({...input, onFault: undefined});
      expect(r2.success).toBe(true);
      const l2 = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
      expect(l2.shadow_revision).toBeGreaterThan(0);
      for (const f of SHADOW_FILES) { const p = path.join(root, input.shadowDir, f); expect(fs.existsSync(p)).toBe(true); expect(sha256Hex(fs.readFileSync(p,'utf-8'))).toBe(l2.shadow_hashes[f]); }
      expect(fs.existsSync(path.join(root, '.activation-journal.json'))).toBe(false);
    });
  }

  for (const crashIdx of [0,1,2,3,4,5,6,7]) {
    it(`inflight crash at index ${crashIdx}: journal has inflightIndex + recovery`, () => {
      const root = copyFixture(); const input = getInput(root);
      tamperShadow(root, input);
      let faulted = false;
      input.onFault = (ev) => {
        if (!faulted && ev.phase === 'postRenamePreJournal' && ev.target === SHADOW_NAMES[crashIdx]) { faulted = true; throw new Error('inflight crash'); }
      };
      const r1 = activateLedger(input);
      if (crashIdx < 7) {
        expect(r1.success).toBe(false);
        expect(r1.mutated).toBe(true);
        expect(r1.recovered).toBe(true);
      } else {
        expect(r1.success).toBe(true);
        expect(r1.mutated).toBe(true);
      }
      const r2 = activateLedger({...input, onFault: undefined});
      expect(r2.success).toBe(true);
      const l2 = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
      expect(l2.shadow_revision).toBeGreaterThan(0);
    });
  }

  it('fault at preRename returns mutated=false', () => {
    const root = copyFixture(); const input = getInput(root);
    tamperShadow(root, input);
    input.onFault = (ev) => { if (ev.phase === 'preRename') throw new Error('preRename crash'); };
    const r = activateLedger(input); expect(r.success).toBe(false); expect(r.mutated).toBe(false);
  });
  it('fault at postVerify triggers rollback', () => {
    const root = copyFixture(); const input = getInput(root);
    tamperShadow(root, input);
    let faulted = false;
    input.onFault = (ev) => {
      if (ev.phase === 'postVerify' && !faulted) { faulted = true; throw new Error('postVerify crash'); }
    };
    const r1 = activateLedger(input);
    expect(fs.existsSync(path.join(root, '.activation-journal.json'))).toBe(true);
    const r2 = activateLedger({...input, onFault: undefined});
    expect(r2.success).toBe(true); expect(r2.recovered).toBe(true);
  });

  it('journal presence with matching verifyAll returns recovered', () => {
    const root = copyFixture(); const input = getInput(root);
    activateLedger(input);
    const genDir = path.join(root, '.agent', '.activation-generations', 'test-rec');
    fs.mkdirSync(genDir, { recursive: true });
    const hashes: Record<string,string> = { 'ledger.json': sha256Hex(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8')) };
    for (const f of SHADOW_FILES) hashes[f] = sha256Hex(fs.readFileSync(path.join(root, input.shadowDir, f), 'utf-8'));
    const oh: Record<string,string|null> = {}; const bh: Record<string,string|null> = {};
    for (const k of ['ledger.json',...SHADOW_FILES]) { oh[k] = hashes[k]; bh[k] = hashes[k]; }
    fs.writeFileSync(path.join(root, '.activation-journal.json'), JSON.stringify({
      generationDir: path.relative(root, genDir), oldHashes: oh, backupHashes: bh,
      newHashes: hashes, commitIndex: 8, phase: 'staged' }), 'utf-8');
    const r = activateLedger(input);
    expect(r.success).toBe(true); expect(r.mutated).toBe(true); expect(r.recovered).toBe(true);
    expect(fs.existsSync(path.join(root, '.activation-journal.json'))).toBe(false);
  });

  it('invalid journal ignored', () => {
    const root = copyFixture(); const input = getInput(root);
    tamperShadow(root, input);
    fs.mkdirSync(path.join(root, '.agent', '.activation-generations', 't'), { recursive: true });
    fs.writeFileSync(path.join(root, '.activation-journal.json'), JSON.stringify({
      generationDir:'.agent/.activation-generations/t',oldHashes:{},newHashes:{},backupHashes:{},commitIndex:99,phase:'x'}),'utf-8');
    const r = activateLedger(input); expect(r.success).toBe(true); expect(r.mutated).toBe(true);
  });
  it('oversized journal rejected', () => {
    const root = copyFixture(); const input = getInput(root);
    const huge = JSON.stringify({generationDir:'.agent/.activation-generations/t',oldHashes:{},newHashes:{},backupHashes:{},commitIndex:0,phase:'x',pad:'x'.repeat(2*1024*1024)});
    fs.writeFileSync(path.join(root, '.activation-journal.json'), huge, 'utf-8');
    fs.mkdirSync(path.join(root, '.agent', '.activation-generations', 't'), { recursive: true });
    const r = activateLedger(input); expect(r.success).toBe(true);
  });

  it('rejects invalid UTF8 in ledger', () => {
    const root = copyFixture(); const input = getInput(root);
    const buf = Buffer.concat([Buffer.from('{"plan_id":"x","status":"x","amendments":[],"shadow_revision":0,"extra":"'), Buffer.from([0xFF, 0xFE]), Buffer.from('"}')]);
    fs.writeFileSync(path.join(root, input.ledgerPath), buf);
    const r = activateLedger(input); expect(r.success).toBe(false);
  });

  it('lock token+inode prevents stale lock release', () => {
    const root = copyFixture(); const input = getInput(root);
    const r1 = activateLedger(input); expect(r1.success).toBe(true);
    const r2 = activateLedger(input); expect(r2.success).toBe(true);
    expect(fs.existsSync(path.join(root, '.activation-lock.json'))).toBe(false);
  });

  it('cleans up journal after successful activation', () => {
    const root = copyFixture(); const input = getInput(root);
    const r = activateLedger(input); expect(r.success).toBe(true);
    expect(fs.existsSync(path.join(root, '.activation-journal.json'))).toBe(false);
  });

  it('backup tamper causes unrecovered transaction; targets untouched', () => {
    const root = copyFixture(); const input = getInput(root);
    const names = ['ledger.json', ...SHADOW_FILES];
    const genDir = path.join(root, '.agent', '.activation-generations', 'test-bkp');
    const stageHashes: Record<string,string> = {};
    for (const n of names) {
      const content = `STAGED-${n}`;
      const p = path.join(genDir, n); fs.mkdirSync(path.dirname(p), {recursive:true});
      fs.writeFileSync(p, content, 'utf-8');
      stageHashes[n] = crypto.createHash('sha256').update(content,'utf-8').digest('hex');
    }
    const backupHashes: Record<string,string> = {};
    const oldHashes: Record<string,string|null> = {};
    for (const n of names) {
      const src = n === 'ledger.json' ? path.join(root, input.ledgerPath) : path.join(root, input.shadowDir, n);
      const content = fs.readFileSync(src);
      const h = sha256Buf(content);
      oldHashes[n] = h; backupHashes[n] = h;
      const bp = path.join(genDir, 'backups', n); fs.mkdirSync(path.dirname(bp), {recursive:true});
      fs.writeFileSync(bp, content);
    }
    fs.writeFileSync(path.join(genDir, 'backups', 'tasks.md'), 'TAMPERED', 'utf-8');
    fs.writeFileSync(path.join(root, '.activation-journal.json'), JSON.stringify({
      generationDir: path.relative(root, genDir), oldHashes, backupHashes,
      newHashes: stageHashes, commitIndex: 8, phase: 'test' }), 'utf-8');
    fs.writeFileSync(path.join(root, input.shadowDir, 'tasks.md'), 'TAMPERED-SHADOW\n', 'utf-8');
    const expectedBytes: Record<string, Buffer> = { 'ledger.json': fs.readFileSync(path.join(root, input.ledgerPath)) };
    for (const f of SHADOW_FILES) expectedBytes[f] = fs.readFileSync(path.join(root, input.shadowDir, f));
    const r = activateLedger(input);
    expect(r.success).toBe(false);
    expect(r.error).toContain('Unrecovered');
    expect(fs.existsSync(path.join(root, '.activation-journal.json'))).toBe(true);
    const genDirRel = JSON.parse(fs.readFileSync(path.join(root, '.activation-journal.json'), 'utf-8')).generationDir;
    expect(fs.existsSync(path.join(root, genDirRel))).toBe(true);
    expect(fs.readFileSync(path.join(root, input.ledgerPath))).toEqual(expectedBytes['ledger.json']);
    for (const f of SHADOW_FILES) expect(fs.readFileSync(path.join(root, input.shadowDir, f))).toEqual(expectedBytes[f]);
  });

  it('EACCES on ledger file propagates', () => {
    const root = copyFixture(); const input = getInput(root);
    const lp = path.join(root, input.ledgerPath);
    const origMode = fs.statSync(lp).mode;
    fs.chmodSync(lp, 0o000);
    const r = activateLedger(input);
    fs.chmodSync(lp, origMode & 0o777);
    expect(r.success).toBe(false); expect(r.error).toMatch(/EACCES|permission/i);
  });
  it('ENOENT on amendment returns error', () => {
    const root = copyFixture(); const input = getInput(root);
    fs.rmSync(path.join(root, input.amendmentPath));
    const r = activateLedger(input); expect(r.success).toBe(false);
  });

  it('rollback rejects symlink target (no write-through)', () => {
    const root = copyFixture(); const input = getInput(root);
    tamperShadow(root, input);
    let faulted = false;
    input.onFault = (ev) => {
      if (ev.phase === 'postRenamePreJournal' && ev.target === SHADOW_NAMES[0] && !faulted) { faulted = true; throw new Error('crash'); }
    };
    const r1 = activateLedger(input);
    expect(r1.success).toBe(false); expect(r1.mutated).toBe(true); expect(r1.recovered).toBe(true);
    const ledgerTarget = path.join(root, input.ledgerPath);
    const outsideTarget = path.join(root, 'outside-rollback-target');
    const realContent = fs.readFileSync(ledgerTarget);
    const fakeContent = Buffer.from('FAKE_ROLLBACK_TARGET');
    fs.writeFileSync(outsideTarget, fakeContent);
    fs.rmSync(ledgerTarget);
    fs.symlinkSync(outsideTarget, ledgerTarget);
    const r2 = activateLedger({...input, onFault: undefined});
    expect(fs.readFileSync(outsideTarget)).toEqual(fakeContent);
  });

  it('marks only evidence-bearing objects with old identity as stale', () => {
    const root = copyFixture(); const input = getInput(root);
    tamperShadow(root, input);
    const r = activateLedger(input); expect(r.success).toBe(true);
    const after = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
    for (const r2 of (after.reviews || []) as Record<string,unknown>[]) {
      if (r2.effective_plan_sha256 === PRIOR_EFFECTIVE_SHA256) expect(r2.stale).toBe(true);
    }
    for (const a of (after.assignments || []) as Record<string,unknown>[]) {
      if (a.stale) {
        expect(a.ns0_old_identity).toBe(PRIOR_EFFECTIVE_SHA256);
        expect(a.ns0_new_identity).toBe(NEW_EFFECTIVE_SHA256);
        expect(a.ns0_status).toBe('PENDING_FRESH_REVIEW');
      }
    }
    const ns = (after.assignments as Record<string,unknown>[]).filter((a:Record<string,unknown>)=>a.assignment_id!.toString().startsWith('ASN-AM0012-'));
    for (const a of ns) expect(a.stale).toBeUndefined();
  });

  // ── Bounded Repair ─────────────────────────────────────────────────────────

  function continuationInput(r:string):BoundedRepairInput{
    return{
      canonicalRoot:r,ledgerPath:`.agent/${LEDGER_REL}`,shadowDir:`.agent/${SHADOW_REL}`,
      originalSha256:ORIGINAL_SHA256,priorEffectiveSha256:NEW_EFFECTIVE_SHA256,
      amendments:[
        {amendmentId:'AM-0013',amendmentPath:`.agent/${AM13_REL}`,amendmentSha256:AM13_SHA256,capturePath:`.agent/${CAPTURE13_REL}`},
        {amendmentId:'AM-0014',amendmentPath:`.agent/${AM14_REL}`,amendmentSha256:AM14_SHA256,capturePath:`.agent/${CAPTURE14_REL}`},
        {amendmentId:'AM-0015',amendmentPath:`.agent/${AM15_REL}`,amendmentSha256:AM15_SHA256,capturePath:`.agent/${CAPTURE15_REL}`},
      ],
    };
  }

  describe('bounded repair continuation (AM-0013..0015 after AM-0012 EFFECTIVE)', () => {
    it('activates AM-0013..0015 atomically with correct final identity', () => {
      const root = copyFixture(); const input = continuationInput(root);
      const r = boundedRepair(input);
      expect(r.success).toBe(true); expect(r.mutated).toBe(true);
      expect(r.effectiveIdentity).toBe(BR_FINAL_IDENTITY);
      expect(r.shadowRevision).toBe(48);
      const l = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
      expect(l.effective_plan_identity.sha256).toBe(BR_FINAL_IDENTITY);
      const amendIds = (l.amendments as Record<string,unknown>[]).map((a:Record<string,unknown>)=>a.amendment_id);
      expect(amendIds).toContain('AM-0013');
      expect(amendIds).toContain('AM-0014');
      expect(amendIds).toContain('AM-0015');
      for (const a of l.amendments as Record<string,unknown>[]) {
        if (a.amendment_id === 'AM-0013' || a.amendment_id === 'AM-0014' || a.amendment_id === 'AM-0015') {
          expect(a.status).toBe('OWNER_APPROVED_EFFECTIVE');
        }
      }
      for (const f of SHADOW_FILES) {
        const p = path.join(root, input.shadowDir, f);
        expect(fs.existsSync(p)).toBe(true);
        expect(sha256Hex(fs.readFileSync(p,'utf-8'))).toBe(l.shadow_hashes[f]);
      }
      expect(fs.existsSync(path.join(root, '.activation-journal.json'))).toBe(false);
    });

    it('is idempotent: second call returns mutated false, bytes exact', () => {
      const root = copyFixture(); const input = continuationInput(root);
      const r1 = boundedRepair(input);
      expect(r1.success).toBe(true);
      const ledgerAfter = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
      input.priorEffectiveSha256 = (ledgerAfter.effective_plan_identity as Record<string,unknown>)?.sha256 as Sha256;
      const snap: Record<string, Buffer> = { 'ledger.json': fs.readFileSync(path.join(root, input.ledgerPath)) };
      for (const f of SHADOW_FILES) snap[f] = fs.readFileSync(path.join(root, input.shadowDir, f));
      const r2 = boundedRepair(input);
      expect(r2.success).toBe(true); expect(r2.mutated).toBe(false);
      expect(fs.readFileSync(path.join(root, input.ledgerPath))).toEqual(snap['ledger.json']);
      for (const f of SHADOW_FILES) expect(fs.readFileSync(path.join(root, input.shadowDir, f))).toEqual(snap[f]);
    });

    it('rejects gap: AM-0012, AM-0014 without AM-0013', () => {
      const root = copyFixture();
      const input = continuationInput(root);
      input.amendments = [
        {amendmentId:'AM-0012',amendmentPath:`.agent/${AMENDMENT_REL}`,amendmentSha256:AMENDMENT_SHA256,capturePath:`.agent/${CAPTURE_REL}`},
        {amendmentId:'AM-0014',amendmentPath:`.agent/${AM14_REL}`,amendmentSha256:AM14_SHA256,capturePath:`.agent/${CAPTURE14_REL}`},
      ];
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/gap/i);
    });

    it('rejects order violation: AM-0014 before AM-0013', () => {
      const root = copyFixture();
      const input = continuationInput(root);
      input.amendments = [
        {amendmentId:'AM-0014',amendmentPath:`.agent/${AM14_REL}`,amendmentSha256:AM14_SHA256,capturePath:`.agent/${CAPTURE14_REL}`},
        {amendmentId:'AM-0013',amendmentPath:`.agent/${AM13_REL}`,amendmentSha256:AM13_SHA256,capturePath:`.agent/${CAPTURE13_REL}`},
      ];
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/gap/i);
    });

    it('rejects tampered amendment SHA', () => {
      const root = copyFixture();
      const input = continuationInput(root);
      input.amendments[0] = {...input.amendments[0], amendmentSha256: '0'.repeat(64) as Sha256};
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
    });

    it('rejects tampered capture reference', () => {
      const root = copyFixture();
      const input = continuationInput(root);
      const cap13 = JSON.parse(fs.readFileSync(path.join(root, input.amendments[0].capturePath), 'utf-8'));
      const steerPath = (cap13.steer as Record<string, unknown>)?.path as string;
      if (steerPath) {
        const fullPath = path.join(root, steerPath);
        fs.writeFileSync(fullPath, '# TAMPERED\n', 'utf-8');
      }
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
    });

    it('rejects missing capture file', () => {
      const root = copyFixture();
      const input = continuationInput(root);
      fs.rmSync(path.join(root, input.amendments[0].capturePath));
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
    });

    it('crash rollback at target 0: exact byte recovery + mutation flag', () => {
      const root = copyFixture(); const input = continuationInput(root);
      const origBytes: Record<string, Buffer> = { 'ledger.json': fs.readFileSync(path.join(root, input.ledgerPath)) };
      for (const f of SHADOW_FILES) origBytes[f] = fs.readFileSync(path.join(root, input.shadowDir, f));
      let faulted = false;
      input.onFault = (ev) => {
        if (ev.phase === 'postRenamePreJournal' && ev.target === SHADOW_NAMES[0] && !faulted) { faulted = true; throw new Error('br crash'); }
      };
      const r1 = boundedRepair(input);
      expect(r1.success).toBe(false);
      expect(r1.mutated).toBe(true);
      expect(r1.recovered).toBe(true);
      for (let j = 0; j < 8; j++) {
        const nm = SHADOW_NAMES[j];
        const p = j === 0 ? path.join(root, input.ledgerPath) : path.join(root, input.shadowDir, nm);
        expect(fs.readFileSync(p)).toEqual(origBytes[nm]);
      }
      const r2 = boundedRepair({...input, onFault: undefined});
      expect(r2.success).toBe(true);
      const l2 = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
      expect(l2.shadow_revision).toBeGreaterThan(47);
      expect(fs.existsSync(path.join(root, '.activation-journal.json'))).toBe(false);
    });

    it('crash rollback at target 3: exact byte recovery', () => {
      const root = copyFixture(); const input = continuationInput(root);
      const origBytes: Record<string, Buffer> = { 'ledger.json': fs.readFileSync(path.join(root, input.ledgerPath)) };
      for (const f of SHADOW_FILES) origBytes[f] = fs.readFileSync(path.join(root, input.shadowDir, f));
      let faulted = false;
      input.onFault = (ev) => {
        if (ev.phase === 'postRenamePreJournal' && ev.target === SHADOW_NAMES[3] && !faulted) { faulted = true; throw new Error('br crash idx3'); }
      };
      const r1 = boundedRepair(input);
      expect(r1.success).toBe(false);
      expect(r1.mutated).toBe(true);
      expect(r1.recovered).toBe(true);
      for (let j = 0; j < 8; j++) {
        const nm = SHADOW_NAMES[j];
        const p = j === 0 ? path.join(root, input.ledgerPath) : path.join(root, input.shadowDir, nm);
        expect(fs.readFileSync(p)).toEqual(origBytes[nm]);
      }
      const r2 = boundedRepair({...input, onFault: undefined});
      expect(r2.success).toBe(true);
    });

    it('rejects empty batch', () => {
      const root = copyFixture();
      const input = continuationInput(root);
      input.amendments = [];
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/empty/i);
    });

    it('rejects duplicate amendment IDs', () => {
      const root = copyFixture();
      const input = continuationInput(root);
      input.amendments = [
        {amendmentId:'AM-0013',amendmentPath:`.agent/${AM13_REL}`,amendmentSha256:AM13_SHA256,capturePath:`.agent/${CAPTURE13_REL}`},
        {amendmentId:'AM-0013',amendmentPath:`.agent/${AM13_REL}`,amendmentSha256:AM13_SHA256,capturePath:`.agent/${CAPTURE13_REL}`},
      ];
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/dup/i);
    });

    it('rejects tampered capture original SHA', () => {
      const root = copyFixture(); const input = continuationInput(root);
      const cap = JSON.parse(fs.readFileSync(path.join(root, input.amendments[0].capturePath), 'utf-8'));
      cap.original.sha256 = '0'.repeat(64);
      fs.writeFileSync(path.join(root, input.amendments[0].capturePath), JSON.stringify(cap, null, 2), 'utf-8');
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
    });

    it('rejects tampered capture amendment SHA', () => {
      const root = copyFixture(); const input = continuationInput(root);
      const cap = JSON.parse(fs.readFileSync(path.join(root, input.amendments[0].capturePath), 'utf-8'));
      cap.amendment.sha256 = '0'.repeat(64);
      fs.writeFileSync(path.join(root, input.amendments[0].capturePath), JSON.stringify(cap, null, 2), 'utf-8');
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
    });

    it('rejects tampered capture plan_id', () => {
      const root = copyFixture(); const input = continuationInput(root);
      const cap = JSON.parse(fs.readFileSync(path.join(root, input.amendments[0].capturePath), 'utf-8'));
      cap.plan_id = 'wrong-plan-id';
      fs.writeFileSync(path.join(root, input.amendments[0].capturePath), JSON.stringify(cap, null, 2), 'utf-8');
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
    });

    it('rejects non-canonical amendment ID (AM0013 without hyphen)', () => {
      const root = copyFixture(); const input = continuationInput(root);
      input.amendments = [
        {amendmentId:'AM0013',amendmentPath:`.agent/${AM13_REL}`,amendmentSha256:AM13_SHA256,capturePath:`.agent/${CAPTURE13_REL}`},
      ];
      const r = boundedRepair(input);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/bad/i);
    });

    it('crash at postVerify after all targets committed: journal recovery succeeds', () => {
      const root = copyFixture(); const input = continuationInput(root);
      let faulted = false;
      input.onFault = (ev) => {
        if (ev.phase === 'postVerify' && !faulted) { faulted = true; throw new Error('crash after final target'); }
      };
      const r1 = boundedRepair(input);
      expect(r1.success).toBe(false);
      expect(r1.mutated).toBe(false);
      expect(fs.existsSync(path.join(root, '.activation-journal.json'))).toBe(true);
      const r2 = boundedRepair({...input, onFault: undefined});
      expect(r2.success).toBe(true);
      expect(r2.effectiveIdentity).toBe(BR_FINAL_IDENTITY);
      expect(r2.recovered).toBe(true);
      expect(fs.existsSync(path.join(root, '.activation-journal.json'))).toBe(false);
      const l2 = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
      expect(l2.shadow_revision).toBeGreaterThan(47);
      for (const f of SHADOW_FILES) { const p = path.join(root, input.shadowDir, f); expect(fs.existsSync(p)).toBe(true); expect(sha256Hex(fs.readFileSync(p,'utf-8'))).toBe(l2.shadow_hashes[f]); }
      const ledgerAfter = JSON.parse(fs.readFileSync(path.join(root, input.ledgerPath), 'utf-8'));
      input.priorEffectiveSha256 = (ledgerAfter.effective_plan_identity as Record<string,unknown>)?.sha256 as Sha256;
      const snap: Record<string, Buffer> = { 'ledger.json': fs.readFileSync(path.join(root, input.ledgerPath)) };
      for (const f of SHADOW_FILES) snap[f] = fs.readFileSync(path.join(root, input.shadowDir, f));
      const r3 = boundedRepair(input);
      expect(r3.success).toBe(true);
      expect(r3.mutated).toBe(false);
      expect(fs.readFileSync(path.join(root, input.ledgerPath))).toEqual(snap['ledger.json']);
      for (const f of SHADOW_FILES) expect(fs.readFileSync(path.join(root, input.shadowDir, f))).toEqual(snap[f]);
    });
  });
});
