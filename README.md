# unplugin-devpilot

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/zcf0508/unplugin-devpilot)

[中文版本](./README_CN.md)

A universal plugin framework for development tools that enables seamless browser-server communication and MCP (Model Context Protocol) integration with AI/LLM systems.

## Features

- 🔌 **Universal Plugin System** - Create plugins once, use everywhere
- 🌐 **Multi-Bundler Support** - Works with Vite, Webpack, Rspack, Farm, and more via [unplugin](https://github.com/unjs/unplugin)
- 🔄 **Real-time Communication** - WebSocket-based bidirectional RPC between browser and development server
- 🤖 **MCP Integration** - Built-in Model Context Protocol server for AI/LLM automation
- 🎯 **DOM Inspector Plugin** - Out-of-the-box DOM inspection and manipulation for web automation
- 🛠️ **Development-Only** - Zero production overhead, only runs in dev mode

## Quick Start

### Installation

```bash
npm install -D unplugin-devpilot
npm install -D devpilot-plugin-dom-inspector
```

### Setup

<details>
<summary><b>Vite</b></summary>

```ts
// vite.config.ts
import DomInspector from 'devpilot-plugin-dom-inspector';
import Devpilot from 'unplugin-devpilot/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    Devpilot({
      plugins: [DomInspector],
    }),
  ],
});
```

</details>

<details>
<summary><b>Webpack</b></summary>

```js
// webpack.config.js
import DomInspector from 'devpilot-plugin-dom-inspector';
import Devpilot from 'unplugin-devpilot/webpack';

export default {
  plugins: [
    Devpilot({
      plugins: [DomInspector],
    }),
  ],
};
```

</details>

<details>
<summary><b>Rspack</b></summary>

```ts
// rspack.config.ts
import DomInspector from 'devpilot-plugin-dom-inspector';
import Devpilot from 'unplugin-devpilot/rspack';

export default {
  plugins: [
    Devpilot({
      plugins: [DomInspector],
    }),
  ],
};
```

</details>

### Client Import

Add this import to your project entry point to enable the devpilot client:

```ts
// main.ts or main.js (entry point)
import 'virtual:devpilot-client';
```

This import activates the WebSocket connection to the development server and initializes all registered plugins on the client side.

## Packages

### [unplugin-devpilot](./packages/unplugin-devpilot)

Core plugin framework providing:
- Multi-bundler support through unplugin
- WebSocket server for browser-server communication
- MCP server for AI/LLM integration
- Plugin system with namespace isolation
- Virtual module generation for client-side code

### [devpilot-plugin-dom-inspector](./packages/devpilot-plugin-dom-inspector)

Built-in DOM inspection plugin offering:
- Compact DOM snapshots optimized for LLM tokens
- Element querying via devpilot-id or CSS selectors (supports :has() and advanced selectors)
- Element interaction (click, text input)
- Scroll elements into view
- Visual layout analysis
- Browser console log access
- 9 MCP tools for web automation

**MCP Tools:**
- `query_selector` - Query DOM elements with accessibility tree (returns `devpilotId` for use in other APIs)
- `get_compact_snapshot` - Get LLM-friendly DOM structure
- `click_element_by_id` - Click elements
- `input_text_by_id` - Fill form fields
- `get_element_info_by_id` - Get element details
- `get_dom_tree` - Get full accessibility tree
- `get_logs` - Access browser logs
- `get_layout` - Analyze visual layout hierarchy
- `scroll_to_element` - Scroll element into view (for scrollable containers)

**Element ID Format:** All element identifiers use the `e` prefix format (e.g., `e1`, `e2`, `e123`). The `query_selector` tool returns `devpilotId` in this format, which can be directly used in other APIs.

## Use Cases

### Web Automation
Automate browser interactions and DOM manipulation for testing and scripting.

### AI/LLM Integration
Enable AI systems to interact with web applications through standardized MCP tools.

### Development Tools
Build custom development tools and extensions with real-time browser access.

### Browser-Based Debugging
Debug and inspect web applications with real-time server communication.

## Architecture Overview

```
┌────────────────────────────────────────────┐
│         Web Application Browser            │
│  ┌─────────────────────────────────────┐   │
│  │  Virtual Module: devpilot-client    │   │
│  │  - WebSocket Connection             │   │
│  │  - RPC Handlers                     │   │
│  │  - Plugin Client Modules            │   │
│  └─────────────────────────────────────┘   │
│           ▲                    ▲           │
│           │ WebSocket          │ RPC       │
└───────────┼────────────────────┼───────────┘
            │                    │
┌───────────┼────────────────────┼──────────┐
│           ▼                    ▼          │
│  ┌─────────────────────────────────────┐  │
│  │    Development Server (Node.js)     │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │  WebSocket Server (:3100)    │   │  │
│  │  │  - Client Management         │   │  │
│  │  │  - RPC Routing               │   │  │
│  │  └──────────────────────────────┘   │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │  MCP Server (:3101)          │   │  │
│  │  │  - Tool Registration         │   │  │
│  │  │  - Tool Invocation           │   │  │
│  │  └──────────────────────────────┘   │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │  Plugin System               │   │  │
│  │  │  - DOM Inspector             │   │  │
│  │  │  - Custom Plugins            │   │  │
│  │  └──────────────────────────────┘   │  │
│  └─────────────────────────────────────┘  │
│           ▲                               │
│           │ MCP Protocol                  │
└───────────┼───────────────────────────────┘
            │
    ┌───────┴───────┐
    │               │
┌───▼──┐      ┌─────▼────┐
│ LLM  │      │ AI Tools │
└──────┘      └──────────┘
```

## Plugin Development

Create a custom plugin:

```ts
import type { DevpilotPlugin } from 'unplugin-devpilot';
import { defineMcpToolRegister, resolveClientModule } from 'unplugin-devpilot';

export default {
  namespace: 'my-plugin',
  clientModule: resolveClientModule(import.meta.url, './client/index.mjs'),

  serverSetup(ctx) {
    return {
      // Server-side RPC methods
      myServerMethod: (arg: string) => `Result: ${arg}`,
    };
  },

  mcpSetup(ctx) {
    return [
      defineMcpToolRegister(
        'my_tool',
        {
          title: 'My Tool',
          description: 'A custom MCP tool',
          inputSchema: z.object({
            param: z.string(),
          }),
        },
        async (params) => {
          // Tool implementation
          return {
            content: [{
              type: 'text' as const,
              text: `Tool result: ${params.param}`,
            }],
          };
        },
      ),
    ];
  },
} satisfies DevpilotPlugin;
```

### Plugin Storage

Each plugin gets a **namespaced storage** instance (powered by [unstorage](https://github.com/unjs/unstorage)) via `ctx.storage`, available in both `serverSetup` and `mcpSetup`. Storage is isolated per plugin namespace, so plugins won't interfere with each other.

#### Server-side: Reading and Writing

```ts
export default {
  // In serverSetup or mcpSetup
  serverSetup(ctx) {
    return {
      async saveData(items: MyData[]) {
        // Domain-specific logic runs on the server
        const existing = await ctx.storage.getItem<MyData[]>('key') || [];
        const merged = [...existing, ...items];
        await ctx.storage.setItem('key', merged);
      },
    };
  },

  mcpSetup(ctx) {
    // MCP tools read directly from storage - no browser RPC needed
    const data = await ctx.storage.getItem<MyData[]>('key') || [];
  },
};
```

#### Client-side: Basic KV via RPC Bridge

The client can use `createClientStorage` for simple key-value operations that bridge to server storage via WebSocket RPC:

```ts
import { createClientStorage, getDevpilotClient } from 'unplugin-devpilot/client';

const client = getDevpilotClient();
const storage = createClientStorage(client, 'my-plugin');

await storage.setItem('key', value);
const data = await storage.getItem<MyType>('key');
```

#### Client-side: Calling Plugin Server Methods

For domain-specific operations (e.g., incremental append with deduplication), define methods in `serverSetup` and call them from the client via `rpcCall`:

```ts
// shared-types.ts - Shared type ensures client and server stay in sync
export interface MyPluginServerMethods extends Record<string, (...args: any[]) => any> {
  appendData: (items: MyData[]) => Promise<void>
}

// server (index.ts)
export default <DevpilotPlugin>{
  serverSetup(ctx): MyPluginServerMethods {
    return {
      async appendData(items) {
        const existing = await ctx.storage.getItem<MyData[]>('data') || [];
        await ctx.storage.setItem('data', [...existing, ...items].slice(-500));
      },
    };
  },
};
```

```ts
// client
import { getDevpilotClient } from 'unplugin-devpilot/client';

const client = getDevpilotClient<MyPluginServerMethods>();
client.rpcCall('appendData', batch);
```

This pattern keeps domain logic on the server, minimizes RPC payload, and maintains type safety across both sides.

## Development

### Prerequisites
- Node.js 22+
- pnpm@~9

### Install dependencies
```bash
pnpm install
```

### Build
```bash
pnpm build
```

### Development mode
```bash
pnpm dev
```

### Run tests
```bash
pnpm test
```

### Type checking
```bash
pnpm typecheck
```

## Configuration

### Port Configuration

The plugin automatically manages port allocation to prevent conflicts:

```ts
Devpilot({
  wsPort: 3100, // Optional: WebSocket server port (random if not specified)
  mcpPort: 3101, // Optional: MCP server port (random if occupied)
  plugins: [/* ... */],
});
```

**Port Allocation Strategy:**
- **wsPort**: When provided, the specified port is used if available; otherwise, a random available port is allocated. When not provided, a random available port is automatically allocated. This ensures no port conflicts.
- **mcpPort**: When not provided, defaults to 3101. If the port is already in use, an error will be thrown.

This ensures your MCP server runs on a predictable port. If the default port is occupied, you'll need to specify a different port or free up the occupied port.

### Plugin Options
Each plugin can be configured based on its implementation. Refer to individual plugin documentation.

## Performance

- **Zero Production Cost** - Only runs in development mode
- **Minimal Overhead** - Lazy-loads plugin client modules
- **Efficient Communication** - Binary WebSocket messages
- **Token Optimized** - Compact DOM snapshots for LLM usage

## Troubleshooting

### WebSocket Connection Failed
- Ensure development server is running
- Check if port 3100 is not blocked by firewall
- Verify `wsPort` configuration matches

### MCP Tools Not Available
- Confirm plugins are registered in configuration
- Check server logs for plugin loading errors
- Verify MCP server is running on port 3101

### Client Not Found
- Refresh the browser page to reconnect
- Check browser console for connection errors
- Use `get_layout` or `list_clients` tools to discover available clients

## License

MIT © 2025 [zcf0508](https://github.com/zcf0508)

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## Resources

- [GitHub Repository](https://github.com/zcf0508/unplugin-devpilot)
- [unplugin Documentation](https://github.com/unjs/unplugin)
- [Model Context Protocol](https://modelcontextprotocol.io)
