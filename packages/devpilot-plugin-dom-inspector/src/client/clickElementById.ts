import type { ElementActionResult } from '../shared-types';

export async function clickElementById(id: string): Promise<ElementActionResult> {
  try {
    console.log('[devpilot-dom-inspector] clickElementById called with id:', id);

    const element = document.querySelector(`[data-devpilot-id="${id}"]`);
    if (!element) {
      return {
        success: false,
        error: `Element with ID ${id} not found`,
      };
    }

    if (element instanceof HTMLElement) {
      // Check if element is disabled (only for form elements)
      if (
        (element instanceof HTMLInputElement
          || element instanceof HTMLTextAreaElement
          || element instanceof HTMLSelectElement
          || element instanceof HTMLButtonElement)
        && element.disabled
      ) {
        return {
          success: false,
          error: `Element with ID ${id} is disabled`,
        };
      }

      // Check if element is visible
      // Note: offsetParent can be null for position:fixed elements, which are still visible
      // Use getComputedStyle for more accurate visibility check
      const style = window.getComputedStyle(element);
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || style.opacity === '0'
        || element.hidden
      ) {
        return {
          success: false,
          error: `Element with ID ${id} is not visible`,
        };
      }

      // Check if element has zero size (might be hidden by other means)
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return {
          success: false,
          error: `Element with ID ${id} has zero size and cannot be clicked`,
        };
      }

      // Use dispatchEvent for more reliable click triggering
      // This helps with frameworks that use synthetic events (React, Vue, etc.)
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
      });

      const result = element.dispatchEvent(clickEvent);
      if (!result) {
        return {
          success: false,
          error: 'Click event was cancelled by the element',
        };
      }

      console.log('[devpilot-dom-inspector] clickElementById success');
      return { success: true };
    }

    return {
      success: false,
      error: `Element with ID ${id} is not clickable (not an HTMLElement)`,
    };
  }
  catch (error) {
    console.error('[devpilot-dom-inspector] clickElementById error:', error);
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}
