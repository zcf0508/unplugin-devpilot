/**
 * This entry file is for webpack plugin.
 *
 * @module
 */

import { unpluginDevpilot } from './index';

/**
 * Webpack plugin
 *
 * @example
 * ```js
 * // webpack.config.js
 * import devpilot from 'unplugin-devpilot/webpack'
 *
 * export default {
 *   plugins: [devpilot()],
 * }
 * ```
 */
const webpack = unpluginDevpilot.webpack as typeof unpluginDevpilot.webpack;
export default webpack;
export { webpack as 'module.exports' };
