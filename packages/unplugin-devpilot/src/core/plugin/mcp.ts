import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export interface McpToolConfig {
  title?: string
  description?: string
  inputSchema?: ZodRawShapeCompat | AnySchema
  outputSchema?: ZodRawShapeCompat | AnySchema
  annotations?: ToolAnnotations
  _meta?: Record<string, unknown>
}

// 存储用的宽松类型 - 用于内部存储和遍历
export interface McpToolRegister {
  name: string
  config: McpToolConfig
  cb: (...args: any[]) => any
}

// 定义工具时返回的完整类型 - 保留完整的类型推断
export interface McpToolRegisterTyped<InputArgs, OutputArgs> extends McpToolRegister {
  name: string
  config: McpToolConfig & { inputSchema?: InputArgs, outputSchema?: OutputArgs }
  cb: InputArgs extends ZodRawShapeCompat | AnySchema | undefined ? ToolCallback<InputArgs> : ToolCallback
}

export type McpToolRegisterFn = <
  OutputArgs extends ZodRawShapeCompat | AnySchema,
  InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined,
>(name: string,
  config: {
    title?: string
    description?: string
    inputSchema?: InputArgs
    outputSchema?: OutputArgs
    annotations?: ToolAnnotations
    _meta?: Record<string, unknown>
  },
  cb: ToolCallback<InputArgs>,
) => () => McpToolRegisterTyped<InputArgs, OutputArgs>;

export interface McpToolResolved {
  name: string
  config: {
    title?: string
    description?: string
    inputSchema?: ZodRawShapeCompat
    outputSchema?: ZodRawShapeCompat | AnySchema
    annotations?: ToolAnnotations
    _meta?: Record<string, unknown>
  }
  cb: ToolCallback<ZodRawShapeCompat>
}

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
}, cb: ToolCallback<InputArgs>): () => McpToolRegisterTyped<InputArgs, OutputArgs> {
  return () => ({
    name,
    config,
    cb,
  } as McpToolRegisterTyped<InputArgs, OutputArgs>);
}
