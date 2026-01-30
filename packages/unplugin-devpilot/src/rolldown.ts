/**
 * This entry file is for Rolldown plugin.
 *
 * @module
 */

import { unpluginDevpilot } from './index';

/**
 * Rolldown plugin
 *
 * @example
 * ```ts
 * // rolldown.config.js
 * import devpilot from 'unplugin-devpilot/rolldown'
 *
 * export default {
 *   plugins: [devpilot()],
 * }
 * ```
 */
const rolldown = unpluginDevpilot.rolldown as typeof unpluginDevpilot.rolldown;
export default rolldown;
export { rolldown as 'module.exports' };
