/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^vitest$': '<rootDir>/test/vitest-shim.js',
    '^\\./helpers/(.*)\\.js$': '<rootDir>/test/helpers/$1.ts',
  },
  // Custom resolver: when an ESM import requests `./foo.js` or `../foo.js`, and a
  // matching `.ts` file exists under this package, return that path. Without this
  // hook Jest's default resolver looks for the literal `.js` file and fails,
  // because TypeScript's NodeNext module resolution rewrites source imports to
  // `.js` extensions while the project still ships `.ts` source.
  resolver: '<rootDir>/test/jest-resolver.cjs',
  transform: {
    '^.+\\.m?[jt]sx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!@jest/globals)',
  ],
  testTimeout: 20000,
};
