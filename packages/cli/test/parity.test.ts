import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const buildRoot = path.join(root, 'generated', 'runtime-build');
const contracts = JSON.parse(fs.readFileSync(path.join(root, 'platforms/platform-contracts.json'), 'utf8'));
const hosts: string[] = contracts.registry.host_ids;

function manifest(host: string) {
  return JSON.parse(fs.readFileSync(path.join(buildRoot, host, 'manifest.json'), 'utf8')) as {
    platform: string;
    files: Array<{ path: string; sha256: string }>;
  };
}

describe('canonical build projection', () => {
  it('builds every registered host from the same rules and skills', () => {
    expect(hosts).toHaveLength(9);
    const baseline = manifest(hosts[0]);
    const canonical = baseline.files
      .filter((file) => /^rules\/(?:00|10|20|30|40)-|^rules\/manifest\.yaml$/.test(file.path))
      .map((file) => [file.path, file.sha256]);
    expect(canonical.some(([file]) => file === 'rules/manifest.yaml')).toBe(true);
    for (const host of hosts) {
      const built = manifest(host);
      expect(built.platform).toBe(host);
      expect(built.files.map((file) => file.path)).toEqual(
        [...built.files.map((file) => file.path)].sort((a, b) => a.localeCompare(b, 'en')),
      );
      expect(built.files
        .filter((file) => /^rules\/(?:00|10|20|30|40)-|^rules\/manifest\.yaml$/.test(file.path))
        .map((file) => [file.path, file.sha256])).toEqual(canonical);
      expect(built.files.filter((file) => /-overlay\.md$/.test(file.path))).toHaveLength(1);
    }
  });

  it('binds every manifest hash to the emitted file', () => {
    for (const host of hosts) {
      for (const file of manifest(host).files) {
        const target = path.join(buildRoot, host, ...file.path.split('/'));
        expect(fs.existsSync(target)).toBe(true);
        expect(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')).toBe(file.sha256);
      }
    }
  });

  it('does not materialize model policies, worker roles, or ticket tools', () => {
    for (const host of hosts) {
      const paths = manifest(host).files.map((file) => file.path);
      expect(paths.some((file) => /model-policy|workctl|^agents\//i.test(file))).toBe(false);
    }
  });
});

describe('public CLI', () => {
  it('exposes only the compact operator surface', () => {
    const help = execFileSync(process.execPath, [path.join(root, 'packages/cli/dist/index.js'), '--help'], { encoding: 'utf8' });
    for (const command of ['install', 'uninstall', 'doctor', 'status', 'integration', 'reference', 'route-native']) {
      expect(help).toContain(`  ${command} `);
    }
    for (const retired of ['run', 'init', 'plan', 'goal', 'close']) expect(help).not.toContain(`  ${retired} `);
  });
});
