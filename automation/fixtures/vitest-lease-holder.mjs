import { acquireProjectVitestLease } from '../run-governed-vitest.mjs';

const [projectRoot, leaseRoot, mode = 'focused', holdMs = '60000'] = process.argv.slice(2);
if (!projectRoot || !leaseRoot) {
  throw new Error('Usage: vitest-lease-holder.mjs <project-root> <lease-root> [focused|full] [hold-ms]');
}

const lease = await acquireProjectVitestLease({
  projectRoot,
  leaseRoot,
  mode,
  timeoutMs: 2_000,
  pollMs: 10,
});

process.stdout.write('ACQUIRED\n');
try {
  await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));
} finally {
  lease.release();
}
