import { resolve } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'unplugin-devpilot': resolve(__dirname, '../unplugin-devpilot/src'),
    },
  },
  test: {
    globals: true,
    include: ['tests/client/**/*.spec.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      // at least one instance is required
      instances: [
        { browser: 'chromium', headless: true },
      ],
    },
  },
});
