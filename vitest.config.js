import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.js'],
      exclude: ['lib/adapters/couchdb*.js']
    }
  }
});
