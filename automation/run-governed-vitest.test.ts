import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acquireProjectVitestLease,
  governedVitestArguments,
  VitestLeaseTimeoutError,
} from './run-governed-vitest.mjs';

const temporaryRoots: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(directory);
  return directory;
}

async function waitForOutput(child: ChildProcessWithoutNullStreams, expected: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expected}; saw ${output}`)), 2_000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes(expected)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      if (!output.includes(expected)) {
        clearTimeout(timer);
        reject(new Error(`Lease holder exited ${code} before ${expected}; saw ${output}`));
      }
    });
  });
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('governed Vitest arguments', () => {
  it('forces one worker and disables file parallelism', () => {
    expect(governedVitestArguments(['run', 'a.test.ts'])).toEqual([
      'run',
      'a.test.ts',
      '--maxWorkers=1',
      '--minWorkers=1',
      '--no-file-parallelism',
    ]);
  });

  it.each([
    '--maxWorkers=2',
    '--maxWorkers',
    '--minWorkers=2',
    '--fileParallelism=true',
    '--file-parallelism',
  ])('fails closed on caller worker override %s', (argument) => {
    expect(() => governedVitestArguments(['run', argument])).toThrow(/forbidden/);
  });
});

describe('per-project Vitest leases', () => {
  it('allows two focused parents and rejects a third until a slot is released', async () => {
    const projectRoot = temporaryDirectory('vitest-project-');
    const leaseRoot = temporaryDirectory('vitest-leases-');
    const first = await acquireProjectVitestLease({ projectRoot, leaseRoot, mode: 'focused' });
    const second = await acquireProjectVitestLease({ projectRoot, leaseRoot, mode: 'focused' });

    await expect(acquireProjectVitestLease({
      projectRoot,
      leaseRoot,
      mode: 'focused',
      timeoutMs: 80,
      pollMs: 10,
    })).rejects.toBeInstanceOf(VitestLeaseTimeoutError);

    first.release();
    const replacement = await acquireProjectVitestLease({
      projectRoot,
      leaseRoot,
      mode: 'focused',
      timeoutMs: 200,
      pollMs: 10,
    });
    replacement.release();
    second.release();
  });

  it('makes a full suite exclusive and consumes both project slots', async () => {
    const projectRoot = temporaryDirectory('vitest-project-');
    const leaseRoot = temporaryDirectory('vitest-leases-');
    const focused = await acquireProjectVitestLease({ projectRoot, leaseRoot, mode: 'focused' });
    const fullPromise = acquireProjectVitestLease({
      projectRoot,
      leaseRoot,
      mode: 'full',
      timeoutMs: 1_000,
      pollMs: 10,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    await expect(acquireProjectVitestLease({
      projectRoot,
      leaseRoot,
      mode: 'focused',
      timeoutMs: 80,
      pollMs: 10,
    })).rejects.toBeInstanceOf(VitestLeaseTimeoutError);

    focused.release();
    const full = await fullPromise;
    expect(full.paths.map((entry) => path.basename(entry)).sort()).toEqual([
      'exclusive.lease.json',
      'slot-0.lease.json',
      'slot-1.lease.json',
    ]);
    full.release();
  });

  it('recovers a stale lease left by a terminated dummy process', async () => {
    const projectRoot = temporaryDirectory('vitest-project-');
    const leaseRoot = temporaryDirectory('vitest-leases-');
    const fixture = path.join(process.cwd(), 'automation', 'fixtures', 'vitest-lease-holder.mjs');
    const child = spawn(process.execPath, [fixture, projectRoot, leaseRoot, 'focused', '60000'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForOutput(child, 'ACQUIRED');
    child.kill();
    await waitForExit(child);

    const recovered = await acquireProjectVitestLease({
      projectRoot,
      leaseRoot,
      mode: 'full',
      timeoutMs: 500,
      pollMs: 10,
    });
    recovered.release();
  });

  it('keeps different projects independent', async () => {
    const leaseRoot = temporaryDirectory('vitest-leases-');
    const projectA = temporaryDirectory('vitest-project-a-');
    const projectB = temporaryDirectory('vitest-project-b-');
    const fullA = await acquireProjectVitestLease({ projectRoot: projectA, leaseRoot, mode: 'full' });
    const fullB = await acquireProjectVitestLease({ projectRoot: projectB, leaseRoot, mode: 'full' });
    fullA.release();
    fullB.release();
  });
});

describe('Vitest invocation governance', () => {
  it('has no executable direct Vitest bypass outside the launcher and this test', () => {
    const root = process.cwd();
    const bypasses: string[] = [];
    const monorepoRoot = path.resolve(__dirname, '..');

    // Allowed vitest bypasses for tag-based selective runs
    const allowedBypasses = ['test:fast', 'test:e2e', 'test:browser', 'test:smoke'];

    for (const packageFile of [
      'package.json',
      'packages/cli/package.json',
      'packages/engine/package.json',
      'packages/kernel/package.json',
    ]) {
      const fullPath = path.join(root, packageFile);
      if (!fs.existsSync(fullPath)) continue;
      const scripts = JSON.parse(fs.readFileSync(fullPath, 'utf8')).scripts ?? {};
      for (const [name, command] of Object.entries<string>(scripts)) {
        if (/\bvitest\b/.test(command) && !command.includes('run-governed-vitest.mjs') && !allowedBypasses.includes(name)) {
          bypasses.push(`${packageFile}#${name}`);
        }
      }
    }

    for (const relativeFile of [
      '.github/workflows/quality.yml',
      'automation/verify-all.ps1',
    ]) {
      const content = fs.readFileSync(path.join(root, relativeFile), 'utf8');
      if (/\bnpx\s+vitest\b|node_modules[^\n]+vitest(?:\.mjs)?/.test(content)) {
        bypasses.push(relativeFile);
      }
    }

    // Exclude monorepo root and generated paths
    const monorepoRootScripts = JSON.parse(
      fs.readFileSync(path.join(monorepoRoot, 'package.json'), 'utf8'),
    ).scripts ?? {};
    for (const [name, command] of Object.entries<string>(monorepoRootScripts)) {
      if (/\bvitest\b/.test(command) && !command.includes('run-governed-vitest.mjs') && !allowedBypasses.includes(name)) {
        bypasses.push(`package.json#${name}`);
      }
    }

    expect(bypasses).toEqual([]);
  });
});
