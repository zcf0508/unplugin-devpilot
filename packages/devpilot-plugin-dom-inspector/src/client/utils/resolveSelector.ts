/**
 * Utility function to resolve element selector with fallback support
 * Priority: devpilot-id > CSS selector
 */

/**
 * Checks if a selector looks like a simple devpilot-id (not a complex CSS selector)
 * Simple devpilot-ids: alphanumeric, hyphens, underscores, dots (but not starting with # or .)
 * Complex CSS selectors: contain spaces, brackets, quotes, or start with # or .
 */
function isLikelyDevpilotId(selector: string): boolean {
  // If it starts with # or ., it's definitely a CSS selector
  if (selector.startsWith('#') || selector.startsWith('.')) {
    return false;
  }
  // If it contains spaces, brackets, quotes, or other CSS-specific characters, it's a CSS selector
  if (
    selector.includes(' ')
    || selector.includes('[')
    || selector.includes(']')
    || selector.includes('"')
    || selector.includes('\'')
    || selector.includes(':')
    || selector.includes('(')
    || selector.includes(')')
    || selector.includes('>')
    || selector.includes('+')
    || selector.includes('~')
  ) {
    return false;
  }
  // Otherwise, treat it as a potential devpilot-id
  return true;
}

/**
 * Resolves an element from a selector string.
 * Priority:
 * 1. Try as devpilot-id (data-devpilot-id attribute) - only for simple identifiers
 * 2. If not found, try as CSS selector
 *
 * @param selector - Element identifier, can be devpilot-id or CSS selector
 * @returns The resolved element or null if not found
 */
export function resolveElementBySelector(selector: string): Element | null {
  if (!selector || typeof selector !== 'string') {
    return null;
  }

  // Priority 1: Try as devpilot-id (only for simple identifiers)
  // This handles devpilot-ids (e.g., "e1", "e123")
  if (isLikelyDevpilotId(selector)) {
    const devpilotIdSelector = `[data-devpilot-id="${selector}"]`;
    try {
      const elementByDevpilotId = document.querySelector(devpilotIdSelector);

      if (elementByDevpilotId) {
        console.log('[devpilot-dom-inspector] Element found by devpilot-id:', selector);
        return elementByDevpilotId;
      }
    }
    catch (error) {
      // Invalid devpilot-id selector - continue to CSS selector
      console.log('[devpilot-dom-inspector] Invalid devpilot-id selector:', selector, error);
    }
  }

  // Priority 2: Try as CSS selector
  try {
    const elementByCss = document.querySelector(selector);

    if (elementByCss) {
      console.log('[devpilot-dom-inspector] Element found by CSS selector:', selector);
      return elementByCss;
    }
  }
  catch (error) {
    // Invalid CSS selector - ignore and continue
    console.log('[devpilot-dom-inspector] Invalid CSS selector:', selector, error);
  }

  // Not found by either method
  console.log('[devpilot-dom-inspector] Element not found by devpilot-id or CSS selector:', selector);
  return null;
}

/**
 * Resolves multiple elements from a selector string (for querySelectorAll)
 * Priority:
 * 1. Try as devpilot-id (data-devpilot-id attribute) - only for simple identifiers
 * 2. If not found, try as CSS selector
 *
 * @param selector - Element identifier, can be devpilot-id or CSS selector
 * @returns Array of resolved elements (empty if none found)
 */
export function resolveElementsBySelector(selector: string): Element[] {
  if (!selector || typeof selector !== 'string') {
    return [];
  }

  // Priority 1: Try as devpilot-id (only for simple identifiers)
  // This handles devpilot-ids (e.g., "e1", "e123")
  if (isLikelyDevpilotId(selector)) {
    const devpilotIdSelector = `[data-devpilot-id="${selector}"]`;
    try {
      const elementsByDevpilotId = Array.from(document.querySelectorAll(devpilotIdSelector));

      if (elementsByDevpilotId.length > 0) {
        console.log('[devpilot-dom-inspector] Found', elementsByDevpilotId.length, 'element(s) by devpilot-id:', selector);
        return elementsByDevpilotId;
      }
    }
    catch (error) {
      // Invalid devpilot-id selector - continue to CSS selector
      console.log('[devpilot-dom-inspector] Invalid devpilot-id selector:', selector, error);
    }
  }

  // Priority 2: Try as CSS selector
  try {
    const elementsByCss = Array.from(document.querySelectorAll(selector));

    if (elementsByCss.length > 0) {
      console.log('[devpilot-dom-inspector] Found', elementsByCss.length, 'element(s) by CSS selector:', selector);
      return elementsByCss;
    }
  }
  catch (error) {
    // Invalid CSS selector - ignore and continue
    console.log('[devpilot-dom-inspector] Invalid CSS selector:', selector, error);
  }

  // Not found by either method
  console.log('[devpilot-dom-inspector] No elements found by devpilot-id or CSS selector:', selector);
  return [];
}

/**
 * Generates helpful error message when element is not found
 *
 * @param selector - The selector that was used
 * @returns Error message with suggestions
 */
export function generateSelectorNotFoundError(selector: string): string {
  return `Element not found for selector: "${selector}".

Available options:
1. Use devpilot-id (e.g., "e123") - recommended, more reliable
2. Use CSS selector (e.g., "#myId", ".myClass", "button[type=submit]")
3. Use get_compact_snapshot() to see available element IDs

Note: devpilot-id takes priority over CSS selectors. If you're using a CSS selector that looks like an ID (e.g., "e123"), it will first try to find an element with data-devpilot-id="e123".`;
}
