# unplugin-devpilot

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/zcf0508/unplugin-devpilot)

[中文版本](./README_CN.md)

A universal plugin framework for development tools that enables seamless browser-server communication and MCP (Model Context Protocol) integration with AI/LLM systems.

## Features

- 🔌 **Universal Plugin System** - Create plugins once, use everywhere
- 🌐 **Multi-Bundler Support** - Works with Vite, Webpack, Rspack, Farm, and more via [unplugin](https://github.com/unjs/unplugin)
- 🔄 **Real-time Communication** - WebSocket-based bidirectional RPC between browser and development server (works with HTTP and HTTPS)
- 🤖 **MCP Integration** - Built-in Model Context Protocol server for AI/LLM automation
- 🎯 **DOM Inspector Plugin** - Out-of-the-box DOM inspection and manipulation for web automation
- 🛠️ **Development-Only** - Zero production overhead, only runs in dev mode
- 🔒 **HTTPS Support** - Works seamlessly with HTTPS dev servers via automatic WebSocket proxy

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

The WebSocket proxy is automatically configured for both HTTP and HTTPS development servers.

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

The WebSocket proxy is automatically configured in webpack-dev-server.

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

The WebSocket proxy is automatically configured in rspack-dev-server.

</details>

<details>
<summary><b>Farm</b></summary>

```ts
// farm.config.ts
import DomInspector from 'devpilot-plugin-dom-inspector';
import Devpilot, { getProxyConfig } from 'unplugin-devpilot/farm';

// Note: wsPort is the WebSocket server port (obtained from console output)
export default defineConfig({
  plugins: [
    Devpilot({
      plugins: [DomInspector],
    }),
  ],
  server: {
    proxy: getProxyConfig(60427),
  },
});
```

Farm requires manual proxy configuration. The `getProxyConfig(wsPort)` helper generates the correct proxy settings. The actual `wsPort` will be logged to the console when the dev server starts.

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
- Page and element screenshot capture
- 8 MCP tools for web automation

**MCP Tools:**
- `get_page_snapshot` - Get LLM-friendly DOM structure (compact, token-efficient)
- `get_visual_hierarchy` - Analyze visual layout hierarchy and coverage
- `get_element_details` - Get comprehensive element info (HTML + accessibility + position)
- `click_element` - Click elements
- `input_text` - Fill form fields
- `get_console_logs` - Access browser logs (error/warn/info/debug only; `console.log` is NOT captured)
- `scroll_to_element` - Scroll element into view (for scrollable containers)
- `capture_screenshot` - Capture page or element screenshot (cross-origin images without CORS headers may appear blank)

**Element ID Format:** All element identifiers use the `e` prefix format (e.g., `e1`, `e2`, `e123`). The `get_page_snapshot` tool returns `devpilotId` in this format, which can be directly used in other APIs.

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
            │   WSS (via dev     │   WS (direct)
            │   server proxy)    │
┌───────────┼────────────────────┼──────────┐
│           ▼                    ▼          │
│  ┌─────────────────────────────────────┐  │
│  │    Development Server (Node.js)     │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │  WebSocket Proxy             │   │  │
│  │  │  (auto-configured for all    │   │  │
│  │  │   bundlers)                  │   │  │
│  │  └──────────────────────────────┘   │  │
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

### Skill File

Plugins can provide a `skillModule` to help LLMs understand and use the plugin's capabilities. This is a markdown file or folder that describes the plugin's purpose, available tools, and usage patterns.

```ts
import type { DevpilotPlugin } from 'unplugin-devpilot';
import { resolveModule } from 'unplugin-devpilot';

export default {
  namespace: 'my-plugin',
  clientModule: resolveClientModule(import.meta.url, './client/index.mjs'),
  skillModule: resolveModule(import.meta.url, './skill.md'), // or './skills' for a folder
  // ...
} satisfies DevpilotPlugin;
```

**Single File Mode:**

```ts
skillModule: resolveModule(import.meta.url, './skill.md');
```

The skill file is copied to the output directory as `{namespace}.md`.

**Folder Mode:**

```ts
skillModule: resolveModule(import.meta.url, './skills');
```

When using a folder:
- If `index.md` exists, the link points to `{namespace}/index.md`
- If no `index.md`, the link points to `{namespace}/` and LLM explores the folder
- All files in the folder are copied recursively

**Skill File Guidelines:**

- Keep under 100 lines for core instructions
- Include tool descriptions, parameters, and usage examples
- For complex plugins, use folder mode with multiple `.md` files

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

The plugin automatically manages port allocation internally:

```ts
Devpilot({
  mcpPort: 3101, // Optional: MCP server port (defaults to 3101)
  plugins: [/* ... */],
});
```

**Port Allocation:**
- **WebSocket**: Port is automatically allocated internally. The WebSocket connection is proxied through the dev server (via `/__devpilot_ws`), so it works seamlessly with both HTTP and HTTPS.
- **MCP**: Defaults to port 3101. If occupied, specify a different port or free up the occupied port.

### HTTPS Support

The plugin automatically works with HTTPS development servers (e.g., using `unplugin-https-reverse-proxy` or Vite's built-in HTTPS). The WebSocket connection is proxied through the dev server using the same protocol:

- **HTTP pages**: Connects via `ws://` (WebSocket)
- **HTTPS pages**: Connects via `wss://` (Secure WebSocket)

No additional configuration is required for HTTPS support.

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
- For HTTPS servers, ensure the certificate is trusted by your browser
- Check browser console for connection errors

### MCP Tools Not Available
- Confirm plugins are registered in configuration
- Check server logs for plugin loading errors
- Verify MCP server is running on port 3101

### Client Not Found
- Refresh the browser page to reconnect
- Check browser console for connection errors
- Use `get_visual_hierarchy` or `list_clients` tools to discover available clients

## License

MIT © 2025 [zcf0508](https://github.com/zcf0508)

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## Resources

- [GitHub Repository](https://github.com/zcf0508/unplugin-devpilot)
- [unplugin Documentation](https://github.com/unjs/unplugin)
- [Model Context Protocol](https://modelcontextprotocol.io)
