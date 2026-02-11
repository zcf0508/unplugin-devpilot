# devpilot-plugin-dom-inspector

DOM Inspector plugin for unplugin-devpilot - provides tools for querying and inspecting DOM elements in the browser.

## Features

This plugin provides several MCP tools for DOM inspection and interaction.

### Element ID Format

All element identifiers use the `e` prefix format (e.g., `e1`, `e2`, `e123`). This format is consistent across:

- **get_page_snapshot** returns `devpilotId` in this format
- **User-provided devpilot-id** attributes (e.g., `data-devpilot-id="e123"`)
- **All API parameters** that accept element identifiers

### Selector Resolution (Priority Order)

**IMPORTANT:** All tools that accept element identifiers support both `devpilot-id` and CSS selectors with the following priority:

1. **devpilot-id** (Priority 1): Element's `data-devpilot-id` attribute (e.g., "e123")
2. **CSS Selector** (Priority 2): Standard CSS selector (e.g., "#myId", ".myClass", "button[type=submit]")

**Example:**
- `"e123"` → First tries to find element with `data-devpilot-id="e123"`, then falls back to CSS selector `#e123`
- `"#submitBtn"` → Tries `data-devpilot-id="#submitBtn"` (unlikely), then CSS selector `#submitBtn`
- `".btn.primary"` → Tries `data-devpilot-id=".btn.primary"` (unlikely), then CSS selector `.btn.primary`

### 1. `get_page_snapshot`

Get a compact DOM snapshot in agent-browser format, optimized for token efficiency.

**Parameters:**
- `clientId` (string, **required**): Target client ID. Use `list_clients` to find available clients.
- `maxDepth` (number, optional, default: 5): Maximum depth to traverse
- `startNodeId` (string, optional): Element identifier (devpilot-id or CSS selector) to start snapshot from. Priority: devpilot-id > CSS selector

**Returns:**
- Compact snapshot with element IDs (e.g., @e123 [button] "Submit")
- LLM-friendly formatted output with usage guide

### 2. `get_visual_hierarchy`

Analyze visual hierarchy by detecting which child elements fully cover their parents.

**Parameters:**
- `clientId` (string, **required**): Target client ID. Use `list_clients` to find available clients.
- `elementId` (string, optional): Element identifier (devpilot-id or CSS selector) to analyze. Priority: devpilot-id > CSS selector. Defaults to body
- `maxDepth` (number, optional, default: 15): Maximum depth to traverse

**Returns:**
- Multiple levels of snapshots showing visual coverage relationships
- LLM-friendly formatted layout with interactive elements

### 3. `get_element_details`

Get comprehensive element information including HTML attributes, accessibility info, and position.

**Parameters:**
- `selector` (string): Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Can match multiple elements.
- `includeChildren` (boolean, optional, default: false): Include children tree in the result
- `maxDepth` (number, optional, default: 5): Maximum depth for children tree (only used if includeChildren is true)
- `clientId` (string, **required**): Target client ID. Use `list_clients` to find available clients.

**Returns:**
- Array of elements with:
  - HTML info: tag, text, attributes
  - Accessibility info: role, name, value, description
  - Position info: rect (x, y, width, height)
  - Optional children tree (accessibility nodes)

### 4. `click_element`

Click an element by its identifier.

**Parameters:**
- `id` (string): Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Example: "e123" or "#submitBtn"
- `clientId` (string, **required**): Target client ID. Use `list_clients` to find available clients.

**Returns:**
- Success status or error message

### 5. `input_text`

Input text into an element by its identifier.

**Parameters:**
- `id` (string): Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Example: "e123" or "#myInput"
- `text` (string): Text to input
- `clientId` (string, **required**): Target client ID. Use `list_clients` to find available clients.

**Returns:**
- Success status or error message

### 6. `get_console_logs`

Get browser console logs including errors, warnings, and user logs. Filters logs by client ID.

**Parameters:**
- `clientId` (string, **required**): Target client ID. Use `list_clients` to find available clients.
- `level` (enum, optional, default: "all"): Log level filter (all, error, warn, info, debug)
- `limit` (number, optional, default: 100): Maximum number of logs to return
- `keyword` (string, optional): Keyword to filter logs (case-insensitive substring match)
- `regex` (string, optional): Regex pattern to filter logs (applied after keyword filter)

**Returns:**
- Captured console logs with timestamps and stack traces
- Includes errors, warnings, info, and debug messages

### 7. `capture_screenshot`

