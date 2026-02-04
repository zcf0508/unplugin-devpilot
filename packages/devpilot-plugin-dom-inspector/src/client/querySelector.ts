import type { AccessibilityNode, QuerySelectorResult } from '../shared-types';
import { buildAccessibilityTree } from './utils';

export async function querySelector(selector: string, maxDepth = 5): Promise<QuerySelectorResult> {
  try {
    console.log('[devpilot-dom-inspector] querySelector called with:', selector);
    const elements = document.querySelectorAll(selector);
    console.log('[devpilot-dom-inspector] Found elements:', elements.length);
    const results: Array<AccessibilityNode & { matchedSelector: string }> = [];

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const node = buildAccessibilityTree(element, 0, maxDepth); // 至少一层深度

      if (node) {
        results.push({
          ...node,
          matchedSelector: selector,
        });
      }
    }

    const result = {
      success: true,
      selector,
      matchedCount: results.length,
      elements: results,
    };
    console.log('[devpilot-dom-inspector] querySelector returning:', result);
    return result;
  }
  catch (error) {
    console.error('[devpilot-dom-inspector] querySelector error:', error);
    return {
      success: false,
      selector,
      error: error instanceof Error
        ? error.message
        : String(error),
      matchedCount: 0,
      elements: [],
    };
  }
}
