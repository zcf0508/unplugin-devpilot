import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildClientPluginContext, buildPluginContext, configurePluginContext, resetPluginContext } from '../src/core/plugin';

describe('plugin context environment', () => {
  let root: string | undefined;
  const originalToken = process.env.DEVPILOT_CONTEXT_TEST_TOKEN;

  beforeEach(() => resetPluginContext());

  afterEach(async () => {
    if (originalToken === undefined) {
      delete process.env.DEVPILOT_CONTEXT_TEST_TOKEN;
    }
    else {
      process.env.DEVPILOT_CONTEXT_TEST_TOKEN = originalToken;
    }
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = undefined;
    }
    resetPluginContext();
  });

  it('provides process defaults for non-Vite bundlers', () => {
    const context = buildPluginContext({ wsPort: 4321 }, 'test-plugin');

    expect(context.root).toBe(process.cwd());
    expect(context.mode).toBe(process.env.NODE_ENV ?? 'development');
    expect(context.env).not.toBe(process.env);
    expect(context.env.NODE_ENV).toBe(process.env.NODE_ENV);
  });

  it('does not expose server env to clientModule context', async () => {
    root = await mkdtemp(join(tmpdir(), 'devpilot-context-'));
    await configurePluginContext({ root, mode: 'staging' });
    const context = buildClientPluginContext({ wsPort: 4321 }, 'test-plugin');

    expect(context.root).toBe(root);
    expect(context).not.toHaveProperty('env');
  });

  it('uses Vite envDir when it differs from the project root', async () => {
    root = await mkdtemp(join(tmpdir(), 'devpilot-context-'));
    const envDir = join(root, 'config');
    await mkdir(envDir);
    await writeFile(join(envDir, '.env.staging'), 'DEVPILOT_CONTEXT_DIR=from-env-dir\n');

    await configurePluginContext({ root, mode: 'staging', envDir });
    const context = buildPluginContext({ wsPort: 4321 }, 'test-plugin');

    expect(context.root).toBe(root);
    expect(context.env.DEVPILOT_CONTEXT_DIR).toBe('from-env-dir');
  });

  it('loads Vite env from its resolved root and mode while preserving process values', async () => {
    root = await mkdtemp(join(tmpdir(), 'devpilot-context-'));
    await writeFile(join(root, '.env'), 'DEVPILOT_CONTEXT_TEST_TOKEN=from-env\nDEVPILOT_CONTEXT_BASE=base\n');
    await writeFile(join(root, '.env.staging'), 'DEVPILOT_CONTEXT_MODE=staging\n');
    process.env.DEVPILOT_CONTEXT_TEST_TOKEN = 'from-process';

    await configurePluginContext({ root, mode: 'staging' });
    const context = buildPluginContext({ wsPort: 4321 }, 'test-plugin');

    expect(context.root).toBe(root);
    expect(context.mode).toBe('staging');
    expect(context.env).toMatchObject({
      DEVPILOT_CONTEXT_TEST_TOKEN: 'from-process',
      DEVPILOT_CONTEXT_BASE: 'base',
      DEVPILOT_CONTEXT_MODE: 'staging',
    });
  });
});
