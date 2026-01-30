import type { UnpluginInstance } from 'unplugin';
import type { Options } from './core/options';
import { createUnplugin } from 'unplugin';
import { generateClientScript } from './core/client-script';
import { startMcpServer, stopMcpServer } from './core/mcp-server';
import { resolveOptions } from './core/options';
import { startWebSocketServer, stopWebSocketServer } from './core/ws-server';

const VIRTUAL_MODULE_ID = 'virtual:devpilot-client';
const RESOLVED_VIRTUAL_MODULE_ID = '\0virtual:devpilot-client';

export const unpluginDevpilot: UnpluginInstance<Options | undefined, false>
  = createUnplugin((rawOptions = {}) => {
    const options = resolveOptions(rawOptions);
    let serversStarted = false;

    const name = 'unplugin-devpilot';

    async function startServers() {
      if (serversStarted) { return; }
      serversStarted = true;
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
          return generateClientScript(options.wsPort);
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
export type { Options };
export * from './core/types';
