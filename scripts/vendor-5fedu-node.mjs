import https from 'https';
import fs from 'fs';
import path from 'path';

const COMMIT = 'ec9e4a87c7918a48a089a293f70090beb82cebbb';
const TARGET = 'profiles/5fedu/reference-projects/5f-template-ket-noi-supabase-main';
const BASE = 'https://raw.githubusercontent.com/initforge/pos-ops';

function fetch(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });
    const file = fs.createWriteStream(dest);
    https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'agent-rules-harness/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function fetchTree(apiUrl) {
  const data = await new Promise((resolve, reject) => {
    https.get(apiUrl, { rejectUnauthorized: false, headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'agent-rules-harness/1.0' } }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
  const prefix = '5f-template-ket-noi-supabase-main/';
  const blobs = data.tree.filter(e => e.type === 'blob' && e.path.startsWith(prefix));
  for (const blob of blobs) {
    const rel = blob.path.slice(prefix.length);
    const url = `${BASE}/${COMMIT}/${blob.path}`;
    const dest = path.join(TARGET, rel);
    process.stdout.write(`  ${rel}... `);
    try {
      await fetch(url, dest);
      process.stdout.write('OK\n');
    } catch (e) {
      process.stdout.write(`FAIL: ${e.message}\n`);
    }
  }
  process.stdout.write(`\nDone: ${blobs.length} files\n`);
}

fetchTree(`https://api.github.com/repos/initforge/pos-ops/git/trees/${COMMIT}?recursive=1`).catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
