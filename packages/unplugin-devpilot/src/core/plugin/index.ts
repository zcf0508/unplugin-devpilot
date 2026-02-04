import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface DevpilotPluginContext {
  wsPort: number
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
  const __dirname = dirname(fileURLToPath(importMetaUrl));
  const absolutePath = join(__dirname, relativePath);
  // Convert to file URL and then to string for proper escaping and import compatibility
  return pathToFileURL(absolutePath).href;
}

export type { McpToolRegister as McpServerRegister } from './mcp';
export { defineMcpToolRegister } from './mcp';
