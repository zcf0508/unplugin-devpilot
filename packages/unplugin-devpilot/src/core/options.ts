import type { DevpilotPluginContext, McpServerRegister } from './plugin';
import { checkPort, getRandomPort } from 'get-port-please';

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
  /**
   * Setup server-side RPC methods for this plugin
   * These methods can be called from the client via rpcCall()
   */
  serverSetup?: (ctx: DevpilotPluginContext) => Record<string, (...args: any[]) => any>
  mcpSetup?: (ctx: DevpilotPluginContext) => Array<McpServerRegister>
}

export interface Options {
  wsPort?: number
  mcpPort?: number
  plugins?: DevpilotPlugin[]
}

export type OptionsResolved = Required<Options>;

export async function resolveOptions(options: Options): Promise<OptionsResolved> {
  // wsPort: use specified port if available, otherwise randomly allocate
  let wsPort: number;
  if (options.wsPort !== undefined) {
    const wsPortInUse = await checkPort(options.wsPort);
    if (wsPortInUse === false) {
      wsPort = options.wsPort;
    }
    else {
      wsPort = await getRandomPort();
    }
  }
  else {
    wsPort = await getRandomPort();
  }

  // mcpPort checks if the specified port (or default 3101) is available
  // If occupied, throw an error
  const preferredMcpPort = options.mcpPort || 3101;
  const portAvailable = await checkPort(preferredMcpPort);

  if (portAvailable === false) {
    throw new Error(
      `MCP port ${preferredMcpPort} is already in use. Please specify a different port or free up the port.`,
    );
  }

  return {
    wsPort,
    mcpPort: preferredMcpPort,
    plugins: options.plugins || [],
  };
}
