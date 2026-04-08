import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
    include: [
      'test/**/*.test.js',
      'packages/*/test/**/*.test.js'
    ],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.js', 'packages/*/lib/**/*.js'],
      exclude: ['lib/adapters/couchdb*.js']
    }
  }
});
