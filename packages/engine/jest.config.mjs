/** @type {import('jest').Config} */
const config = {
  // maxWorkers:1 == runInBand (serial, no parallelism)
  maxWorkers: 1,
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'P:/agent-rules/node_modules/ts-jest',
        {
          useESM: true,
          emitESM: true,
          isolatedModules: true,
          diagnostics: {
            // Type errors from existing test suite; skip to focus on runtime behavior
            ignoreCodes: [151002, 2790, 2741],
          },
          tsconfig: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          skipLibCheck: true,
          outDir: '<rootDir>/dist',
          rootDir: '<rootDir>',
        },
      },
    ],
  },
  // Vitest globals shim — all 82 test files import from 'vitest'
  moduleNameMapper: {
    '^vitest$': '<rootDir>/jest-vitest-globals.ts',
    '^vitest/globals$': '<rootDir>/jest-vitest-globals.ts',
    // NodeNext tests import '../src/foo.js' — map to compiled dist output
    '^(.*)src(.*)\\.js$': '$1dist$2.js',
  },
  testMatch: ['**/test/**/*.test.ts'],
  testTimeout: 10_000,
};

export default config;
