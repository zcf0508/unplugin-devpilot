import type { ClientFunctions, ServerFunctions } from '../core/types';

// RpcHandlers should be based on ClientFunctions (methods the server can call on the client)
export type RpcHandlers = ClientFunctions;

// Helper type to convert ServerFunctions to rpcCall format with optional extensions
type PromisifyServerFunctions<T = ServerFunctions> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Return
    ? (...args: Args) => Promise<Awaited<Return>>
    : never;
};

export interface DevpilotClient<S extends Record<string, any> = ServerFunctions> {
  getClientId: () => string | null
  rpcCall: <K extends keyof PromisifyServerFunctions<S>>(
    method: K,
    ...args: Parameters<PromisifyServerFunctions<S>[K]>
  ) => Promise<ReturnType<PromisifyServerFunctions<S>[K]>>
  isConnected: () => boolean
  onConnected: (callback: () => void) => () => void
  onDisconnected: (callback: () => void) => () => void
}

export interface DevpilotClientOptions {
  wsPort: number
  rpcHandlers?: Partial<RpcHandlers>
}
