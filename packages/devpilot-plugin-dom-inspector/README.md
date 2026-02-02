# devpilot-plugin-dom-inspector

DOM Inspector plugin for unplugin-devpilot - provides tools for querying and inspecting DOM elements in the browser.

## Features

This plugin provides three main MCP tools:

### 1. `query_selector`

Query DOM elements using CSS selectors with accessibility tree information.

**Parameters:**
- `selector` (string): CSS selector to query elements
- `clientId` (string, optional): Target client ID (defaults to task source client)

**Returns:**
- Array of matched elements with accessibility information (role, name, value, children, etc.)

### 2. `get_dom_tree`

Get accessibility tree snapshot of the DOM.

**Parameters:**
- `clientId` (string, optional): Target client ID (defaults to task source client)
- `maxDepth` (number, optional, default: 5): Maximum depth to traverse

**Returns:**
- Hierarchical tree structure with accessibility information
- Includes semantic roles, accessible names, and attributes

### 3. `get_logs`

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
// Query all buttons
const result = await mcp.call('builtin-dom-inspector_query_selector', {
  selector: 'button',
  clientId: 'c_abc123',
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
