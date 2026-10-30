/**
 * Live integration tests (`live.test.ts` files) run in plain Node, outside the React
 * Native test environment, so they use Node's own fetch and WebSocket against the real API.
 * See src/api/http/__tests__/live.test.ts for the variables they need.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/__tests__/live.test.ts'],
  transform: { '\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
