import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const root = process.cwd();
const archiveDir = path.join(root, '.agent', 'tmp', 'retired-platform-archive');
const receiptPath = path.join(root, '.agent', 'tmp', 'retired-platform-purge-receipt.json');

fs.mkdirSync(archiveDir, { recursive: true });

let gitHead = 'unknown';
try {
  gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {}

function walkDir(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
    if (relPath.startsWith('.git/') || relPath.startsWith('node_modules/') || relPath.startsWith('.agent/tmp/retired-platform-archive/')) {
      continue;
    }
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
    } else {
      fileList.push({ fullPath, relPath, name: entry.name });
    }
  }
  return fileList;
}

const allFiles = walkDir(root);
const matchingFiles = [];

for (const file of allFiles) {
  const nameMatches = /mimo[-_]?code/i.test(file.name);
  let contentMatches = false;
  try {
    const buf = fs.readFileSync(file.fullPath);
    // quick binary check
    if (!buf.includes(0)) {
      const text = buf.toString('utf8');
      contentMatches = /mimo[-_]?code/i.test(text);
    }
  } catch {}

  if (nameMatches || contentMatches) {
    matchingFiles.push(file);
  }
}

console.log('Found matching files count:', matchingFiles.length);

const ledgerEntries = [];

for (const file of matchingFiles) {
  const content = fs.readFileSync(file.fullPath);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');

  const destPath = path.join(archiveDir, file.relPath);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, content);

  ledgerEntries.push({
    path: file.relPath,
    pre_purge_sha256: sha256,
    action: 'archived',
    name_matched: /mimo[-_]?code/i.test(file.name)
  });
}

console.log('Archived', ledgerEntries.length, 'files to', archiveDir);

// Remove specific retired adapters/tombstones from active runtime
const filesToDelete = [
  '.agent/archive/mimocode-platform/AGENTS.md',
  '.agent/archive/mimocode-platform/adapter.ts',
  '.agent/tombstones/mimocode-platform-retirement.json',
  '.agent/tombstones/mimocode-retirement.json',
  'integrations/optional/pencil-mcp/adapters/mimocode.json',
  'integrations/optional/serena/adapters/mimocode.json',
  'integrations/recommended/chrome-devtools-mcp/adapters/mimocode.json',
  'integrations/recommended/codebase-memory-mcp/adapters/mimocode.json',
  'integrations/recommended/context7/adapters/mimocode.json',
  'integrations/recommended/playwright-mcp/adapters/mimocode.json',
  'integrations/recommended/rtk/adapters/mimocode.json'
];

for (const delRel of filesToDelete) {
  const abs = path.join(root, delRel);
  if (fs.existsSync(abs)) {
    fs.unlinkSync(abs);
    console.log('Deleted active residue:', delRel);
  }
}

// Clean up empty directories
const delDirs = ['.agent/archive/mimocode-platform', '.agent/archive'];
for (const dir of delDirs) {
  const absDir = path.join(root, dir);
  if (fs.existsSync(absDir) && fs.readdirSync(absDir).length === 0) {
    fs.rmdirSync(absDir);
  }
}

const receipt = {
  git_head: gitHead,
  purge_timestamp: new Date().toISOString(),
  total_files_scanned: allFiles.length,
  total_files_archived: ledgerEntries.length,
  files: ledgerEntries
};

const receiptStr = JSON.stringify(receipt, null, 2);
const receiptSha = crypto.createHash('sha256').update(receiptStr).digest('hex');
receipt.receipt_sha256 = receiptSha;

fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');
console.log('Purge receipt written to:', receiptPath, 'with SHA:', receiptSha);
