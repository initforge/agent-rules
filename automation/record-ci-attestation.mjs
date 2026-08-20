#!/usr/bin/env node
/** Create one external hosted-CI attestation after the quality fan-in. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const output = process.argv[2];
if (!output || path.isAbsolute(output) === false && output.includes('..')) throw new Error('usage: record-ci-attestation.mjs <absolute-output-file>');
const body = {
  schema: 'harness/external-ci-attestation/v1',
  source: 'github-actions',
  repository: process.env.GITHUB_REPOSITORY || 'unknown',
  workflow: process.env.GITHUB_WORKFLOW || 'Quality',
  run_id: process.env.GITHUB_RUN_ID || null,
  run_url: process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  head_sha: process.env.GITHUB_SHA || null,
  observed_at: new Date().toISOString(),
  required_jobs: {
    quality: process.env.QUALITY_RESULT || 'unknown',
    python_tests: process.env.PYTHON_RESULT || 'unknown',
    security: process.env.SECURITY_RESULT || 'unknown',
  },
  self_referential_closure: false,
  status: ['success'].every(() => [process.env.QUALITY_RESULT, process.env.PYTHON_RESULT, process.env.SECURITY_RESULT].every((value) => value === 'success')) ? 'PASS' : 'FAIL',
};
const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ ...body, sha256: hash }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ status: body.status, head_sha: body.head_sha, sha256: hash }));
if (body.status !== 'PASS') process.exit(1);
