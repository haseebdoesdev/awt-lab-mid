import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
      BCRYPT_ROUNDS: '4',
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
    },
    // The first run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 120_000,
    testTimeout: 15_000,
  },
});
