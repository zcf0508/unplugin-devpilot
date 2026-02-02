export interface RpcHandlers {
  notifyTaskUpdate: (count: number) => void
  notifyTaskCompleted: (taskId: string) => void
}

export interface DevpilotClient {
  getClientId: () => string | null
  rpcCall: <T = unknown>(method: string, ...args: unknown[]) => Promise<T>
  isConnected: () => boolean
  onConnected: (callback: () => void) => () => void
  onDisconnected: (callback: () => void) => () => void
}

export interface DevpilotClientOptions {
  wsPort: number
  rpcHandlers?: Partial<RpcHandlers>
}
