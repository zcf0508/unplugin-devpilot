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
    dts: true,
    hooks: {
      'build:done': () => {
        mkdirSync('dist/client', { recursive: true });
        copyFileSync('src/client/virtual.d.ts', 'dist/client/virtual.d.ts');
      },
    },
  },
]);
