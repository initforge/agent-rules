import { writeFile } from 'node:fs/promises';
import { collectLocalCertificationDiagnostics } from './host-certification-diagnostics.js';

async function main(): Promise<void> {
  const requestedModel = process.env.REQUESTED_MODEL || 'qwencoder/qwen3.7-max';
  const output = process.env.DIAGNOSTICS_OUTPUT;
  const diagnostics = await collectLocalCertificationDiagnostics(requestedModel, process.cwd());
  const json = `${JSON.stringify(diagnostics, null, 2)}\n`;
  if (output) await writeFile(output, json);
  process.stdout.write(json);
  if (diagnostics.status === 'WAITING_EXTERNAL') {
    // Distinguish the exit-78 situations (ci-certify.sh keeps checking 78):
    // 78 = runners unavailable on this host; 79 = an installed native host
    // genuinely failed its probes. Both are recorded in diagnostics.reason.
    if (diagnostics.reason === 'NATIVE_HOST_FAILED') process.exitCode = 79;
    else process.exitCode = 78;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`local-certification-diagnostics failed: ${message}\n`);
  process.exitCode = 1;
});
