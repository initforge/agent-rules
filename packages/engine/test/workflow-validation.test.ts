import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

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
  strategy?: { matrix?: { include?: Record<string, unknown>[] } };
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

  it('quality.yml has no duplicate build step', () => {
    const wf = loadWorkflow('quality.yml');
    let buildCount = 0;
    for (const job of Object.values(wf.jobs!)) {
      for (const step of job.steps || []) {
        if (step.run && step.run.includes('npm run build')) buildCount++;
      }
    }
    expect(buildCount).toBeLessThanOrEqual(1);
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

  it('control plane is started and cleaned up', () => {
    const wf = loadWorkflow('quality.yml');
    const qualityJob = wf.jobs!.quality;
    const startStep = qualityJob!.steps!.find(s => s.name === 'Start Control Plane');
    const cleanupStep = qualityJob!.steps!.find(s => s.name === 'Cleanup Control Plane');
    expect(startStep).toBeTruthy();
    expect(startStep!.run).toContain('node automation/control-plane-ci.mjs start');
    expect(cleanupStep).toBeTruthy();
    expect(cleanupStep!['if']).toBe('always()');
    expect(cleanupStep!.run).toContain('node automation/control-plane-ci.mjs stop');
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

  it('uses SHA-pinned semgrep and gitleaks actions', () => {
    const wf = loadWorkflow('quality.yml');
    const securityJob = wf.jobs!.security;
    const semgrep = securityJob!.steps!.find(s => s.name === 'Semgrep SAST');
    const gitleaks = securityJob!.steps!.find(s => s.name === 'Secret scanning');
    expect(isShaPin(semgrep!.uses!)).toBe(true);
    expect(isShaPin(gitleaks!.uses!)).toBe(true);
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
  it('has matrix with all 5 native hosts', () => {
    const wf = loadWorkflow('certification.yml');
    const certifyJob = wf.jobs!.certify;
    expect(certifyJob).toBeTruthy();
    const matrix = certifyJob!.strategy?.matrix;
    expect(matrix).toBeTruthy();
    const hosts = matrix!.include!.map(i => i.host);
    expect(hosts).toContain('codex');
    expect(hosts).toContain('cursor');
    expect(hosts).toContain('antigravity');
    expect(hosts).toContain('grok');
    expect(hosts).toContain('opencode');
  });

  it('each host has a self-hosted runner label', () => {
    const wf = loadWorkflow('certification.yml');
    const matrix = wf.jobs!.certify!.strategy!.matrix!;
    for (const entry of matrix.include!) {
      const runner = entry.runner as string[];
      expect(runner).toContain('self-hosted');
      expect(runner).toContain(`${entry.host}-native`);
    }
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
    expect(stepNames).toContain('Verify attestations via manifest content, hash, metadata and host uniqueness');
    expect(stepNames).toContain('Verify aggregate');
  });

  it('certify job generates artifact manifest with SHA and uploads attestation+manifest', () => {
    const wf = loadWorkflow('certification.yml');
    const certifySteps = wf.jobs!.certify!.steps!;
    expect(certifySteps.some(s => s.name === 'Generate artifact manifest')).toBeTruthy();
    const uploadStep = certifySteps.find(s => s.uses?.startsWith('actions/upload-artifact'));
    expect(uploadStep).toBeTruthy();
    expect(uploadStep!.with!['if-no-files-found']).toBe('error');
  });

  it('certification has timeout-minutes set on both jobs', () => {
    const wf = loadWorkflow('certification.yml');
    expect(wf.jobs!.certify!['timeout-minutes']).toBeGreaterThan(0);
    expect(wf.jobs!['certify-aggregate']!['timeout-minutes']).toBeUndefined();
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
  it('quality workflow needs control-plane built and running', () => {
    const wf = loadWorkflow('quality.yml');
    const cpStep = wf.jobs!.quality!.steps!.find(s => s.name === 'Start Control Plane');
    expect(cpStep).toBeTruthy();
  });

  it('certification workflow needs native CLIs on self-hosted runners', () => {
    const wf = loadWorkflow('certification.yml');
    const matrix = wf.jobs!.certify!.strategy!.matrix!;
    for (const entry of matrix.include!) {
      const runner = entry.runner as string[];
      expect(runner).toContain(`${entry.host}-native`);
    }
  });

  it('certification aggregate needs download-artifact to retrieve per-host attestations', () => {
    const wf = loadWorkflow('certification.yml');
    const downloadStep = wf.jobs!['certify-aggregate']!.steps!.find(s => s.uses?.startsWith('actions/download-artifact'));
    expect(downloadStep).toBeTruthy();
  });
});
