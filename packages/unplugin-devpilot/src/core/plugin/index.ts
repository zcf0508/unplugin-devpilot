import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DevpilotPluginContext {
  wsPort: number
}

/**
 * Resolve the module path relative to the plugin to an absolute path
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
  const __dirname = dirname(fileURLToPath(importMetaUrl));
  return `${__dirname}/${relativePath}`;
}

export type { McpToolRegister as McpServerRegister } from './mcp';
export { defineMcpToolRegister } from './mcp';
