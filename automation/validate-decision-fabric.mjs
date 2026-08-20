#!/usr/bin/env node
import { decide, compareDecisionFabric } from '../packages/kernel/dist/northstar/decision-fabric.js';

const packet = {
  protocol_version: '2.0',
  task_id: 'T-df-self-test',
  spec_id: 'S-df-self-test',
  spec_revision: 1,
  work_id: 'W-df-self-test',
  execution_generation: 0,
  phase: 'verify',
  goal: 'Verify a bounded implementation',
  requirements: ['R-001'],
  scope: { owned: ['src'], forbidden: [] },
  acceptance: [{ claim_id: 'C-001', verifier_id: 'V-001' }],
};
const spec = {
  protocol_version: '2.0',
  spec_id: 'S-df-self-test',
  revision: 1,
  work_id: 'W-df-self-test',
  requirements: [{ id: 'R-001', statement: 'bounded implementation', mandatory: true, claims: ['C-001'] }],
  risk_class: 'S1',
};

const active = decide({ packet, spec, mode: 'active', repoFacts: null });
if (active.phase !== 'verify') throw new Error('Decision Fabric must honor explicit TaskPacket.phase');
if (active.skills.length !== 0) throw new Error('normal Decision Fabric routing must keep skills empty without explicit skill data');
if (!active.policies.includes('execution.current-generation-only')) throw new Error('Decision Fabric must carry execution authority policy');
const shadow = compareDecisionFabric({ ...active, mode: 'shadow' }, { skills: ['quality'], capabilities: active.capabilities });
if (!shadow.differences.includes('skills:quality')) throw new Error('shadow routing must record legacy/typed skill differences');
console.log('PASS: Decision Fabric typed phase, empty-skill default, authority policy, and shadow diff');
