# unplugin-devpilot

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Unit Test][unit-test-src]][unit-test-href]

## Installation

```bash
npm i -D unplugin-devpilot
```

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import Devpilot from 'unplugin-devpilot/vite';

export default defineConfig({
  plugins: [Devpilot()],
});
```

The WebSocket proxy is automatically configured for both HTTP and HTTPS development servers.

<br></details>

<details>
<summary>Webpack</summary><br>

```js
// webpack.config.js
import Devpilot from 'unplugin-devpilot/webpack';

export default {
  /* ... */
  plugins: [Devpilot()],
};
```

The WebSocket proxy is automatically configured in webpack-dev-server.

<br></details>

<details>
<summary>Rspack</summary><br>

```ts
// rspack.config.js
import Devpilot from 'unplugin-devpilot/rspack';

export default {
  /* ... */
  plugins: [Devpilot()],
};
```

The WebSocket proxy is automatically configured in rspack-dev-server.

<br></details>

<details>
<summary>Farm</summary><br>

```ts
// farm.config.ts
import Devpilot, { getProxyConfig } from 'unplugin-devpilot/farm';

// Note: wsPort is the WebSocket server port (obtained from console output)
export default defineConfig({
  plugins: [Devpilot()],
  server: {
    proxy: getProxyConfig(60427),
  },
});
```

Farm requires manual proxy configuration. The `getProxyConfig(wsPort)` helper generates the correct proxy settings. The actual `wsPort` will be logged to the console when the dev server starts.

<br></details>

## Client Import

Add this import to your project entry point to enable the devpilot client:

```ts
// main.ts or main.js (entry point)
import 'virtual:devpilot-client';
```

This import activates the WebSocket connection to the development server and initializes all registered plugins on the client side.

### Task UI (dev)

A Lit + Shadow DOM overlay mounts automatically: **Tasks** polls **getTaskDashboard** at 1 Hz and lists pending + in progress; **Get approval token** feeds **complete_task** on the MCP side. **Alt+Shift+I** submits a task. Built-in MCP tools include **get_pending_tasks**, **claim_task**, and **complete_task** (token-gated). The **Devpilot** badge shows the pending count.

Plugins can export a `taskPayloadHook` from their client module to enrich the task payload before submission (e.g., inject `devpilotId`). Hooks run in plugin registration order via `registerTaskPayloadHook` and receive both the payload and the raw DOM element.

## Configuration

You can customize the plugin behavior by passing options:

```ts
// vite.config.ts
import Devpilot from 'unplugin-devpilot/vite';

export default defineConfig({
  plugins: [
    Devpilot({
      mcpPort: 3101, // Optional: Specify MCP server port (defaults to 3101)
      plugins: [], // Optional: Array of DevpilotPlugin instances
      skillPaths: ['./.github/skills/devpilot', './.cursor/skills/devpilot'], // Optional: Array of paths to core skill files
    }),
  ],
});
```

### Port Allocation

- **WebSocket**: Port is automatically allocated internally. The WebSocket connection is proxied through the dev server (via `/__devpilot_ws`), so it works seamlessly with both HTTP and HTTPS.
- **MCP**: Defaults to port 3101. If occupied, specify a different port or free up the occupied port.

### HTTPS Support

The plugin automatically works with HTTPS development servers (e.g., using `unplugin-https-reverse-proxy` or Vite's built-in HTTPS). The WebSocket connection is proxied through the dev server using the same protocol:

- **HTTP pages**: Connects via `ws://` (WebSocket)
- **HTTPS pages**: Connects via `wss://` (Secure WebSocket)

No additional configuration is required for HTTPS support.

## License

[MIT](./LICENSE) License © 2025-PRESENT [Huali](https://github.com/zcf0508)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/unplugin-devpilot.svg
[npm-version-href]: https://npmjs.com/package/unplugin-devpilot
[npm-downloads-src]: https://img.shields.io/npm/dm/unplugin-devpilot
[npm-downloads-href]: https://www.npmcharts.com/compare/unplugin-devpilot?interval=30
[unit-test-src]: https://github.com/zcf0508/unplugin-devpilot/actions/workflows/unit-test.yml/badge.svg
[unit-test-href]: https://github.com/zcf0508/unplugin-devpilot/actions/workflows/unit-test.yml
