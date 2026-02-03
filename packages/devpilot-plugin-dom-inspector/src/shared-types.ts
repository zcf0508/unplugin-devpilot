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

// Compact snapshot format (agent-browser style)
export interface CompactSnapshotResult {
  success: boolean
  clientId: string
  timestamp: number
  url: string
  title: string
  snapshot: string // Compact format: "@{id} [tag] \"text\" [key=value]"
  error?: string
}

export interface ElementInfo {
  success: boolean
  element?: {
    id: string
    tag: string
    text: string
    attributes: Record<string, string>
  }
  error?: string
}

export interface ElementActionResult {
  success: boolean
  error?: string
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
  // Compact snapshot (agent-browser style)
  getCompactSnapshot: (maxDepth?: number) => Promise<CompactSnapshotResult>
  clickElementById: (id: string) => Promise<ElementActionResult>
  inputTextById: (id: string, text: string) => Promise<ElementActionResult>
  getElementInfoById: (id: string) => Promise<ElementInfo>

  // Legacy methods
  querySelector: (selector: string, maxDepth?: number) => Promise<QuerySelectorResult>
  getDOMTree: (maxDepth?: number) => Promise<GetDOMTreeResult>
  getLogs: (options?: { level?: 'all' | 'error' | 'warn' | 'info' | 'debug', limit?: number }) => Promise<GetLogsResult>
}
