import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/health-contract.test.ts',
      'test/materiality.test.ts',
      'test/native-turn-router.test.ts',
      'test/repo-facts.test.ts',
      'test/rule-enforcement.test.ts',
      'test/skill-contract-and-routing.test.ts',
      'test/skill-resolver-call-count.test.ts',
      'test/skill-registry.test.ts',
      'test/task-state.test.ts',
      'test/plan-contract.test.ts',
      'test/skill-folder-hash.test.ts',
      'test/proof-surface-mapping.test.ts',
      'test/harness-degradation.test.ts',
      'test/northstar/proof-receipt.test.ts',
    ],
  },
});
