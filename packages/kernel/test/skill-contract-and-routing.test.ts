import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import YAML from 'yaml';
import { routeSkills } from '../src/northstar/routing.js';

describe('native skill routing', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const temporaryRoots: string[] = [];
  afterEach(() => { for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

  const facts = (packages: string[] = [], frameworks: string[] = [], schemas: string[] = []) => ({ manifests: ['package.json'], packages, frameworks, schemas, changed_files: [] });

  function fixtureGraph(requires: Record<string, string[]>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-routing-'));
    temporaryRoots.push(root);
    const nodes = Object.entries(requires).map(([slug, dependencies]) => {
      const source = `skills/${slug}/SKILL.md`;
      const file = path.join(root, ...source.split('/'));
      const body = `---\nname: ${slug}\ndescription: fixture\nmetadata:\n  signals: ${slug}\n---\n# ${slug}\n`;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      const hash = createHash('sha256').update(body).digest('hex');
      return { id: `skill:${slug}`, layer: 'skills', source, source_hash: hash, routing_source: source, routing_hash: hash, routing: { signals: [slug], requires: dependencies } };
    });
    fs.mkdirSync(path.join(root, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(root, 'generated', 'context-graph.json'), JSON.stringify({ version: 3, nodes }));
    return root;
  }

  // ── explicit-routing fixtures: deterministic, no phraseHit-as-semantic ──
  it('routes explicit skill IDs deterministically', () => {
    const routes = routeSkills({ prompt: '', explicitSkills: ['security-review'] }, repoRoot);
    const ids = routes.map((r) => r.id);
    expect(ids).toContain('security-review');
    // requires closure pulls the declared dependency
    expect(ids).toContain('verification-router');
  });

  it('routes explicit skills even when the prompt text is neutral', () => {
    const ids = routeSkills({ prompt: 'Unrelated neutral wording', explicitSkills: ['plan-and-handoff'] }, repoRoot).map((r) => r.id);
    expect(ids).toContain('plan-and-handoff');
  });

  it('uses requested mode deterministically (plan → plan-and-handoff)', () => {
    const ids = routeSkills({ prompt: 'Continue with the accepted task', requestedMode: 'plan' }, repoRoot).map((r) => r.id);
    expect(ids).toContain('plan-and-handoff');
    expect(ids).not.toContain('verification-router');
  });

  it('uses requested mode deterministically (qa → verification-router)', () => {
    const ids = routeSkills({ prompt: 'Continue with the accepted task', requestedMode: 'qa' }, repoRoot).map((r) => r.id);
    expect(ids[0]).toBe('verification-router');
  });

  it('does not invent semantic activation from prompt text', () => {
    // Old phraseHit tests pretended the router was a semantic classifier.
    // Lock 1: implicit semantic activation belongs to the host-native model
    // reading the exact skill name/description — never a runtime classifier.
    const ids = routeSkills({ prompt: 'Refactor postgres query cache drawer backend service and schema layout' }, repoRoot).map((r) => r.id);
    expect(ids).not.toContain('database-stack'); // retired
    expect(ids).not.toContain('frontend-composition'); // retired
  });

  it('does not auto-load supports and requires explicit project scope for 5fedu', () => {
    const supported = routeSkills({ prompt: 'Run the requested check', explicitSkills: ['parity-verification'] }, repoRoot).map((route) => route.id);
    expect(supported).toContain('parity-verification');

    expect(routeSkills({ prompt: 'Audit 5fedu module parity' }, repoRoot).map((route) => route.id)).not.toContain('5fedu-module-parity');
    expect(routeSkills({ prompt: 'Audit 5fedu module parity', activeProjectScope: '5fedu' }, repoRoot).map((route) => route.id)).toContain('5fedu-module-parity');
  });

  it('fails closed for missing or cyclic required skills', () => {
    expect(() => routeSkills({ prompt: '', explicitSkills: ['first'] }, fixtureGraph({ first: ['missing'] }))).toThrow(/dependency is missing/);
    expect(() => routeSkills({ prompt: '', explicitSkills: ['first'] }, fixtureGraph({ first: ['second'], second: ['first'] }))).toThrow(/dependency cycle/);
  });

  // ── static description proof owner: use case + near-miss boundary ───────
  it('descriptions state the use case and a near-miss boundary', () => {
    const registry = YAML.parse(fs.readFileSync(path.join(repoRoot, 'registry', 'skills.yaml'), 'utf8'));
    for (const entry of registry.skills) {
      if (entry.lifecycle !== 'active' || entry.origin !== 'internal') continue;
      const skillFile = path.join(repoRoot, 'skills', entry.id, 'SKILL.md');
      const body = fs.readFileSync(skillFile, 'utf8').replace(/^\uFEFF/, '');
      const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      expect(fm, `${entry.id} must have frontmatter`).toBeTruthy();
      const meta = YAML.parse(fm![1]!) ?? {};
      expect(typeof meta.name).toBe('string');
      expect(meta.name).toBe(entry.id);
      expect(typeof meta.description).toBe('string');
      expect(meta.description!.length).toBeGreaterThan(40);
      // near-miss boundary: every internal procedure names what it is NOT for
      expect(meta.metadata?.excludes).toBeTruthy();
    }
  });

  it('retired aliases are not selectable', () => {
    const active = routeSkills({ prompt: '', explicitSkills: ['security-review'] }, repoRoot).map((route) => route.id);
    for (const slug of ['finish-to-completion', 'database-stack', 'frontend-composition', 'mobile-composition', 'infra-devops-composition', 'browser-qa', 'ui-taste', 'master-image-generation', 'qa-skills', 'quality']) {
      expect(active).not.toContain(slug);
      expect(fs.existsSync(path.join(repoRoot, 'skills', slug, 'SKILL.md'))).toBe(false);
    }
  });

  it('renamed skills keep their canonical folder and frontmatter name', () => {
    for (const [folder, id] of [['skill-source-governance', 'skill-source-governance'], ['backend-change-boundaries', 'backend-change-boundaries']]) {
      const skillFile = path.join(repoRoot, 'skills', folder, 'SKILL.md');
      expect(fs.existsSync(skillFile)).toBe(true);
      const body = fs.readFileSync(skillFile, 'utf8');
      expect(body).toMatch(new RegExp(`^name: ${id}$`, 'm'));
    }
  });

  it('uses registry governance plus exact SKILL.md content for global routing', () => {
    const graph = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', 'context-graph.json'), 'utf8')) as { nodes: Array<{ id: string; layer: string; source: string; routing_source: string }> };
    for (const node of graph.nodes.filter((node) => node.layer === 'skills' && !node.source.startsWith('profiles/'))) {
      expect(node.source).toMatch(/^skills\/[^/]+\/SKILL\.md$/);
      expect(node.routing_source).toBe('registry/skills.yaml');
      expect(fs.existsSync(path.join(repoRoot, node.source.replaceAll('/', path.sep).replace('SKILL.md', 'ROUTE.json')))).toBe(false);
    }
  });

  it('affected scope filters compatibility without activating', () => {
    // no generic upstream skill activates purely from environment facts
    const ids = routeSkills({ prompt: 'Prisma database work', affectedScope: { stacks: ['prisma'] } }, repoRoot).map((r) => r.id);
    expect(ids).not.toContain('prisma-client-api');
    // explicit skill still wins
    const explicit = routeSkills({ prompt: 'Prisma database work', explicitSkills: ['prisma-client-api'], affectedScope: { stacks: ['prisma'] } }, repoRoot).map((r) => r.id);
    expect(explicit).toContain('prisma-client-api');
  });
});
