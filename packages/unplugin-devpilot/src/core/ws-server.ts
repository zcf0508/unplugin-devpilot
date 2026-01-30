import type { ClientFunctions, ServerFunctions } from './types';
import { createBirpc } from 'birpc';
import { WebSocketServer } from 'ws';
import { clientManager } from './client-manager';

let wss: WebSocketServer | null = null;

export function startWebSocketServer(port: number): WebSocketServer {
  if (wss) {
    return wss;
  }

  wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    const clientId = clientManager.generateClientId();

    const serverFunctions: ServerFunctions = {
      ping() {
        return 'pong';
      },
      updateClientInfo(info) {
        clientManager.updateClientInfo(clientId, info);
      },
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
