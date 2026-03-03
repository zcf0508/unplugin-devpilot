import type { UnpluginInstance } from 'unplugin';
import type { DevpilotPlugin, Options, OptionsResolved } from './core/options';
import { WS_PROXY_PATH } from './core/constants';
import process from 'node:process';
import { createUnplugin } from 'unplugin';
import { injectSourceLocation } from './core/code-location-injector';
import { registerPluginMcpRegisterMethods, startMcpServer, stopMcpServer } from './core/mcp-server';
import { resolveOptions } from './core/options';
import { generateCoreSkill } from './core/skill-generator';
import { disposeStorage, getPluginStorage } from './core/storage';
import { registerPluginServerMethods, startWebSocketServer, stopWebSocketServer } from './core/ws-server';

const VIRTUAL_MODULE_ID = 'virtual:devpilot-client';
const RESOLVED_VIRTUAL_MODULE_ID = '\0virtual:devpilot-client';

/**
 * Check if running in test environment
 * Vitest sets: VITEST, TEST, NODE_ENV=test
 */
function isTestEnvironment(): boolean {
  return !!(
    process.env.VITEST
    || process.env.TEST
    || process.env.NODE_ENV === 'test'
  );
}

function getPluginClientModules(plugins: DevpilotPlugin[], options: OptionsResolved): string[] {
  return plugins
    .filter(p => p.clientModule)
    .map((p) => {
      const ctx = { wsPort: options.wsPort, storage: getPluginStorage(p.namespace) };
      const mod = typeof p.clientModule === 'function'
        ? p.clientModule(ctx)
        : p.clientModule!;
      return mod;
    });
}

function generateVirtualClientModule(options: OptionsResolved, isDev: boolean): string {
  // In non-dev mode or test mode, return empty module
  if (!isDev || isTestEnvironment()) {
    return '';
  }

  const pluginModules = getPluginClientModules(options.plugins, options);

  // Generate dynamic imports for all plugin modules
  const importStatements = pluginModules.map((mod, index) =>
    `import { rpcHandlers as handlers_${index} } from '${mod}';`,
  ).join('\n');

  // Generate code to collect all handlers
  const handlerCollection = pluginModules.map((_, index) => `  ...handlers_${index},`).join('\n');

  return `
${importStatements}
import { initDevpilot } from 'unplugin-devpilot/client';

export const wsPort = ${options.wsPort};
export const client = initDevpilot({
  rpcHandlers: {
${handlerCollection}
  }
});
`;
}

let serversStarted = false;
let lastOptions: OptionsResolved | null = null;

async function startServers(rawOptions: Options) {
  const options = await resolveOptions(rawOptions);
  lastOptions = options;
  registerPluginServerMethods(options.plugins);
  registerPluginMcpRegisterMethods(options.plugins);
  if (!serversStarted) {
    serversStarted = true;
    startWebSocketServer(options.wsPort);
    await startMcpServer(options.mcpPort);
  }
  await generateCoreSkill(options, process.env.NODE_ENV !== 'production');
  return options;
}

async function stopServers() {
  if (!serversStarted) { return; }
  serversStarted = false;
  await Promise.all([
    stopWebSocketServer(),
    stopMcpServer(),
  ]);
  if (lastOptions) {
    await generateCoreSkill(lastOptions, false);
  }
  await disposeStorage();
}

