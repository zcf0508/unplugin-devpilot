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
// Similar to getLayout's formatLayoutForLLM - handles all formatting on client side
function formatSnapshotForLLM(snapshot: string, url: string, title: string): string {
  let formatted = '# DOM Structure Snapshot\n\n';
  formatted += '## Page Context\n';
  formatted += `- **URL:** ${url}\n`;
  formatted += `- **Title:** ${title}\n`;
  formatted += `- **Timestamp:** ${new Date().toISOString()}\n\n`;

  formatted += '## Format Guide\n';
  formatted += 'Each line represents a DOM element with the following structure:\n';
  formatted += '`@id [tag] <role> "text" [attributes] {visual}`\n\n';
  formatted += 'Where:\n';
  formatted += '- `@id`: Unique element identifier (e.g., @e1, @e2) - use this for targeted operations\n';
  formatted += '- `[tag]`: HTML tag name (e.g., [div], [button], [input])\n';
  formatted += '- `<role>`: ARIA role or semantic role (e.g., <button>, <link>, <heading>) - shown only if meaningful\n';
  formatted += '- `"text"`: Visible text content or accessible name - what users see or screen readers announce\n';
  formatted += '- `[attributes]`: Key attributes and states:\n';
  formatted += '  - Element properties: id, type, href, placeholder, name, value, for\n';
  formatted += '  - Interactive states: disabled, readonly, checked, selected\n';
  formatted += '  - Visual states: hidden, zero-size\n';
  formatted += '  - Class names (first 2 classes shown)\n';
  formatted += '- `{visual}`: Visual context (position, size, visibility):\n';
  formatted += '  - size:WxH - element dimensions in pixels\n';
  formatted += '  - pos:X,Y - position relative to viewport top-left\n';
  formatted += '  - z:N - z-index value\n';
  formatted += '  - Positioning: fixed, absolute, sticky\n';
  formatted += '  - Visibility: invisible, transparent, display:none\n\n';

  formatted += '## DOM Tree\n';
  formatted += '```\n';
  formatted += `${snapshot}\n`;
  formatted += '```\n\n';

  formatted += '## Usage Tips\n';
  formatted += '- Elements are indented to show nesting hierarchy (2 spaces per level)\n';
  formatted += '- Interactive elements (buttons, links, inputs) are always included\n';
  formatted += '- Use element IDs (e.g., @e123) when you need to interact with specific elements\n';
  formatted += '- Visual context helps understand layout and positioning\n';
  formatted += '- Hidden or zero-size elements are marked but still tracked\n\n';

  formatted += '## Interaction Commands\n';
  formatted += '- Use the @id format (e.g., @e123) to reference elements\n';
  formatted += '- Call `click_element_by_id({ id: "e123" })` to click\n';
  formatted += '- Call `input_text_by_id({ id: "e123", text: "value" })` to input text\n';
  formatted += '- Call `get_element_info_by_id({ id: "e123" })` to get details\n';

  return formatted;
}

export async function getCompactSnapshot(maxDepth = 5): Promise<CompactSnapshotResult> {
  try {
    console.log('[devpilot-dom-inspector] getCompactSnapshot called');

    const rawSnapshot = buildCompactSnapshot(document.body, 0, maxDepth);
    const formattedSnapshot = formatSnapshotForLLM(rawSnapshot, location.href, document.title || '');

    const result: CompactSnapshotResult = {
      success: true,
      clientId: getClientId(),
      timestamp: Date.now(),
      url: location.href,
      title: document.title || '',
      snapshot: rawSnapshot,
      formattedSnapshot,
    };

    console.log('[devpilot-dom-inspector] getCompactSnapshot returning snapshot with length:', rawSnapshot.length);
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
      formattedSnapshot: null,
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}
