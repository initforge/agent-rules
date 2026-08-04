const fs = require('fs');
const path = require('path');
const os = require('os');
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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'));
console.log('Temp dir:', dir);

// Check what happens step by step
console.log('\n1. Before constructor:');
console.log('  Lock exists:', fs.existsSync(path.join(dir, '.lock')));

// Manually call loadMetadata
console.log('\n2. After creating cache (constructor):');
const c1 = new ContextCache({ cacheDir: dir });
console.log('  Lock exists:', fs.existsSync(path.join(dir, '.lock')));
console.log('  Files:', fs.readdirSync(dir));

// Check memory/disk state
console.log('\n3. Cache state:');
console.log('  memory.size:', c1.memory.size);
console.log('  diskAccounted.size:', c1.diskAccounted.size);
console.log('  accessOrder.length:', c1.accessOrder.length);
console.log('  totalBytes:', c1.totalBytes);

// Now try set
console.log('\n4. Calling set():');
const k = makeKey();
const cap = makeCapsule(k);
const result = c1.set(k, cap);
console.log('  set result:', result);
console.log('  Lock after set:', fs.existsSync(path.join(dir, '.lock')));
console.log('  Files after set:', fs.readdirSync(dir));

// Cleanup
fs.rmSync(dir, { recursive: true, force: true });
