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
  /**
   * @internal
   *
   * for test
   */
  snapshot: string // Raw compact format: "@{id} [tag] \"text\" [key=value]"
  formattedSnapshot?: string | null // LLM-friendly formatted snapshot with context and guide
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

export interface GetLayoutResult {
  success: boolean
  targetId: string
  targetRect: {
    x: number
    y: number
    width: number
    height: number
  }
  /**
   * @internal
   *
   * for test
   */
  layout: Record<string, string> | null // level -> snapshot string
  formattedLayout?: string | null // LLM-friendly formatted layout with all levels
  depth: number
  error?: string
  timestamp?: number
}

export interface DomInspectorRpc {
  // Compact snapshot (agent-browser style)
  /**
   * Get a compact DOM snapshot
   * @param options.startNodeId - Element identifier (devpilot-id or CSS selector). Snapshot will start from this element
   */
  getCompactSnapshot: (options?: { maxDepth?: number, startNodeId?: string }) => Promise<Omit<CompactSnapshotResult, 'snapshot'>>

  /**
   * Click an element
   * @param id - Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector
   */
  clickElementById: (id: string) => Promise<ElementActionResult>

  /**
   * Input text into an element
   * @param id - Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector
   */
  inputTextById: (id: string, text: string) => Promise<ElementActionResult>

  /**
   * Get element information
   * @param id - Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector
   */
  getElementInfoById: (id: string) => Promise<ElementInfo>

  /**
   * Get visual layout hierarchy
   * @param options.id - Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Defaults to body
   */
  getLayout: (options?: { id?: string, maxDepth?: number }) => Promise<Omit<GetLayoutResult, 'layout'>>

  // Legacy methods
  /**
   * Query DOM elements using CSS selector or devpilot-id
   * @param selector - Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector
   */
  querySelector: (selector: string, maxDepth?: number) => Promise<QuerySelectorResult>
  getDOMTree: (maxDepth?: number) => Promise<GetDOMTreeResult>
  getLogs: (options?: { level?: 'all' | 'error' | 'warn' | 'info' | 'debug', limit?: number }) => Promise<GetLogsResult>
}
