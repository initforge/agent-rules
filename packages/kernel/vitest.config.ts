import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/health-contract.test.ts',
      'test/native-turn-router.test.ts',
      'test/rule-enforcement.test.ts',
      'test/skill-contract-and-routing.test.ts',
      'test/skill-resolver-call-count.test.ts',
      'test/northstar/proof-receipt.test.ts',
    ],
  },
});
