#!/usr/bin/env node
/**
 * C-015 via V-015 (S7, REQ-015): audit every GitHub Actions workflow for
 * bounded steps, waits, browser installs, service starts, and external checks.
 *
 * Rules:
 *   R1  every job declares a positive `timeout-minutes`
 *   R2  every `wait-on` step carries an explicit --timeout/-t (a wait that
 *       never succeeds must fail the STEP with the exact step name)
 *   R3  browser-install (`playwright install`) steps declare step-level
 *       `timeout-minutes`
 *   R4  external check steps (npm audit, semgrep, gitleaks) declare step-level
 *       `timeout-minutes`
 *   R5  hosted quality stays required-capable: quality.yml triggers on
 *       pull_request
 *   R6  self-hosted certification can never be a required check: certification.yml
 *       must not trigger on pull_request or merge_group
 *   R7  certification.yml cannot queue forever on an unavailable runner: a
 *       bounded watchdog job cancels queued self-hosted certify jobs and emits
 *       RUNNERS_UNAVAILABLE advisory evidence (exit 78); certify-aggregate maps
 *       skipped/cancelled to the same advisory path.
 *
 * Fails with the exact unbounded job/step name (failure playbook for REQ-015).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDir = path.join(root, '.github', 'workflows');
const problems = [];
const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) problems.push(detail);
};

const WAIT_RE = /\bwait-on\b/;
const BROWSER_RE = /playwright\s+install/;
const EXTERNAL_RUN_RE = /npm\s+audit/;
const EXTERNAL_USES_RE = /(?:semgrep|gitleaks)/;
const UNBOUNDED_SPECIAL_RE = new RegExp([
  WAIT_RE.source,
  BROWSER_RE.source,
  EXTERNAL_RUN_RE.source,
].join('|'));

function readWorkflows() {
  const files = fs.readdirSync(workflowsDir).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml')).sort();
  if (files.length === 0) {
    check('workflow-discovery', false, `no workflow files found under ${workflowsDir}`);
    return [];
  }
  return files.map((name) => {
    const file = path.join(workflowsDir, name);
    let doc;
    try {
      doc = parseYaml(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      check(`yaml-${name}`, false, `${name}: invalid YAML: ${error.message}`);
      return null;
    }
    if (!doc || typeof doc !== 'object' || !doc.jobs || typeof doc.jobs !== 'object') {
      check(`jobs-${name}`, false, `${name}: no jobs map`);
      return null;
    }
    return { name, file, doc };
  }).filter(Boolean);
}

const workflowSummaries = [];

for (const workflow of readWorkflows()) {
  const { name, doc } = workflow;
  const events = Object.keys(doc.on ?? {});
  const jobs = Object.entries(doc.jobs);
  const jobSummaries = [];
  for (const [jobName, job] of jobs) {
    const timeoutMinutes = Number(job?.['timeout-minutes']);
    check(
      `timeout-${name}#${jobName}`,
      Number.isInteger(timeoutMinutes) && timeoutMinutes > 0,
      `unbounded job "${jobName}" in ${name}: missing or non-positive timeout-minutes`
    );
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    const stepSummaries = [];
    for (const [index, step] of steps.entries()) {
      if (!step || typeof step !== 'object') continue;
      const stepName = String(step.name ?? `(unnamed step ${index})`);
      const run = String(step.run ?? '');
      const uses = String(step.uses ?? '');
      const stepTimeout = Number(step['timeout-minutes']);
      const hasStepTimeout = Number.isInteger(stepTimeout) && stepTimeout > 0;

      if (run !== '') {
        if (WAIT_RE.test(run)) {
          const explicitWaitTimeout = /(?:--timeout|-t)\s+\d+/i.test(run);
          check(
            `wait-${name}#${jobName}#${stepName}`,
            explicitWaitTimeout,
            `unbounded wait in step "${stepName}" (${name}, job "${jobName}"): wait-on must carry an explicit --timeout so the step fails with its own name`
          );
        }
        if (BROWSER_RE.test(run)) {
          check(
            `explicit-${name}#${jobName}#${stepName}`,
            hasStepTimeout,
            `unbounded step "${stepName}" (${name}, job "${jobName}"): browser install / service start|stop must declare step-level timeout-minutes`
          );
        }
        if (EXTERNAL_RUN_RE.test(run)) {
          check(
            `external-${name}#${jobName}#${stepName}`,
            hasStepTimeout,
            `unbounded external check step "${stepName}" (${name}, job "${jobName}"): npm audit must declare step-level timeout-minutes`
          );
        }
      }
      if (uses !== '' && EXTERNAL_USES_RE.test(uses)) {
        check(
          `external-uses-${name}#${jobName}#${stepName}`,
          hasStepTimeout,
          `unbounded external check step "${stepName}" (${name}, job "${jobName}"): ${uses} must declare step-level timeout-minutes`
        );
      }
      const special = UNBOUNDED_SPECIAL_RE.test(run);
      const bounded = hasStepTimeout || (Number.isInteger(timeoutMinutes) && timeoutMinutes > 0);
      if (special && !bounded) {
        check(
          `bound-${name}#${jobName}#${stepName}`,
          false,
          `unbounded step "${stepName}" (${name}, job "${jobName}"): high-risk step without any timeout bound`
        );
      }
      stepSummaries.push({ name: stepName, bounded });
    }
    jobSummaries.push({ name: jobName, timeoutMinutes, steps: stepSummaries });
  }
  workflowSummaries.push({ name, events, jobs: jobSummaries });

  if (name === 'quality.yml') {
    check(
      'quality-required-check',
      events.includes('pull_request'),
      'quality.yml must trigger on pull_request so hosted quality stays a required GitHub check'
    );
  }
  if (name === 'certification.yml') {
    const forbidden = events.filter((event) => event === 'pull_request' || event === 'merge_group');
    check(
      'certification-not-required',
      forbidden.length === 0,
      `certification.yml must not trigger on ${forbidden.join(', ')} — self-hosted certification can never be a required PR/merge-queue check`
    );
    const watchdog = jobs.find(([jobName]) => /watchdog/i.test(jobName));
    check('certification-watchdog', Boolean(watchdog), 'certification.yml must contain a bounded watchdog job that detaches queued self-hosted certification');
    if (watchdog) {
      const [watchdogName, watchdogJob] = watchdog;
      const watchdogRun = (watchdogJob.steps ?? []).map((step) => String(step.run ?? '')).join('\n');
      check('certification-watchdog-bounded', Number(watchdogJob?.['timeout-minutes']) > 0, `certification watchdog job "${watchdogName}" must declare timeout-minutes`);
      check('certification-watchdog-cancel', /\/cancel/.test(watchdogRun), `certification watchdog job "${watchdogName}" must cancel queued self-hosted certify jobs`);
      check('certification-watchdog-advisory', /RUNNERS_UNAVAILABLE/.test(watchdogRun) && /exit\s+78/.test(watchdogRun), `certification watchdog job "${watchdogName}" must emit RUNNERS_UNAVAILABLE advisory evidence and exit 78`);
    }
    const aggregate = jobs.find(([jobName]) => jobName === 'certify-aggregate');
    if (aggregate) {
      const aggregateRun = (aggregate[1].steps ?? []).map((step) => String(step.run ?? '')).join('\n');
      check('certification-aggregate-advisory', /RUNNERS_UNAVAILABLE/.test(aggregateRun) && /cancelled/.test(aggregateRun) && /exit\s+78/.test(aggregateRun), 'certify-aggregate must map skipped/cancelled self-hosted certification to RUNNERS_UNAVAILABLE advisory evidence (exit 78), never to a required-check failure');
    } else {
      check('certification-aggregate-advisory', false, 'certification.yml is missing the certify-aggregate job');
    }
  }
}

const summary = {
  schema: 'harness/ci-timeout-audit/v1',
  status: problems.length === 0 ? 'PASS' : 'FAIL',
  checks: checks.length,
  failedChecks: problems.length,
  workflows: workflowSummaries,
  problems,
};
console.log(JSON.stringify(summary, null, 2));

if (problems.length > 0) {
  console.error(`\nvalidate-ci-timeouts: ${problems.length} unbounded/unsafe CI element(s) found — first: ${problems[0]}`);
  process.exit(1);
}
console.error('\nvalidate-ci-timeouts: all workflows bounded; hosted quality required-capable; self-hosted certification detached from required checks');
