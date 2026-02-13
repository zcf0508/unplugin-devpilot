import type { Storage } from 'unstorage';
import { resolveModule } from '../utils';

export interface DevpilotPluginContext {
  wsPort: number
  storage: Storage
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

export type { McpToolRegister, McpToolResolved } from './mcp';
