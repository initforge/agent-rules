#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from '../node_modules/typescript/lib/typescript.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sourcePath = path.join(root, 'packages/cli/src/automation/install-opencode-adapter.ts');
const source = await fs.readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
  reportDiagnostics: true,
});
const errors = (transpiled.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
if (errors.length) throw new Error(`TypeScript transpile failed: ${errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('; ')}`);

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-rules-opencode-probe-'));
try {
  const modulePath = path.join(temp, 'install-opencode-adapter.mjs');
  await fs.writeFile(modulePath, transpiled.outputText, 'utf8');
  const { installOpenCodeAdapter } = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
  const project = path.join(temp, 'project');
  await fs.mkdir(project, { recursive: true });
  const configPath = path.join(project, 'opencode.json');
  const original = {
    $schema: 'https://opencode.ai/config.json',
    model: 'custom/default',
    enabled_providers: ['custom'],
    provider: { custom: { options: { apiKey: 'preserve-me' } } },
  };
  const originalBytes = Buffer.from(`${JSON.stringify(original, null, 2)}\n`);
  await fs.writeFile(configPath, originalBytes);
  const result = await installOpenCodeAdapter({ repoRoot: root, projectRoot: project });
  if (!result?.ok) throw new Error(`installer returned non-ok result: ${JSON.stringify(result)}`);
  const after = await fs.readFile(configPath);
  if (!after.equals(originalBytes)) throw new Error('OpenCode adapter rewrote user-owned opencode.json');
  const owned = JSON.parse(await fs.readFile(path.join(project, '.opencode', 'agent-rules-owned.json'), 'utf8'));
  if (owned.some((entry) => path.basename(entry) === 'opencode.json')) throw new Error('OpenCode ownership manifest claims user-owned opencode.json');
  if (!owned.includes('commands/goal.md')) throw new Error('OpenCode adapter did not install the emulated /goal command');
  if (!owned.includes('skills/finish-to-completion/SKILL.md')) throw new Error('OpenCode adapter did not install harness skills');
  const goal = await fs.readFile(path.join(project, '.opencode', 'commands', 'goal.md'), 'utf8');
  if (!goal.includes('EMULATED')) throw new Error('OpenCode /goal command lacks honest emulation attestation');
  const implementer = await fs.readFile(path.join(project, '.opencode', 'agents', 'initforge-implementer.md'), 'utf8');
  if (implementer.includes('__OPENCODE_MODEL_CLASS__') || /^model:/m.test(implementer)) {
    throw new Error('OpenCode adapter leaked a template model instead of inheriting user/session configuration');
  }
  console.log('PASS: OpenCode adapter source preserves provider/model config and does not claim opencode.json');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
