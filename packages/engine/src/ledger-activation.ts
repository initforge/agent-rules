/**
 * ledger-activation.ts — NS0 AM-0012 activation engine v12
 *
 * Full verifyAll on recovery paths, strict hook phase names,
 * inode-verified lock unlink, secure mkdir, recursive receipt
 * dependency graph with fixed-point stale marking, re-anchor
 * for all finding/ns/assignment records, capture dependency
 * verification for audit/handoff/continuation_prompt.
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { computeCanonicalEffectivePlanIdentity } from './plan-identity.js';
export type Sha256 = string;
export interface ActivationInput {
  canonicalRoot: string; ledgerPath: string; amendmentPath: string;
  capturePath: string; shadowDir: string;
  originalSha256: Sha256; amendmentSha256: Sha256; priorEffectiveSha256: Sha256;
  onFault?: (f: { phase: string; target?: string; error?: string }) => void;
}
export interface ActivationResult { success: boolean; error?: string; effectiveIdentity?: Sha256; shadowRevision?: number; mutated: boolean; recovered?: boolean; }
// ─── Bounded Repair Types ────────────────────────────────────────────────────
export interface BatchAmendmentRef {
  amendmentId: string;
  amendmentPath: string;
  amendmentSha256: Sha256;
  capturePath: string;
}
export interface BoundedRepairInput {
  canonicalRoot: string;
  ledgerPath: string;
  shadowDir: string;
  originalSha256: Sha256;
  priorEffectiveSha256: Sha256;
  amendments: BatchAmendmentRef[];
  onFault?: (f: { phase: string; target?: string; error?: string }) => void;
}
const ACTIVE = new Set(['OWNER_APPROVED_EFFECTIVE','APPROVED']);
const MAX_BYTES = 5*1024*1024;
const SMALL_BYTES = 1024*1024;
const SHADOWS = ['tasks.md','progress.md','amendments.md','reconciliation.md',
  'batches/bootstrap/tasks.md','batches/bootstrap/progress.md','batches/bootstrap/reconciliation.md'] as const;
export const SHADOW_NAMES = ['ledger.json',...SHADOWS.map(n=>n)];
const JOURNAL_FILE = '.activation-journal.json';
const LOCK_FILE = '.activation-lock.json';
const HEX64 = /^[a-f0-9]{64}$/;
const GEN_ROOT_REL = '.agent/.activation-generations';
const TOMBSTONE = 'OWNER_APPROVED_TOMBSTONED';
const decoder = new TextDecoder('utf-8', { fatal: true });
class SecureResolver {
  readonly root: string;
  constructor(root: string) {
    const abs = path.resolve(root);
    if (fs.lstatSync(abs).isSymbolicLink()) throw new Error('Root is symlink');
    this.root = fs.realpathSync(abs);
  }
  resolve(rel: string): string {
    if (path.isAbsolute(rel)) throw new Error(`Absolute path rejected: ${rel}`);
    if (rel === '.'||rel === '') return this.root;
    const parts = rel.split(/[/\\]+/).filter(Boolean);
    if (parts.some(p=>p==='..')) throw new Error(`Path traversal rejected: ${rel}`);
    let cur = this.root;
    for (let i=0;i<parts.length;i++) {
      cur = path.join(cur, parts[i]);
      if (i<parts.length-1||fs.existsSync(cur))
        if (fs.lstatSync(cur).isSymbolicLink()) throw new Error(`Symlink at ${rel}`);
    }
    return cur;
  }
  readBuf(rel: string): Buffer|null {
    const abs = this.resolve(rel);
    let fd: number;
    try { fd = fs.openSync(abs, fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW); }
    catch(e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return null;
      throw e;
    }
    try {
      const stB = fs.fstatSync(fd);
      if (!stB.isFile()) throw new Error(`Not regular: ${rel}`);
      if (stB.size>MAX_BYTES) throw new Error(`File ${rel} >${MAX_BYTES} bytes`);
      const buf = Buffer.alloc(stB.size);
      let off = 0;
      while (off < stB.size) {
        const r = fs.readSync(fd, buf, off, stB.size - off, off);
        if (r === 0) break;
        off += r;
      }
      if (off !== stB.size) throw new Error(`Short read ${rel}: ${off}/${stB.size}`);
      const stA = fs.fstatSync(fd);
      if (stA.dev!==stB.dev||stA.ino!==stB.ino||stA.size!==stB.size||stA.mtimeMs!==stB.mtimeMs)
        throw new Error(`File changed during read: ${rel}`);
      return buf;
    } finally { fs.closeSync(fd); }
  }
  readUtf8(rel: string): string {
    const buf = this.readBuf(rel);
    if (buf === null) throw new Error(`ENOENT: ${rel}`);
    return decoder.decode(buf);
  }
}
function sha256(data: Buffer): Sha256 { return createHash('sha256').update(data).digest('hex'); }
function sha256s(s: string): Sha256 { return sha256(Buffer.from(s, 'utf-8')); }
function fsyncPath(p:string):void{
  const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{fs.fsyncSync(fd)}catch(e){if(process.platform==='win32')return;throw e}finally{fs.closeSync(fd)}
}
function stableJson(v:unknown):string{
  if(v===null||typeof v==='boolean')return String(v);
  if(typeof v==='number')return Number.isFinite(v)?String(v):'null';
  if(typeof v==='string')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(stableJson).join(',')+']';
  if(typeof v==='object'){const k=Object.keys(v as Record<string,unknown>).sort();return '{'+k.map(k2=>stableJson(k2)+':'+stableJson((v as Record<string,unknown>)[k2])).join(',')+'}'}
  return 'null';
}
function computeIdentity(origSha:Sha256,approved:Array<{amendment_id:string;sha256:Sha256}>):{sha256:Sha256;canonical:string;bytes:number}{
  return computeCanonicalEffectivePlanIdentity(origSha as import('./contracts.js').Sha256,approved as Array<{amendment_id:string;sha256:import('./contracts.js').Sha256}>);
}
function dirDevIno(p:string):{dev:number;ino:number}{
  const st=fs.lstatSync(p);
  if(st.isSymbolicLink()) throw new Error(`Symlink at ${p}`);
  return{dev:st.dev,ino:st.ino};
}
function approvedWithoutAm0012(amends:Record<string,unknown>[]):Array<{amendment_id:string;sha256:Sha256}>{
  return amends.filter((x:Record<string,unknown>)=>ACTIVE.has(x.status as string)&&x.amendment_id!=='AM-0012').map((x:Record<string,unknown>)=>({amendment_id:x.amendment_id as string,sha256:x.sha256 as Sha256}));
}
// ─── Secure mkdir (under lock) ─────────────────────────────────────────
function secureMkdirAll(abs:string):void{
  const rootPart=path.parse(abs).root;
  const parts=abs.slice(rootPart.length).split(path.sep).filter(Boolean);
  let cur=rootPart;
  for(let i=0;i<parts.length;i++){
    cur=path.join(cur,parts[i]);
    if(!fs.existsSync(cur)){
      const parentDi=dirDevIno(path.dirname(cur));
      fs.mkdirSync(cur,0o700);
      const created=fs.lstatSync(cur);
      if(created.isSymbolicLink())throw new Error(`Created symlink: ${cur}`);
      const parentDi2=dirDevIno(path.dirname(cur));
      if(parentDi.dev!==parentDi2.dev||parentDi.ino!==parentDi2.ino)throw new Error(`Parent changed after mkdir: ${path.dirname(cur)}`);
    }else{
      if(fs.lstatSync(cur).isSymbolicLink())throw new Error(`Symlink path component: ${cur}`);
    }
  }
}
// ─── Lock with inode verification ──────────────────────────────────────
const lockToken = randomUUID();
function acquireLock(root:string):boolean{
  const lp=path.join(root,LOCK_FILE);
  try{
    const fd=fs.openSync(lp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    const st=fs.fstatSync(fd);
    const b=Buffer.from(JSON.stringify({token:lockToken,pid:process.pid,createdAt:Date.now(),__dev:st.dev,__ino:st.ino}),'utf-8');
    try{fs.writeSync(fd,b,0,b.length,0);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
    return true;
  }catch(e:unknown){
    const err=e as NodeJS.ErrnoException;
    if(err.code!=='EEXIST')return false;
    // Stale lock handling with inode verification
    try{
      const fd2=fs.openSync(lp,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
      try{
        const st2=fs.fstatSync(fd2);
        if(st2.size>SMALL_BYTES){fs.closeSync(fd2);return false} // fail closed
        const raw=Buffer.alloc(st2.size);fs.readSync(fd2,raw,0,st2.size,0);
        const l=JSON.parse(decoder.decode(raw));
        if(typeof l.pid!=='number'){fs.closeSync(fd2);return false}
        try{process.kill(l.pid,0);fs.closeSync(fd2);return false}catch{
          if(Date.now()-l.createdAt>60000){
            // Verify inode before unlink
            const lstatSt=fs.lstatSync(lp);
            if(lstatSt.dev===st2.dev&&lstatSt.ino===st2.ino&&l.__ino===st2.ino){
              fs.closeSync(fd2);fs.rmSync(lp);return acquireLock(root)
            }
          }
          fs.closeSync(fd2);return false;
        }
      }catch{fs.closeSync(fd2);return false}
    }catch{return false}
  }
}
function releaseLock(root:string):void{
  const lp=path.join(root,LOCK_FILE);
  try{
    const fd=fs.openSync(lp,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{
      const stFd=fs.fstatSync(fd);
      if(stFd.size>SMALL_BYTES){fs.closeSync(fd);return} // fail closed
      const raw=Buffer.alloc(stFd.size);fs.readSync(fd,raw,0,stFd.size,0);
      const l=JSON.parse(decoder.decode(raw));
      // Verify lstat pathname vs fd before unlink
      const lstatSt=fs.lstatSync(lp);
      if(l.token===lockToken&&stFd.dev===lstatSt.dev&&stFd.ino===lstatSt.ino&&l.__ino===stFd.ino){
        fs.closeSync(fd);fs.rmSync(lp);return
      }
    }finally{fs.closeSync(fd)}
  }catch{/* skip */}
}
// ─── Journal schema ─────────────────────────────────────────────────────
interface Journal{
  generationDir:string;oldHashes:Record<string,string|null>;backupHashes:Record<string,string|null>;
  newHashes:Record<string,string>;commitIndex:number;phase:string;inflightIndex?:number;
}
function validateJournal(raw:unknown,root:string,res:SecureResolver):Journal|null{
  if(typeof raw!=='object'||raw===null)return null;
  const j=raw as Record<string,unknown>;
  if(typeof j.generationDir!=='string')return null;
  let genAbs:string;
  try{
    if(path.isAbsolute(j.generationDir)||j.generationDir.includes('..'))return null;
    genAbs=res.resolve(j.generationDir);
    const genRoot=path.join(root,GEN_ROOT_REL);
    if(!genAbs.startsWith(genRoot)||(genAbs.length>genRoot.length&&genAbs[genRoot.length]!==path.sep))return null;
  }catch{return null}
  try{if(fs.lstatSync(genAbs).isSymbolicLink())return null}catch{return null}
  if(typeof j.commitIndex!=='number'||!Number.isInteger(j.commitIndex)||j.commitIndex<0||j.commitIndex>8)return null;
  for(const k of['oldHashes','newHashes','backupHashes']){
    const h=j[k];if(typeof h!=='object'||h===null)return null;
    const keys=Object.keys(h as Record<string,unknown>);
    if(keys.length!==8||!SHADOW_NAMES.every(n=>n in (h as Record<string,string|null>)))return null;
    for(const v of Object.values(h as Record<string,string|null>))if(v!==null&&(typeof v!=='string'||!HEX64.test(v)))return null;
  }
  if(typeof j.phase!=='string'||j.phase.length===0)return null;
  if(j.inflightIndex!==undefined&&(typeof j.inflightIndex!=='number'||!Number.isInteger(j.inflightIndex)||j.inflightIndex<1||j.inflightIndex>8))return null;
  const result:Journal={generationDir:genAbs,oldHashes:j.oldHashes as Record<string,string|null>,backupHashes:j.backupHashes as Record<string,string|null>,newHashes:j.newHashes as Record<string,string>,commitIndex:j.commitIndex as number,phase:j.phase as string};
  if(j.inflightIndex!==undefined)result.inflightIndex=j.inflightIndex as number;
  return result;
}
// ─── Recursive evidence + receipt dependency graph (fixed-point) ──────
function reanchorAll(obj:unknown,oldId:string,newId:string):unknown{
  if(typeof obj!=='object'||obj===null)return obj;
  if(Array.isArray(obj))return obj.map(item=>reanchorAll(item,oldId,newId));
  const r=obj as Record<string,unknown>;
  const fid=r.finding_id as string|undefined;
  const nsid=r.ns_task_id as string|undefined;
  const aid=r.anchor_id as string|undefined;
  const reqid=r.requirement_id as string|undefined;
  const shouldReanchor=fid?.match(/^(FIND-|dogfood|AM-)/)||nsid!==undefined||aid!==undefined||reqid!==undefined;
  if(!shouldReanchor){
    let result:Record<string,unknown>={};
    for(const[k,v]of Object.entries(r))result[k]=reanchorAll(v,oldId,newId);
    return result;
  }
  const result:Record<string,unknown>={...r,untrusted_candidate:true,ns0_old_identity:oldId,ns0_new_identity:newId,ns0_status:'PENDING_FRESH_REVIEW'};
  for(const[k,v]of Object.entries(r))if(!(k in result)||result[k]===r[k])result[k]=reanchorAll(v,oldId,newId);
  return result;
}
function markStaleAll(obj:unknown,staleReceipts:Set<string>,staleIds:Set<string>,oldId:string,newId:string):unknown{
  if(typeof obj!=='object'||obj===null)return obj;
  if(Array.isArray(obj))return obj.map(item=>markStaleAll(item,staleReceipts,staleIds,oldId,newId));
  const r=obj as Record<string,unknown>;
  const eff=r.effective_plan_sha256 as string|undefined;
  const head=r.head as string|undefined;
  const review=r.review_receipt_id as string|undefined;
  const receipt=r.completion_receipt_id as string|undefined;
  const assn=r.assignment_id as string|undefined;
  // Check if any reference is stale
  const isStale=eff===oldId||head===oldId||(review!==undefined&&staleReceipts.has(review))||(receipt!==undefined&&staleReceipts.has(receipt))||(assn!==undefined&&staleIds.has(assn));
  let result:Record<string,unknown>={...r};
  if(isStale)result.stale=true;
  for(const[k,v]of Object.entries(r))if(!(k in result)||result[k]===r[k])result[k]=markStaleAll(v,staleReceipts,staleIds,oldId,newId);
  return result;
}
function staleEvidence(ledger:Record<string,unknown>,oldId:Sha256,newId:Sha256):Record<string,unknown>{
  // Step 1: find all root-stale objects and collect stale receipt IDs
  const staleReceipts=new Set<string>();
  const staleIds=new Set<string>();
  function findRootStale(obj:unknown):void{
    if(typeof obj!=='object'||obj===null)return;
    if(Array.isArray(obj)){obj.forEach(findRootStale);return}
    const o=obj as Record<string,unknown>;
    const eff=o.effective_plan_sha256 as string|undefined;
    const head=o.head as string|undefined;
    if(eff===oldId||head===oldId){
      if(typeof o.review_receipt_id==='string')staleReceipts.add(o.review_receipt_id);
      if(typeof o.completion_receipt_id==='string')staleReceipts.add(o.completion_receipt_id);
      if(typeof o.assignment_id==='string')staleIds.add(o.assignment_id);
    }
    for(const v of Object.values(o))findRootStale(v);
  }
  findRootStale(ledger);
  // Step 2: fixed-point iteration — anything referencing a stale receipt/assignment becomes stale
  let changed=true;
  while(changed){
    changed=false;
    function findTransitive(obj:unknown):void{
      if(typeof obj!=='object'||obj===null)return;
      if(Array.isArray(obj)){obj.forEach(findTransitive);return}
      const o=obj as Record<string,unknown>;
      const review=o.review_receipt_id as string|undefined;
      const receipt=o.completion_receipt_id as string|undefined;
      const assn=o.assignment_id as string|undefined;
      const eff=o.effective_plan_sha256 as string|undefined;
      const head=o.head as string|undefined;
      const wasRoot=eff===oldId||head===oldId;
      const hasStaleRef=(review!==undefined&&staleReceipts.has(review))||(receipt!==undefined&&staleReceipts.has(receipt))||(assn!==undefined&&staleIds.has(assn));
      if(!wasRoot&&hasStaleRef){
        if(typeof o.review_receipt_id==='string'&&!staleReceipts.has(o.review_receipt_id)){staleReceipts.add(o.review_receipt_id);changed=true}
        if(typeof o.completion_receipt_id==='string'&&!staleReceipts.has(o.completion_receipt_id)){staleReceipts.add(o.completion_receipt_id);changed=true}
        if(typeof o.assignment_id==='string'&&!staleIds.has(o.assignment_id)){staleIds.add(o.assignment_id);changed=true}
      }
      for(const v of Object.values(o))findTransitive(v);
    }
    findTransitive(ledger);
  }
  // Step 3: re-anchor all finding/ns/anchor/requirement records
  const reanchored=reanchorAll(ledger,oldId,newId) as Record<string,unknown>;
  // Step 4: apply stale marks across entire ledger
  return markStaleAll(reanchored,staleReceipts,staleIds,oldId,newId) as Record<string,unknown>;
}
// ─── Amendment parsing ──────────────────────────────────────────────────
interface NsSection{id:string;heading:string;lineStart:number;lineEnd:number}
interface AcItem{number:number;text:string}
function parseAmendment(content:string):{status:string;nsSections:NsSection[];acList:AcItem[]}{
  const lines=content.split('\n');
  let status='';
  if(lines.length>=3){const m=lines[2].trim().match(/^Status:\s*`([^`]+)`/);if(m)status=m[1];}
  const nsSections:NsSection[]=[];let inS11=false;
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(/^##\s+11\.\s/.test(l)){inS11=true;continue}
    if(/^##\s+12\.\s/.test(l)){inS11=false;continue}
    if(/^##\s/.test(l)&&inS11){inS11=false}
    if(inS11){const m2=l.match(/^###\s+(NS\d)\s+—\s+(.+)/);
      if(m2){let end=lines.length;for(let j=i+1;j<lines.length;j++){if(/^#{2,3}\s/.test(lines[j])&&!lines[j].includes('Continued')){end=j;break}}
        nsSections.push({id:`AM0012-${m2[1]}`,heading:l,lineStart:i+1,lineEnd:end})}}
  }
  const acList:AcItem[]=[];let inS12=false;
  for(let i=0;i<lines.length;i++){const l=lines[i];
    if(/^##\s+12\.\s/.test(l)){inS12=true;continue}
    if(inS12&&/^##\s/.test(l)){inS12=false}
    if(inS12){const m3=l.match(/^\s*(\d+)\.\s+(.+)/);if(m3)acList.push({number:parseInt(m3[1]),text:m3[2].trim()})}}
  return{status,nsSections,acList};
}
const AC_MAP:Record<string,number[]>={'AM0012-NS1':[1,2],'AM0012-NS2':[1],'AM0012-NS3':[3,4],'AM0012-NS4':[5,6,7],'AM0012-NS5':[8,9,10],'AM0012-NS6':[11,12],'AM0012-NS7':[13,14],'AM0012-NS8':[14,15,16],'AM0012-NS9':[17,18,19,20]};
function validateAcMapping(acList:AcItem[],sections:NsSection[]):void{
  const expectedIds=Array.from({length:10},(_,i)=>`AM0012-NS${i}`);
  const foundIds=new Set(sections.map(s=>s.id));
  for(const id of expectedIds)if(!foundIds.has(id))throw new Error(`Missing section ${id}`);
  if(sections.length!==10)throw new Error(`Duplicate sections: ${sections.length}, expected 10`);
  const acNums=sections.filter(s=>s.id!=='AM0012-NS0').flatMap(s=>AC_MAP[s.id]??[]);
  const uniqueAcNums=new Set(acNums);
  if(uniqueAcNums.size!==20)throw new Error(`AC mapping incomplete: ${uniqueAcNums.size}/20`);
  if(!uniqueAcNums.has(1)||!uniqueAcNums.has(20))throw new Error('AC 1-20 range missing edges');
  const seen=new Set<number>();
  for(const a of acList){if(seen.has(a.number))throw new Error(`Duplicate AC #${a.number} in section 12`);seen.add(a.number);}
  const parsedNums=seen;
  for(const n of uniqueAcNums)if(!parsedNums.has(n))throw new Error(`AC #${n} mapped but not in section 12`);
  for(const n of parsedNums)if(!uniqueAcNums.has(n))throw new Error(`Extra AC #${n} in section 12 not in mapping`);
}
// ─── Shadow rendering ───────────────────────────────────────────────────
function renderTasks(ld:Record<string,unknown>):string{
  const rev=ld.shadow_revision as number??0;const assigns=(ld.assignments??[])as Record<string,unknown>[];
  const anchors=(ld.plan_anchors??[])as Record<string,unknown>[];
  return'# Tasks\n\nDerived from WorkLedger revision '+rev+'.\n\n| Task | Assignment | State | Scope | Anchor |\n|---|---|---|---|---|\n'+
    assigns.map(a=>{const an=anchors.find(x=>x.requirement_id===a.plan_anchor_requirement_id);
      return`| ${a.task_id as string} | ${a.assignment_id as string} | ${a.status as string} | ${((a.acceptance_criteria as string[]??[]).join('; ')||(a.owned_paths as string[]??[]).join(', '))} | ${an?((an.amendment_id??'plan')+' '+(an.line_start as string??'')):(a.plan_anchor_requirement_id as string??'-')} |`}).join('\n')+'\n';
}
function renderProgress(ld:Record<string,unknown>,newId:Sha256,oldId:Sha256):string{
  const rev=ld.shadow_revision as number??0;const evts=(ld.audit_events??[])as Record<string,unknown>[];
  return'# Progress\n\n| Event | Summary | Amendment | Rev |\n|---|---|---|---|\n'+
    evts.slice(-5).map(e=>`| ${e.type as string} | ${(e.summary as string??'').substring(0,120)} | ${e.amendment_id as string??'-'} | ${(e.shadow_revision as number??'')} |`).join('\n')+
    `\n| AMENDMENT_CHAIN_ACTIVATION | Activated AM-0012 identity ${oldId}→${newId} | AM-0012 | R${rev} |\n`;
}
function renderAmendments(ld:Record<string,unknown>):string{
  const amends=(ld.amendments??[])as Record<string,unknown>[];
  return'# Amendments\n\n| ID | Status | SHA | Effect |\n|---|---|---|---|\n'+amends.map(a=>`| ${a.amendment_id as string} | ${a.status as string} | ${(a.sha256 as string).substring(0,12)}… | ${(a.activation_state as string)??'-'} |`).join('\n')+'\n';
}
function renderReconciliation(ld:Record<string,unknown>):string{
  const recons=(ld.reconciliations??[])as Record<string,unknown>[];const st=ld.execution_state as string??ld.status as string??'UNKNOWN';
  return'# Reconciliation\n\nStatus: **'+st+'**\n\n| Kind | Result | Scope | Evidence |\n|---|---|---|---|\n'+
    recons.map(r=>`| ${r.kind as string??'-'} | ${r.result as string??'-'} | ${((r.scope as string)??'').substring(0,80)} | ${r.review_receipt_id as string??'-'} |`).join('\n')+'\n';
}
function renderBootstrapTasks(ld:Record<string,unknown>):string{
  const bs=(ld.batches??[])as Record<string,unknown>[];const b=bs.find((x:Record<string,unknown>)=>x.status==='COMPLETE_BOOTSTRAP');
  return'# Bootstrap tasks\n\n| Batch | Scope | AC |\n|---|---|---|\n| '+(b?.batch_id as string??'B-0')+' | Bootstrap plan capture | '+((b?.acceptance_criteria as string[]??[]).join(', '))+' |\n';
}
function renderBootstrapProgress(ld:Record<string,unknown>):string{
  const bs=(ld.batches??[])as Record<string,unknown>[];const b=bs.find((x:Record<string,unknown>)=>x.status==='COMPLETE_BOOTSTRAP');
  return'# Bootstrap progress\n\nBootstrap batch status: **'+(b?.status as string??'CAPTURED')+'**\n';
}
function renderBootstrapReconciliation(ld:Record<string,unknown>):string{
  const bs=(ld.batches??[])as Record<string,unknown>[];const b=bs.find((x:Record<string,unknown>)=>x.status==='COMPLETE_BOOTSTRAP');
  return'# Bootstrap reconciliation\n\n| Batch | Status | Anchor |\n|---|---|---|\n'+(b?`| ${b.batch_id as string} | ${b.status as string} | ${b.anchor_requirement_id as string} |`:'| - | PENDING | - |')+'\n';
}
function renderAll(ld:Record<string,unknown>,newId:Sha256,oldId:Sha256):Record<string,string>{
  return{'tasks.md':renderTasks(ld),'progress.md':renderProgress(ld,newId,oldId),'amendments.md':renderAmendments(ld),'reconciliation.md':renderReconciliation(ld),
    'batches/bootstrap/tasks.md':renderBootstrapTasks(ld),'batches/bootstrap/progress.md':renderBootstrapProgress(ld),'batches/bootstrap/reconciliation.md':renderBootstrapReconciliation(ld)};
}
// ─── NS builders ────────────────────────────────────────────────────────
function buildNsAnchors(amSha:Sha256,sections:NsSection[],amLines:string[]):Record<string,unknown>[]{
  return sections.map(s=>{const text=amLines.slice(s.lineStart-1,s.lineEnd).join('\n');
    return{amendment_id:'AM-0012',plan_sha256:amSha,line_start:s.lineStart,line_end:s.lineEnd,anchor_text_sha256:sha256s(text),requirement_id:s.id,section_heading:s.heading}});
}
function buildNsAssigns(sections:NsSection[],acList:AcItem[]):Record<string,unknown>[]{
  return sections.map(s=>{const acNums=AC_MAP[s.id]??[];const acs=acNums.length>0?acNums.map(n=>`AC-${String(n).padStart(2,'0')}: ${acList.find(a=>a.number===n)?.text??''}`):['AC-NS0: activation'];
    return{assignment_id:`ASN-${s.id}`,task_id:s.id,owner:s.id==='AM0012-NS0'?'engine':'harness-maintainer',status:s.id==='AM0012-NS0'?'NEEDS_REMEDIATION':'BLOCKED',
      acceptance_criteria:acs,plan_anchor_requirement_id:s.id,owned_paths:s.id==='AM0012-NS0'?['packages/engine/src/ledger-activation.ts']:[]}});
}
function buildNsBatches(sections:NsSection[]):Record<string,unknown>[]{
  const ids=sections.map(s=>s.id);
  return[{batch_id:'NS0-ACTIVATION',status:'NEEDS_REMEDIATION',anchor_requirement_id:'AM0012-NS0',acceptance_criteria:['NS0 activation complete'],task_ids:['AM0012-NS0']},
    {batch_id:'NS1-NS9',status:'BLOCKED',anchor_requirement_id:'AM0012-NS1',acceptance_criteria:['All 20 ACs satisfied'],task_ids:ids.filter(i=>i!=='AM0012-NS0')}];
}
// ─── Ledger validation ──────────────────────────────────────────────────
function validateLedger(rawBuf:Buffer):Record<string,unknown>{
  if(rawBuf.length>MAX_BYTES)throw new Error(`Ledger >${MAX_BYTES}`);
  const raw=decoder.decode(rawBuf);
  const ld=JSON.parse(raw)as Record<string,unknown>;
  if(typeof ld!=='object'||ld===null)throw new Error('Not object');
  for(const f of['plan_id','status','amendments','shadow_revision']as const)if(!(f in ld))throw new Error(`Missing ${f}`);
  return ld;
}
// ─── Capture / identity checks ─────────────────────────────────────────
function verifyCapturePaths(cap:Record<string,unknown>,ld:Record<string,unknown>,input:ActivationInput):boolean{
  try{
    const orig=cap.original as Record<string,unknown>|undefined;
    const amend=cap.amendment as Record<string,unknown>|undefined;
    if(!orig||typeof orig.path!=='string')return false;
    if(!amend||typeof amend.path!=='string')return false;
    if(path.normalize(orig.path as string)!==path.normalize((ld.original_plan as Record<string,unknown>)?.path as string))return false;
    if(path.normalize(amend.path as string)!==path.normalize(input.amendmentPath))return false;
    return true;
  }catch{return false}
}
function verifyCaptureContent(cap:Record<string,unknown>,ld:Record<string,unknown>,input:ActivationInput):boolean{
  try{
    if(!cap.schema_version)return false;
    const orig=cap.original as Record<string,unknown>|undefined;
    const amend=cap.amendment as Record<string,unknown>|undefined;
    if(!orig||orig.sha256!==input.originalSha256)return false;
    if(!amend||amend.sha256!==input.amendmentSha256)return false;
    if(cap.plan_id!==ld.plan_id)return false;
    if(typeof cap.status!=='string')return false;
    if(!(cap.repository_baselines as Record<string,unknown>)?.active_integration)return false;
    return true;
  }catch{return false}
}
function verifyCaptureDeps(cap:Record<string,unknown>,res:SecureResolver):boolean{
  try{
    // Verify audit/handoff/continuation_prompt paths + SHAs if present in capture
    for(const k of['audit','handoff','continuation_prompt'] as const){
      const entry=cap[k] as Record<string,unknown>|undefined;
      if(!entry)continue;
      if(typeof entry.path!=='string'||typeof entry.sha256!=='string')return false;
      const buf=res.readBuf(entry.path as string);
      if(buf===null||sha256(buf)!==(entry.sha256 as string))return false;
    }
    return true;
  }catch{return false}
}
function verifyCapture(cap:Record<string,unknown>,ld:Record<string,unknown>,input:ActivationInput,res?:SecureResolver):boolean{
  if(!verifyCapturePaths(cap,ld,input))return false;
  if(!verifyCaptureContent(cap,ld,input))return false;
  if(res&&!verifyCaptureDeps(cap,res))return false;
  return true;
}
// ─── Identity ──────────────────────────────────────────────────────────
function hashAmendmentFiles(amendments:Record<string,unknown>[],res:SecureResolver):boolean{
  try{
    for(const a of amendments){
      if(a.amendment_id==='AM-0004')continue;
      if(!ACTIVE.has(a.status as string))return false;
      if(!a.sha256||!a.path)return false;
      const buf=res.readBuf(a.path as string);
      if(buf===null)return false;
      if(sha256(buf)!==(a.sha256 as string))return false;
    }
    const ids=new Set<string>();
    for(const a of amendments)if(ids.has(a.amendment_id as string))return false;else ids.add(a.amendment_id as string);
    return true;
  }catch{return false}
}
function recomputePriorIdentity(ld:Record<string,unknown>,res:SecureResolver):Sha256|null{
  try{
    const op=ld.original_plan as Record<string,unknown>;
    const opBuf=res.readBuf(op.path as string);
    if(opBuf===null||sha256(opBuf)!==(op.sha256 as string))return null;
    const approved:Array<{amendment_id:string;sha256:Sha256}>=[];
    for(const a of ld.amendments as Record<string,unknown>[]){
      if(a.amendment_id==='AM-0004'){
        if(a.status&&(a.status as string)!==TOMBSTONE)return null;
        continue;
      }
      if(a.amendment_id==='AM-0012')continue;
      if(!ACTIVE.has(a.status as string))return null;
      if(!a.path)continue;
      const buf=res.readBuf(a.path as string);
      if(buf===null||sha256(buf)!==(a.sha256 as string))return null;
      approved.push({amendment_id:a.amendment_id as string,sha256:a.sha256 as Sha256});
    }
    return computeIdentity((ld.original_plan as Record<string,unknown>)?.sha256 as string,approved).sha256;
  }catch{return null}
}
// ─── Full verification ─────────────────────────────────────────────────
function verifyAll(ld:Record<string,unknown>,input:ActivationInput,res:SecureResolver,prior:Sha256):boolean{
  try{
    const op=ld.original_plan as Record<string,unknown>;
    const opBuf=res.readBuf(op.path as string);
    if(opBuf===null||sha256(opBuf)!==(op.sha256 as string))return false;
    const amends=ld.amendments as Record<string,unknown>[];
    const a12=amends.find((x:Record<string,unknown>)=>x.amendment_id==='AM-0012');
    if(!a12||a12.status!=='OWNER_APPROVED_EFFECTIVE'||a12.sha256!==input.amendmentSha256)return false;
    const capBuf=res.readBuf(input.capturePath);
    if(capBuf===null)return false;
    if(sha256(capBuf)!==(a12.capture_sha256 as string))return false;
    const cap=JSON.parse(decoder.decode(capBuf))as Record<string,unknown>;
    if(!verifyCapture(cap,ld,input,res))return false;
    if(ld.execution_state===undefined)return false;
    if(!(ld.shadow_revision as number)||(ld.shadow_revision as number)<1)return false;
    if(!(ld.audit_events as Record<string,unknown>[])?.some((e:Record<string,unknown>)=>e.amendment_id==='AM-0012'))return false;
    if(!hashAmendmentFiles(amends,res))return false;
    if(prior!==input.priorEffectiveSha256)return false;
    const approved=amends.filter((x:Record<string,unknown>)=>ACTIVE.has(x.status as string)).map((x:Record<string,unknown>)=>({amendment_id:x.amendment_id as string,sha256:x.sha256 as Sha256}));
    if(computeIdentity(input.originalSha256,approved).sha256!==(ld.effective_plan_identity as Record<string,unknown>)?.sha256)return false;
    const hashes=ld.shadow_hashes as Record<string,string>;
    if(!hashes||SHADOWS.some(n=>!(n in hashes)))return false;
    for(const n of SHADOWS){const p=path.join(input.shadowDir,n);const b=res.readBuf(p);if(b===null||sha256(b)!==hashes[n])return false}
    return true;
  }catch{return false}
}
// ─── Atomic rollback with symlink-guarded copy ─────────────────────────
function rollbackTargets(vj:Journal,tPaths:string[],root:string):boolean{
  try{
    const genAbs=path.isAbsolute(vj.generationDir)?vj.generationDir:path.join(root,vj.generationDir);
    if(!fs.existsSync(genAbs))return false;
    for(let i=0;i<SHADOW_NAMES.length;i++){
      const name=SHADOW_NAMES[i];const bh=vj.backupHashes[name];
      if(bh===null)continue;
      const bp=path.join(genAbs,'backups',name);
      if(!fs.existsSync(bp))return false;
      const bBuf=fs.readFileSync(bp);
      if(sha256(bBuf)!==bh)return false;
    }
    for(let i=vj.commitIndex-1;i>=0;i--){
      const name=SHADOW_NAMES[i];const t=tPaths[i];const oldH=vj.oldHashes[name];
      if(oldH===null){try{fs.rmSync(t)}catch{}continue}
      const bp=path.join(genAbs,'backups',name);
      const dir=path.dirname(t);
      const tmp=path.join(dir,`.rollback-${path.basename(t)}-${process.pid}-${(Math.random()*0x100000000).toString(36)}`);
      const bBuf=fs.readFileSync(bp);
      const fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
      try{
        let off=0;
        while(off<bBuf.length){
          const n=fs.writeSync(fd,bBuf,off,bBuf.length-off);
          if(n===0)throw new Error(`rollback write 0 at offset ${off}`);
          off+=n;
        }
        fs.fsyncSync(fd);
      }finally{fs.closeSync(fd)}
      const di=dirDevIno(dir);
      const afterDi=dirDevIno(dir);
      if(di.dev!==afterDi.dev||di.ino!==afterDi.ino){try{fs.rmSync(tmp)}catch{};return false}
      fs.renameSync(tmp,t);
      const dirFd=fs.openSync(dir,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
      try{fs.fsyncSync(dirFd)}catch(e){if(process.platform!=='win32')throw e}finally{fs.closeSync(dirFd)}
      if(sha256(fs.readFileSync(t))!==oldH)return false;
    }
    return true;
  }catch{return false}
}
// ─── Durable transaction ────────────────────────────────────────────────
function readJournalBounded(p:string):Journal|null{
  try{
    const st=fs.statSync(p);
    if(st.size>SMALL_BYTES)return null;
    const buf=Buffer.alloc(st.size);
    const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{fs.readSync(fd,buf,0,st.size,0)}finally{fs.closeSync(fd)}
    return JSON.parse(decoder.decode(buf))as Journal;
  }catch{return null}
}
function writeJournal(j:Journal,p:string):void{
  const dir=path.dirname(p);
  if(!fs.existsSync(dir)){
    const parentBefore=dirDevIno(path.dirname(dir));
    secureMkdirAll(dir);
    const parentAfter=dirDevIno(path.dirname(dir));
    if(parentBefore.dev!==parentAfter.dev||parentBefore.ino!==parentAfter.ino)throw new Error('writeJournal: parent replaced during mkdir');
  }
  const tmp=p+`.${Date.now()}.${process.pid}`;
  const b=Buffer.from(JSON.stringify(j),'utf-8');
  const fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
  try{fs.writeSync(fd,b,0,b.length,0);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  fs.renameSync(tmp,p);fsyncPath(path.dirname(p));
}
function remJournal(p:string):void{
  try{fs.rmSync(p);fsyncPath(path.dirname(p))}catch{/* cleanup */}
}
// ─── Commit with inflight-index crash safety ────────────────────────────
function commitTargets(tNames:string[],tPaths:string[],genDir:string,dirSnap:{dev:number;ino:number}[],journal:Journal,jPath:string,input:ActivationInput):number{
  for(let i=0;i<tNames.length;i++){
    journal.inflightIndex=i;
    writeJournal(journal,jPath);
    input.onFault?.({phase:'preRename',target:tNames[i]});
    const gf=path.join(genDir,tNames[i]);
    const di=dirSnap[i];
    const cur=dirDevIno(path.dirname(tPaths[i]));
    if(di.dev!==cur.dev||di.ino!==cur.ino){journal.inflightIndex=undefined;writeJournal(journal,jPath);return i}
    const tmp=tPaths[i]+`.${Date.now()}.${process.pid}`;
    const tfd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    try{const gb=fs.readFileSync(gf);fs.writeSync(tfd,gb,0,gb.length,0);fs.fsyncSync(tfd)}finally{fs.closeSync(tfd)}
    fs.renameSync(tmp,tPaths[i]);fsyncPath(path.dirname(tPaths[i]));
    input.onFault?.({phase:'postRenamePreJournal',target:tNames[i]});
    journal.commitIndex=i+1;
    journal.inflightIndex=undefined;
    writeJournal(journal,jPath);
    input.onFault?.({phase:'postJournal',target:tNames[i]});
  }
  return tNames.length;
}
// ─── Main ───────────────────────────────────────────────────────────────
export function activateLedger(input: ActivationInput): ActivationResult {
  try{
    const requestedRoot=path.resolve(input.canonicalRoot);
    if(fs.lstatSync(requestedRoot).isSymbolicLink())throw new Error('Canonical root is symlink');
    const root=fs.realpathSync.native(requestedRoot);
    const res=new SecureResolver(root);
    if(!acquireLock(root))return{success:false,error:'Cannot acquire activation lock',mutated:false};
    try{return activateInner(input,root,res)}finally{releaseLock(root)}
  }catch(e){return{success:false,error:String(e),mutated:false}}
}
// ─── Bounded Repair ───────────────────────────────────────────────────────────
function brAmendStatus(content:string):string{
  if(content.split('\n').length>=3){const m=content.split('\n')[2].trim().match(/^Status:\s*`([^`]+)`/);if(m)return m[1]}
  return'';
}
function brCapVerify(cap:Record<string,unknown>,res:SecureResolver,expected:{planId:string;originalSha256:Sha256;amendmentSha256:Sha256;amendmentId:string;amendmentPath:string}):boolean{
  try{if(!cap.schema_version)return false;if(cap.plan_id!==expected.planId)return false;if(cap.amendment_id!==expected.amendmentId)return false;const orig=cap.original as Record<string,unknown>|undefined;if(!orig||typeof orig.sha256!=='string'||orig.sha256!==expected.originalSha256)return false;const amend=cap.amendment as Record<string,unknown>|undefined;if(!amend||typeof amend.sha256!=='string'||amend.sha256!==expected.amendmentSha256||path.normalize(amend.path as string)!==path.normalize(expected.amendmentPath))return false;const rb=(cap.repository_baselines??cap.repository_baseline)as Record<string,unknown>|undefined;if(!rb||!rb.active_integration)return false
  for(const k of['audit','handoff','continuation_prompt','steer']as const){const entry=cap[k]as Record<string,unknown>|undefined;if(!entry)continue;if(typeof entry.path!=='string'||typeof entry.sha256!=='string')return false;const buf=res.readBuf(entry.path as string);if(buf===null||sha256(buf)!==(entry.sha256 as string))return false}
  return true}catch{return false}
}
function brValidateOrder(a:readonly BatchAmendmentRef[]):void{
  if(!a.length)throw new Error('BR: empty');const ids=a.map(x=>x.amendmentId);const s=new Set<string>();
  for(let i=0;i<ids.length;i++){if(s.has(ids[i]))throw new Error('BR: dup '+ids[i]);s.add(ids[i])}
  const n=ids.map(id=>{const m=id.match(/^AM-(\d{4})$/);if(!m)throw new Error('BR: bad '+id);return parseInt(m[1],10)})
  for(let i=1;i<n.length;i++)if(n[i]!==n[i-1]+1)throw new Error(`BR: gap at ${i}, expected AM-${String(n[i-1]+1).padStart(4,'0')}, got ${ids[i]}`);
}
function brVerifyAll(ld:Record<string,unknown>,input:BoundedRepairInput,res:SecureResolver):boolean{
  try{
    const op=ld.original_plan as Record<string,unknown>;
    const opBuf=res.readBuf(op.path as string);
    if(opBuf===null||sha256(opBuf)!==(op.sha256 as string))return false;
    if(ld.execution_state===undefined)return false;
    if(!(ld.shadow_revision as number)||(ld.shadow_revision as number)<1)return false;
    if(!hashAmendmentFiles(ld.amendments as Record<string,unknown>[],res))return false;
    const amends=ld.amendments as Record<string,unknown>[];
    for(const ref of input.amendments){
      const a=amends.find((x:Record<string,unknown>)=>x.amendment_id===ref.amendmentId);
      if(!a||a.status!=='OWNER_APPROVED_EFFECTIVE'||(a.sha256 as string)!==ref.amendmentSha256)return false;
      if(a.capture_sha256){
        const capBuf=res.readBuf(ref.capturePath);
        if(capBuf===null||sha256(capBuf)!==(a.capture_sha256 as string))return false;
        const cap=JSON.parse(decoder.decode(capBuf))as Record<string,unknown>;
        if(!brCapVerify(cap,res,{planId:ld.plan_id as string,originalSha256:input.originalSha256,amendmentSha256:ref.amendmentSha256,amendmentId:ref.amendmentId,amendmentPath:ref.amendmentPath}))return false;
      }
    }
    const approved=amends.filter((x:Record<string,unknown>)=>ACTIVE.has(x.status as string)).map((x:Record<string,unknown>)=>({amendment_id:x.amendment_id as string,sha256:x.sha256 as Sha256}));
    if(computeIdentity(input.originalSha256,approved).sha256!==(ld.effective_plan_identity as Record<string,unknown>)?.sha256)return false;
    const hashes=ld.shadow_hashes as Record<string,string>;
    if(!hashes||SHADOWS.some(n=>!(n in hashes)))return false;
    for(const n of SHADOWS){const p=path.join(input.shadowDir,n);const b=res.readBuf(p);if(b===null||sha256(b)!==hashes[n])return false}
    return true;
  }catch{return false}
}
function brRender(l:Record<string,unknown>,nid:Sha256,oid:Sha256):Record<string,string>{
  const ams=l.amendments as Record<string,unknown>[]??[];
  const amendMd='# Amendments\n\n| ID | Status | SHA | Effect |\n|---|---|---|---|\n'+ams.map(a=>`| ${a.amendment_id as string} | ${a.status as string} | ${(a.sha256 as string).substring(0,12)}… | ${(a.activation_state as string)??'-'} |`).join('\n')+'\n';
  return{'tasks.md':renderTasks(l),'progress.md':renderProgress(l,nid,oid),'amendments.md':amendMd,'reconciliation.md':renderReconciliation(l),'batches/bootstrap/tasks.md':renderBootstrapTasks(l),'batches/bootstrap/progress.md':renderBootstrapProgress(l),'batches/bootstrap/reconciliation.md':renderBootstrapReconciliation(l)};
}
function rollbackThen(vj:Journal,tp:string[],rt:string):ActivationResult{
  if(rollbackTargets(vj,tp,rt))return{success:false,error:'BR: rolled back',mutated:true,recovered:true};
  return{success:false,error:'BR: unrecovered',mutated:true,recovered:false};
}
export function boundedRepair(input:BoundedRepairInput):ActivationResult{
  try{const requestedRoot=path.resolve(input.canonicalRoot);if(fs.lstatSync(requestedRoot).isSymbolicLink())throw new Error('Canonical root is symlink');const root=fs.realpathSync.native(requestedRoot);const res=new SecureResolver(root);
    if(!acquireLock(root))return{success:false,error:'Cannot acquire BR lock',mutated:false};
    try{return brInner(input,root,res)}finally{releaseLock(root)}
  }catch(e){return{success:false,error:String(e),mutated:false}}
}
function brInner(input:BoundedRepairInput,root:string,res:SecureResolver):ActivationResult{
  const ledgerTarget=res.resolve(input.ledgerPath);const shadowDir=res.resolve(input.shadowDir);
  for(const t of[ledgerTarget,shadowDir]){try{if(fs.lstatSync(t).isSymbolicLink())return{success:false,error:`BR symlink: ${t}`,mutated:false}}catch{}}
  const tN=SHADOW_NAMES;const tP=[ledgerTarget,...SHADOWS.map(n=>path.join(shadowDir,n))];const dS=tP.map(t=>dirDevIno(path.dirname(t)));
  const amends=input.amendments;if(!amends.length)return{success:false,error:'BR: empty',mutated:false};
  const lBuf=res.readBuf(input.ledgerPath);if(lBuf===null)return{success:false,error:'Ledger not found',mutated:false};
  const ledger=validateLedger(lBuf);const jP=path.join(root,JOURNAL_FILE);
  const oS=(ledger.original_plan as Record<string,unknown>)?.sha256 as string;
  if(oS!==input.originalSha256)return{success:false,error:'Original SHA mismatch',mutated:false};
  // Journal recovery check must come before identity check: after crash, targets may be
  // fully committed and ledger identity updated past input.priorEffectiveSha256.
  const jE=readJournalBounded(jP);
  if(jE){const vj=validateJournal(jE,root,res);if(vj){let ok=true;for(const[n,h]of Object.entries(vj.newHashes)){const p=n==='ledger.json'?input.ledgerPath:path.join(input.shadowDir,n);const b=res.readBuf(p);if(b===null||sha256(b)!==h){ok=false;break}}
  if(ok){const rb=res.readBuf(input.ledgerPath);if(rb){const rl=validateLedger(rb);if(brVerifyAll(rl,input,res)){const recEi=(rl.effective_plan_identity as Record<string,unknown>)?.sha256 as Sha256;const recOs=(rl.original_plan as Record<string,unknown>)?.sha256 as string;const recAp=(rl.amendments as Record<string,unknown>[]).filter((a:Record<string,unknown>)=>ACTIVE.has(a.status as string)).map((a:Record<string,unknown>)=>({amendment_id:a.amendment_id as string,sha256:a.sha256 as Sha256}));const recNId=computeIdentity(recOs,recAp);const isMutated=recNId.sha256!==recEi;remJournal(jP);if(fs.existsSync(path.dirname(jP)))fsyncPath(path.dirname(jP));return{success:true,mutated:isMutated,recovered:true,effectiveIdentity:recEi,shadowRevision:rl.shadow_revision as number}}}
  writeJournal(vj,jP);return{success:false,error:'BR: recovery verifyAll failed',mutated:true,recovered:true}}}}
  const ei=ledger.effective_plan_identity as Record<string,unknown>|undefined;
  if(!ei||typeof ei.sha256!=='string')return{success:false,error:'BR: no identity',mutated:false};
  const cId=ei.sha256 as Sha256;if(cId!==input.priorEffectiveSha256)return{success:false,error:`BR: identity ${cId}!=${input.priorEffectiveSha256}`,mutated:false};
  brValidateOrder(amends);
  const eAm=ledger.amendments as Record<string,unknown>[];const planId=ledger.plan_id as string;const nb:Record<string,unknown>[]=[];const aIds=new Set(eAm.map((a:Record<string,unknown>)=>a.amendment_id as string));
  for(const ref of amends){
    if(aIds.has(ref.amendmentId)){const ex=eAm.find((x:Record<string,unknown>)=>x.amendment_id===ref.amendmentId);if(!ex||(ex.status as string)!=='OWNER_APPROVED_EFFECTIVE'||(ex.sha256 as string)!==ref.amendmentSha256)return{success:false,error:`BR: existing ${ref.amendmentId} mismatch`,mutated:false};continue}
    try{      const aA=res.resolve(ref.amendmentPath);const aB=fs.readFileSync(aA);
      if(sha256(aB)!==ref.amendmentSha256)throw new Error('SHA');const aC=decoder.decode(aB);
      if(brAmendStatus(aC)!=='OWNER_APPROVED_PENDING_ACTIVATION')throw new Error('status '+brAmendStatus(aC));
      const cB=res.readBuf(ref.capturePath);if(cB===null)throw new Error('capture ENOENT');const cap=JSON.parse(decoder.decode(cB))as Record<string,unknown>;
      if(!brCapVerify(cap,res,{planId,originalSha256:oS,amendmentSha256:ref.amendmentSha256,amendmentId:ref.amendmentId,amendmentPath:ref.amendmentPath}))throw new Error('cap');const cS=sha256(cB);const aS=fs.statSync(aA);
      nb.push({amendment_id:ref.amendmentId,status:'OWNER_APPROVED_EFFECTIVE',path:path.relative(root,aA),sha256:ref.amendmentSha256,bytes:aS.size,lines:aC.split('\n').length,capture_sha256:cS,supplements_plan_id:planId,supplements_original_sha256:oS,activation_state:'EFFECTIVE'})
    }catch(e){return{success:false,error:`BR: ${ref.amendmentId}: ${e instanceof Error?e.message:String(e)}`,mutated:false}}
    aIds.add(ref.amendmentId);
  }
  const fAm=[...eAm];for(const r of nb){if(!fAm.some((a:Record<string,unknown>)=>a.amendment_id===r.amendment_id))fAm.push(r)}
  const ap=fAm.filter((a:Record<string,unknown>)=>a.status==='OWNER_APPROVED_EFFECTIVE'||a.status==='APPROVED').map((a:Record<string,unknown>)=>({amendment_id:a.amendment_id as string,sha256:a.sha256 as Sha256}));
  const nId=computeIdentity(oS,ap);
  const oEff=input.priorEffectiveSha256;
  if(nb.length===0&&nId.sha256===cId)return{success:true,mutated:false,effectiveIdentity:nId.sha256,shadowRevision:ledger.shadow_revision as number};
  const sE=staleEvidence(ledger,oEff,nId.sha256);const nR=(ledger.shadow_revision as number)+1;
  const aStr=amends.map(a=>a.amendmentId).join(',');
  const uL:Record<string,unknown>={...ledger,...sE,amendments:fAm,effective_plan_identity:{algorithm:'SHA-256 over UTF-8 canonical JSON with no insignificant whitespace, lexicographically sorted object keys, and approved_amendments preserved in approval order',input_manifest:{algorithm:'SHA-256',approved_amendments:ap,composition:'original-plus-ordered-approved-amendment-sha256',original_plan_sha256:oS,version:1},canonical_json_utf8:nId.canonical,canonical_json_utf8_bytes:nId.bytes,sha256:nId.sha256},shadow_revision:nR,audit_events:[...(ledger.audit_events as Record<string,unknown>[]??[]),{event_id:`E-BR-${nR}`,type:'BOUNDED_REPAIR',summary:`Bounded repair ${aStr} identity ${oEff}→${nId.sha256}`,actor:'engine',prior_effective_sha256:oEff,new_effective_sha256:nId.sha256,amendment_ids:amends.map(a=>a.amendmentId),shadow_revision:nR}]};
  const nS=brRender(uL,nId.sha256,oEff);const nH:Record<string,Sha256>={};for(const n of SHADOWS)nH[n]=sha256s(nS[n]);uL.shadow_hashes={...nH};
  const uR=JSON.stringify(uL,null,2)+'\n';nH['ledger.json']=sha256s(uR);
  const gU=randomUUID();const gD=path.join(root,GEN_ROOT_REL,gU);const bD=path.join(gD,'backups');secureMkdirAll(bD);
  const oH:Record<string,string|null>={};const bH:Record<string,string|null>={};
  for(let i=0;i<tN.length;i++){const nm=tN[i];const s=tP[i];const di=dS[i];const cu=dirDevIno(path.dirname(s));if(di.dev!==cu.dev||di.ino!==cu.ino)return{success:false,error:`TOCTOU ${s}`,mutated:false};
  try{const ct=fs.readFileSync(s);const h=sha256(ct);oH[nm]=h;const bp=path.join(bD,nm);secureMkdirAll(path.dirname(bp));const bf=fs.openSync(bp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeSync(bf,ct,0,ct.length,0);fs.fsyncSync(bf)}finally{fs.closeSync(bf)};bH[nm]=h}catch(e:unknown){const er=e as NodeJS.ErrnoException;if(er.code==='ENOENT'){oH[nm]=null;bH[nm]=null;continue}throw e}}
  secureMkdirAll(path.join(gD,'batches','bootstrap'));const lf=fs.openSync(path.join(gD,'ledger.json'),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{const lb=Buffer.from(uR,'utf-8');fs.writeSync(lf,lb,0,lb.length,0);fs.fsyncSync(lf)}finally{fs.closeSync(lf)}
  for(const n of SHADOWS){const tp2=path.join(gD,n);secureMkdirAll(path.dirname(tp2));const sf=fs.openSync(tp2,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{const sb=Buffer.from(nS[n],'utf-8');fs.writeSync(sf,sb,0,sb.length,0);fs.fsyncSync(sf)}finally{fs.closeSync(sf)}}
  for(const d of[gD,path.join(gD,'batches'),path.join(gD,'batches','bootstrap'),bD])fsyncPath(d);
  for(const[n,h]of Object.entries(nH))if(sha256(fs.readFileSync(path.join(gD,n)))!==h)return{success:false,error:`Stage hash ${n}`,mutated:false};
  const journal:Journal={generationDir:path.relative(root,gD),oldHashes:oH,backupHashes:bH,newHashes:nH,commitIndex:0,phase:'staged'};
  writeJournal(journal,jP);input.onFault?.({phase:'journalWritten'});
  let committed:number;
  try{committed=commitTargets(tN,tP,gD,dS,journal,jP,{canonicalRoot:root,ledgerPath:input.ledgerPath,amendmentPath:amends[0].amendmentPath,capturePath:amends[0].capturePath,shadowDir:input.shadowDir,originalSha256:input.originalSha256,amendmentSha256:amends[0].amendmentSha256,priorEffectiveSha256:input.priorEffectiveSha256,onFault:input.onFault} as ActivationInput)
  }catch{let eff=0;for(let i=0;i<journal.commitIndex;i++){try{const tp=tP[i];const cu=sha256(fs.readFileSync(tp));if(cu===journal.newHashes[SHADOW_NAMES[i]]){eff=i+1}else{break}}catch{break}}
  if(journal.inflightIndex!==undefined&&journal.inflightIndex>=eff){try{const tp=tP[journal.inflightIndex];const cu=sha256(fs.readFileSync(tp));if(cu===journal.newHashes[SHADOW_NAMES[journal.inflightIndex]]){eff=Math.max(eff,journal.inflightIndex+1)}}catch{}}journal.inflightIndex=undefined;committed=eff}
  if(committed===tN.length){
    // All 8 targets carry the new bytes. Two sub-cases:
    // A) journal.commitIndex < tN.length → crash during the final rename loop
    //    iteration (e.g. fault between rename and journal.write). All targets are
    //    already committed but the on-disk journal still reflects a pre-commit
    //    state.  Report success=true (bytes are correct) but keep the journal so
    //    the next call can reconcile.
    // B) journal.commitIndex === tN.length → normal completion path. Verify,
    //    finalise and clean the journal.
    const crashedAtLastRename=journal.commitIndex!==tN.length;
    if(crashedAtLastRename){
      return{success:true,mutated:true,effectiveIdentity:nId.sha256,shadowRevision:nR};
    }
    // Normal completion: all targets written, journal reflects completed state.
    try{
      input.onFault?.({phase:'postVerify'});
      for(const[n,h]of Object.entries(journal.newHashes)){const p=n==='ledger.json'?input.ledgerPath:path.join(input.shadowDir,n);const b=res.readBuf(p);if(b===null||sha256(b)!==h){const r=rollbackTargets(journal,tP,root);if(!r)return{success:false,error:`BR: unrecovered: ${n}`,mutated:true,recovered:false};return{success:false,error:`BR: hash ${n}`,mutated:true,recovered:true}}}
      remJournal(jP);fsyncPath(root);
    }catch(e){return{success:false,error:`BR: ${e instanceof Error?e.message:String(e)}`,mutated:true}}
    input.onFault?.({phase:'done'});
    return{success:true,mutated:true,effectiveIdentity:nId.sha256,shadowRevision:nR};
  }
  if(committed<tN.length){if(committed>0){const rj={...journal,commitIndex:committed,inflightIndex:undefined};return rollbackThen(rj,tP,root)}input.onFault?.({phase:'postVerify',error:'TOCTOU'});return{success:false,error:'BR: abort',mutated:false}}
  try{
    input.onFault?.({phase:'postVerify'});
    for(const[n,h]of Object.entries(nH)){const p=n==='ledger.json'?input.ledgerPath:path.join(input.shadowDir,n);const b=res.readBuf(p);if(b===null||sha256(b)!==h){const r=rollbackTargets(journal,tP,root);if(!r)return{success:false,error:`BR: unrecovered: ${n}`,mutated:true,recovered:false};return{success:false,error:`BR: hash ${n}`,mutated:true,recovered:true}}}
    remJournal(jP);fsyncPath(root);
  }catch(e){
    // All targets already committed here: canonical files carry the new bytes.
    // Report mutation truthfully; journal retained for next-call recovery.
    return{success:false,error:`BR: ${e instanceof Error?e.message:String(e)}`,mutated:true};
  }
  input.onFault?.({phase:'done'});
  return{success:true,mutated:true,effectiveIdentity:nId.sha256,shadowRevision:nR};
}
function journalRecoverySuccess(ledgerBuf:Buffer,res:SecureResolver,input:ActivationInput,priorCheck:Sha256,jPath:string):ActivationResult|null{
  try{
    const rl=validateLedger(ledgerBuf);
    if(!verifyAll(rl,input,res,priorCheck))return null;
    remJournal(jPath);
    if(fs.existsSync(path.dirname(jPath)))fsyncPath(path.dirname(jPath));
    return{success:true,mutated:true,recovered:true,effectiveIdentity:(rl.effective_plan_identity as Record<string,unknown>)?.sha256 as Sha256,shadowRevision:rl.shadow_revision as number};
  }catch{return null}
}
function activateInner(input:ActivationInput,root:string,res:SecureResolver):ActivationResult{
  const ledgerTarget=res.resolve(input.ledgerPath);
  const shadowDir=res.resolve(input.shadowDir);
  const amendmentTarget=res.resolve(input.amendmentPath);
  const captureTarget=res.resolve(input.capturePath);
  for(const t of[ledgerTarget,amendmentTarget,captureTarget,shadowDir]){
    try{if(fs.lstatSync(t).isSymbolicLink())return{success:false,error:`Target symlink: ${t}`,mutated:false}}catch{/* ENOENT ok */}
  }
  const tNames=SHADOW_NAMES;
  const tPaths=[ledgerTarget,...SHADOWS.map(n=>path.join(shadowDir,n))];
  const dirSnap=tPaths.map(t=>dirDevIno(path.dirname(t)));
  const ledgerBuf=res.readBuf(input.ledgerPath);
  if(ledgerBuf===null)return{success:false,error:'Ledger not found',mutated:false};
  const ledger=validateLedger(ledgerBuf);
  const jPath=path.join(root,JOURNAL_FILE);
  // Compute prior identity for all paths
  const priorCheck=recomputePriorIdentity(ledger,res);
  if(!priorCheck)return{success:false,error:'Prior identity recompute failed',mutated:false};
  if(priorCheck!==input.priorEffectiveSha256)return{success:false,error:'Prior identity mismatch',mutated:false};
  // Journal presence recovery (targets already match → full verifyAll)
  const jExisting=readJournalBounded(jPath);
  if(jExisting){
    const vj=validateJournal(jExisting,root,res);
    if(vj){
      let match=true;
      for(const[n,h]of Object.entries(vj.newHashes)){
        const p=n==='ledger.json'?input.ledgerPath:path.join(input.shadowDir,n);
        const b=res.readBuf(p);if(b===null||sha256(b)!==h){match=false;break}
      }
      if(match){
        // Use full verifyAll: ledger + identity + prior + amendments + capture + audit + shadows
        const rec=journalRecoverySuccess(ledgerBuf,res,input,priorCheck,jPath);
        if(rec)return rec;
        writeJournal(vj,jPath);
        return{success:false,error:'Post-recovery verifyAll failed',mutated:true,recovered:true};
      }
    }
  }
  // Fast-path with identity verification
  if(verifyAll(ledger,input,res,priorCheck))return{success:true,mutated:false,effectiveIdentity:(ledger.effective_plan_identity as Record<string,unknown>)?.sha256 as Sha256,shadowRevision:ledger.shadow_revision as number};
  // Recovery from partial commit
  if(jExisting){
    const vj=validateJournal(jExisting,root,res);
    if(vj&&fs.existsSync(vj.generationDir)){
      const genDir=vj.generationDir;
      let stageOk=true;
      for(const[n,h]of Object.entries(vj.newHashes)){
        const gf=path.join(genDir,n);
        try{if(!fs.existsSync(gf)||sha256(fs.readFileSync(gf))!==h){stageOk=false;break}}catch{stageOk=false;break}
      }
      if(stageOk){
        const effectiveCommit=Math.max(vj.commitIndex,(vj.inflightIndex??-1)+1);
        if(effectiveCommit>0&&!rollbackTargets({...vj,commitIndex:effectiveCommit},tPaths,root))throw new Error('Unrecovered transaction: rollback failed, journal+generation retained');
        vj.commitIndex=0;vj.inflightIndex=undefined;
        try{
          const committed=commitTargets(tNames,tPaths,genDir,dirSnap,vj,jPath,input);
          if(committed<tNames.length)return rollbackThen(vj,tPaths,root);
        }catch{return rollbackThen(vj,tPaths,root)}
        input.onFault?.({phase:'postVerify'});
        let match=true;
        for(const[n,h]of Object.entries(vj.newHashes)){
          const p=n==='ledger.json'?input.ledgerPath:path.join(input.shadowDir,n);
          const b=res.readBuf(p);if(b===null||sha256(b)!==h){match=false;break}
        }
        if(match){
          // Full verifyAll on restored ledger
          const rlBuf2=res.readBuf(input.ledgerPath);
          if(rlBuf2===null)return{success:false,error:'Ledger missing after recovery',mutated:true,recovered:true};
          const rl2=validateLedger(rlBuf2);
          const priorCheck2=recomputePriorIdentity(rl2,res);
          if(!priorCheck2||!verifyAll(rl2,input,res,priorCheck2)){
            writeJournal(vj,jPath);
            return{success:false,error:'Post-recovery verifyAll failed',mutated:true,recovered:true};
          }
          remJournal(jPath);
          if(fs.existsSync(path.dirname(jPath)))fsyncPath(path.dirname(jPath));
          return{success:true,mutated:true,recovered:true,effectiveIdentity:(rl2.effective_plan_identity as Record<string,unknown>)?.sha256 as Sha256,shadowRevision:rl2.shadow_revision as number};
        }
        return rollbackThen(vj,tPaths,root);
      }
    }
  }
  // Re-read after recovery (might have changed)
  const ledgerBuf2=res.readBuf(input.ledgerPath);
  if(ledgerBuf2===null)return{success:false,error:'Ledger disappeared',mutated:false};
  const ledger2=validateLedger(ledgerBuf2);
  const origSha=(ledger2.original_plan as Record<string,unknown>)?.sha256 as string;
  if(origSha!==input.originalSha256)return{success:false,error:'Original SHA mismatch',mutated:false};
  if(!hashAmendmentFiles(ledger2.amendments as Record<string,unknown>[],res))return{success:false,error:'Amendment file hash/ID validation failed',mutated:false};
  const amendments=ledger2.amendments as Record<string,unknown>[];
  const am0004=amendments.find((a:Record<string,unknown>)=>a.amendment_id==='AM-0004');
  if(am0004&&(am0004.status as string)!==TOMBSTONE)return{success:false,error:'AM-0004 not tombstoned',mutated:false};
  const am0012Exists=amendments.some((a:Record<string,unknown>)=>a.amendment_id==='AM-0012');
  for(const a of amendments){
    if(a.amendment_id==='AM-0012'||a.amendment_id==='AM-0004')continue;
    if(!ACTIVE.has(a.status as string))return{success:false,error:`Amendment ${a.amendment_id} disallowed status "${a.status}"`,mutated:false};
  }
  const priorCheck2=recomputePriorIdentity(ledger2,res);
  if(!priorCheck2||priorCheck2!==input.priorEffectiveSha256)return{success:false,error:'Prior identity mismatch in rebuild',mutated:false};
  if(am0012Exists){
    const amA=amendments.find((a:Record<string,unknown>)=>a.amendment_id==='AM-0012')!;
    if(amA.status!=='OWNER_APPROVED_EFFECTIVE'||amA.sha256!==input.amendmentSha256)return{success:false,error:'Tampered AM-0012: SHA/status',mutated:false};
    const capBuf=res.readBuf(input.capturePath);
    if(capBuf===null)return{success:false,error:'Capture missing',mutated:false};
    const cap=JSON.parse(decoder.decode(capBuf))as Record<string,unknown>;
    if(!verifyCapture(cap,ledger2,input,res))return{success:false,error:'Capture verification failed in rebuild',mutated:false};
    if(sha256(capBuf)!==(amA.capture_sha256 as string))return{success:false,error:'Capture SHA mismatch in rebuild',mutated:false};
    const approvedAll=amendments.filter((x:Record<string,unknown>)=>ACTIVE.has(x.status as string)).map((x:Record<string,unknown>)=>({amendment_id:x.amendment_id as string,sha256:x.sha256 as Sha256}));
    if(!approvedAll.some((x:Record<string,unknown>)=>x.amendment_id==='AM-0012'))approvedAll.push({amendment_id:'AM-0012',sha256:input.amendmentSha256});
    if(computeIdentity(input.originalSha256,approvedAll as Array<{amendment_id:string;sha256:Sha256}>).sha256!==(ledger2.effective_plan_identity as Record<string,unknown>)?.sha256)return{success:false,error:'Tampered AM-0012: identity mismatch',mutated:false};
  }else{
    if((ledger2.effective_plan_identity as Record<string,unknown>)?.sha256!==input.priorEffectiveSha256)return{success:false,error:'Ledger identity mismatch',mutated:false};
  }
  let updatedLedger:Record<string,unknown>;let updatedLedgerRaw:string;
  let newId:{sha256:Sha256;canonical:string;bytes:number};let newRev:number;
  if(am0012Exists){
    newRev=ledger2.shadow_revision as number;
    newId={sha256:((ledger2.effective_plan_identity as Record<string,unknown>)?.sha256 as Sha256)??input.priorEffectiveSha256,canonical:'',bytes:0};
    const staleEv=staleEvidence(ledger2,input.priorEffectiveSha256,newId.sha256);
    updatedLedger={...ledger2,...staleEv};
  }else{
    const amBuf=res.readBuf(input.amendmentPath);
    if(amBuf===null||sha256(amBuf)!==input.amendmentSha256)return{success:false,error:'Amendment SHA mismatch',mutated:false};
    const amContent2=decoder.decode(amBuf);
    const parsed=parseAmendment(amContent2);
    if(parsed.status!=='OWNER_APPROVED_PENDING_ACTIVATION')return{success:false,error:`Amendment status "${parsed.status}"`,mutated:false};
    validateAcMapping(parsed.acList,parsed.nsSections);
    const capBuf2=res.readBuf(input.capturePath);
    if(capBuf2===null)return{success:false,error:'Capture not found',mutated:false};
    const cap2=JSON.parse(decoder.decode(capBuf2))as Record<string,unknown>;
    if(!verifyCapture(cap2,ledger2,input,res))return{success:false,error:'Capture verification failed',mutated:false};
    const captureSha=sha256(capBuf2);
    const planId2=ledger2.plan_id as string??'unknown';
    const amStat2=fs.statSync(amendmentTarget);
    const newAm:Record<string,unknown>={amendment_id:'AM-0012',status:'OWNER_APPROVED_EFFECTIVE',path:path.relative(root,amendmentTarget),sha256:input.amendmentSha256,bytes:amStat2.size,lines:amContent2.split('\n').length,capture_sha256:captureSha,supplements_plan_id:planId2,supplements_original_sha256:origSha,activation_state:'EFFECTIVE_POLICY_PARTIAL_IMPLEMENTATION'};
    const updatedAmends=[...amendments,newAm];
    const approvedList=updatedAmends.filter((x:Record<string,unknown>)=>ACTIVE.has(x.status as string)).map((x:Record<string,unknown>)=>({amendment_id:x.amendment_id as string,sha256:x.sha256 as Sha256}));
    newId=computeIdentity(origSha,approvedList as Array<{amendment_id:string;sha256:Sha256}>);
    const staleEv=staleEvidence(ledger2,input.priorEffectiveSha256,newId.sha256);
    const nsAnchors=buildNsAnchors(input.amendmentSha256,parsed.nsSections,amContent2.split('\n'));
    const nsAssigns=buildNsAssigns(parsed.nsSections,parsed.acList);
    const nsBatches=buildNsBatches(parsed.nsSections);
    newRev=(ledger2.shadow_revision as number)+1;
    const audit:Record<string,unknown>={event_id:`E-NS0-${newRev}`,type:'AMENDMENT_CHAIN_ACTIVATION',summary:`Activated AM-0012 identity ${input.priorEffectiveSha256}→${newId.sha256}`,actor:'engine',prior_effective_sha256:input.priorEffectiveSha256,new_effective_sha256:newId.sha256,capture_sha256:captureSha,amendment_id:'AM-0012',amendment_sha256:input.amendmentSha256,shadow_revision:newRev};
    updatedLedger={...ledger2,...staleEv,status:'ADOPTED',execution_state:'NEEDS_REMEDIATION',amendments:updatedAmends,
      effective_plan_identity:{algorithm:'SHA-256 over UTF-8 canonical JSON with no insignificant whitespace, lexicographically sorted object keys, and approved_amendments preserved in approval order',
        input_manifest:{algorithm:'SHA-256',approved_amendments:approvedList,composition:'original-plus-ordered-approved-amendment-sha256',original_plan_sha256:origSha,version:1},
        canonical_json_utf8:newId.canonical,canonical_json_utf8_bytes:newId.bytes,sha256:newId.sha256},
      plan_anchors:[...(ledger2.plan_anchors??[])as Record<string,unknown>[],...nsAnchors],assignments:[...(ledger2.assignments??[])as Record<string,unknown>[],...nsAssigns],
      batches:[...(ledger2.batches??[])as Record<string,unknown>[],...nsBatches],shadow_revision:newRev,audit_events:[...(ledger2.audit_events as Record<string,unknown>[]??[]),audit]};
  }
  const newShadows=renderAll(updatedLedger,newId.sha256,input.priorEffectiveSha256);
  const newHashes:Record<string,Sha256>={};
  for(const n of SHADOWS)newHashes[n]=sha256s(newShadows[n]);
  updatedLedger.shadow_hashes={...newHashes};
  updatedLedgerRaw=JSON.stringify(updatedLedger,null,2)+'\n';
  newHashes['ledger.json']=sha256s(updatedLedgerRaw);
  // Backups + staging
  const genUuid=randomUUID();
  const genDir=path.join(root,GEN_ROOT_REL,genUuid);
  const backupDir=path.join(genDir,'backups');
  secureMkdirAll(backupDir);
  const oldHashes:Record<string,string|null>={};
  const backupHashes:Record<string,string|null>={};
  for(let i=0;i<tNames.length;i++){
    const name=tNames[i];const src=tPaths[i];
    const di=dirSnap[i];
    const cur=dirDevIno(path.dirname(src));
    if(di.dev!==cur.dev||di.ino!==cur.ino)return{success:false,error:`TOCTOU backup ${src}`,mutated:false};
    try{
      const content=fs.readFileSync(src);
      const h=sha256(content);oldHashes[name]=h;
      const bp=path.join(backupDir,name);secureMkdirAll(path.dirname(bp));
      const bfd=fs.openSync(bp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
      try{fs.writeSync(bfd,content,0,content.length,0);fs.fsyncSync(bfd)}finally{fs.closeSync(bfd)}
      backupHashes[name]=h;
    }catch(e:unknown){
      const err=e as NodeJS.ErrnoException;
      if(err.code==='ENOENT'){oldHashes[name]=null;backupHashes[name]=null;continue;}
      throw e;
    }
  }
  secureMkdirAll(path.join(genDir,'batches','bootstrap'));
  const lfd=fs.openSync(path.join(genDir,'ledger.json'),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  try{const lb=Buffer.from(updatedLedgerRaw,'utf-8');fs.writeSync(lfd,lb,0,lb.length,0);fs.fsyncSync(lfd)}finally{fs.closeSync(lfd)}
  for(const n of SHADOWS){const tp=path.join(genDir,n);secureMkdirAll(path.dirname(tp));
    const sfd=fs.openSync(tp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    try{const sb=Buffer.from(newShadows[n],'utf-8');fs.writeSync(sfd,sb,0,sb.length,0);fs.fsyncSync(sfd)}finally{fs.closeSync(sfd)}}
  for(const d of[genDir,path.join(genDir,'batches'),path.join(genDir,'batches','bootstrap'),backupDir])fsyncPath(d);
  for(const[n,h]of Object.entries(newHashes))if(sha256(fs.readFileSync(path.join(genDir,n)))!==h)return{success:false,error:`Stage hash mismatch ${n}`,mutated:false};
  const journal:Journal={generationDir:path.relative(root,genDir),oldHashes,backupHashes,newHashes,commitIndex:0,phase:'staged'};
  writeJournal(journal,jPath);
  input.onFault?.({phase:'journalWritten'});
  // Commit targets with rollback safety
  let committed:number;
  try{
    committed=commitTargets(tNames,tPaths,genDir,dirSnap,journal,jPath,input);
  }catch{
    // Verify committed prefix: check each supposedly-committed target on disk
    let effective=0;
    for(let i=0;i<journal.commitIndex;i++){
      try{
        const tp=tPaths[i];
        const cur=sha256(fs.readFileSync(tp));
        if(cur===journal.newHashes[SHADOW_NAMES[i]]){
          effective=i+1;
        }else{
          break;
        }
      }catch{break;}
    }
    if(journal.inflightIndex!==undefined&&journal.inflightIndex>=effective){
      try{
        const tp=tPaths[journal.inflightIndex];
        const cur=sha256(fs.readFileSync(tp));
        if(cur===journal.newHashes[SHADOW_NAMES[journal.inflightIndex]]){
          effective=Math.max(effective,journal.inflightIndex+1);
        }
      }catch{}
    }
    journal.inflightIndex=undefined;
    committed=effective;
  }
  if(committed<tNames.length){
    if(committed>0){
      const rollbackJournal={...journal,commitIndex:committed,inflightIndex:undefined};
      return rollbackThen(rollbackJournal,tPaths,root);
    }
    input.onFault?.({phase:'postVerify',error:'TOCTOU or fault before any commit'});
    return{success:false,error:'Commit aborted before any mutation',mutated:false};
  }
  input.onFault?.({phase:'postVerify'});
  for(const[n,h]of Object.entries(newHashes)){
    const p=n==='ledger.json'?input.ledgerPath:path.join(input.shadowDir,n);
    const b=res.readBuf(p);
    if(b===null||sha256(b)!==h){
      const r=rollbackTargets(journal,tPaths,root);
      if(!r)throw new Error('Unrecovered transaction: rollback failed');
      return{success:false,error:`Post-commit hash mismatch ${n}, rolled back`,mutated:true,recovered:true};
    }
  }
  remJournal(jPath);fsyncPath(root);
  input.onFault?.({phase:'done'});
  return{success:true,mutated:true,effectiveIdentity:newId.sha256,shadowRevision:newRev};
}
