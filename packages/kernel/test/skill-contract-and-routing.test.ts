import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { routeSkills } from '../src/northstar/routing.js';

describe('native skill routing', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  it('suppresses near-miss UI triggers while routing the database skill', () => {
    const routes = routeSkills({ prompt: 'Refactor postgres query cache drawer backend service and schema layout' }, repoRoot);
    const skillIds = routes.map((r) => r.id);

    // Must NOT activate UI/frontend skills purely because of words like 'drawer' or 'layout'
    expect(skillIds).not.toContain('frontend-architect');
    expect(skillIds).not.toContain('browser-qa');
    expect(skillIds).toContain('database-stack');
  });

  it('does not auto-load supports and requires explicit domain scope for 5fedu', () => {
    const supported = routeSkills({ prompt: 'Run the requested check', explicitSkills: ['parity-verification'] }, repoRoot).map((route) => route.id);
    expect(supported).toContain('parity-verification');
    expect(supported).not.toContain('browser-qa');
    expect(supported).not.toContain('qa-skills');

    expect(routeSkills({ prompt: 'Audit 5fedu module parity' }, repoRoot).map((route) => route.id)).not.toContain('5fedu-module-parity');
    expect(routeSkills({ prompt: 'Audit 5fedu module parity', activeProjectScope: '5fedu' }, repoRoot).map((route) => route.id)).toContain('5fedu-module-parity');
  });

  it('routes cold-start cross-host handoff planning to plan-and-handoff', () => {
    const routes = routeSkills({ prompt: 'Create a cold-start portable cross-host handoff plan for another implementation session' }, repoRoot);
    const ids = routes.map((route) => route.id);
    expect(ids).toContain('plan-and-handoff');
    expect(ids).not.toContain('finish-to-completion');
  });

  it('routes execution of a pasted portable plan to finish-to-completion', () => {
    const routes = routeSkills({ prompt: 'Execute this pasted portable plan end to end without phase relay' }, repoRoot);
    expect(routes.map((route) => route.id)).toContain('finish-to-completion');
  });
});
