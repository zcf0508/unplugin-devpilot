/**
 * This entry file is for Rollup plugin.
 *
 * @module
 */

import { unpluginDevpilot } from './index';

/**
 * Rollup plugin
 *
 * @example
 * ```ts
 * // rollup.config.js
 * import devpilot from 'unplugin-devpilot/rollup'
 *
 * export default {
 *   plugins: [devpilot()],
 * }
 * ```
 */
const rollup = unpluginDevpilot.rollup as typeof unpluginDevpilot.rollup;
export default rollup;
export { rollup as 'module.exports' };
