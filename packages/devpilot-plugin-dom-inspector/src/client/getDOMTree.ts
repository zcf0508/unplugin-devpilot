import type { AccessibilityNode, GetDOMTreeResult } from '../shared-types';
import { buildAccessibilityTree } from './utils';

export async function getDOMTree(maxDepth = 5): Promise<GetDOMTreeResult> {
  try {
    const tree: AccessibilityNode = {
      uid: 'root',
      role: 'document',
      name: document.title || null,
      attributes: {
        url: location.href,
        title: document.title,
      },
      children: [],
    };

    // Process body and its children
    if (document.body) {
      const bodyNode = buildAccessibilityTree(document.body, 0, maxDepth);
      if (bodyNode) {
        tree.children = [bodyNode];
      }
    }

    return {
      success: true,
      tree,
      timestamp: Date.now(),
    };
  }
  catch (error) {
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : String(error),
      tree: null,
    };
  }
}
