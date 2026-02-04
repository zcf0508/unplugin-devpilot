import type { ElementActionResult } from '../shared-types';
import { generateSelectorNotFoundError, resolveElementBySelector } from './utils/resolveSelector';

export async function inputTextById(id: string, text: string): Promise<ElementActionResult> {
  try {
    console.log('[devpilot-dom-inspector] inputTextById called with id/selector:', id, 'text:', text);

    const element = resolveElementBySelector(id);
    if (!element) {
      return {
        success: false,
        error: generateSelectorNotFoundError(id),
      };
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[devpilot-dom-inspector] inputTextById success');
      return { success: true };
    }

    if (element instanceof HTMLSelectElement) {
      // First try to match by value
      element.value = text;

      // If value doesn't match, try to find option by display text
      if (element.value !== text) {
        const matchingOption = Array.from(element.options).find(
          option => option.textContent?.trim() === text,
        );

        if (matchingOption) {
          element.value = matchingOption.value;
        }
        else {
          return {
            success: false,
            error: `No option found with text "${text}" in select element`,
          };
        }
      }

      element.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[devpilot-dom-inspector] inputTextById success (select)');
      return { success: true };
    }

    return {
      success: false,
      error: `Element with ID ${id} is not an input, textarea, or select element`,
    };
  }
  catch (error) {
    console.error('[devpilot-dom-inspector] inputTextById error:', error);
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }
}
