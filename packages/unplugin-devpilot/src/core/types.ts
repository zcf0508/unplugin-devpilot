export interface ClientInfo {
  clientId: string
  url: string
  title: string
  userAgent: string
  connectedAt: number
  lastActiveAt: number
}

export interface PendingTask {
  id: string
  sourceClient: string
  intent: 'analyze' | 'modify' | 'test' | 'style' | 'ask'
  element: {
    uid: string
    selector: string
    role: string
    name: string
    codeLocation?: {
      file: string
      line: number
      column: number
    }
  }
  userNote?: string
  timestamp: number
}

// Base server functions that can be extended by plugins
export interface BaseServerFunctions {
  ping: () => string
  updateClientInfo: (info: Omit<ClientInfo, 'clientId' | 'connectedAt' | 'lastActiveAt'>) => void
}

// Default empty interface for plugins to extend via module augmentation
export interface PluginServerFunctions {}

// Combined server functions type
export type ServerFunctions = BaseServerFunctions & PluginServerFunctions;

// Base client functions that can be extended by plugins
export interface BaseClientFunctions {
  notifyTaskUpdate: (count: number) => void
  notifyTaskCompleted: (taskId: string) => void
}

// Default empty interface for plugins to extend via module augmentation
export interface PluginClientFunctions {}

// Combined client functions type
export type ClientFunctions = BaseClientFunctions & PluginClientFunctions;
