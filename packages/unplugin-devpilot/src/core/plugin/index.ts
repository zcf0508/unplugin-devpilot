import type { Storage } from 'unstorage';
import type { OptionsResolved } from '../options';
import process from 'node:process';
import { getPluginStorage } from '../storage';
import { resolveModule } from '../utils';

let pluginRoot = process.cwd();
let pluginMode = process.env.NODE_ENV ?? 'development';
let pluginEnv: Record<string, string | undefined> = { ...process.env };

export interface DevpilotPluginContext {
  wsPort: number
  storage: Storage
  /** Optional in the compatibility type; plugin callbacks receive a resolved context. */
  root?: string
  /** Optional in the compatibility type; plugin callbacks receive a resolved context. */
  mode?: string
  /**
   * Optional in the compatibility type; server-side plugin callbacks receive this field.
   * It may contain secrets and is never passed to clientModule.
   */
  env?: Record<string, string | undefined>
}

export interface DevpilotResolvedPluginContext extends DevpilotPluginContext {
  /** Vite's configResolved.root, or process.cwd() for other bundlers. */
  root: string
  /** Vite's configResolved.mode, or NODE_ENV ?? 'development' for other bundlers. */
  mode: string
  /** All server environment variables, including values loaded from Vite .env files. */
  env: Record<string, string | undefined>
}

/**
 * Update the shared plugin context from Vite's resolved configuration.
 * Vite process variables take precedence over values loaded from .env files.
 */
export async function configurePluginContext(config: {
  root: string
  mode: string
  envDir?: string | false
}): Promise<void> {
  const { loadEnv } = await import('vite');
  const envDir = typeof config.envDir === 'string'
    ? config.envDir
    : config.root;
  pluginRoot = config.root;
  pluginMode = config.mode;
  pluginEnv = {
    ...loadEnv(config.mode, envDir, ''),
    ...process.env,
  };
}

export type DevpilotClientContext = Omit<DevpilotResolvedPluginContext, 'env'>;

export function buildPluginContext(options: Pick<OptionsResolved, 'wsPort'>, namespace: string): DevpilotResolvedPluginContext {
  return {
    wsPort: options.wsPort,
    storage: getPluginStorage(namespace),
    root: pluginRoot,
    mode: pluginMode,
    env: { ...pluginEnv },
  };
}

export function buildClientPluginContext(options: Pick<OptionsResolved, 'wsPort'>, namespace: string): DevpilotClientContext {
  const { env: _env, ...context } = buildPluginContext(options, namespace);
  return context;
}

export function resetPluginContext(): void {
  pluginRoot = process.cwd();
  pluginMode = process.env.NODE_ENV ?? 'development';
  pluginEnv = { ...process.env };
}

/**
 * Resolve the module path relative to the plugin to an absolute path
 * Handles cross-platform paths (Windows, macOS, Linux) and proper escaping for imports
 * @param importMetaUrl - Pass in import.meta.url
 * @param relativePath - Path relative to the plugin
 * @example
 * ```ts
 * import { resolveClientModule } from 'unplugin-devpilot'
 *
 * export function myPlugin(): DevpilotPlugin {
 *   return {
 *     name: 'my-plugin',
 *     clientModule: resolveClientModule(import.meta.url, './client.mjs'),
 *   }
 * }
 * ```
 */
export function resolveClientModule(importMetaUrl: string, relativePath: string): string {
  return resolveModule(importMetaUrl, relativePath);
}

export type { McpToolRegister, McpToolRegisterTyped, McpToolResolved } from './mcp';
