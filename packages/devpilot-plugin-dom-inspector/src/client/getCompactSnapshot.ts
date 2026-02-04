import type { CompactSnapshotResult } from '../shared-types';
import { getDevpilotClient } from 'unplugin-devpilot/client';
import { buildCompactSnapshot } from './utils';

// Helper function to get current client ID from the devpilot client
function getClientId(): string {
  const client = getDevpilotClient();
  const clientId = client?.getClientId();
  return clientId || 'unknown';
}

export async function getCompactSnapshot(maxDepth = 5): Promise<CompactSnapshotResult> {
  try {
    console.log('[devpilot-dom-inspector] getCompactSnapshot called');

    const snapshot = buildCompactSnapshot(document.body, 0, maxDepth);

    const result: CompactSnapshotResult = {
      success: true,
      clientId: getClientId(),
      timestamp: Date.now(),
      url: location.href,
      title: document.title || '',
      snapshot,
    };

    console.log('[devpilot-dom-inspector] getCompactSnapshot returning snapshot with length:', snapshot.length);
    return result;
  }
  catch (error) {
    console.error('[devpilot-dom-inspector] getCompactSnapshot error:', error);
    return {
      success: false,
      clientId: getClientId(),
      timestamp: Date.now(),
      url: location.href,
      title: document.title || '',
      snapshot: '',
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}
