/**
 * This entry file is for esbuild plugin.
 *
 * @module
 */

import { unpluginDevpilot } from './index';

/**
 * Esbuild plugin
 *
 * @example
 * ```ts
 * import { build } from 'esbuild'
 * import devpilot from 'unplugin-devpilot/esbuild'
 *
 * build({ plugins: [devpilot()] })
```
 */
const esbuild = unpluginDevpilot.esbuild as typeof unpluginDevpilot.esbuild;
export default esbuild;
export { esbuild as 'module.exports' };
