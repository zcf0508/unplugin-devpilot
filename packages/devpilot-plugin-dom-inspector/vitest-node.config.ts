import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'unplugin-devpilot': resolve(__dirname, '../unplugin-devpilot/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    exclude: ['tests/client/**/*.spec.ts'],
  },
});
