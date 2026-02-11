import type { ElementDetails } from '../shared-types';
import { buildAccessibilityTree, getVisibleText, IMPORTANT_ATTRS } from './utils';
import { generateSelectorNotFoundError, resolveElementsBySelector } from './utils/resolveSelector';

// Get detailed element information (HTML + accessibility + position)
function _getElementDetails(
  selector: string,
  options?: { includeChildren?: boolean, maxDepth?: number },
): ElementDetails {
  const elements = resolveElementsBySelector(selector);

  if (elements.length === 0) {
    return {
      success: false,
      error: generateSelectorNotFoundError(selector),
    };
  }

  const maxDepth = options?.maxDepth ?? 5;
  const includeChildren = options?.includeChildren ?? false;

  const results = elements.map((element) => {
    // Get HTML info
    const tag = element.tagName.toLowerCase();
    const text = getVisibleText(element);
    const attributes: Record<string, string> = {};

    // Collect relevant attributes
    for (const attr of IMPORTANT_ATTRS) {
      const value = element.getAttribute(attr);
      if (value) {
        attributes[attr] = value;
      }
    }

    // Include class
    const classValue = element.getAttribute('class');
    if (classValue) {
      attributes.class = classValue;
    }

    // Include id
    const idValue = element.getAttribute('id');
    if (idValue) {
      attributes.id = idValue;
    }

    // Get accessibility info
    const accessibilityNode = buildAccessibilityTree(element, 0, includeChildren
      ? maxDepth
      : 0);

    // Get position info
    const rect = element.getBoundingClientRect();

    return {
      devpilotId: accessibilityNode?.devpilotId || '',
      tag,
      text,
      attributes,
      role: accessibilityNode?.role || '',
      name: accessibilityNode?.name || null,
      value: accessibilityNode?.value,
      description: accessibilityNode?.description,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      children: includeChildren
        ? accessibilityNode?.children
        : undefined,
    };
  });

  return {
    success: true,
    elements: results,
  };
}

export async function getElementDetails(
  selector: string,
  options?: { includeChildren?: boolean, maxDepth?: number },
): Promise<ElementDetails> {
  try {
    console.log('[devpilot-dom-inspector] getElementDetails called with:', selector, options);

    const result = _getElementDetails(selector, options);
    console.log('[devpilot-dom-inspector] getElementDetails returning:', result);
    return result;
  }
  catch (error) {
    console.error('[devpilot-dom-inspector] getElementDetails error:', error);
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}
