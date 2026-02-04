import type { CompactSnapshotResult } from '../shared-types';
import { getDevpilotClient } from 'unplugin-devpilot/client';
import { buildCompactSnapshot } from './utils';

// Helper function to get current client ID from the devpilot client
function getClientId(): string {
  const client = getDevpilotClient();
  const clientId = client?.getClientId();
  return clientId || 'unknown';
}

// Format snapshot with LLM-friendly explanation
function formatSnapshotForLLM(snapshot: string, url: string, title: string): string {
  return `# DOM Structure Snapshot

## Page Context
- URL: ${url}
- Title: ${title}
- Timestamp: ${new Date().toISOString()}

## Format Guide
Each line represents a DOM element with the following structure:
\`@id [tag] <role> "text" [attributes] {visual}\`

Where:
- \`@id\`: Unique element identifier (e.g., @e1, @e2) - use this for targeted operations
- \`[tag]\`: HTML tag name (e.g., [div], [button], [input])
- \`<role>\`: ARIA role or semantic role (e.g., <button>, <link>, <heading>) - shown only if meaningful
- \`"text"\`: Visible text content or accessible name - what users see or screen readers announce
- \`[attributes]\`: Key attributes and states:
  - Element properties: id, type, href, placeholder, name, value, for
  - Interactive states: disabled, readonly, checked, selected
  - Visual states: hidden, zero-size
  - Class names (first 2 classes shown)
- \`{visual}\`: Visual context (position, size, visibility):
  - size:WxH - element dimensions in pixels
  - pos:X,Y - position relative to viewport top-left
  - z:N - z-index value
  - Positioning: fixed, absolute, sticky
  - Visibility: invisible, transparent, display:none

## DOM Tree
${snapshot}

## Usage Tips
- Elements are indented to show nesting hierarchy (2 spaces per level)
- Interactive elements (buttons, links, inputs) are always included
- Use element IDs (e.g., @e123) when you need to interact with specific elements
- Visual context helps understand layout and positioning
- Hidden or zero-size elements are marked but still tracked
`;
}

export async function getCompactSnapshot(maxDepth = 5): Promise<CompactSnapshotResult> {
  try {
    console.log('[devpilot-dom-inspector] getCompactSnapshot called');

    const rawSnapshot = buildCompactSnapshot(document.body, 0, maxDepth);
    const snapshot = formatSnapshotForLLM(rawSnapshot, location.href, document.title || '');

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
