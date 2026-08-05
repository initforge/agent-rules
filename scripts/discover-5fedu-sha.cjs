/**
 * Discover the SHA of the vendored 5fedu reference tree.
 *
 * Why: profiles/5fedu/projects/source-lock.json still carries the
 * all-zeros placeholder `0000…0000`. We refuse to ship that to a
 * downstream consumer because every 4-axis parity check that compares
 * against the locked source will be comparing against "nothing".
 *
 * The SHA is derived from the actual vendored tree (read-only path
 * under profiles/5fedu/) so the harness never invents an upstream
 * commit. The output is deterministic on a clean checkout; any
 * future change to the vendored copy produces a new SHA.
 *
 * Run: node scripts/discover-5fedu-sha.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const here = path.dirname(__filename);
const FIVE_FEDU = path.resolve(here, '..', 'profiles', '5fedu');

if (!fs.existsSync(FIVE_FEDU)) {
  console.error('profiles/5fedu not found at ' + FIVE_FEDU);
  process.exit(1);
}

function walkFiles(root, skip = new Set(['.git', 'node_modules', 'dist'])) {
  const out = [];
  const visit = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue;
        visit(p);
      } else if (e.isFile()) {
        out.push(p);
      }
    }
  };
  visit(root);
  return out;
}

const files = walkFiles(FIVE_FEDU);
const h = createHash('sha256');
for (const f of files) {
  const rel = path.relative(FIVE_FEDU, f).split(path.sep).join('/');
  h.update(rel);
  h.update('\0');
  h.update(fs.readFileSync(f));
  h.update('\0');
}
const sha = h.digest('hex');

const lockPath = path.resolve(FIVE_FEDU, 'projects', 'source-lock.json');
let priorSha = null;
try {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  priorSha = lock?.sourceLock?.commitSha ?? null;
} catch { /* file unreadable; we are writing the first time */ }

console.log('5fedu source-lock:');
console.log('  vendored files hashed : ' + files.length);
console.log('  computed SHA-256       : ' + sha);
console.log('  prior commitSha        : ' + (priorSha ?? '<unset>'));
console.log('  prior placeholder     : ' + (priorSha === '0'.repeat(40) ? 'YES — would be replaced' : 'no'));

if (priorSha === '0'.repeat(40)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.sourceLock.commitSha = sha;
  lock.sourceLock.integrity = lock.sourceLock.integrity || {};
  lock.sourceLock.integrity.algorithm = 'sha256';
  lock.sourceLock.integrity.hash = sha;
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  console.log('  → updated source-lock.json');
}
process.exit(0);