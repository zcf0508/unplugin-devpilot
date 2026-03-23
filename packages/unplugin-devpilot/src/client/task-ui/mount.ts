import type { DevpilotClient } from '../types';
import { DevpilotTaskApp } from './devpilot-task-app.js';

const TAG = 'devpilot-task-app'

/**
 * Mount Lit + Shadow DOM task UI (inspect mode, task dialog, pending badge).
 * Safe to call once per page; no-op in non-browser environments.
 */
export function mountDevpilotTaskUi(client: DevpilotClient): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }
  if (!customElements.get(TAG)) {
    customElements.define(TAG, DevpilotTaskApp)
  }
  if (document.querySelector(TAG)) {
    return
  }
  const app = document.createElement(TAG) as DevpilotTaskApp
  app.devpilotClient = client
  document.body.appendChild(app)
}
