import type { ClientFunctions, ServerFunctions, TaskSubmitPayload } from '../core/types';

// RpcHandlers should be based on ClientFunctions (methods the server can call on the client)
export type RpcHandlers = ClientFunctions;

/** Context passed to each task payload hook. */
export interface TaskPayloadHookContext {
  /** The raw DOM element that was picked by the user. */
  element: Element
  client: DevpilotClient
}

/**
 * A hook that enriches the task payload before submission.
 * Hooks run in registration order; each receives the payload returned by the previous hook.
 */
export type TaskPayloadHook = (
  payload: TaskSubmitPayload,
  context: TaskPayloadHookContext,
) => TaskSubmitPayload | Promise<TaskSubmitPayload>;

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
  rpcHandlers?: Partial<RpcHandlers>
  extendRpcHandlers?: Record<string, (...args: any[]) => any>
}
