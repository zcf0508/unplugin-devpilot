// Shared types between server and client - no DOM dependencies

export interface AccessibilityNode {
  uid: string
  role: string
  name: string | null
  value?: string
  description?: string
  children?: AccessibilityNode[]
  attributes?: Record<string, any>
}

export interface ConsoleLogEntry {
  level: 'error' | 'warn' | 'info' | 'debug'
  message: string
  timestamp: number
  stack?: string
  args?: any[]
}

export interface QuerySelectorResult {
  success: boolean
  selector: string
  matchedCount: number
  elements: Array<AccessibilityNode & { matchedSelector: string }>
  error?: string
}

export interface GetDOMTreeResult {
  success: boolean
  tree: AccessibilityNode | null
  error?: string
  timestamp?: number
}

export interface GetLogsResult {
  success: boolean
  logs: ConsoleLogEntry[]
  total: number
  filtered: number
  level: string
  error?: string
}

export interface DomInspectorRpc {
  querySelector: (selector: string, maxDepth?: number) => Promise<QuerySelectorResult>
  getDOMTree: (maxDepth?: number) => Promise<GetDOMTreeResult>
  getLogs: (options?: { level?: 'all' | 'error' | 'warn' | 'info' | 'debug', limit?: number }) => Promise<GetLogsResult>
}
