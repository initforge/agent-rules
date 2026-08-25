#!/usr/bin/env node
/**
 * build-runtime.mjs — generate the packaged per-host runtime under
 * generated/runtime-build (REQ-102: core install only configures native
 * instruction surfaces; the packaged runtime ships rules/skills/policy/
 * manifests per host).
 *
 * The actual generation pipeline lives in automation/01-build-runtime.ps1;
 * this wrapper only locates pwsh and invokes it with the repository root.
 * It never imports deleted CLI command modules and never reads dist/commands.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'automation', '01-build-runtime.ps1');
const buildRoot = path.join(root, 'generated', 'runtime-build');

function findPwsh() {
  const candidates = process.env.PWSH || process.env.POWERSHELL || 'pwsh';
  for (const cand of (Array.isArray(candidates) ? candidates : [candidates])) {
    const r = spawnSync(cand, ['-NoLogo', '-NoProfile', '-Command', '"$PSVersionTable.PSVersion.ToString()"'], { encoding: 'utf8' });
    if (r.status === 0 && !r.error) return cand;
  }
  for (const cand of ['powershell', 'pwsh-preview']) {
    const r = spawnSync(cand, ['-NoLogo', '-NoProfile', '-Command', '"$PSVersionTable.PSVersion.ToString()"'], { encoding: 'utf8' });
    if (r.status === 0 && !r.error) return cand;
  }
  return null;
}

const pwsh = findPwsh();
if (!pwsh) {
  console.error('build-runtime: no PowerShell (pwsh/powershell) available on PATH');
  process.exit(2);
}

const result = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Root', root], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
  timeout: 600_000,
  env: { ...process.env, AGENT_RULES_REPOSITORY_ROOT: root },
});

if (result.error || result.status !== 0) {
  console.error(`build-runtime: packaged runtime generation failed (${result.error?.message ?? `exit ${result.status}`})`);
  process.exit(result.status ?? 1);
}
// The installer enforces a deterministic order contract (localeCompare 'en') on
// manifest.files. PowerShell's en-US sort can differ (punctuation handling), so
// normalize every per-host manifest to the exact order the packaged RuntimeInstaller
// accepts — otherwise the packaged-runtime smoke (REQ-120 gate 6) fails closed.
let normalized = 0;
for (const hostDir of fs.readdirSync(buildRoot)) {
  const manifestPath = path.join(buildRoot, hostDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) continue;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest.files)) continue;
    // The opencode installer excludes runtime-contract.json from its observed
    // file set (it is contract metadata, not an installed artifact), so it must
    // also be absent from the manifest listing or the observed==listed
    // invariant fails closed.
    if (hostDir === 'opencode') {
      manifest.files = manifest.files.filter((f) => f.path !== 'runtime-contract.json');
      // Substitute the canonical opencode model class in the built native
      // agents (the packaged runtime renders the policy selector; the source
      // keeps the __OPENCODE_MODEL_CLASS__ placeholder).
      const hostBuild = path.join(buildRoot, hostDir);
      const modelPolicy = JSON.parse(fs.readFileSync(path.join(root, 'automation', 'model-policy.json'), 'utf8'));
      const selector = modelPolicy?.platforms?.opencode?.standard?.selector;
      if (typeof selector === 'string' && selector.length > 0) {
        let substituted = 0;
        for (const entry of manifest.files) {
          if (!entry.path.startsWith('native/agents/')) continue;
          const file = path.join(hostBuild, entry.path);
          if (!fs.existsSync(file)) continue;
          const raw = fs.readFileSync(file, 'utf8');
          if (!raw.includes('__OPENCODE_MODEL_CLASS__')) continue;
          const next = raw.replaceAll('__OPENCODE_MODEL_CLASS__', selector);
          fs.writeFileSync(file, next, 'utf8');
          entry.sha256 = createHash('sha256').update(Buffer.from(next, 'utf8')).digest('hex');
          substituted += 1;
        }
        if (substituted > 0) console.log(`build-runtime: opencode model substituted in ${substituted} native agent(s)`);
      }
    }
    const sorted = [...manifest.files].sort((a, b) => String(a.path).localeCompare(String(b.path), 'en'));
    if (JSON.stringify(manifest.files) !== JSON.stringify(sorted)) {
      manifest.files = sorted;
      normalized += 1;
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  } catch (error) {
    console.error(`build-runtime: cannot normalize manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
if (!fs.existsSync(path.join(buildRoot, 'codex', 'manifest.json'))) {
  console.error('build-runtime: generated/runtime-build/codex/manifest.json missing after generation');
  process.exit(1);
}
console.log(`Runtime builds created: ${buildRoot} (${normalized} manifest(s) normalized to deterministic order)`);
process.exit(0);