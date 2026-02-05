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

<br></details>

## Client Import

Add this import to your project entry point to enable the devpilot client:

```ts
// main.ts or main.js (entry point)
import 'virtual:devpilot-client';
```

This import activates the WebSocket connection to the development server and initializes all registered plugins on the client side.

## Configuration

You can customize the plugin behavior by passing options:

```ts
// vite.config.ts
import Devpilot from 'unplugin-devpilot/vite';

export default defineConfig({
  plugins: [
    Devpilot({
      wsPort: 3100, // Optional: Specify WebSocket port (will be randomly allocated if not specified)
      mcpPort: 3101, // Optional: Specify MCP server port (will use random port if specified port is occupied)
      plugins: [], // Optional: Array of DevpilotPlugin instances
    }),
  ],
});
```

### Port Allocation Strategy

- **wsPort**: When provided, the specified port is used if available; otherwise, a random available port is allocated. When not provided, a random available port is automatically allocated
- **mcpPort**: When not provided, defaults to 3101. If the port is already in use, an error will be thrown

This ensures your MCP server runs on a predictable port. If the default port is occupied, you'll need to specify a different port or free up the occupied port.

## License

[MIT](./LICENSE) License © 2025-PRESENT [Huali](https://github.com/zcf0508)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/unplugin-devpilot.svg
[npm-version-href]: https://npmjs.com/package/unplugin-devpilot
[npm-downloads-src]: https://img.shields.io/npm/dm/unplugin-devpilot
[npm-downloads-href]: https://www.npmcharts.com/compare/unplugin-devpilot?interval=30
[unit-test-src]: https://github.com/zcf0508/unplugin-devpilot/actions/workflows/unit-test.yml/badge.svg
[unit-test-href]: https://github.com/zcf0508/unplugin-devpilot/actions/workflows/unit-test.yml
