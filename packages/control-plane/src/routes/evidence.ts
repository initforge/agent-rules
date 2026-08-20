import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiError } from '../services/safety.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(): string {
  const here = __dirname;
  let current = here;
  for (let depth = 0; depth < 6; depth += 1) {
    const markers = ['.agent', 'packages', 'north-star-v2'];
    if (markers.some((marker) => fs.existsSync(path.join(current, marker)))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return here;
}

interface EvidenceClaim {
  claim_id: string;
  task_id: string;
  plan_id: string;
  kind: string;
  status: 'pass' | 'fail' | 'stale' | 'missing' | 'pending';
  age: string;
  sha?: string;
  path?: string;
  verifier_id?: string;
  summary?: string;
}

function ageLabel(observedAt: string | undefined): string {
  if (!observedAt) return '—';
  const then = new Date(observedAt).getTime();
  if (Number.isNaN(then)) return '—';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

router.get('/', async (_req, res) => {
  try {
    const root = findProjectRoot();
    const evidenceRoot = path.join(root, '.agent', 'evidence');
    const claims: EvidenceClaim[] = [];
    let total = 0;
    let fresh = 0;
    let stale = 0;
    let missing = 0;

    if (fs.existsSync(evidenceRoot)) {
      for (const workDir of fs.readdirSync(evidenceRoot)) {
        const workPath = path.join(evidenceRoot, workDir);
        if (!fs.statSync(workPath).isDirectory()) continue;
        const walk = (dir: string) => {
          for (const entry of fs.readdirSync(dir)) {
            const full = path.join(dir, entry);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
              walk(full);
              continue;
            }
            if (!entry.endsWith('.json')) continue;
            try {
              const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
              const planId = String(doc.plan_id || workDir);
              const taskId = String(doc.task_id || path.basename(dir) || '');
              const rel = path.relative(evidenceRoot, full);
              if (Array.isArray(doc.claims)) {
                for (const claim of doc.claims) {
                  total += 1;
                  const status = claim.status === 'pass' ? 'pass' : 'fail';
                  const freshness = claim.freshness === 'fresh' ? 'fresh' : 'stale';
                  if (freshness === 'fresh') fresh += 1;
                  else stale += 1;
                  claims.push({
                    claim_id: String(claim.claim_id || ''),
                    task_id: taskId,
                    plan_id: planId,
                    kind: 'verifier',
                    status,
                    age: ageLabel(doc.observed_at),
                    sha: doc.head_commit ? String(doc.head_commit).slice(0, 7) : undefined,
                    path: rel,
                    verifier_id: String(claim.verifier_id || ''),
                    summary: String(claim.summary || ''),
                  });
                }
              }
            } catch {
              /* unreadable evidence file is skipped */
            }
          }
        };
        walk(workPath);
      }
    }

    res.json({
      ok: true,
      data: {
        stats: { total, fresh, stale, missing },
        claims: claims.slice(0, 200),
      },
    });
  } catch (err) {
    apiError(res, 500, err);
  }
});

export default router;
