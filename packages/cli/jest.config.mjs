/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^vitest$': '<rootDir>/test/vitest-shim.js',
    '^../src/(.*)\\.js$': '<rootDir>/src/$1.ts',
    '^\\./helpers/(.*)\\.js$': '<rootDir>/test/helpers/$1.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
