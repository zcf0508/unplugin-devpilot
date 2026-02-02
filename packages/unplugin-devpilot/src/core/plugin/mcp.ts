import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

/** @internal */
export type McpToolRegister = <
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
  cb: NoInfer<ToolCallback<InputArgs>>
});

export function defineMcpToolRegister<
  OutputArgs extends ZodRawShapeCompat | AnySchema,
  InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined,
>(name: string, config: {
  title?: string
  description?: string
  inputSchema?: InputArgs
  outputSchema?: OutputArgs
  annotations?: ToolAnnotations
  _meta?: Record<string, unknown>
}, cb: ToolCallback<InputArgs>): () => ({
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
}) {
  return () => ({
    name,
    config,
    cb,
  });
}
