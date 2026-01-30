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

export interface ServerFunctions {
  ping: () => string
  updateClientInfo: (info: Omit<ClientInfo, 'clientId' | 'connectedAt' | 'lastActiveAt'>) => void
}

export interface ClientFunctions {
  notifyTaskUpdate: (count: number) => void
  notifyTaskCompleted: (taskId: string) => void
}
