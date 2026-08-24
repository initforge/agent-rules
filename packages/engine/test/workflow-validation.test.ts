import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { CERTIFICATION_REQUIRED_HOSTS, HOST_ATTESTATION_EVIDENCE_ROLES, hostAttestationEvidenceRef, hostAttestationEvidenceSubjectSha256 } from '../src/contracts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKFLOWS_DIR = join(__dirname, '..', '..', '..', '.github', 'workflows');

interface Workflow {
  name?: string;
  on?: Record<string, unknown>;
  concurrency?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  jobs?: Record<string, Job>;
}

interface Job {
  'runs-on'?: string | string[];
  strategy?: { matrix?: { include?: Record<string, unknown>[]; host?: string[] } };
  steps?: Step[];
  needs?: string | string[];
  'if'?: string;
}

interface Step {
  uses?: string;
  run?: string;
  shell?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
  name?: string;
  'if'?: string;
  'continue-on-error'?: boolean;
  'working-directory'?: string;
}

function loadWorkflow(filename: string): Workflow {
  const raw = readFileSync(join(WORKFLOWS_DIR, filename), 'utf-8');
  return parse(raw) as Workflow;
}

function isShaPin(action: string): boolean {
  const parts = action.split('@');
  if (parts.length !== 2) return false;
  const ref = parts[1];
  return /^[0-9a-f]{40}$/i.test(ref) || /^[0-9a-f]{7,}$/i.test(ref);
}

function getActionRef(action: string): string {
  const parts = action.split('@');
  if (parts.length < 2) return '';
  return parts[1].split('#')[0].trim();
}

const VALID_ACTION_PATTERNS = [
  /^actions\/[a-z-]+@[0-9a-f]{40}/,
];

describe('Workflow structure validation', () => {
  const files = readdirSync(WORKFLOWS_DIR).filter(f => extname(f) === '.yml' || extname(f) === '.yaml');

  it.each(files)('%s has valid YAML and required fields', (file) => {
    const wf = loadWorkflow(file);
    expect(wf.name).toBeTruthy();
    expect(wf.on).toBeTruthy();
    expect(wf.jobs).toBeTruthy();
    expect(Object.keys(wf.jobs!).length).toBeGreaterThan(0);
  });

  it.each(files)('%s has concurrency group defined', (file) => {
    const wf = loadWorkflow(file);
    expect(wf.concurrency).toBeTruthy();
    expect(wf.concurrency!.group).toBeTruthy();
  });

  it.each(files)('%s has contents: read permissions', (file) => {
    const wf = loadWorkflow(file);
    if (wf.permissions) {
      expect(wf.permissions).toEqual({ contents: 'read' });
    }
  });

  it.each(files)('%s all action uses are SHA-pinned', (file) => {
    const wf = loadWorkflow(file);
    for (const [, job] of Object.entries(wf.jobs!)) {
      for (const step of job.steps || []) {
        if (!step.uses) continue;
        expect(isShaPin(step.uses), `${file}: action "${step.uses}" is not SHA-pinned`).toBe(true);
      }
    }
  });

  it.each(files)('%s no shell injection via ${{ }} in run commands', (file) => {
    const wf = loadWorkflow(file);
    for (const [, job] of Object.entries(wf.jobs!)) {
      for (const step of job.steps || []) {
        if (!step.run) continue;
        const matches = step.run.match(/\$\{\{\s*[^}]+\}\}/g);
        if (!matches) continue;
        for (const match of matches) {
          const inner = match.slice(3, -2).trim();
          const isSafe = inner.startsWith('matrix.') || inner.startsWith('needs.') || inner.startsWith('github.') || inner.startsWith('toJSON(needs.') || inner === 'always()';
          expect(isSafe, `${file}: potentially unsafe expression "${match}" in step "${step.name || '(unnamed)'}"`).toBe(true);
        }
      }
    }
  });

  it('quality.yml has one root build step and no duplicate root build', () => {
    const wf = loadWorkflow('quality.yml');
    let buildCount = 0;
    for (const job of Object.values(wf.jobs!)) {
      for (const step of job.steps || []) {
        if (step.run && /^npm run build\s*$/m.test(step.run)) buildCount++;
      }
    }
    expect(buildCount).toBe(1);
  });

  it('certification.yml uses self-hosted runners, never on pull_request (only trusted push/manual/schedule/release)', () => {
    const wf = loadWorkflow('certification.yml');
    const prTrigger = (wf.on as Record<string, unknown>)?.pull_request;
    expect(prTrigger).toBeUndefined();
    const hasSelfHosted = Object.values(wf.jobs!).some((job) => {
      const runner = job['runs-on'];
      if (Array.isArray(runner)) return runner.some(r => r === 'self-hosted');
      return false;
    });
    expect(hasSelfHosted).toBe(true);
  });
});

