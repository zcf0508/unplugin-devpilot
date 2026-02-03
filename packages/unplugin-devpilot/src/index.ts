import type { UnpluginInstance } from 'unplugin';
import type { DevpilotPlugin, Options, OptionsResolved } from './core/options';
import { createUnplugin } from 'unplugin';
import { registerPluginMcpRegisterMethods, startMcpServer, stopMcpServer } from './core/mcp-server';
import { resolveOptions } from './core/options';
import { registerPluginServerMethods, startWebSocketServer, stopWebSocketServer } from './core/ws-server';

const VIRTUAL_MODULE_ID = 'virtual:devpilot-client';
const RESOLVED_VIRTUAL_MODULE_ID = '\0virtual:devpilot-client';

function getPluginClientModules(plugins: DevpilotPlugin[], options: OptionsResolved): string[] {
  const ctx = { wsPort: options.wsPort };
  return plugins
    .filter(p => p.clientModule)
    .map((p) => {
      const mod = typeof p.clientModule === 'function'
        ? p.clientModule(ctx)
        : p.clientModule!;
      return mod;
    });
}

function generateVirtualClientModule(options: OptionsResolved): string {
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
  wsPort,
  rpcHandlers: {
${handlerCollection}
  }
});
`;
}

export const unpluginDevpilot: UnpluginInstance<Options | undefined, false>
  = createUnplugin((rawOptions = {}) => {
    const options = resolveOptions(rawOptions);
    let serversStarted = false;

    const name = 'unplugin-devpilot';

    async function startServers() {
      if (serversStarted) { return; }
      serversStarted = true;
      // Register plugin server methods before starting WebSocket server
      registerPluginServerMethods(options.plugins);
      // Register plugin mcp register methods before starting WebSocket server
      registerPluginMcpRegisterMethods(options.plugins);
      startWebSocketServer(options.wsPort);
      await startMcpServer(options.mcpPort);
    }

    function stopServers() {
      if (!serversStarted) { return; }
      serversStarted = false;
      stopWebSocketServer();
      stopMcpServer();
    }

    return {
      name,
      enforce: 'pre',

      resolveId(id) {
        if (id === VIRTUAL_MODULE_ID) {
          return RESOLVED_VIRTUAL_MODULE_ID;
        }
      },

      loadInclude(id) {
        return id === RESOLVED_VIRTUAL_MODULE_ID;
      },

      load(id) {
        if (id === RESOLVED_VIRTUAL_MODULE_ID) {
          return generateVirtualClientModule(options);
        }
      },

      buildStart() {
        startServers();
      },

      buildEnd() {
        stopServers();
      },

      vite: {
        configureServer() {
          startServers();
        },
      },

      webpack(compiler) {
        compiler.hooks.watchRun.tapPromise(name, async () => {
          await startServers();
        });
        compiler.hooks.done.tap(name, () => {
          if (!compiler.options.watch) {
            stopServers();
          }
        });
      },

      rspack(compiler) {
        compiler.hooks.watchRun.tapPromise(name, async () => {
          await startServers();
        });
        compiler.hooks.done.tap(name, () => {
          if (!compiler.options.watch) {
            stopServers();
          }
        });
      },
    };
  });

export default unpluginDevpilot;
export { clientManager } from './core/client-manager';
export type { DevpilotPlugin, Options } from './core/options';
export type { DevpilotPluginContext } from './core/plugin';
export { defineMcpToolRegister } from './core/plugin';
export { resolveClientModule } from './core/plugin';
export * from './core/types';
