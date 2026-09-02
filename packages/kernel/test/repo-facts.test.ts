import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectRepositoryFacts } from '../src/northstar/repo-facts.js';

const roots: string[] = [];
function tempRoot(): string { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-repo-facts-')); roots.push(root); return root; }
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('repository facts', () => {
  it('collects declared workspace packages, markers and scoped package facts', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'apps', 'api', 'prisma'), { recursive: true });
    fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*'], dependencies: { react: '1' } }));
    fs.writeFileSync(path.join(root, 'apps', 'api', 'package.json'), JSON.stringify({ dependencies: { '@prisma/client': '1' } }));
    fs.writeFileSync(path.join(root, 'apps', 'api', 'prisma', 'schema.prisma'), 'generator client {}');
    fs.writeFileSync(path.join(root, 'apps', 'web', 'package.json'), JSON.stringify({ devDependencies: { next: '1' } }));
    fs.writeFileSync(path.join(root, 'apps', 'web', 'next.config.ts'), 'export default {};');

    const facts = collectRepositoryFacts(root, [path.join(root, 'apps', 'api', 'src', 'route.ts'), path.join(os.tmpdir(), 'outside.ts')]);
    expect(facts.manifests).toEqual(['apps/api/package.json', 'apps/web/package.json', 'package.json']);
    expect(facts.packages).toEqual(expect.arrayContaining(['@prisma/client', 'next', 'react']));
    expect(facts.frameworks).toEqual(expect.arrayContaining(['@prisma/client', 'next', 'react']));
    expect(facts.schemas).toContain('apps/api/prisma/schema.prisma');
    expect(facts.changed_files).toEqual(['apps/api/src/route.ts']);
  });

  it('matches recursive workspace globs and nested framework/schema markers', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'apps', 'group', 'api', 'prisma'), { recursive: true });
    fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/**'] }));
    fs.writeFileSync(path.join(root, 'apps', 'group', 'api', 'package.json'), JSON.stringify({ dependencies: { '@prisma/client': '1' } }));
    fs.writeFileSync(path.join(root, 'apps', 'group', 'api', 'prisma', 'schema.prisma'), 'model User {}');
    fs.writeFileSync(path.join(root, 'apps', 'web', 'package.json'), JSON.stringify({ dependencies: { next: '1' } }));
    fs.writeFileSync(path.join(root, 'apps', 'web', 'next.config.ts'), 'export default {};');

    const facts = collectRepositoryFacts(root);
    expect(facts.manifests).toEqual(['apps/group/api/package.json', 'apps/web/package.json', 'package.json']);
    expect(facts.schemas).toContain('apps/group/api/prisma/schema.prisma');
    expect(facts.frameworks).toEqual(expect.arrayContaining(['@prisma/client', 'next']));
  });

  it('supports object workspace form and ignores excluded directories', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'packages', 'group', 'core'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: { packages: ['packages/**'] } }));
    fs.writeFileSync(path.join(root, 'packages', 'group', 'core', 'package.json'), JSON.stringify({ dependencies: { react: '1' } }));
    for (const ignored of ['node_modules', 'generated', 'dist', 'build', 'coverage', '.git']) {
      const directory = path.join(root, ignored, 'hidden');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ dependencies: { forbidden: '1' } }));
    }

    const facts = collectRepositoryFacts(root);
    expect(facts.manifests).toEqual(['package.json', 'packages/group/core/package.json']);
    expect(facts.packages).toContain('react');
    expect(facts.packages).not.toContain('forbidden');
  });

  it('fails soft for malformed manifests', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'apps', 'broken'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/**'] }));
    fs.writeFileSync(path.join(root, 'apps', 'broken', 'package.json'), '{broken');
    expect(() => collectRepositoryFacts(root)).not.toThrow();
    expect(collectRepositoryFacts(root).manifests).toContain('apps/broken/package.json');
  });
});