describe('Quality workflow validation', () => {
  it('has cross-platform matrix with linux, windows, macos', () => {
    const wf = loadWorkflow('quality.yml');
    const qualityJob = wf.jobs!.quality;
    expect(qualityJob).toBeTruthy();
    const matrix = qualityJob!.strategy?.matrix;
    expect(matrix).toBeTruthy();
    expect(matrix!.include).toHaveLength(3);
    const hosts = matrix!.include!.map(i => i.host);
    expect(hosts).toContain('linux');
    expect(hosts).toContain('windows');
    expect(hosts).toContain('macos');
  });

  it('all quality runners install Playwright Chromium with Linux system dependencies', () => {
    const wf = loadWorkflow('quality.yml');
    const qualityJob = wf.jobs!.quality;
    const linux = qualityJob!.steps!.find(s => s.name === 'Playwright preflight check (Linux)');
    const windows = qualityJob!.steps!.find(s => s.name === 'Playwright preflight check (Windows)');
    const macos = qualityJob!.steps!.find(s => s.name === 'Playwright preflight check (macOS)');
    expect(linux?.run).toContain('npx playwright install chromium --with-deps');
    expect(windows?.run).toContain('npx playwright install chromium');
    expect(macos?.run).toContain('npx playwright install chromium');
    expect(linux?.if).toBe("matrix.host == 'linux'");
    expect(windows?.if).toBe("matrix.host == 'windows'");
    expect(macos?.if).toBe("matrix.host == 'macos'");
    for (const step of [linux, windows, macos]) {
      expect(step?.env).toHaveProperty('PLAYWRIGHT_BROWSERS_PATH');
      expect(String(step?.env?.PLAYWRIGHT_BROWSERS_PATH)).toBe('0');
    }
  });

  it('quality job has timeout-minutes set', () => {
    const wf = loadWorkflow('quality.yml');
    expect(wf.jobs!.quality!['timeout-minutes']).toBeGreaterThan(0);
  });

  it('security job has timeout-minutes set', () => {
    const wf = loadWorkflow('quality.yml');
    expect(wf.jobs!.security!['timeout-minutes']).toBeGreaterThan(0);
  });

  it('builds the engine dependency before generating the context graph', () => {
    const wf = loadWorkflow('quality.yml');
    const pythonSteps = wf.jobs!['python-tests']!.steps!;
    const kernelDependencyBuildIndex = pythonSteps.findIndex(s => s.name === 'Build context graph kernel dependency');
    const engineDependencyBuildIndex = pythonSteps.findIndex(s => s.name === 'Build context graph engine dependency');
    const contextGraphIndex = pythonSteps.findIndex(s => s.name === 'Generate context graph');

    expect(kernelDependencyBuildIndex).toBeGreaterThanOrEqual(0);
    expect(pythonSteps[kernelDependencyBuildIndex]!.run).toBe('npm run build -w packages/kernel');
    expect(engineDependencyBuildIndex).toBeGreaterThan(kernelDependencyBuildIndex);
    expect(pythonSteps[engineDependencyBuildIndex]!.run).toBe('npm run build -w packages/engine');
    expect(contextGraphIndex).toBeGreaterThan(engineDependencyBuildIndex);
    expect(pythonSteps[contextGraphIndex]!.run).toContain('npx tsx packages/cli/src/index.ts context-graph build');
  });

  it('has security job with audit, semgrep, and gitleaks', () => {
    const wf = loadWorkflow('quality.yml');
    const securityJob = wf.jobs!.security;
    expect(securityJob).toBeTruthy();
    expect(securityJob!['runs-on']).toBe('ubuntu-latest');
    const stepNames = securityJob!.steps!.map(s => s.name || '');
    expect(stepNames).toContain('npm audit');
    expect(stepNames).toContain('Semgrep SAST');
    expect(stepNames).toContain('Secret scanning');
  });

  it('uses SHA-pinned semgrep action and a pinned-version gitleaks binary', () => {
    const wf = loadWorkflow('quality.yml');
    const securityJob = wf.jobs!.security;
    const semgrep = securityJob!.steps!.find(s => s.name === 'Semgrep SAST');
    const gitleaks = securityJob!.steps!.find(s => s.name === 'Secret scanning');
    expect(isShaPin(semgrep!.uses!)).toBe(true);
    // After the history-convergence rewrite the ref's root has no parent, so
    // gitleaks-action's `event.before^` base is ambiguous. The secret-scan step
    // therefore runs a pinned-version gitleaks binary over the whole rewritten
    // chain (root..HEAD) instead of the action's event-based diff range.
    const run = gitleaks!.run ?? '';
    expect(run).toContain('gitleaks_8.24.3_linux_x64.tar.gz');
    expect(run).toContain('--log-opts');
  });

  it('aggregate checks both quality and security results', () => {
    const wf = loadWorkflow('quality.yml');
    const agg = wf.jobs!['quality-aggregate'];
    expect(agg).toBeTruthy();
    expect(agg!['if']).toBe('always()');
    const needs = agg!.needs;
    expect(needs).toContain('quality');
    expect(needs).toContain('security');
  });
});

