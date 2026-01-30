/**
 * This entry file is for Farm plugin.
 *
 * @module
 */

import { unpluginDevpilot } from './index';

/**
 * Farm plugin
 *
 * @example
 * ```ts
 * // farm.config.js
 * import devpilot from 'unplugin-devpilot/farm'
 *
 * export default {
 *   plugins: [devpilot()],
 * }
 * ```
 */
const farm = unpluginDevpilot.farm as typeof unpluginDevpilot.farm;
export default farm;
export { farm as 'module.exports' };
