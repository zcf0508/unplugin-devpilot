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

      // Check if element is visible (has offsetParent)
      if (element.offsetParent === null) {
        return {
          success: false,
          error: `Element with ID ${id} is not visible`,
        };
      }

      element.click();
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
