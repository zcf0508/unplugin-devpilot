import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DevpilotPluginContext {
  wsPort: number
}

export type McpServerRegister = <
  OutputArgs extends ZodRawShapeCompat | AnySchema,
  InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined,
>() => ({
  name: string
  config: {
    title?: string
    description?: string
    inputSchema?: InputArgs
    outputSchema?: OutputArgs
    annotations?: ToolAnnotations
    _meta?: Record<string, unknown>
  }
  cb: ToolCallback<InputArgs>
});

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
 *     clientModule: resolveClientModule(import.meta.url, './client.ts'),
 *   }
 * }
 * ```
 */
export function resolveClientModule(importMetaUrl: string, relativePath: string): string {
  const __dirname = dirname(fileURLToPath(importMetaUrl));
  return `${__dirname}/${relativePath}`;
}
