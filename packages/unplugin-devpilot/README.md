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

## License

[MIT](./LICENSE) License © 2025-PRESENT [Huali](https://github.com/zcf0508)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/unplugin-devpilot.svg
[npm-version-href]: https://npmjs.com/package/unplugin-devpilot
[npm-downloads-src]: https://img.shields.io/npm/dm/unplugin-devpilot
[npm-downloads-href]: https://www.npmcharts.com/compare/unplugin-devpilot?interval=30
[unit-test-src]: https://github.com/zcf0508/unplugin-devpilot/actions/workflows/unit-test.yml/badge.svg
[unit-test-href]: https://github.com/zcf0508/unplugin-devpilot/actions/workflows/unit-test.yml
