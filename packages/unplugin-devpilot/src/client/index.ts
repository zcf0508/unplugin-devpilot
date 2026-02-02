import type { ServerFunctions } from '../core/types';
import type { DevpilotClient, DevpilotClientOptions, RpcHandlers } from './types';

export type { DevpilotClient, DevpilotClientOptions, RpcHandlers };

function generateId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function createDevpilotClient<S extends Record<string, any> = ServerFunctions>(
  options: DevpilotClientOptions,
): DevpilotClient<S> {
  const { wsPort, rpcHandlers: customHandlers } = options;

  let ws: WebSocket | null = null;
  let clientId: string | null = null;
  const pendingCalls = new Map<string, { resolve: (value: unknown) => void, reject: (reason: Error) => void }>();
  const connectedCallbacks = new Set<() => void>();
  const disconnectedCallbacks = new Set<() => void>();

  // Create rpcHandlers by merging default implementations with custom handlers
  const rpcHandlers = {
    notifyTaskUpdate(count: number) {
      window.dispatchEvent(new CustomEvent('devpilot:taskUpdate', { detail: { count } }));
      customHandlers?.notifyTaskUpdate?.(count);
    },
    notifyTaskCompleted(taskId: string) {
      window.dispatchEvent(new CustomEvent('devpilot:taskCompleted', { detail: { taskId } }));
      customHandlers?.notifyTaskCompleted?.(taskId);
    },
    // Merge any additional custom handlers
    ...customHandlers,
  } as RpcHandlers;

  function connect(): void {
    ws = new WebSocket(`ws://localhost:${wsPort}`);

    ws.onopen = () => {
      console.log('[devpilot] Connected to server');
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === 'connected') {
          clientId = data.clientId;
          console.log('[devpilot] Client ID:', clientId);
          rpcCall('updateClientInfo', {
            url: location.href,
            title: document.title,
            userAgent: navigator.userAgent,
          });
          connectedCallbacks.forEach(cb => cb());
          return;
        }

        if (data.t === 'q' && data.m && data.m in rpcHandlers) {
          const handler = rpcHandlers[data.m as keyof RpcHandlers];
          const result = (handler as (...args: unknown[]) => unknown)(...(data.a || []));
          if (data.i) {
            ws?.send(JSON.stringify({ t: 's', i: data.i, r: result }));
          }
          return;
        }

        if (data.t === 's' && data.i && pendingCalls.has(data.i)) {
          const { resolve, reject } = pendingCalls.get(data.i)!;
          pendingCalls.delete(data.i);
          if (data.e) { reject(new Error(String(data.e))); }
          else { resolve(data.r); }
        }
      }
      catch (e) {
        console.error('[devpilot] Message parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[devpilot] Disconnected, reconnecting...');
      clientId = null;
      disconnectedCallbacks.forEach(cb => cb());
      setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('[devpilot] WebSocket error:', err);
    };
  }

  function rpcCall<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const id = generateId();
      pendingCalls.set(id, { resolve: resolve as (value: unknown) => void, reject });
      ws.send(JSON.stringify({ t: 'q', m: method, a: args, i: id }));
    });
  }

  connect();

  return {
    getClientId: () => clientId,
    rpcCall,
    isConnected: () => ws !== null && ws.readyState === WebSocket.OPEN,
    onConnected: (callback) => {
      connectedCallbacks.add(callback);
      return () => connectedCallbacks.delete(callback);
    },
    onDisconnected: (callback) => {
      disconnectedCallbacks.add(callback);
      return () => disconnectedCallbacks.delete(callback);
    },
  } as DevpilotClient<S>;
}

let globalClient: DevpilotClient<any> | null = null;

export function initDevpilot<S extends Record<string, any> = ServerFunctions>(
  options: DevpilotClientOptions,
): DevpilotClient<S> {
  if (globalClient) { return globalClient as DevpilotClient<S>; }
  globalClient = createDevpilotClient<S>(options);
  (window as Window & { __devpilot?: DevpilotClient<any> }).__devpilot = globalClient;
  return globalClient as DevpilotClient<S>;
}

export function getDevpilotClient<S extends Record<string, any> = ServerFunctions>(): DevpilotClient<S> | null {
  return globalClient as DevpilotClient<S> | null;
}
