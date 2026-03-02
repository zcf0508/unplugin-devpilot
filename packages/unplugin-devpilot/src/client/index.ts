import type { ServerFunctions } from '../core/types';
import type { DevpilotClient, DevpilotClientOptions, RpcHandlers } from './types';

export type { DevpilotClient, DevpilotClientOptions, RpcHandlers };
export type { ClientStorage } from './storage';
export { createClientStorage } from './storage';

function generateId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function detectBrowser() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);

  // Detect iOS version
  let iOSVersion = 0;
  if (isIOS) {
    const match = ua.match(/OS (\d+)_/);
    if (match) {
      iOSVersion = Number.parseInt(match[1], 10);
    }
  }

  return { isIOS, isSafari, iOSVersion };
}

/**
 * https://github.com/zcf0508/unplugin-https-reverse-proxy/issues/5
 */
function showWebSocketError() {
  const { isIOS, isSafari, iOSVersion } = detectBrowser();

  // Only show error for Safari
  if (!isSafari) {
    return;
  }

  let message = '⚠️ WebSocket Connection Failed\n\n';

  if (isIOS) {
    if (iOSVersion >= 15) {
      message += 'Solutions:\n\n'
        + '1. Enable experimental feature (Recommended):\n'
        + '   Settings → Safari → Advanced → Experimental Features\n'
        + '   → Enable "NSURLSession WebSocket"\n\n'
        + '2. Or ensure certificate is trusted:\n'
        + '   Settings → General → About\n'
        + '   → Certificate Trust Settings';
    }
    else if (iOSVersion >= 13) {
      message += `iOS ${iOSVersion} does not support WebSocket with self-signed certificates\n\n`
        + 'Solutions:\n\n'
        + '1. Upgrade to iOS 15+ and enable experimental feature\n'
        + '2. Or use HTTP access (non-HTTPS)\n'
        + '3. Or use mkcert to generate locally-trusted certificates';
    }
    else {
      message += 'Current iOS version does not support WebSocket with self-signed certificates\n\n'
        + 'Please upgrade to iOS 15+ or use HTTP access';
    }
  }
  else {
    // macOS Safari
    message += 'Solutions:\n\n'
      + '1. Enable experimental feature:\n'
      + '   Safari → Settings → Advanced → Show Develop menu\n'
      + '   → Develop → Experimental Features\n'
      + '   → Enable "NSURLSession WebSocket"\n\n'
      + '2. Or ensure certificate is trusted';
  }

  // eslint-disable-next-line no-alert
  alert(message);
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
  let hasShownError = false; // Track if we've shown the error popup
  let hasConnectedOnce = false; // Track if we've ever connected successfully

  // Create rpcHandlers by merging default implementations with custom handlers and extended handlers
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
    // Merge extended handlers from plugins
    ...(options.extendRpcHandlers || {}),
  } as RpcHandlers;

  function connect(): void {
    // Use location.hostname to support LAN debugging (not hardcoded localhost)
    // Always use ws:// (not wss://) as the WebSocket server doesn't support WSS
    const host = location.hostname;
    ws = new WebSocket(`ws://${host}:${wsPort}`);

    ws.onopen = () => {
      console.log('[devpilot] Connected to server');
      hasConnectedOnce = true;
      hasShownError = false; // Reset error flag on successful connection
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
          Promise.resolve((handler as (...args: unknown[]) => unknown)(...(data.a || [])))
            .then((result) => {
              if (data.i) {
                ws?.send(JSON.stringify({ t: 's', i: data.i, r: result }));
              }
            })
            .catch((error) => {
              if (data.i) {
                ws?.send(JSON.stringify({ t: 's', i: data.i, e: error instanceof Error
                  ? error.message
                  : String(error) }));
              }
            });
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

      // Show error popup only once and only if we've never connected successfully
      // (to avoid showing error on temporary network issues)
      if (!hasShownError && !hasConnectedOnce) {
        hasShownError = true;
        showWebSocketError();
      }
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

/**
 * Define and type-check RPC handlers for the client
 * This ensures the handlers are correctly typed and will be recognized by the RPC system
 * @param handlers - RPC handlers object that extends the base RpcHandlers
 * @returns The handlers object (for convenience)
 * @example
 * ```ts
 * export const rpcHandlers = defineRpcHandlers({
 *   querySelector: async (selector: string) => {
 *     // implementation
 *   },
 *   getDOMTree: async (maxDepth: number) => {
 *     // implementation
 *   }
 * });
 * ```
 */
export function defineRpcHandlers<T extends { [K in keyof T]: (...args: any[]) => any }>(handlers: T): T {
  return handlers;
}
