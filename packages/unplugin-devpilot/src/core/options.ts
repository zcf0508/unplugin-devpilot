export interface DevpilotPluginContext {
  wsPort: number
}

export interface DevpilotPlugin {
  namespace: string
  /**
   * The client module path to be injected
   * - npm package path: 'my-plugin/client'
   * - absolute path: '/path/to/client.ts'
   *
   * Note: relative paths need to be resolved to absolute paths first
   * @example
   * ```ts
   * import { resolveClientModule } from 'unplugin-devpilot'
   *
   * clientModule: resolveClientModule(import.meta.url, './client.ts')
   * ```
   */
  clientModule?: string | ((ctx: DevpilotPluginContext) => string)
}

export interface Options {
  wsPort?: number
  mcpPort?: number
  plugins?: DevpilotPlugin[]
}

export type OptionsResolved = Required<Options>;

export function resolveOptions(options: Options): OptionsResolved {
  return {
    wsPort: options.wsPort || 3100,
    mcpPort: options.mcpPort || 3101,
    plugins: options.plugins || [],
  };
}
