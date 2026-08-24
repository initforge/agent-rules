import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assertCertificationAttestation, CERTIFICATION_REQUIRED_HOSTS } from '../packages/engine/dist/contracts.js';

const required = name => process.env[name] || (() => { throw new Error(`${name} is required`); })();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function validateAttestation() {
  const host = required('CERTIFICATION_HOST');
  const commit = required('CERTIFICATION_COMMIT_SHA');
  if (!CERTIFICATION_REQUIRED_HOSTS.includes(host)) throw new Error(`unexpected certification host: ${host}`);
  const attestation = JSON.parse(readFileSync(required('HOST_ATTESTATION_FILE'), 'utf8'));
  if (attestation.host !== host) throw new Error(`attestation host ${attestation.host} does not match runner host ${host}`);
  assertCertificationAttestation(attestation, commit);
  return attestation;
}

function buildCertificationArtifact() {
  const attestation = validateAttestation();
  const bytes = readFileSync(required('HOST_ATTESTATION_FILE'));
  const output = required('CERTIFICATION_OUTPUT');
  const filename = `attestation-${attestation.host}.json`;
  const manifest = {
    schema: 'host-certification-manifest/v1', host: attestation.host, attestationFile: filename,
    attestationSha256: sha256(bytes), commitSha: required('CERTIFICATION_COMMIT_SHA'),
    repository: required('CERTIFICATION_REPOSITORY'), runId: required('CERTIFICATION_RUN_ID'),
    runUrl: required('CERTIFICATION_RUN_URL'), workflow: required('CERTIFICATION_WORKFLOW'),
    check: required('CERTIFICATION_CHECK'),
  };
  mkdirSync(output);
  writeFileSync(path.join(output, filename), bytes, { flag: 'wx' });
  writeFileSync(path.join(output, `manifest-${attestation.host}.json`), `${JSON.stringify(manifest)}\n`, { flag: 'wx' });
}

function verifyCertificationArtifacts() {
  const root = path.resolve(required('CERTIFICATION_ARTIFACTS'));
  const entries = readdirSync(root, { withFileTypes: true });
  if (entries.some(entry => !entry.isFile())) throw new Error('certification artifacts must contain files only');
  const expectedBasenames = CERTIFICATION_REQUIRED_HOSTS.flatMap(host => [`attestation-${host}.json`, `manifest-${host}.json`]).sort();
  const basenames = entries.map(entry => entry.name).sort();
  if (basenames.length !== expectedBasenames.length || basenames.some((name, index) => name !== expectedBasenames[index])) {
    throw new Error(`certification artifacts must contain exactly ${expectedBasenames.length} expected files: ${basenames.join(',')}`);
  }
  const manifests = CERTIFICATION_REQUIRED_HOSTS.map(host => `manifest-${host}.json`);
  const seen = new Set();
  for (const basename of manifests) {
    const manifestPath = path.join(root, basename);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.schema !== 'host-certification-manifest/v1' || seen.has(manifest.host) || !CERTIFICATION_REQUIRED_HOSTS.includes(manifest.host)) throw new Error(`invalid or duplicate manifest host: ${manifest.host}`);
    seen.add(manifest.host);
    const expected = { commitSha: required('CERTIFICATION_COMMIT_SHA'), repository: required('CERTIFICATION_REPOSITORY'), runId: required('CERTIFICATION_RUN_ID'), runUrl: required('CERTIFICATION_RUN_URL'), workflow: required('CERTIFICATION_WORKFLOW') };
    for (const [field, value] of Object.entries(expected)) if (manifest[field] !== value) throw new Error(`${manifest.host}: manifest ${field} mismatch`);
    if (manifest.check !== 'certify') throw new Error(`${manifest.host}: manifest check mismatch`);
    const expectedAttestationBasename = `attestation-${manifest.host}.json`;
    if (manifest.attestationFile !== expectedAttestationBasename || path.basename(manifest.attestationFile) !== manifest.attestationFile) {
      throw new Error(`${manifest.host}: invalid attestation basename`);
    }
    const attestationPath = path.resolve(root, manifest.attestationFile);
    if (path.dirname(attestationPath) !== root) throw new Error(`${manifest.host}: attestation path escapes artifact root`);
    const bytes = readFileSync(attestationPath);
    if (sha256(bytes) !== manifest.attestationSha256) throw new Error(`${manifest.host}: attestation hash mismatch`);
    const attestation = JSON.parse(bytes.toString('utf8'));
    if (attestation.host !== manifest.host) throw new Error(`${manifest.host}: attestation content host mismatch`);
    assertCertificationAttestation(attestation, manifest.commitSha);
  }
  if (!CERTIFICATION_REQUIRED_HOSTS.every(host => seen.has(host))) throw new Error('certification host set mismatch');
}

const command = process.argv[2];
if (command === 'certification-validate') {
  validateAttestation();
} else if (command === 'certification-build') {
  buildCertificationArtifact();
} else if (command === 'certification-verify') {
  verifyCertificationArtifacts();
} else {
  console.error('Usage: node automation/certification-ci.mjs <certification-validate|certification-build|certification-verify>');
  process.exitCode = 2;
}
