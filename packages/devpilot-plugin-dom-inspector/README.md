# devpilot-plugin-dom-inspector

DOM Inspector plugin for unplugin-devpilot - provides tools for querying and inspecting DOM elements in the browser.

## Features

This plugin provides several MCP tools for DOM inspection and interaction.

### Selector Resolution (Priority Order)

**IMPORTANT:** All tools that accept element identifiers support both `devpilot-id` and CSS selectors with the following priority:

1. **devpilot-id** (Priority 1): Element's `data-devpilot-id` attribute (e.g., "e123")
2. **CSS Selector** (Priority 2): Standard CSS selector (e.g., "#myId", ".myClass", "button[type=submit]")

**Example:**
- `"e123"` → First tries to find element with `data-devpilot-id="e123"`, then falls back to CSS selector `#e123`
- `"#submitBtn"` → Tries `data-devpilot-id="#submitBtn"` (unlikely), then CSS selector `#submitBtn`
- `".btn.primary"` → Tries `data-devpilot-id=".btn.primary"` (unlikely), then CSS selector `.btn.primary`

### 1. `query_selector`

Query DOM elements using devpilot-id or CSS selectors with accessibility tree information.

**Parameters:**
- `selector` (string): Element identifier - can be devpilot-id (e.g., "e123") or CSS selector (e.g., "#myId", ".myClass"). Priority: devpilot-id > CSS selector
- `clientId` (string, optional): Target client ID (defaults to task source client)
- `maxDepth` (number, optional, default: 5): Maximum depth to traverse

**Returns:**
- Array of matched elements with accessibility information (role, name, value, children, etc.)

### 2. `get_compact_snapshot`

Get a compact DOM snapshot in agent-browser format, optimized for token efficiency.

**Parameters:**
- `clientId` (string, optional): Target client ID (defaults to task source client)
- `maxDepth` (number, optional, default: 5): Maximum depth to traverse
- `startNodeId` (string, optional): Element identifier (devpilot-id or CSS selector) to start snapshot from. Priority: devpilot-id > CSS selector

**Returns:**
- Compact snapshot with element IDs (e.g., @e123 [button] "Submit")
- LLM-friendly formatted output with usage guide

### 3. `click_element_by_id`

Click an element by its identifier.

**Parameters:**
- `id` (string): Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Example: "e123" or "#submitBtn"
- `clientId` (string, optional): Target client ID (defaults to task source client)

**Returns:**
- Success status or error message

### 4. `input_text_by_id`

Input text into an element by its identifier.

**Parameters:**
- `id` (string): Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Example: "e123" or "#myInput"
- `text` (string): Text to input
- `clientId` (string, optional): Target client ID (defaults to task source client)

**Returns:**
- Success status or error message

### 5. `get_element_info_by_id`

Get detailed information about an element by its identifier.

**Parameters:**
- `id` (string): Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Example: "e123" or "#myElement"
- `clientId` (string, optional): Target client ID (defaults to task source client)

**Returns:**
- Element details including tag, text, and attributes

### 6. `get_layout`

Get visual layout hierarchy of DOM elements. Automatically detects which child elements fully cover the target element.

**Parameters:**
- `clientId` (string, optional): Target client ID (defaults to task source client)
- `id` (string, optional): Element identifier (devpilot-id or CSS selector) to analyze. Priority: devpilot-id > CSS selector. Defaults to body
- `maxDepth` (number, optional, default: 15): Maximum depth to traverse

**Returns:**
- Multiple levels of snapshots showing visual coverage relationships
- LLM-friendly formatted layout with interactive elements

### 7. `get_dom_tree`

Get accessibility tree snapshot of the DOM.

**Parameters:**
- `clientId` (string, optional): Target client ID (defaults to task source client)
- `maxDepth` (number, optional, default: 5): Maximum depth to traverse

**Returns:**
- Hierarchical tree structure with accessibility information
- Includes semantic roles, accessible names, and attributes

### 8. `get_logs`

Get browser console logs including errors, warnings, and user logs.

**Parameters:**
- `clientId` (string, optional): Target client ID (defaults to task source client)
- `level` (enum, optional, default: "all"): Log level filter (all, error, warn, info, debug)
- `limit` (number, optional, default: 100): Maximum number of logs to return

**Returns:**
- Captured console logs with timestamps and stack traces
- Includes errors, warnings, info, and debug messages

## Usage

This plugin is automatically loaded by unplugin-devpilot. To use these tools:

1. Make sure unplugin-devpilot is properly configured in your Vite/Webpack config
2. The plugin will inject necessary client code into your application
3. Use the MCP tools from your LLM client (Cursor, Claude, etc.)

### Example MCP Tool Calls

```typescript
// Query all buttons using CSS selector
const result = await mcp.call('builtin-dom-inspector_query_selector', {
  selector: 'button',
  clientId: 'c_abc123',
});

// Query element by devpilot-id (priority 1)
const element = await mcp.call('builtin-dom-inspector_query_selector', {
  selector: 'e123', // Tries data-devpilot-id="e123" first, then CSS selector #e123
  clientId: 'c_abc123',
});

// Click element by devpilot-id
await mcp.call('builtin-dom-inspector_click_element_by_id', {
  id: 'e123', // Priority: devpilot-id > CSS selector
  clientId: 'c_abc123',
});

// Input text into element by CSS selector
await mcp.call('builtin-dom-inspector_input_text_by_id', {
  id: '#username', // CSS selector
  text: 'myusername',
  clientId: 'c_abc123',
});

// Get compact snapshot starting from specific element
const snapshot = await mcp.call('builtin-dom-inspector_get_compact_snapshot', {
  startNodeId: 'e456', // devpilot-id or CSS selector
  clientId: 'c_abc123',
});

// Get layout analysis
const layout = await mcp.call('builtin-dom-inspector_get_layout', {
  id: 'e10', // devpilot-id or CSS selector
  clientId: 'c_abc123',
  maxDepth: 15,
});

// Get full DOM tree
const tree = await mcp.call('builtin-dom-inspector_get_dom_tree', {
  clientId: 'c_abc123',
  maxDepth: 10,
});

// Get recent error logs
const logs = await mcp.call('builtin-dom-inspector_get_logs', {
  clientId: 'c_abc123',
  level: 'error',
  limit: 50,
});
```

## Client-Side Behavior

When loaded in the browser, this plugin will:
1. Capture console logs (error, warn, info, debug)
2. Capture unhandled errors and promise rejections
3. Build accessibility trees for DOM inspection
4. Respond to RPC calls from the server

## Implementation Details

### Accessibility Tree

The plugin builds an accessibility tree based on:
- ARIA attributes (role, aria-label, aria-labelledby, etc.)
- Semantic HTML elements
- Form element labels and attributes
- Text content and values

This provides a more meaningful representation of the page compared to raw DOM, filtering out non-semantic elements like scripts, styles, and layout containers.

### Log Capture

Console methods are intercepted to capture:
- console.error()
- console.warn()
- console.info()
- console.debug()

Plus global error handlers for:
- window error events
- unhandled promise rejections

Logs are buffered (max 1000 entries) and can be filtered by level.
