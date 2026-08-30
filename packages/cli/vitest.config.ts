import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/host-adapters-contract.test.ts',
      'test/index.test.ts',
      'test/install.test.ts',
      'test/operator-ux.test.ts',
      'test/parity.test.ts',
      'test/route-native.test.ts',
      'test/static-candidate.test.ts',
      'test/integration/framework.test.ts',
      'test/integration/npm-handler.test.ts',
      'test/integration/provisioning.test.ts',
      'test/integration/shell-handler.test.ts',
      'test/runtime/mcp-convergence.test.ts',
      'test/runtime/native-wiring.test.ts',
    ],
  },
});
