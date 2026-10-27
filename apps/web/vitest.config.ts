import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    env: {
      MONGODB_URI: 'mongodb://127.0.0.1:27017/mba-antisocial-test',
      AUTH_SECRET: 'test-secret-that-is-long-enough-for-hkdf',
      APP_URL: 'http://localhost:3000',
    },
  },
});
