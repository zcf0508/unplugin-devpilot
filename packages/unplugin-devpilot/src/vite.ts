/**
 * This entry file is for Vite plugin.
 *
 * @module
 */

import { unpluginDevpilot } from './index';

/**
 * Vite plugin
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import devpilot from 'unplugin-devpilot/vite'
 *
 * export default defineConfig({
 *   plugins: [devpilot()],
 * })
 * ```
 */
const vite = unpluginDevpilot.vite as typeof unpluginDevpilot.vite;
export default vite;
export { vite as 'module.exports' };
