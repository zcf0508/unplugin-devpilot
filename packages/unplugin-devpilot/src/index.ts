import type { UnpluginInstance } from 'unplugin';
import type { DevpilotPlugin, Options, OptionsResolved } from './core/options';
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
  if (!isDev || process.env.VITEST || process.env.NODE_ENV === 'test') {
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
  wsPort,
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

    async function ensureServersStarted() {
      options = await startServers(rawOptions);
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
          if (!options) {
            options = await resolveOptions(rawOptions);
          }
          return generateVirtualClientModule(options, process.env.NODE_ENV !== 'production');
        }
      },

      transform(code, id) {
        // Skip in production or test mode
        if (process.env.NODE_ENV === 'production') {
          return null;
        }
        if (process.env.VITEST || process.env.NODE_ENV === 'test') {
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

      buildStart() {
        if (process.env.NODE_ENV === 'production') { return; }
        if (process.env.VITEST || process.env.NODE_ENV === 'test') { return; }
        if (isDevServer) { return; }
        return ensureServersStarted();
      },

      buildEnd() {
        if (isDevServer) { return; }
        return stopServers();
      },

      vite: {
        configureServer() {
          if (process.env.VITEST || process.env.NODE_ENV === 'test') { return; }
          isDevServer = true;
          ensureServersStarted();
        },
      },

      webpack(compiler) {
        compiler.hooks.watchRun.tapPromise(name, async () => {
          isDevServer = true;
          await ensureServersStarted();
        });
        compiler.hooks.shutdown?.tap(name, () => {
          stopServers();
        });
      },

      rspack(compiler) {
        compiler.hooks.watchRun.tapPromise(name, async () => {
          isDevServer = true;
          await ensureServersStarted();
        });
        compiler.hooks.shutdown?.tap(name, () => {
          stopServers();
        });
      },

      farm: {
        configureDevServer() {
          isDevServer = true;
          ensureServersStarted();
        },
      },
    };
  });

process.on('beforeExit', () => {
  stopServers();
});

export default unpluginDevpilot;
export { clientManager } from './core/client-manager';
export type { DevpilotPlugin, Options } from './core/options';
export type { DevpilotPluginContext } from './core/plugin';
export { defineMcpToolRegister } from './core/plugin';
export { resolveClientModule } from './core/plugin';
export { resolveSkillModule } from './core/skill-generator';
export { getPluginStorage, storage } from './core/storage';
export * from './core/types';
export { resolveModule } from './core/utils';
