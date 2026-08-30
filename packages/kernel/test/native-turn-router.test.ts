import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { NATIVE_TURN_ROUTER_VERSION, routeNativeTurn, type NativeTurnRequest } from '../src/northstar/native-turn-router.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const validate = new Ajv2020({ allErrors: true }).compile(JSON.parse(fs.readFileSync(path.join(repoRoot, 'schemas/route-capsule.schema.json'), 'utf8')));
const request = (over: Partial<NativeTurnRequest> = {}): NativeTurnRequest => ({
  protocol_version: '2.0',
  host: 'omp',
  session_id: 'session-1',
  turn_id: 'turn-1',
  cwd: repoRoot,
  prompt: 'Review database migration safety',
  host_facts: { model: { provider: 'owner', model_id: 'selected-model' } },
  ...over,
});

describe('native turn router', () => {
  it('returns the compact schema and preserves the owner-selected model', () => {
    const capsule = routeNativeTurn(request()).capsule;
    expect(validate(capsule), JSON.stringify(validate.errors)).toBe(true);
    expect(capsule.status).toBe('READY');
    expect(capsule.model.requested).toBe('owner/selected-model');
    expect(capsule.model.observed).toBeNull();
    expect(capsule.observed.router_version).toBe(NATIVE_TURN_ROUTER_VERSION);
  });

  it('is idempotent for the same turn and distinct for another turn', () => {
    const first = routeNativeTurn(request()).capsule;
    const again = routeNativeTurn(request()).capsule;
    const next = routeNativeTurn(request({ turn_id: 'turn-2' })).capsule;
    expect(again.route_id).toBe(first.route_id);
    expect(again.identity).toEqual(first.identity);
    expect(next.route_id).not.toBe(first.route_id);
  });

  it('routes matching skills exactly once through the broker', () => {
    const capsule = routeNativeTurn(request({ prompt: 'Optimize a Postgres query using Prisma' })).capsule;
    expect(capsule.skills.map((skill) => skill.id)).toContain('database-stack');
    expect(capsule.context.rendered).toContain('## Skill: database-stack');
  });

  it('does not auto-route explicit-only integrations', () => {
    const capsule = routeNativeTurn(request({ prompt: 'Draw this in Pencil' })).capsule;
    expect(capsule.integrations.some((entry) => entry.provider === 'pencil-mcp')).toBe(false);
  });

  it('rejects empty input without creating plan or ticket state', () => {
    expect(() => routeNativeTurn(request({ prompt: ' ' }))).toThrow(/must not be empty/);
  });
});