export const unpluginDevpilot: UnpluginInstance<Options | undefined, false>
  = createUnplugin((rawOptions = {}) => {
    let options: OptionsResolved | null = null;
    let isDevServer = false;

    const name = 'unplugin-devpilot';

    async function ensureServersStarted(): Promise<OptionsResolved | null> {
      if (options) return options;
      options = await startServers(rawOptions);
      return options;
    }

    return {
      name,

      resolveId(id) {
        if (id === VIRTUAL_MODULE_ID) {
          return RESOLVED_VIRTUAL_MODULE_ID;
        }
      },

      loadInclude(id) {
        return id === RESOLVED_VIRTUAL_MODULE_ID;
      },

      async load(id) {
        if (id === RESOLVED_VIRTUAL_MODULE_ID) {
          // Skip in test mode - return empty module
          if (isTestEnvironment()) {
            return '';
          }

          if (!options) {
            options = await resolveOptions(rawOptions);
          }
          return generateVirtualClientModule(options, process.env.NODE_ENV !== 'production');
        }
      },

      transform(code, id) {
        // Skip in production or test mode
        if (process.env.NODE_ENV === 'production' || isTestEnvironment()) {
          return null;
        }

        // Inject source location into code
        // If code-inspector is present, it will overwrite our injection
        // This is acceptable as code-inspector's injection is more accurate
        const result = injectSourceLocation(code, id);
        if (result) {
          return { code: result };
        }

        return null;
      },

      async buildStart() {
        if (process.env.NODE_ENV === 'production' || isTestEnvironment()) {
          return;
        }
        if (isDevServer) { return; }
        await ensureServersStarted();
      },

      buildEnd() {
        if (isDevServer) { return; }
        return stopServers();
      },

      vite: {
        async configureServer(server) {
          if (isTestEnvironment()) { return; }
          isDevServer = true;
          const opts = await ensureServersStarted();
          if (!opts) return;

          // Auto-configure WebSocket proxy
          const wsUrl = `ws://localhost:${opts.wsPort}`;
          const httpProxyModule = await import('http-proxy');
          const proxy = (httpProxyModule.default || httpProxyModule).createProxyServer({
            target: wsUrl,
            ws: true,
            changeOrigin: true,
          });

          // Handle WebSocket upgrade for proxy
          server.httpServer?.on('upgrade', (req, socket, head) => {
            if (req.url === WS_PROXY_PATH) {
              proxy.ws(req, socket, head);
            }
          });
        },
      },

      webpack(compiler) {
        // Configure dev server proxy before run
        compiler.hooks.beforeRun.tapPromise(name, async () => {
          isDevServer = true;
          const opts = await ensureServersStarted();
          if (!opts) return;

          // Inject proxy config into devServer options
          compiler.options.devServer = compiler.options.devServer || {};
          const devServer = compiler.options.devServer as Record<string, any>;

          // Handle different proxy configurations
          const proxyConfig = {
            context: WS_PROXY_PATH,
            target: `ws://localhost:${opts.wsPort}`,
            ws: true,
            changeOrigin: true,
          };

          if (devServer.proxy === undefined) {
            // No proxy config, create array
            devServer.proxy = [proxyConfig];
          } else if (Array.isArray(devServer.proxy)) {
            // Already an array, check if already exists
            const existingProxy = devServer.proxy.find(
              (p: any) => p && (p.context === WS_PROXY_PATH || p.path === WS_PROXY_PATH),
            );
            if (!existingProxy) {
              devServer.proxy.push(proxyConfig);
            }
          } else if (typeof devServer.proxy === 'object' && devServer.proxy !== null) {
            // Convert object to array
            const existingKeys = Object.keys(devServer.proxy);
            const hasExisting = existingKeys.some(key => key === WS_PROXY_PATH);
            if (!hasExisting) {
              // Convert to array
              const proxyArray = existingKeys.map(key => ({
                context: key,
                ...devServer.proxy[key],
              }));
              proxyArray.push(proxyConfig);
              devServer.proxy = proxyArray;
            }
          }
        });
        compiler.hooks.watchRun.tapPromise(name, async () => {
          isDevServer = true;
          await ensureServersStarted();
        });
        compiler.hooks.shutdown?.tap(name, () => {
          stopServers();
        });
      },

      rspack(compiler) {
        // Configure dev server proxy before run
        compiler.hooks.beforeRun.tapPromise(name, async () => {
          isDevServer = true;
          const opts = await ensureServersStarted();
          if (!opts) return;

          compiler.options.devServer = compiler.options.devServer || {};
          const devServer = compiler.options.devServer as Record<string, any>;

          // Handle different proxy configurations
          const proxyConfig = {
            context: WS_PROXY_PATH,
            target: `ws://localhost:${opts.wsPort}`,
            ws: true,
            changeOrigin: true,
          };

          if (devServer.proxy === undefined) {
            // No proxy config, create array
            devServer.proxy = [proxyConfig];
          } else if (Array.isArray(devServer.proxy)) {
            // Already an array, check if already exists
            const existingProxy = devServer.proxy.find(
              (p: any) => p && (p.context === WS_PROXY_PATH || p.path === WS_PROXY_PATH),
            );
            if (!existingProxy) {
              devServer.proxy.push(proxyConfig);
            }
          } else if (typeof devServer.proxy === 'object' && devServer.proxy !== null) {
            // Convert object to array
            const existingKeys = Object.keys(devServer.proxy);
            const hasExisting = existingKeys.some(key => key === WS_PROXY_PATH);
            if (!hasExisting) {
              // Convert to array
              const proxyArray = existingKeys.map(key => ({
                context: key,
                ...devServer.proxy[key],
              }));
              proxyArray.push(proxyConfig);
              devServer.proxy = proxyArray;
            }
          }
        });
        compiler.hooks.watchRun.tapPromise(name, async () => {
          isDevServer = true;
          await ensureServersStarted();
        });
        compiler.hooks.shutdown?.tap(name, () => {
          stopServers();
        });
      },

      farm: {
        async configureDevServer() {
          isDevServer = true;
          const opts = await ensureServersStarted();
          if (!opts) return;

          console.warn(`[unplugin-devpilot] Farm dev server proxy requires manual configuration.
Add the following to your farm.config.ts:

import { getProxyConfig } from 'unplugin-devpilot/farm'

export default defineConfig({
  server: {
    proxy: getProxyConfig(${opts.wsPort})
  },
  plugins: [Devpilot()]
})`);
        },
      },
    };
  });

