import type { ElementInfo } from '../shared-types';
import { getVisibleText, IMPORTANT_ATTRS } from './utils';
import { generateSelectorNotFoundError, resolveElementBySelector } from './utils/resolveSelector';

// Get element info by ID
function _getElementInfoById(id: string): ElementInfo {
  const element = resolveElementBySelector(id);

  if (!element) {
    return {
      success: false,
      error: generateSelectorNotFoundError(id),
    };
  }

  const tag = element.tagName.toLowerCase();
  const text = getVisibleText(element);
  const attributes: Record<string, string> = {};

  // Collect relevant attributes (using shared IMPORTANT_ATTRS + class)
  for (const attr of IMPORTANT_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) {
      attributes[attr] = value;
    }
  }

  // Also include class
  const classValue = element.getAttribute('class');
  if (classValue) {
    attributes.class = classValue;
  }

  return {
    success: true,
    element: {
      id,
      tag,
      text,
      attributes,
    },
  };
}

export async function getElementInfoById(id: string): Promise<ElementInfo> {
  try {
    console.log('[devpilot-dom-inspector] getElementInfoById called with id:', id);

    const result = _getElementInfoById(id);
    console.log('[devpilot-dom-inspector] getElementInfoById returning:', result);
    return result;
  }
  catch (error) {
    console.error('[devpilot-dom-inspector] getElementInfoById error:', error);
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}