Capture a screenshot of the page or a specific element using [SnapDOM](https://github.com/zumerlab/snapdom). Works with any browser (Chrome, Safari, DingTalk, etc).

**Parameters:**
- `selector` (string, optional): Element identifier (devpilot-id or CSS selector) to capture. Priority: devpilot-id > CSS selector. If not provided, captures body or full page based on `fullPage` option
- `fullPage` (boolean, optional, default: false): Capture full page (documentElement) instead of just body
- `format` (enum, optional, default: "png"): Image format - "png", "jpeg", or "webp"
- `quality` (number, optional, default: 0.9): Image quality for jpeg/webp (0-1)
- `clientId` (string, **required**): Target client ID. Use `list_clients` to find available clients.

**Returns:**
- Screenshot image data (base64) with metadata (dimensions, URL, title)

**Limitations:**
- This is a client-side DOM capture, not a browser-level screenshot. Cross-origin images without CORS headers (`Access-Control-Allow-Origin`) may appear blank due to browser security restrictions. This is a limitation of all client-side capture libraries (SnapDOM, html2canvas, dom-to-image, etc.), not specific to this tool.

### 8. `scroll_to_element`

Scroll an element into view. Useful when element is in a scrollable container or outside the current viewport.

**Parameters:**
- `id` (string): Element identifier (devpilot-id or CSS selector). Priority: devpilot-id > CSS selector. Example: "e123" or "#myElement"
- `clientId` (string, **required**): Target client ID. Use `list_clients` to find available clients.
- `behavior` (enum, optional, default: "smooth"): Scroll behavior - "smooth" (animated) or "auto" (instant)

**Returns:**
- Success status or error message

**Note:** After scrolling, you can call `get_page_snapshot` to see the updated view.

## Usage

This plugin is automatically loaded by unplugin-devpilot. To use these tools:

1. Make sure unplugin-devpilot is properly configured in your Vite/Webpack config
2. The plugin will inject necessary client code into your application
3. Use the MCP tools from your LLM client (Cursor, Claude, etc.)

### Example MCP Tool Calls

```typescript
// Get page snapshot
const snapshot = await mcp.call('builtin-dom-inspector_get_page_snapshot', {
  clientId: 'c_abc123',
  maxDepth: 5,
});

// Get page snapshot starting from specific element
const partialSnapshot = await mcp.call('builtin-dom-inspector_get_page_snapshot', {
  startNodeId: 'e456', // devpilot-id or CSS selector
  clientId: 'c_abc123',
});

// Get visual hierarchy analysis
const hierarchy = await mcp.call('builtin-dom-inspector_get_visual_hierarchy', {
  elementId: 'e10', // devpilot-id or CSS selector
  clientId: 'c_abc123',
  maxDepth: 15,
});

// Get comprehensive element details
const details = await mcp.call('builtin-dom-inspector_get_element_details', {
  selector: 'e123', // devpilot-id or CSS selector
  includeChildren: true,
  clientId: 'c_abc123',
});

// Click element by devpilot-id
await mcp.call('builtin-dom-inspector_click_element', {
  id: 'e123', // Priority: devpilot-id > CSS selector
  clientId: 'c_abc123',
});

// Input text into element by CSS selector
await mcp.call('builtin-dom-inspector_input_text', {
  id: '#username', // CSS selector
  text: 'myusername',
  clientId: 'c_abc123',
});

// Get console logs filtered by level
const logs = await mcp.call('builtin-dom-inspector_get_console_logs', {
  clientId: 'c_abc123',
  level: 'error',
  limit: 50,
});

// Scroll element into view (if in scrollable container)
await mcp.call('builtin-dom-inspector_scroll_to_element', {
  id: 'e123', // devpilot-id or CSS selector
  clientId: 'c_abc123',
  behavior: 'smooth', // or 'auto'
});

// Complete workflow: find element, scroll to it, then get snapshot
const details = await mcp.call('builtin-dom-inspector_get_element_details', {
  selector: '.ayu-card:has(.i-lucide-pause-circle)',
  clientId: 'c_abc123',
});
const devpilotId = details.elements[0].devpilotId;

await mcp.call('builtin-dom-inspector_scroll_to_element', {
  id: devpilotId,
  clientId: 'c_abc123',
});

const snapshot = await mcp.call('builtin-dom-inspector_get_page_snapshot', {
  startNodeId: devpilotId,
  clientId: 'c_abc123',
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
