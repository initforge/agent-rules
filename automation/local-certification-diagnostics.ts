import { writeFile } from 'node:fs/promises';
import { collectLocalCertificationDiagnostics } from './host-certification-diagnostics.js';

const requestedModel = process.env.REQUESTED_MODEL || 'qwencoder/qwen3.7-max';
const output = process.env.DIAGNOSTICS_OUTPUT;
const diagnostics = await collectLocalCertificationDiagnostics(requestedModel, process.cwd());
const json = `${JSON.stringify(diagnostics, null, 2)}\n`;
if (output) await writeFile(output, json);
process.stdout.write(json);
if (diagnostics.status === 'WAITING_EXTERNAL') process.exitCode = 78;
