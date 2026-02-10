import type { DevpilotPluginContext, McpServerRegister } from './plugin';
import { checkPort, getRandomPort } from 'get-port-please';

let lastResolvedWsPort: number | undefined;
let lastResolvedMcpPort: number | undefined;

export function resetLastResolvedPorts(): void {
  lastResolvedWsPort = undefined;
  lastResolvedMcpPort = undefined;
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
  /**
   * Setup server-side RPC methods for this plugin
   * These methods can be called from the client via rpcCall()
   */
  serverSetup?: (ctx: DevpilotPluginContext) => Record<string, (...args: any[]) => any>
  mcpSetup?: (ctx: DevpilotPluginContext) => Array<McpServerRegister>
  /**
   * The skill module path to be injected
   * - npm package path: 'my-plugin/skill'
   * - absolute path: '/path/to/skill.md'
   *
   * Note: relative paths need to be resolved to absolute paths first
   * @example
   * ```ts
   * import { resolveSkillModule } from 'unplugin-devpilot'
   *
   * skillModule: resolveSkillModule(import.meta.url, './skill.md')
   * ```
   */
  skillModule?: string | ((ctx: DevpilotPluginContext) => string)
}

export interface Options {
  wsPort?: number
  mcpPort?: number
  plugins?: DevpilotPlugin[]
  /**
   * The paths to generate the core skill files
   * - directory path: './.github/skills/devpilot' (will generate SKILL.md in this directory)
   * - file path: './.github/skills/devpilot/SKILL.md' (will generate the specified file)
   *
   * If not specified, no core skill file will be generated
   * @example
   * ```ts
   * Devpilot({
   *   skillPaths: ['./.github/skills/devpilot', './.cursor/skills/devpilot'],
   *   plugins: [],
   * })
   * ```
   */
  skillPaths?: string[]
}

export type OptionsResolved = Required<Omit<Options, 'skillPaths'>> & Pick<Options, 'skillPaths'>;

export async function resolveOptions(options: Options): Promise<OptionsResolved> {
  const wsPort = await resolveWsPort(options.wsPort);
  const mcpPort = await resolveMcpPort(options.mcpPort);

  lastResolvedWsPort = wsPort;
  lastResolvedMcpPort = mcpPort;

  return {
    wsPort,
    mcpPort,
    plugins: options.plugins || [],
    skillPaths: options.skillPaths || [],
  };
}

async function resolveWsPort(preferred?: number): Promise<number> {
  const candidate = preferred ?? lastResolvedWsPort;
  if (candidate !== undefined) {
    const available = await checkPort(candidate);
    if (available !== false) {
      return candidate;
    }
    if (candidate === lastResolvedWsPort) {
      return candidate;
    }
  }
  if (lastResolvedWsPort !== undefined) {
    return lastResolvedWsPort;
  }
  return getRandomPort();
}

async function resolveMcpPort(preferred?: number): Promise<number> {
  const candidate = preferred || 3101;
  if (candidate === lastResolvedMcpPort) {
    return candidate;
  }
  const available = await checkPort(candidate);
  if (available === false) {
    throw new Error(
      `MCP port ${candidate} is already in use. Please specify a different port or free up the port.`,
    );
  }
  return candidate;
}