process.on('beforeExit', () => {
  stopServers();
});

export { clientManager } from './core/client-manager';
export type { DevpilotPlugin, Options } from './core/options';
export default unpluginDevpilot;
export type { DevpilotPluginContext } from './core/plugin';
export { resolveClientModule } from './core/plugin';
export { defineMcpToolRegister, type McpToolResolved } from './core/plugin/mcp';
export { resolveSkillModule } from './core/skill-generator';
export { getPluginStorage, storage } from './core/storage';
export * from './core/types';
export { resolveModule } from './core/utils';

/**
 * Get proxy configuration for WebSocket support
 * Use this to configure dev server proxy for WSS support
 *
 * @param wsPort - The WebSocket server port (from resolved options)
 * @returns Proxy configuration object for Vite/Webpack/Rspack
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import Devpilot, { getProxyConfig } from 'unplugin-devpilot/vite'
 *
 * export default defineConfig({
 *   plugins: [Devpilot()],
 *   server: {
 *     proxy: getProxyConfig(60427)
 *   }
 * })
 * ```
 */
export function getProxyConfig(
  wsPort: number,
): Record<string, { target: string; ws: boolean; changeOrigin: boolean }> {
  return {
    [WS_PROXY_PATH]: {
      target: `ws://localhost:${wsPort}`,
      ws: true,
      changeOrigin: true,
    },
  };
}

/**
 * Create a proxy middleware for WebSocket support
 * Use this for dev servers that accept Connect-style middleware (e.g., Farm)
 *
 * @param wsPort - The WebSocket server port
 * @returns Connect-style middleware function
 *
 * @example
 * ```ts
 * // farm.config.ts
 * import Devpilot, { createProxyMiddleware } from 'unplugin-devpilot/farm'
 *
 * export default defineConfig({
 *   plugins: [Devpilot()],
 *   server: {
 *     middlewares: [
 *       createProxyMiddleware(60427)
 *     ]
 *   }
 * })
 * ```
 */
export async function createProxyMiddleware(
  wsPort: number,
): Promise<(req: any, res: any, next: any) => void> {
  const httpProxyModule = await import('http-proxy');
  const httpProxy = httpProxyModule.default || httpProxyModule;
  const proxy = httpProxy.createProxyServer({
    target: `ws://localhost:${wsPort}`,
    ws: true,
    changeOrigin: true,
  });

  return (req: any, res: any, next: any) => {
    // Handle WebSocket upgrade
    if (req.headers.upgrade === 'websocket' && req.url === WS_PROXY_PATH) {
      // The upgrade event will be handled by the server's upgrade listener
      // We need to attach the proxy to the request for the upgrade handler
      (req as any)._devpilotProxy = proxy;
      (req as any)._devpilotWsPath = WS_PROXY_PATH;
      next();
      return;
    }

    // Handle HTTP request (should not happen for WebSocket)
    if (req.url === WS_PROXY_PATH) {
      proxy.web(req, res);
      return;
    }

    next();
  };
}
