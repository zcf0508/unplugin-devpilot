// Shared types between server and client - no DOM dependencies

export interface AccessibilityNode {
  devpilotId: string
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
  keyword?: string
  regex?: string
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

export interface ScreenshotResult {
  success: boolean
  timestamp: number
  url: string
  title: string
  // Base64-encoded image data (without data URL prefix)
  data?: string
  mimeType?: string
  format?: 'png' | 'jpeg' | 'webp'
  dimensions?: {
    width: number
    height: number
    scrollWidth: number
    scrollHeight: number
  }
  selector?: string
  error?: string
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

  /**
   * Scroll an element into view
   * @param id - Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector
   * @param behavior - Scroll behavior: 'smooth' (default) or 'auto'
   */
  scrollToElement: (id: string, behavior?: 'smooth' | 'auto') => Promise<ElementActionResult>

  /**
   * Capture screenshot of page or element
   * @param options.selector - Element identifier (devpilot-id or CSS selector) to capture. Priority: devpilot-id > CSS selector. If not provided, captures full page or body based on fullPage option
   * @param options.fullPage - Capture full page (documentElement) instead of just viewport (body). Default: false
   * @param options.format - Image format: 'png' (default), 'jpeg', or 'webp'
   * @param options.quality - Image quality for jpeg/webp (0-1). Default: 0.9
   */
  captureScreenshot: (options?: {
    selector?: string
    fullPage?: boolean
    format?: 'png' | 'jpeg' | 'webp'
    quality?: number
  }) => Promise<ScreenshotResult>

  // Legacy methods
  /**
   * Query DOM elements using CSS selector or devpilot-id
   * @param selector - Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector
   */
  querySelector: (selector: string, maxDepth?: number) => Promise<QuerySelectorResult>
  getDOMTree: (maxDepth?: number) => Promise<GetDOMTreeResult>
}

export interface DomInspectorServerMethods extends Record<string, (...args: any[]) => any> {
  appendLogs: (items: ConsoleLogEntry[]) => Promise<void>
}
