import { copyFileSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: [
      'src/*.ts',
    ],
    dts: true,
  },
  {
    entry: [
      'src/client/index.ts',
    ],
    outDir: 'dist/client',
  },
]);