describe('Certification workflow validation', () => {
  it('has exact matrix Codex, Claude, Grok, OpenCode, Antigravity; Cursor deferred', () => {
    const wf = loadWorkflow('certification.yml');
    const certifyJob = wf.jobs!.certify;
    expect(certifyJob).toBeTruthy();
    const matrix = certifyJob!.strategy?.matrix;
    expect(matrix).toBeTruthy();
    expect(matrix!.host).toEqual(['codex', 'claude', 'grok', 'opencode', 'antigravity']);
  });

  it('each host has a self-hosted runner label', () => {
    const wf = loadWorkflow('certification.yml');
    expect(wf.jobs!.certify!['runs-on']).toEqual(['self-hosted', "${{ matrix.host }}-native"]);
  });

  it('certify job uploads attestation artifacts', () => {
    const wf = loadWorkflow('certification.yml');
    const steps = wf.jobs!.certify!.steps!;
    const uploadStep = steps.find(s => s.uses?.startsWith('actions/upload-artifact'));
    expect(uploadStep).toBeTruthy();
    expect(uploadStep!.with).toHaveProperty('name');
    expect(uploadStep!.with).toHaveProperty('path');
    expect(uploadStep!.with!['if-no-files-found']).toBe('error');
  });

  it('aggregate verifies manifest content/hash, metadata, and host uniqueness', () => {
    const wf = loadWorkflow('certification.yml');
    const agg = wf.jobs!['certify-aggregate'];
    expect(agg).toBeTruthy();
    const stepNames = agg!.steps!.map(s => s.name || '');
    expect(stepNames).toContain('Verify exact host set, hashes, metadata, TTL, and model evidence');
    expect(stepNames).toContain('Verify matrix result');
  });

  it('certify job generates artifact manifest with SHA and uploads attestation+manifest', () => {
    const wf = loadWorkflow('certification.yml');
    const certifySteps = wf.jobs!.certify!.steps!;
    expect(certifySteps.some(s => s.name === 'Build exact artifact manifest')).toBeTruthy();
    const uploadStep = certifySteps.find(s => s.uses?.startsWith('actions/upload-artifact'));
    expect(uploadStep).toBeTruthy();
    expect(uploadStep!.with!['if-no-files-found']).toBe('error');
  });

  it('certification has timeout-minutes set on both jobs', () => {
    const wf = loadWorkflow('certification.yml');
    expect(wf.jobs!.certify!['timeout-minutes']).toBeGreaterThan(0);
    expect(wf.jobs!['certify-aggregate']!['timeout-minutes']).toBeGreaterThan(0);
  });

  it('certification triggers: workflow_dispatch, push main, schedule, release — no pull_request', () => {
    const wf = loadWorkflow('certification.yml');
    const triggers = Object.keys(wf.on as Record<string, unknown>);
    expect(triggers).toContain('workflow_dispatch');
    expect(triggers).toContain('push');
    expect(triggers).toContain('schedule');
    expect(triggers).toContain('release');
    expect(triggers).not.toContain('pull_request');
  });
});

