const fs = require('fs');
const path = require('path');
const os = require('os');
const { createHash, randomUUID } = require('node:crypto');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-debug6-'));

const LOCK_FILE = '.lock';

function acquireLock(lockPath) {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, process.pid + '\n');
    fs.closeSync(fd);
    return true;
  } catch { return false; }
}

function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch {}
}

const lockPath = path.join(dir, LOCK_FILE);
console.log('Testing lock behavior...');
console.log('acquireLock:', acquireLock(lockPath));
console.log('Lock file exists:', fs.existsSync(lockPath));

// Read the ContextCache source to understand the flow
const { ContextCache } = require('./dist/context-cache.js');

function makeKey() {
  return {
    effectivePlanSha256: 'a'.repeat(64),
    orderedAmendmentSha256: 'b'.repeat(64),
    baselineSha: 'c'.repeat(64),
    assignmentId: 'assignment-1',
    ownedPaths: ['src/'],
    forbiddenPaths: ['node_modules/'],
    sourceFileHashes: { 'src/main.ts': 'd'.repeat(64) },
    toolchainManifestSha256: 'e'.repeat(64),
    acceptanceCriteriaSha256: 'f'.repeat(64)
  };
}

function makeCapsule(key) {
  return {
    key,
    capsuleSha256: '',
    planAnchors: [],
    amendmentExcerpts: [],
    relevantContracts: [],
    diffFacts: 'no changes',
    failingEvidence: [],
    verificationCommands: ['npm test'],
    createdAt: new Date().toISOString()
  };
}

const c1 = new ContextCache({ cacheDir: dir });
console.log('After constructor, lock exists:', fs.existsSync(path.join(dir, LOCK_FILE)));
console.log('Files:', fs.readdirSync(dir));

const k = makeKey();
const cap = makeCapsule(k);

// Try to trace what's happening inside set()
console.log('\nTrying set...');
const lockAcquired = acquireLock(path.join(dir, LOCK_FILE));
console.log('Manually acquired lock:', lockAcquired);
console.log('Lock exists now:', fs.existsSync(path.join(dir, LOCK_FILE)));

// Release and let ContextCache try
releaseLock(path.join(dir, LOCK_FILE));

// Now call set
const result = c1.set(k, cap);
console.log('set result:', result);
console.log('Files after set:', fs.readdirSync(dir));
console.log('Lock after set:', fs.existsSync(path.join(dir, LOCK_FILE)));

fs.rmSync(dir, { recursive: true, force: true });
