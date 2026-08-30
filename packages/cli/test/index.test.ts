import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExitCode } from '../src/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('public CLI architecture', () => {
  it('keeps a compact operator surface with no shadow execution commands', () => {
    const source = fs.readFileSync(path.join(root, 'packages/cli/src/index.ts'), 'utf8');
    const commands = [...source.matchAll(/\.command\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(commands).toEqual([
      'install', 'update', 'rollback', 'uninstall', 'doctor', 'status', 'integration', 'reference', 'route-native',
    ]);
    expect(commands).not.toEqual(expect.arrayContaining(['init', 'run', 'plan', 'goal', 'close']));
  });

  it('uses canonical source modules and has no retired command facades', () => {
    for (const file of ['install.ts', 'update.ts', 'rollback.ts', 'uninstall.ts', 'integration.ts', 'reference.ts']) {
      expect(fs.existsSync(path.join(root, 'packages/cli/src/commands', file))).toBe(true);
    }
    for (const retired of ['doctor.ts', 'northstar-ux.ts']) {
      expect(fs.existsSync(path.join(root, 'packages/cli/src/commands', retired))).toBe(false);
    }
  });

  it('exports the effectful command handlers', async () => {
    expect(typeof (await import('../src/commands/install.js')).installCmd).toBe('function');
    expect(typeof (await import('../src/commands/update.js')).updateCmd).toBe('function');
    expect(typeof (await import('../src/commands/rollback.js')).rollbackCmd).toBe('function');
    expect(typeof (await import('../src/commands/uninstall.js')).uninstallCmd).toBe('function');
    expect(typeof (await import('../src/commands/integration.js')).integrationCmd).toBe('function');
    expect(typeof (await import('../src/commands/reference.js')).readReference).toBe('function');
  });

  it('keeps distinct machine-readable exit codes', () => {
    expect(ExitCode.Success).toBe(0);
    expect(ExitCode.GeneralError).toBe(1);
    expect(ExitCode.InvalidArgument).toBe(2);
    expect(ExitCode.ValidationFailed).toBe(5);
  });
});
