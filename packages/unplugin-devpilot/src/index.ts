import type { UnpluginInstance } from 'unplugin';
import type { DevpilotPlugin, Options, OptionsResolved } from './core/options';
import { createUnplugin } from 'unplugin';
import { startMcpServer, stopMcpServer } from './core/mcp-server';
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

  const imports = [
    'import { initDevpilot } from \'unplugin-devpilot/client\';',
    ...pluginModules.map(mod => `import '${mod}';`),
  ].join('\n');

  return `
${imports}

export const wsPort = ${options.wsPort};
export const client = initDevpilot({ wsPort });
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
export type { DevpilotPlugin, Options } from './core/options';
export type { DevpilotPluginContext } from './core/plugin';
export { resolveClientModule } from './core/plugin';
export * from './core/types';