describe('Certification artifact verifier adversarial checks', () => {
  const commit = 'a'.repeat(64);
  const env = {
    ...process.env, CERTIFICATION_COMMIT_SHA: commit, CERTIFICATION_REPOSITORY: 'owner/repo',
    CERTIFICATION_RUN_ID: '42', CERTIFICATION_RUN_URL: 'https://github.com/owner/repo/actions/runs/42',
    CERTIFICATION_WORKFLOW: 'Certification',
  };
  const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
  function attestation(host: string) {
    const fields = { host, hostVersion: '1.2.3', commitSha: commit, capabilityStatus: 'HOST_NATIVE', capabilityIds: [`${host}:model`], contractSetSha256: 'b'.repeat(64), requestedModel: 'qwencoder/glm-5.2', resolvedModel: 'qwencoder/glm-5.2', observedModel: 'qwencoder/glm-5.2', nativeRunnerIdentity: `runner:${host}`, issuedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() } as any;
    fields.evidenceRefs = HOST_ATTESTATION_EVIDENCE_ROLES.map(role => { const evidenceSha256 = sha(`${host}:${role}`); return { role, host, commitSha: commit, evidenceSha256, evidenceRef: hostAttestationEvidenceRef(host as any, commit, role, evidenceSha256), subjectSha256: hostAttestationEvidenceSubjectSha256(role, fields), observedAt: fields.issuedAt }; });
    return fields;
  }
  function fixture() {
    const root = mkdtempSync(join(os.tmpdir(), 'cert-artifacts-'));
    for (const host of CERTIFICATION_REQUIRED_HOSTS) {
      const bytes = Buffer.from(`${JSON.stringify(attestation(host))}\n`);
      writeFileSync(join(root, `attestation-${host}.json`), bytes);
      writeFileSync(join(root, `manifest-${host}.json`), JSON.stringify({ schema: 'host-certification-manifest/v1', host, attestationFile: `attestation-${host}.json`, attestationSha256: sha(bytes), commitSha: commit, repository: 'owner/repo', runId: '42', runUrl: 'https://github.com/owner/repo/actions/runs/42', workflow: 'Certification', check: 'certify' }));
    }
    return root;
  }
  const verify = (root: string) => execFileSync(process.execPath, ['automation/certification-ci.mjs', 'certification-verify'], { cwd: join(__dirname, '..', '..', '..'), env: { ...env, CERTIFICATION_ARTIFACTS: root }, stdio: 'pipe' });
  const manifest = (root: string, host = 'codex') => join(root, `manifest-${host}.json`);
  const mutateManifest = (root: string, change: (value: any) => void, host = 'codex') => { const file = manifest(root, host); const value = JSON.parse(readFileSync(file, 'utf8')); change(value); writeFileSync(file, JSON.stringify(value)); };

  it('accepts exact basenames forming exact host pairs', () => { const root = fixture(); expect(() => verify(root)).not.toThrow(); rmSync(root, { recursive: true }); });
  it.each([
    ['extra file', (root: string) => writeFileSync(join(root, 'extra.json'), '{}')],
    ['extra directory', (root: string) => mkdirSync(join(root, 'nested'))],
    ['duplicate nested basename', (root: string) => { mkdirSync(join(root, 'nested')); cpSync(manifest(root), join(root, 'nested', 'manifest-codex.json')); }],
    ['traversal', (root: string) => mutateManifest(root, value => { value.attestationFile = '../attestation-codex.json'; })],
    ['wrong hash', (root: string) => mutateManifest(root, value => { value.attestationSha256 = '0'.repeat(64); })],
    ['foreign host', (root: string) => mutateManifest(root, value => { value.host = 'unknown-host'; })],
    ['wrong commit', (root: string) => mutateManifest(root, value => { value.commitSha = 'c'.repeat(64); })],
    ['stale TTL', (root: string) => { const file = join(root, 'attestation-codex.json'); const value = JSON.parse(readFileSync(file, 'utf8')); value.expiresAt = new Date(Date.now() - 1).toISOString(); const bytes = Buffer.from(JSON.stringify(value)); writeFileSync(file, bytes); mutateManifest(root, manifest => { manifest.attestationSha256 = sha(bytes); }); }],
    ['model mismatch', (root: string) => { const file = join(root, 'attestation-codex.json'); const value = JSON.parse(readFileSync(file, 'utf8')); value.requestedModel = 'synthetic'; const bytes = Buffer.from(JSON.stringify(value)); writeFileSync(file, bytes); mutateManifest(root, manifest => { manifest.attestationSha256 = sha(bytes); }); }],
  ])('rejects %s', (_label, mutate) => { const root = fixture(); mutate(root); expect(() => verify(root)).toThrow(); rmSync(root, { recursive: true }); });
});

