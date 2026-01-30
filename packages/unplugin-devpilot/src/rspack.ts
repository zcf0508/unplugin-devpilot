/**
 * This entry file is for Rspack plugin.
 *
 * @module
 */

import { unpluginDevpilot } from './index';

/**
 * Rspack plugin
 *
 * @example
 * ```js
 * // rspack.config.js
 * import devpilot from 'unplugin-devpilot/rspack'
 *
 * export default {
 *   plugins: [devpilot()],
 * }
 * ```
 */
const rspack = unpluginDevpilot.rspack as typeof unpluginDevpilot.rspack;
export default rspack;
export { rspack as 'module.exports' };
