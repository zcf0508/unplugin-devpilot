import type { ElementDetails, ElementDetailsItem, GetElementDetailsOptions } from '../shared-types';
import { buildAccessibilityTree, getVisibleText, IMPORTANT_ATTRS } from './utils';
import { DEFAULT_STYLE_PROPS, isPseudoElementGenerated, readComputedStyles } from './utils/computedStyles';
import { generateSelectorNotFoundError, resolveElementsBySelector } from './utils/resolveSelector';

// Get detailed element information (HTML + accessibility + position)
function _getElementDetails(
  selector: string,
  options?: GetElementDetailsOptions,
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
  const includeStyles = options?.includeStyles ?? false;
  const pseudo = options?.pseudo;

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

    const item: ElementDetailsItem = {
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

    if (includeStyles) {
      const props = options?.styleProps?.length
        ? options.styleProps
        : DEFAULT_STYLE_PROPS;
      item.styles = readComputedStyles(element, props);

      if (pseudo) {
        if (isPseudoElementGenerated(element, pseudo)) {
          const pseudoStyles: Partial<Record<typeof pseudo, Record<string, string>>> = {};
          pseudoStyles[pseudo] = readComputedStyles(element, props, { pseudo });
          item.pseudoStyles = pseudoStyles;
        }
        else {
          item.pseudoNote = `${pseudo} not found on this element`;
        }
      }
    }

    return item;
  });

  return {
    success: true,
    elements: results,
  };
}

export async function getElementDetails(
  selector: string,
  options?: GetElementDetailsOptions,
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