describe('Action SHA integrity', () => {
  const KNOWN_SHA256_ACTIONS: Record<string, string> = {
    'actions/checkout': '11bd71901bbe5b1630ceea73d27597364c9af683',
    'actions/setup-node': '1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a',
    'actions/upload-artifact': 'ea165f8d65b6e75b540449e92b4886f43607fa02',
    'actions/download-artifact': 'd3f86a106a0bac45b974a628896c90dbdf5c8093',
    'semgrep/semgrep-action': '713efdd345f3035192eaa63f56867b88e63e4e5d',
    'gitleaks/gitleaks-action': 'ff98106e4c7b2bc287b24eaf42907196329070c7',
  };

  it.each(Object.entries(KNOWN_SHA256_ACTIONS))('%s is pinned to immutable SHA', (action, sha) => {
    const files = readdirSync(WORKFLOWS_DIR).filter(f => extname(f) === '.yml' || extname(f) === '.yaml');
    for (const file of files) {
      const wf = loadWorkflow(file);
      for (const [, job] of Object.entries(wf.jobs!)) {
        for (const step of job.steps || []) {
          if (step.uses?.startsWith(`${action}@`)) {
            const ref = step.uses.split('@')[1].split('#')[0];
            if (ref !== sha) {
              throw new Error(`${file}: ${action} pinned to ${ref}, expected ${sha}`);
            }
          }
        }
      }
    }
  });
});

describe('No duplicate actions or steps', () => {
  it('no two workflow jobs call checkout in the same job', () => {
    const files = readdirSync(WORKFLOWS_DIR).filter(f => extname(f) === '.yml' || extname(f) === '.yaml');
    for (const file of files) {
      const wf = loadWorkflow(file);
      for (const [jobName, job] of Object.entries(wf.jobs!)) {
        const checkouts = job.steps!.filter(s => s.uses?.startsWith('actions/checkout'));
        expect(checkouts.length, `${file}/${jobName}: multiple checkout steps`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('no two workflow jobs call setup-node in the same job', () => {
    const files = readdirSync(WORKFLOWS_DIR).filter(f => extname(f) === '.yml' || extname(f) === '.yaml');
    for (const file of files) {
      const wf = loadWorkflow(file);
      for (const [jobName, job] of Object.entries(wf.jobs!)) {
        const setups = job.steps!.filter(s => s.uses?.startsWith('actions/setup-node'));
        expect(setups.length, `${file}/${jobName}: multiple setup-node steps`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('External assumptions documented', () => {
  it('certification workflow needs native CLIs on self-hosted runners', () => {
    const wf = loadWorkflow('certification.yml');
    expect(wf.jobs!.certify!['runs-on']).toEqual(['self-hosted', "${{ matrix.host }}-native"]);
  });

  it('certification aggregate needs download-artifact to retrieve per-host attestations', () => {
    const wf = loadWorkflow('certification.yml');
    const downloadStep = wf.jobs!['certify-aggregate']!.steps!.find(s => s.uses?.startsWith('actions/download-artifact'));
    expect(downloadStep).toBeTruthy();
  });
});
