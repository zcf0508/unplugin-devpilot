import type { DevpilotPlugin } from './options';
import type { ClientFunctions, ServerFunctions } from './types';
import { createBirpc } from 'birpc';
import { WebSocketServer } from 'ws';
import { clientManager } from './client-manager';

let wss: WebSocketServer | null = null;

// Store plugin server methods
let pluginServerMethods: Record<string, Record<string, (...args: any[]) => any>> = {};

/**
 * Register plugin server methods
 */
export function registerPluginServerMethods(plugins: DevpilotPlugin[]): void {
  const ctx = { wsPort: 0 }; // Will be updated when starting server
  pluginServerMethods = {};

  for (const plugin of plugins) {
    if (plugin.serverSetup) {
      try {
        const methods = plugin.serverSetup(ctx);
        pluginServerMethods[plugin.namespace] = methods;
      }
      catch (error) {
        console.error(`[unplugin-devpilot] Failed to setup server methods for plugin ${plugin.namespace}:`, error);
      }
    }
  }
}

export function startWebSocketServer(port: number): WebSocketServer {
  if (wss) {
    return wss;
  }

  wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    const clientId = clientManager.generateClientId();

    // Merge all plugin server methods
    const allPluginMethods: Record<string, (...args: any[]) => any> = {};
    for (const methods of Object.values(pluginServerMethods)) {
      Object.assign(allPluginMethods, methods);
    }

    const serverFunctions: ServerFunctions = {
      ping() {
        return 'pong';
      },
      updateClientInfo(info) {
        clientManager.updateClientInfo(clientId, info);
      },
      // Inject all plugin methods
      ...allPluginMethods,
    };

    const rpc = createBirpc<ClientFunctions, ServerFunctions>(
      serverFunctions,
      {
        post: data => ws.send(data),
        on: fn => ws.on('message', fn),
        serialize: v => JSON.stringify(v),
        deserialize: v => JSON.parse(String(v)),
      },
    );

    clientManager.addClient(clientId, ws, rpc);

    ws.send(JSON.stringify({ type: 'connected', clientId }));

    ws.on('close', () => {
      clientManager.removeClient(clientId);
    });

    ws.on('error', () => {
      clientManager.removeClient(clientId);
    });
  });

  wss.on('listening', () => {
    console.warn(`[unplugin-devpilot] WebSocket server listening on ws://localhost:${port}`);
  });

  return wss;
}

export function stopWebSocketServer(): void {
  if (wss) {
    wss.close();
    wss = null;
  }
}
