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

  it('routes explicit skills exactly once through the broker', () => {
    const capsule = routeNativeTurn(request({ prompt: 'Optimize a Prisma query', explicit: { skills: ['prisma-client-api'] } })).capsule;
    expect(capsule.skills.map((skill) => skill.id)).toContain('prisma-client-api');
    expect(capsule.context.rendered).toContain('## Skill: prisma-client-api');
  });

  it('forwards requested mode to skill routing', () => {
    expect(routeNativeTurn(request({ prompt: 'Continue with the accepted task', requested_mode: 'plan' })).capsule.skills.map((skill) => skill.id)).toContain('plan-and-handoff');
    // execute mode routes no generic skill (Lock 1); explicit skills still win
    const execute = routeNativeTurn(request({ prompt: 'Continue with the accepted task', requested_mode: 'execute', explicit: { skills: ['schema-migration'] } })).capsule.skills.map((skill) => skill.id);
    expect(execute).toContain('schema-migration');
    expect(execute).not.toContain('finish-to-completion');
    const qa = routeNativeTurn(request({ prompt: 'Continue with the accepted task', requested_mode: 'qa' })).capsule.skills.map((skill) => skill.id);
    expect(qa[0]).toBe('verification-router');
    expect(qa).not.toContain('finish-to-completion');
    expect(qa).not.toContain('plan-and-handoff');
  });

  it('forwards affected scope without activating generic skills', () => {
    const capsule = routeNativeTurn(request({ prompt: 'Prisma database work', explicit: { affected_scope: { stacks: ['prisma'] } } })).capsule;
    expect(capsule.skills.map((skill) => skill.id)).not.toContain('prisma-client-api');
  });

  it('does not auto-route explicit-only integrations', () => {
    const capsule = routeNativeTurn(request({ prompt: 'Draw this in Pencil' })).capsule;
    expect(capsule.integrations.some((entry) => entry.provider === 'pencil-mcp')).toBe(false);
  });

  it('rejects empty input without creating plan or ticket state', () => {
    expect(() => routeNativeTurn(request({ prompt: ' ' }))).toThrow(/must not be empty/);
  });
});
